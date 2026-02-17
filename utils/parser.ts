
import { Ingredient, Unit } from '../types';
import { normalizeName as intelligentNormalize } from './intelligence';

export interface ParsedIngredient {
  originalText: string;
  qty: number;
  unit: Unit;
  name: string;
  originalName: string; // The raw name segment before prep extraction
  normalizedName: string;
  matchedId?: string;
  mappedNote?: string; // For Alias Mapping or Prep Notes
}

export interface ParsedRecipe {
  ingredients: ParsedIngredient[];
  method: string[];
  matchRate: number; // 0-1
  suggestedBatchSize?: number;
  suggestedBatchUnit?: Unit;
}

const NORMALIZE_UNITS: Record<string, Unit> = {
  'g': 'g', 'gram': 'g', 'grams': 'g',
  'ml': 'ml', 'milliliter': 'ml', 'milliliters': 'ml',
  'kg': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
  'l': 'l', 'liter': 'l', 'litres': 'l', 'liters': 'l',
  'ea': 'ea', 'each': 'ea', 'unit': 'ea', 'pcs': 'ea', 'piece': 'ea', 'pieces': 'ea',
  'cup': 'ea', 'cups': 'ea',
  'tsp': 'ea', 'teaspoon': 'ea', 'teaspoons': 'ea',
  'tbsp': 'ea', 'tablespoon': 'ea', 'tablespoons': 'ea',
  'oz': 'g', 'ounce': 'g', 'ounces': 'g', // Rough convert
  'lb': 'kg', 'pound': 'kg', 'pounds': 'kg' // Rough convert
};

const FRACTION_MAP: Record<string, number> = {
  '½': 0.5, '⅓': 1/3, '¼': 0.25, '¾': 0.75, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, 
  '⅙': 1/6, '⅚': 5/6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
};

// Comprehensive Kitchen Noise Blacklist
const PREP_WORDS = new Set([
  // Specified List
  'chopped', 'finely', 'roughly', 'minced', 'sliced', 'diced', 'picked', 'torn', 
  'crushed', 'ground', 'toasted', 'roasted', 'peeled', 'halved', 'quartered',
  
  // Extended Utility List
  'grated', 'whole', 'large', 'medium', 'small', 'bulb', 'bulbs', 'clove', 'cloves', 
  'head', 'heads', 'bunch', 'bunches', 'pinch', 'pinches', 'fresh', 'dried', 'dry', 
  'raw', 'cooked', 'smoked', 'fillet', 'fillets', 'breast', 'breasts', 'thigh', 'thighs', 
  'wing', 'wings', 'drumstick', 'drumsticks', 'boneless', 'skinless', 'lean', 'fat', 
  'extra', 'beaten', 'melted', 'softened', 'coarsely', 'thinly', 'thickly'
]);

