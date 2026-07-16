import { describe, it, expect } from 'vitest';
import { suggestIngredientMatches } from '../suggest';
import { Ingredient } from '../../../src/types';

function ing(name: string): Ingredient {
  return {
    id: name,
    name,
    category: 'Dry Store',
    wastePercent: 0,
    allergens: [],
    kcalPer100: 0,
    stockLevel: 0,
    suppliers: []
  } as Ingredient;
}

describe('suggestIngredientMatches', () => {
  it('matches "Dill" against "Dill - Fresh" despite the extra descriptor word', () => {
    const results = suggestIngredientMatches('Dill', [ing('Dill - Fresh'), ing('Parsley - Fresh')]);
    expect(results[0]?.ingredient.name).toBe('Dill - Fresh');
  });

  it('matches "Beans - Edamame Shelled (Frozen)" style names too', () => {
    const results = suggestIngredientMatches('Frozen Edamame Beans', [ing('Beans - Edamame Shelled')]);
    expect(results[0]?.ingredient.name).toBe('Beans - Edamame Shelled');
  });

  it('does not surface wildly unrelated ingredients', () => {
    const results = suggestIngredientMatches('Dill', [ing('Chicken Breast')]);
    expect(results.length).toBe(0);
  });
});
