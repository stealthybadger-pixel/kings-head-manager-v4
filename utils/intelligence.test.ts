import { describe, it, expect } from 'vitest';
import {
  detectAllergens,
  detectCategory,
  normalizeName,
  spellCorrect,
  getLevenshteinDistance,
  normalizeCategory,
  detectSupplierFromCategory,
  estimateKcal,
} from './intelligence';
import { Allergen } from '../types';

describe('detectAllergens', () => {
  it('detects milk allergen', () => {
    expect(detectAllergens('Double Cream')).toContain(Allergen.MILK);
    expect(detectAllergens('Cheddar Cheese')).toContain(Allergen.MILK);
    expect(detectAllergens('Butter')).toContain(Allergen.MILK);
  });

  it('detects egg allergen', () => {
    expect(detectAllergens('Free Range Eggs')).toContain(Allergen.EGGS);
    expect(detectAllergens('Egg Yolk')).toContain(Allergen.EGGS);
  });

  it('detects wheat allergen', () => {
    expect(detectAllergens('Plain Flour')).toContain(Allergen.WHEAT);
    expect(detectAllergens('Pasta')).toContain(Allergen.WHEAT);
  });

  it('detects fish allergen', () => {
    expect(detectAllergens('Salmon Fillet')).toContain(Allergen.FISH);
    expect(detectAllergens('Cod Loin')).toContain(Allergen.FISH);
  });

  it('detects crustacean allergen', () => {
    expect(detectAllergens('King Prawns')).toContain(Allergen.CRUSTACEANS);
    expect(detectAllergens('Lobster Bisque')).toContain(Allergen.CRUSTACEANS);
  });

  it('detects sesame allergen', () => {
    expect(detectAllergens('Tahini Paste')).toContain(Allergen.SESAME);
    expect(detectAllergens('Sesame Oil')).toContain(Allergen.SESAME);
  });

  it('does not flag gin in ginger (exact match guard)', () => {
    const allergens = detectAllergens('Fresh Ginger Root');
    expect(allergens).not.toContain(Allergen.SULPHITES); // gin → sulphites via alcohol
  });

  it('does not flag nut in walnut for peanut allergen', () => {
    // walnut should be tree nuts, not peanuts
    const allergens = detectAllergens('Walnut');
    expect(allergens).not.toContain(Allergen.PEANUTS);
    expect(allergens).toContain(Allergen.TREE_NUTS);
  });

  it('returns empty array for unallergen ingredient', () => {
    expect(detectAllergens('Carrot')).toEqual([]);
    expect(detectAllergens('Potato')).toEqual([]);
  });

  it('detects multiple allergens', () => {
    const allergens = detectAllergens('Pasta with Cream Sauce');
    expect(allergens).toContain(Allergen.WHEAT);
    expect(allergens).toContain(Allergen.MILK);
  });
});

describe('detectCategory', () => {
  it('categorizes vegetables', () => {
    expect(detectCategory('Carrot')).toBe('Vegetable');
    expect(detectCategory('Spinach')).toBe('Vegetable');
    expect(detectCategory('Leeks')).toBe('Vegetable');
  });

  it('categorizes fruit', () => {
    expect(detectCategory('Apple')).toBe('Fruit');
    expect(detectCategory('Mango')).toBe('Fruit');
    expect(detectCategory('Lemon')).toBe('Fruit');
  });

  it('categorizes meat', () => {
    expect(detectCategory('Chicken Breast')).toBe('Meat');
    expect(detectCategory('Beef Mince')).toBe('Meat');
    expect(detectCategory('Lamb Shoulder')).toBe('Meat');
  });

  it('categorizes fish/seafood', () => {
    expect(detectCategory('Salmon')).toBe('Fish');
    expect(detectCategory('King Prawns')).toBe('Fish');
    expect(detectCategory('Cod')).toBe('Fish');
  });

  it('categorizes dairy', () => {
    expect(detectCategory('Double Cream')).toBe('Dairy');
    expect(detectCategory('Cheddar Cheese')).toBe('Dairy');
    expect(detectCategory('Whole Milk')).toBe('Dairy');
  });

  it('dry store overrides take priority (seeds, dried, ground)', () => {
    expect(detectCategory('Coriander Seeds')).toBe('Dry Store');
    expect(detectCategory('Dried Chilli Flakes')).toBe('Dry Store');
    expect(detectCategory('Ground Cinnamon')).toBe('Dry Store');
  });

  it('defaults to Dry Store for unknown ingredients', () => {
    expect(detectCategory('Xanthan Gum')).toBe('Dry Store');
    expect(detectCategory('Some Unknown Thing')).toBe('Dry Store');
  });
});