const QTY_REGEX = /^((?:\d+\s+)?\d+\/\d+|[\d\.]+|[½⅓¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+)\s*([a-zA-Z]+)?\s+(.*)$/;

const parseQuantity = (raw: string): number => {
  if (!raw) return 0;
  
  if (FRACTION_MAP[raw]) return FRACTION_MAP[raw];

  if (raw.includes('/')) {
    const parts = raw.trim().split(/\s+/);
    let total = 0;
    for (const part of parts) {
      if (part.includes('/')) {
        const [num, den] = part.split('/').map(Number);
        if (den !== 0) total += num / den;
      } else {
        total += parseFloat(part) || 0;
      }
    }
    return total;
  }

  return parseFloat(raw) || 0;
};

// Normalization: Lowercase + Strip common plurals ('s', 'es')
const normalizeName = (name: string): string => {
  let lower = name.trim().toLowerCase();
  
  // Basic plural stripping
  if (lower.endsWith('es') && lower.length > 4) {
    lower = lower.slice(0, -2);
  } else if (lower.endsWith('s') && !lower.endsWith('ss') && lower.length > 3) {
    lower = lower.slice(0, -1);
  }
  
  return lower;
};

const extractPrepNotes = (rawName: string): { cleanName: string, notes: string | undefined } => {
  const words = rawName.split(/\s+/);
  const nameParts: string[] = [];
  const prepParts: string[] = [];

  for (const word of words) {
    // Remove punctuation for checking
    const checkWord = word.toLowerCase().replace(/[(),]/g, '');
    if (PREP_WORDS.has(checkWord)) {
      prepParts.push(word.replace(/[(),]/g, ''));
    } else {
      nameParts.push(word);
    }
  }

  return {
    cleanName: nameParts.join(' '),
    notes: prepParts.length > 0 ? prepParts.join(' ') : undefined
  };
};

const isMethodLine = (line: string): boolean => {
  const lower = line.toLowerCase();
  if (lower === 'method' || lower === 'instructions' || lower === 'preparation') return true;
  return false;
};

// SCORCHED EARTH: Force Ingredient Matching Only. 
// This function must NEVER accept a Recipe list for matching.
export const parseRecipeContent = (text: string, ingredientsDB: Ingredient[], recipeTitle?: string): ParsedRecipe => {
  if (!text) return { ingredients: [], method: [], matchRate: 0 };

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  let parsedIngredients: ParsedIngredient[] = [];
  const methodLines: string[] = [];
  
  let parsingMethodSection = false;
  
  // Guard: Normalize title for comparison using intelligence utils for consistent comparison
  const normalizedTitle = recipeTitle ? intelligentNormalize(recipeTitle).toLowerCase() : null;

  // Batch Size Guessing Accumulators
  let totalWeight = 0; // grams
  let totalVolume = 0; // ml

  for (const line of lines) {
    // Check for Section Headers that force a strict switch
    if (isMethodLine(line)) {
      parsingMethodSection = true;
      continue;
    }

    if (parsingMethodSection) {
      methodLines.push(line);
      continue;
    }

    // Attempt NER Parse
    const match = line.match(QTY_REGEX);
    
    if (match) {
      // It looks like an ingredient line: [Qty] [Unit?] [Name]
      const qty = parseQuantity(match[1]);
      const rawUnit = match[2]?.toLowerCase();
      const rawName = match[3];

      // Unit Normalization
      const unit = rawUnit && NORMALIZE_UNITS[rawUnit] ? NORMALIZE_UNITS[rawUnit] : 'ea';
      
      // Extraction: Separate Prep Notes from Name
      const { cleanName, notes } = extractPrepNotes(rawName);
      
      // Name Normalization
      const normalized = normalizeName(cleanName);
      const comparisonName = intelligentNormalize(cleanName).toLowerCase();

      // TITLE GUARD: Prevent parsing the recipe title as an ingredient of itself
      if (normalizedTitle && (comparisonName === normalizedTitle)) {
         console.debug(`[GUARD] REMOVED TITLE "${recipeTitle}" FROM INGREDIENTS`);
         continue; 
      }

      // Batch Accumulation
      if (unit === 'kg') totalWeight += qty * 1000;
      else if (unit === 'g') totalWeight += qty;
      else if (unit === 'l') totalVolume += qty * 1000;
      else if (unit === 'ml') totalVolume += qty;

      // STRICT MATCHING: ONLY INGREDIENTS.
      // We explicitly search the ingredientsDB.
      // We do NOT search any recipe collection.
      const matchedIng = ingredientsDB.find(i => normalizeName(i.name) === normalized);

      parsedIngredients.push({
        originalText: line,
        qty,
        unit,
        name: cleanName,
        originalName: rawName,
        normalizedName: normalized,
        matchedId: matchedIng?.id,
        mappedNote: notes // Store extracted prep words
      });

    } else {
      // If line doesn't match Qty Regex, treat as Method (or title)
      methodLines.push(line);
    }
  }

  // METHOD SANITATION FILTER
  const fullMethodText = methodLines.join('\n');
  parsedIngredients = parsedIngredients.filter(ing => !fullMethodText.includes(ing.originalText));

  // Calculate Match Rate
  const total = parsedIngredients.length;
  const matched = parsedIngredients.filter(p => !!p.matchedId).length;
  const matchRate = total > 0 ? matched / total : 0;

  // Calculate Batch Suggestion
  let suggestedBatchSize = 1;
  let suggestedBatchUnit: Unit = 'ea';
  
  if (totalWeight > 0 && totalWeight > totalVolume) {
     if (totalWeight >= 1000) {
        suggestedBatchSize = Number((totalWeight / 1000).toFixed(2));
        suggestedBatchUnit = 'kg';
     } else {
        suggestedBatchSize = Number(totalWeight.toFixed(0));
        suggestedBatchUnit = 'g';
     }
  } else if (totalVolume > 0) {
      if (totalVolume >= 1000) {
        suggestedBatchSize = Number((totalVolume / 1000).toFixed(2));
        suggestedBatchUnit = 'l';
     } else {
        suggestedBatchSize = Number(totalVolume.toFixed(0));
        suggestedBatchUnit = 'ml';
     }
  }

  return {
    ingredients: parsedIngredients,
    method: methodLines,
    matchRate,
    suggestedBatchSize,
    suggestedBatchUnit
  };
};
