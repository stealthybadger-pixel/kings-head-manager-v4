import { cleanProductName, areWordsFuzzyEqual } from '../../src/utils/matching';
import { Ingredient } from '../../src/types';

export interface SuggestionResult {
  ingredient: Ingredient;
  unmatchedProductWords: number;
  unmatchedIngredientWords: number;
}

// A more lenient variant of the shared findBestIngredientMatch (utils/matching.ts),
// used only for this tool's AI Suggestion panel.
//
// The shared matcher hard-rejects any ingredient with words the product name
// doesn't have — the right call for its actual job (e.g. cheaper-option
// detection, where "Wholemeal Flour" genuinely shouldn't match a generic
// "flour" product). But this app's pantry names are frequently formatted as
// "Item - Descriptor" (e.g. "Dill - Fresh", "Beans - Edamame Shelled"), so a
// single generic descriptor word on the ingredient side would otherwise kill
// an exact match outright. Here, extra words on EITHER side just count
// against the confidence score instead of disqualifying the candidate.
export function suggestIngredientMatches(
  productName: string,
  ingredients: Ingredient[],
  limit = 5
): SuggestionResult[] {
  const cleanProd = cleanProductName(productName);
  if (!cleanProd || cleanProd.length < 2) return [];
  const prodWords = cleanProd.split(/\s+/).filter((w) => w.length > 0);

  const results: SuggestionResult[] = [];
  for (const ing of ingredients) {
    const cleanIng = cleanProductName(ing.name);
    if (!cleanIng) continue;
    const ingWords = cleanIng.split(/\s+/).filter((w) => w.length > 0);

    if (cleanProd === cleanIng) {
      results.push({ ingredient: ing, unmatchedProductWords: 0, unmatchedIngredientWords: 0 });
      continue;
    }

    const unmatchedProd = prodWords.filter((wa) => !ingWords.some((wb) => areWordsFuzzyEqual(wa, wb)));
    const unmatchedIng = ingWords.filter((wb) => !prodWords.some((wa) => areWordsFuzzyEqual(wa, wb)));

    // Require at least one real word overlap — otherwise a short product name
    // like "Dill" could slip under the total-slack cap below against a
    // completely unrelated ingredient purely because both names are short.
    const hasOverlap = unmatchedProd.length < prodWords.length;
    // Cap total slack so wildly unrelated names don't surface as "suggestions".
    if (hasOverlap && unmatchedProd.length + unmatchedIng.length <= 3) {
      results.push({ ingredient: ing, unmatchedProductWords: unmatchedProd.length, unmatchedIngredientWords: unmatchedIng.length });
    }
  }

  results.sort(
    (a, b) =>
      a.unmatchedProductWords + a.unmatchedIngredientWords - (b.unmatchedProductWords + b.unmatchedIngredientWords)
  );
  return results.slice(0, limit);
}
