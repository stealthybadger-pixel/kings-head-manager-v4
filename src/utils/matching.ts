import { Ingredient } from '../types';

export const getLevenshteinDistance = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
};

export const cleanProductName = (name: string): string => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // remove text in parentheses like (frozen), (box)
    .replace(/['"’]/g, '') // remove quotes
    .replace(/[,&/\-_+]/g, ' ') // replace common punctuation with spaces
    .replace(/\b(sachet|box|tray|pack|bag|case|bottle|tin|jar|can|pcs|slices|guide|catt|urban)\b/g, '') // remove packaging words
    // Remove generic marketing/quality filler words that pad out branded product names
    // (e.g. "Dr. Oetker Professional Bicarbonate of Soda") without describing the product
    // itself — left in, these push otherwise-good matches over the unmatched-word limit
    // in findBestIngredientMatch.
    .replace(/\b(professional|premium|finest|superior|gourmet|select|signature|quality)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const isTransposition = (w1: string, w2: string): boolean => {
  if (w1.length !== w2.length) return false;
  let diffCount = 0;
  let diffIndices: number[] = [];
  for (let i = 0; i < w1.length; i++) {
    if (w1[i] !== w2[i]) {
      diffCount++;
      diffIndices.push(i);
    }
  }
  if (diffCount === 2 && diffIndices[1] - diffIndices[0] === 1) {
    const idx1 = diffIndices[0];
    const idx2 = diffIndices[1];
    return w1[idx1] === w2[idx2] && w1[idx2] === w2[idx1];
  }
  return false;
};

// w1 is always a word from the catalog/product name being matched; w2 is always a word
// from the master pantry ingredient name (see getDistinctWords call order below).
const areWordsFuzzyEqual = (w1: string, w2: string): boolean => {
  if (w1 === w2) return true;

  // Transposition check (e.g., "fluor" vs "flour")
  if (isTransposition(w1, w2)) return true;

  // Prefix abbreviation check (minimum 3 characters, e.g. product word "cabb" vs ingredient
  // word "cabbage"). Directional on purpose: only the product word may be a truncated
  // abbreviation of the ingredient word, never the reverse — otherwise unrelated words that
  // happen to share a prefix (e.g. product "Larder" vs ingredient "Lard") would false-match.
  if (w1.length >= 3 && w2.length >= 3 && w1.length <= w2.length) {
    if (w2.startsWith(w1)) {
      return true;
    }
  }
  
  const maxLen = Math.max(w1.length, w2.length);
  // Disable fuzzy edit-distance matching for short words (length <= 5)
  // to avoid incorrect mapping of dense vocabulary (e.g. bread/bream, pork/port, rice/ripe)
  if (maxLen <= 5) {
    return false;
  }
  
  const dist = getLevenshteinDistance(w1, w2);
  return dist <= maxLen * 0.25;
};

const getDistinctWords = (wordsA: string[], wordsB: string[]): [string[], string[]] => {
  const unmatchedA = wordsA.filter(wa => !wordsB.some(wb => areWordsFuzzyEqual(wa, wb)));
  const unmatchedB = wordsB.filter(wb => !wordsA.some(wa => areWordsFuzzyEqual(wa, wb)));
  return [unmatchedA, unmatchedB];
};

export const findBestIngredientMatch = (
  productName: string,
  ingredients: Ingredient[]
): { ingredient: Ingredient; score: number } | null => {
  const cleanProd = cleanProductName(productName);
  if (!cleanProd || cleanProd.length < 2) return null;

  let bestMatch: Ingredient | null = null;
  let bestScore = Infinity; // Lower score is better

  const prodWords = cleanProd.split(/\s+/).filter(w => w.length > 0);

  for (const ing of ingredients) {
    const cleanIng = cleanProductName(ing.name);
    
    // Direct match check
    if (cleanProd === cleanIng) {
      return { ingredient: ing, score: 0 };
    }
    
    const ingWords = cleanIng.split(/\s+/).filter(w => w.length > 0);
    const [unmatchedProd, unmatchedIng] = getDistinctWords(prodWords, ingWords);

    // Reject matches where the master ingredient contains specific modifiers 
    // that are missing in the catalog product name (e.g. "wholemeal" missing in generic bread flour product).
    if (unmatchedIng.length > 0) {
      continue;
    }

    // Score is based on how many extra words the product has compared to the ingredient (lower is better, 0 is exact match)
    const score = unmatchedProd.length;

    // Limit fuzzy matches to a maximum of 2 unmatched product words (to keep it relevant)
    if (score <= 2 && score < bestScore) {
      bestScore = score;
      bestMatch = ing;
    }
  }

  if (bestMatch && bestScore !== Infinity) {
    return { ingredient: bestMatch, score: bestScore };
  }

  return null;
};