describe('normalizeName', () => {
  it('title-cases the first word', () => {
    expect(normalizeName('carrot')).toBe('Carrot');
    expect(normalizeName('chicken breast')).toBe('Chicken Breast');
  });

  it('keeps small conjunctions lowercase (except first word)', () => {
    expect(normalizeName('salt and pepper')).toBe('Salt and Pepper');
    expect(normalizeName('oil of oregano')).toBe('Oil of Oregano');
  });

  it('corrects common typos', () => {
    expect(normalizeName('tumeric')).toBe('Turmeric');
    expect(normalizeName('mozarella')).toBe('Mozzarella');
    expect(normalizeName('spinich')).toBe('Spinach');
  });

  it('trims and collapses whitespace', () => {
    expect(normalizeName('  carrot  ')).toBe('Carrot');
    expect(normalizeName('double  cream')).toBe('Double Cream');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeName('')).toBe('');
  });
});

describe('spellCorrect', () => {
  it('corrects known typos', () => {
    expect(spellCorrect('tumeric')).toBe('turmeric');
    expect(spellCorrect('spinich')).toBe('spinach');
    expect(spellCorrect('mozarella')).toBe('mozzarella');
  });

  it('preserves capitalisation of corrected words', () => {
    expect(spellCorrect('Tumeric')).toBe('Turmeric');
    expect(spellCorrect('Spinich')).toBe('Spinach');
  });

  it('leaves correct words unchanged', () => {
    expect(spellCorrect('carrot')).toBe('carrot');
    expect(spellCorrect('salmon')).toBe('salmon');
  });

  it('handles empty string', () => {
    expect(spellCorrect('')).toBe('');
  });

  it('corrects typos within a sentence', () => {
    const result = spellCorrect('Add tumeric and spinich to the pot');
    expect(result).toBe('Add turmeric and spinach to the pot');
  });
});

describe('getLevenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(getLevenshteinDistance('carrot', 'carrot')).toBe(0);
    expect(getLevenshteinDistance('', '')).toBe(0);
  });

  it('returns length of string when other is empty', () => {
    expect(getLevenshteinDistance('carrot', '')).toBe(6);
    expect(getLevenshteinDistance('', 'carrot')).toBe(6);
  });

  it('returns 1 for single character difference', () => {
    expect(getLevenshteinDistance('carrot', 'carrots')).toBe(1);
    expect(getLevenshteinDistance('cat', 'bat')).toBe(1);
  });

  it('calculates distance for common typos', () => {
    expect(getLevenshteinDistance('salmon', 'samon')).toBe(1);
    expect(getLevenshteinDistance('broccoli', 'brocolli')).toBe(2);
  });
});

describe('normalizeCategory', () => {
  it('normalizes category aliases', () => {
    expect(normalizeCategory('veg')).toBe('Vegetable');
    expect(normalizeCategory('vegetables')).toBe('Vegetable');
    expect(normalizeCategory('seafood')).toBe('Fish');
    expect(normalizeCategory('pantry')).toBe('Dry Store');
    expect(normalizeCategory('butcher')).toBe('Meat');
  });

  it('is case-insensitive', () => {
    expect(normalizeCategory('VEG')).toBe('Vegetable');
    expect(normalizeCategory('Dairy')).toBe('Dairy');
  });

  it('returns original string for unknown categories', () => {
    expect(normalizeCategory('Custom Category')).toBe('Custom Category');
  });
});

describe('detectSupplierFromCategory', () => {
  it('maps category to expected supplier', () => {
    expect(detectSupplierFromCategory('Fruit')).toBe('David Catt');
    expect(detectSupplierFromCategory('Vegetable')).toBe('David Catt');
    expect(detectSupplierFromCategory('Meat')).toBe('Crouch');
    expect(detectSupplierFromCategory('Fish')).toBe('Cranbrook');
    expect(detectSupplierFromCategory('Dry Store')).toBe('Urban');
    expect(detectSupplierFromCategory('Dairy')).toBe('David Catt');
  });

  it('returns Internal for unknown categories', () => {
    expect(detectSupplierFromCategory('Unknown')).toBe('Internal');
    expect(detectSupplierFromCategory('')).toBe('Internal');
  });
});

describe('estimateKcal', () => {
  it('returns high kcal for oil/fat', () => {
    expect(estimateKcal('Olive Oil')).toBe(900);
    expect(estimateKcal('Animal Fat')).toBe(900);
  });

  it('returns kcal for butter', () => {
    expect(estimateKcal('Butter')).toBe(717);
  });

  it('returns kcal for sugar', () => {
    expect(estimateKcal('Caster Sugar')).toBe(400);
  });

  it('returns kcal for flour', () => {
    expect(estimateKcal('Plain Flour')).toBe(360);
  });

  it('returns 0 for water and salt', () => {
    expect(estimateKcal('Water')).toBe(0);
    expect(estimateKcal('Salt')).toBe(0);
  });

  it('returns 0 for unrecognized ingredients', () => {
    expect(estimateKcal('Carrot')).toBe(0);
  });
});
