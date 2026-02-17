
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

    // Re-run the enhanced parser with title guard
    const newParse = parseRecipeContent(recipe.raw_text, ingredientsDB, recipe.name);

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
      
      // Pass recipe.name to enable title guard during bulk correction
      const newParse = parseRecipeContent(recipe.raw_text, ingredientsDB, recipe.name);
      
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

    // Pass pending.name for title guard
    const parsed = parseRecipeContent(pending.raw_text, ingredientsDB, pending.name);
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
