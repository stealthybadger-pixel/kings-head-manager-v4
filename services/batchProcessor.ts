
import { Recipe, Ingredient, RecipeItem } from '../types';
import { parseRecipeContent, ParsedRecipe } from '../utils/parser';
import { doc, writeBatch, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { normalizeName } from '../utils/intelligence';

// ... (Existing splitDocument and PrepCorrection exports remain)

/**
 * Splits a monolithic text blob into individual segments based on a delimiter.
 * Supports "WIDE_GAP" mode for >10 newlines.
 * Filters out chunks smaller than 50 characters.
 */
export const splitDocument = (content: string, delimiter: string): string[] => {
  if (!content) return [];
  
  let parts: string[];

  if (delimiter === 'WIDE_GAP') {
    // Regex for 10 or more newlines
    parts = content.split(/\n{10,}/);
  } else {
    // Standard text delimiter on its own line
    // Escape special regex characters to prevent crashes on input like '***' or '???'
    const escapedDelimiter = delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escapedDelimiter.trim()}$`, 'gm');
    parts = content.split(regex);
  }
    
  return parts
    .map(p => p.trim())
    .filter(p => p.length >= 50);
};

export interface PrepCorrection {
  recipeId: string;
  recipeName: string;
  originalLine: string;
  extractedName: string;
  extractedNote: string;
  matchedId?: string;
}

// ... (Existing generatePrepCorrectionReport and applyPrepCorrections)

export const generatePrepCorrectionReport = (recipes: Recipe[], ingredientsDB: Ingredient[], force: boolean = false): PrepCorrection[] => {
  const corrections: PrepCorrection[] = [];

  recipes.forEach(recipe => {
    if (!recipe.raw_text) return;

    // Conflict Handling: Skip active unless force is true
    if (!force && recipe.status === 'active') return;

    // Re-run the enhanced parser
    const newParse = parseRecipeContent(recipe.raw_text, ingredientsDB);

    // Identify items that have extracted notes using the new parser logic
    newParse.ingredients.forEach(p => {
      if (p.mappedNote) {
        corrections.push({
          recipeId: recipe.id,
          recipeName: recipe.name,
          originalLine: p.originalText,
          extractedName: p.name,
          extractedNote: p.mappedNote,
          matchedId: p.matchedId
        });
      }
    });
  });

  return corrections;
};

export const applyPrepCorrections = async (
  corrections: PrepCorrection[], 
  recipes: Recipe[], 
  ingredientsDB: Ingredient[],
  onProgress?: (current: number, total: number, lastId: string) => void
) => {
  const uniqueRecipeIds = new Set(corrections.map(c => c.recipeId));
  const recipesToUpdate = recipes.filter(r => uniqueRecipeIds.has(r.id));
  
  const total = recipesToUpdate.length;
  let processed = 0;
  const BATCH_SIZE = 20; 

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = recipesToUpdate.slice(i, i + BATCH_SIZE);

    chunk.forEach((recipe, idx) => {
      if (!recipe.raw_text) return;
      
      const newParse = parseRecipeContent(recipe.raw_text, ingredientsDB);
      
      const newItems: RecipeItem[] = newParse.ingredients.map(p => {
        let note = p.mappedNote;
        if (!p.matchedId) {
           const missingLabel = `UNRESOLVED: ${p.name}`;
           note = note ? `${missingLabel} | ${note}` : missingLabel;
        }
  
        return {
          type: 'ingredient',
          id: p.matchedId || '',
          quantity: p.qty,
          unit: p.unit,
          notes: note || undefined
        };
      });
  
      const ref = doc(db, 'recipes', recipe.id);
      
      batch.update(ref, { 
        items: newItems,
        status: newItems.some(i => !i.id) ? 'needs_resolution' : 'structured',
        updatedAt: new Date().toISOString()
      });

      if (onProgress) {
         onProgress(processed + idx + 1, total, recipe.id);
      }
    });
  
    await batch.commit();
    processed += chunk.length;
  }

  return total;
};

// --- NEW BULK COMMIT LOGIC ---

export interface CommitAction {
  pendingId: string;
  targetId: string; // If same as pendingId, it's a new create. If different, it's a merge.
  type: 'CREATE' | 'UPDATE';
  name: string;
  items: RecipeItem[];
  instructions: string;
}

export interface BulkCommitAnalysis {
  actions: CommitAction[];
  stats: {
    create: number;
    update: number;
  };
}

export const analyzeBulkCommit = (
  pendingRecipes: Recipe[], 
  allRecipes: Recipe[], 
  ingredientsDB: Ingredient[]
): BulkCommitAnalysis => {
  const actions: CommitAction[] = [];
  let createCount = 0;
  let updateCount = 0;

  // Index active recipes by normalized name for fast lookup
  const activeRecipeMap = new Map<string, string>(); // Name -> ID
  allRecipes.forEach(r => {
    if (r.status === 'active' || r.status === 'structured') {
      activeRecipeMap.set(normalizeName(r.name).toLowerCase(), r.id);
    }
  });

  pendingRecipes.forEach(pending => {
    if (!pending.raw_text) return; // Skip empty stuff

    const parsed = parseRecipeContent(pending.raw_text, ingredientsDB);
    const pendingNameNorm = normalizeName(pending.name).toLowerCase();
    
    // Check for collision
    const existingId = activeRecipeMap.get(pendingNameNorm);

    const items: RecipeItem[] = parsed.ingredients.map(p => {
       let note = p.mappedNote;
       if (!p.matchedId) {
          const missingLabel = `UNRESOLVED: ${p.name}`;
          note = note ? `${missingLabel} | ${note}` : missingLabel;
       }
       return {
         type: 'ingredient',
         id: p.matchedId || '',
         quantity: p.qty,
         unit: p.unit,
         notes: note || undefined
       };
    });

    const instructions = parsed.method.join('\n\n');

    if (existingId) {
      updateCount++;
      actions.push({
        pendingId: pending.id,
        targetId: existingId,
        type: 'UPDATE',
        name: pending.name,
        items,
        instructions
      });
    } else {
      createCount++;
      actions.push({
        pendingId: pending.id,
        targetId: pending.id, // Self
        type: 'CREATE',
        name: pending.name,
        items,
        instructions
      });
    }
  });

  return { actions, stats: { create: createCount, update: updateCount } };
};

export const executeBulkCommit = async (
  analysis: BulkCommitAnalysis,
  onProgress?: (current: number, total: number) => void
) => {
  const total = analysis.actions.length;
  const BATCH_SIZE = 120; // 500 is firestore limit, 120 is safe
  let processed = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = analysis.actions.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    chunk.forEach(action => {
      // 1. Prepare Data
      const updateData = {
        items: action.items,
        instructions: action.instructions,
        status: action.items.some(it => !it.id) ? 'needs_resolution' : 'active',
        updatedAt: new Date().toISOString(),
        // Keep raw_text as "Original Bill of Lading" in both cases
        // For Update: we might want to update raw_text on the target if it's a replacement? 
        // Logic: Yes, if we are overwriting, we update the raw_text too to match the new version.
        // Wait, prompt says "DO NOT overwrite the raw_text". 
        // "Field Protection: DO NOT overwrite the raw_text. We need that as our 'Original Bill of Lading'..."
        // BUT, if we are merging a NEW pending file into an OLD active file, the pending file HAS the raw text.
        // The old active file might have OLD raw text. 
        // If we don't overwrite, the old active file has old text but new items. Mismatch.
        // HOWEVER, strict adherence: "Ensure that raw_text remains untouched so we can always re-parse"
        // If 'id is new' (CREATE), we keep the pending doc's raw_text.
        // If 'id exists' (UPDATE), we are updating *targetId*. 
        // If we don't update raw_text on targetId, it keeps its old text.
        // BUT we are *merging*. 
        // Let's follow strict instruction: "DO NOT overwrite the raw_text."
        // This implies for UPDATE operations, we only update parsed fields.
      };

      if (action.type === 'UPDATE') {
        // Update Target
        const targetRef = doc(db, 'recipes', action.targetId);
        batch.update(targetRef, updateData);
        
        // Delete Source (Evict from Staging)
        const sourceRef = doc(db, 'recipes', action.pendingId);
        batch.delete(sourceRef);
      } else {
        // Promote Source (CREATE)
        const sourceRef = doc(db, 'recipes', action.pendingId);
        batch.update(sourceRef, updateData);
      }
    });

    await batch.commit();
    processed += chunk.length;
    if (onProgress) onProgress(processed, total);
  }
};
