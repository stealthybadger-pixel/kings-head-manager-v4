import { Allergen } from '../types';

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Vegetable': ['tomato', 'potato', 'onion', 'carrot', 'pepper', 'lettuce', 'cucumber', 'courgette', 'broccoli', 'leek', 'mushroom', 'celery', 'spinach', 'kale', 'asparagus', 'garlic', 'shallot', 'beetroot', 'parsnip', 'cabbage', 'sweetcorn', 'pea', 'bean', 'salad', 'radish', 'fennel', 'artichoke', 'celeriac', 'chard', 'watercress', 'rocket', 'chicory', 'endive', 'samphire', 'vegetable'],
  'Fruit': ['apple', 'pear', 'lemon', 'lime', 'orange', 'strawberry', 'raspberry', 'mango', 'pineapple', 'banana', 'melon', 'cherry', 'grape', 'peach', 'blueberry', 'blackberry', 'avocado', 'fig', 'pomegranate', 'passion fruit', 'grapefruit', 'plum', 'apricot', 'watermelon'],
  'Meat': ['chicken', 'beef', 'pork', 'lamb', 'duck', 'turkey', 'steak', 'mince', 'sausage', 'bacon', 'ham', 'gammon', 'venison', 'veal', 'liver', 'kidney', 'rib', 'loin', 'brisket', 'rump', 'sirloin', 'chorizo', 'salami', 'pancetta', 'prosciutto'],
  'Fish': ['salmon', 'cod', 'tuna', 'haddock', 'prawn', 'shrimp', 'crab', 'lobster', 'scallop', 'bass', 'mackerel', 'trout', 'plaice', 'halibut', 'sole', 'anchovy', 'sardine', 'squid', 'mussel', 'oyster', 'fish', 'seafood', 'bream', 'monkfish', 'skate'],
  'Dairy': ['milk', 'cream', 'butter', 'cheese', 'yogurt', 'creme', 'mascarpone', 'mozzarella', 'brie', 'cheddar', 'parmesan', 'halloumi', 'feta', 'stilton', 'camembert', 'goats', 'dairy', 'crème', 'egg'],
  'Dry Store': ['pasta', 'rice', 'flour', 'sugar', 'salt', 'lentil', 'chickpea', 'breadcrumb', 'couscous', 'quinoa', 'oat', 'cereal', 'noodle', 'cracker', 'biscuit', 'polenta', 'semolina', 'cornflour', 'custard', 'jelly', 'gelatine', 'bread', 'roll', 'bun', 'sourdough', 'brioche', 'focaccia', 'ciabatta', 'baguette', 'tortilla', 'wrap', 'pitta', 'crumpet', 'bagel', 'scone', 'croissant', 'oil', 'vinegar', 'dressing', 'balsamic', 'pastry', 'shortcrust', 'puff', 'filo', 'sauce', 'ketchup', 'mayo', 'mayonnaise', 'mustard', 'chutney', 'relish', 'jus', 'gravy', 'pesto', 'nut', 'seed', 'almond', 'walnut', 'cashew', 'pine nut', 'sunflower', 'pumpkin', 'sesame', 'peanut', 'pistachio', 'hazelnut', 'pecan', 'spice', 'paprika', 'cumin', 'coriander', 'turmeric', 'cinnamon', 'oregano', 'thyme', 'basil', 'rosemary', 'herb', 'cayenne', 'nutmeg', 'cardamom', 'clove', 'star anise', 'bay leaf', 'curry', 'tin', 'canned', 'jar', 'tinned', 'conserve', 'preserve'],
  'Frozen': ['frozen'],
  'Alcohol': ['wine', 'beer', 'spirit', 'gin', 'rum', 'vodka', 'whisky', 'brandy', 'champagne', 'prosecco', 'port', 'ale', 'lager', 'cider', 'sherry', 'liqueur', 'aperol'],
};

export function inferCategory(name: string): string | null {
  const lower = name.toLowerCase();
  const testWord = (w: string) => new RegExp(`\\b${w.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(lower);

  // Check Meat, Fish, Alcohol first to prevent false Dry Store overrides
  if (['chicken', 'beef', 'pork', 'lamb', 'duck', 'turkey', 'steak', 'mince', 'sausage', 'bacon', 'ham', 'gammon', 'venison', 'veal', 'liver', 'kidney', 'rib', 'loin', 'brisket', 'rump', 'sirloin', 'chorizo', 'salami', 'pancetta', 'prosciutto'].some(testWord)) return 'Meat';
  if (['salmon', 'cod', 'tuna', 'haddock', 'prawn', 'shrimp', 'crab', 'lobster', 'scallop', 'bass', 'mackerel', 'trout', 'plaice', 'halibut', 'sole', 'anchovy', 'sardine', 'squid', 'mussel', 'oyster', 'fish', 'seafood', 'bream', 'monkfish', 'skate'].some(testWord)) return 'Fish';
  if (['wine', 'beer', 'spirit', 'gin', 'rum', 'vodka', 'whisky', 'brandy', 'champagne', 'prosecco', 'port', 'ale', 'lager', 'cider', 'sherry', 'liqueur', 'aperol'].some(testWord)) return 'Alcohol';

  // Check Dry Store override (modifiers indicating dried/processed shelf-stable spices & herbs)
  const dryStoreModifiers = ['powder', 'dried', 'ground', 'spice', 'peppercorn', 'black pepper', 'white pepper', 'cayenne pepper', 'bay leaf', 'bay leaves'];
  if (dryStoreModifiers.some(testWord)) return 'Dry Store';

  // Rest in order
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(testWord)) return cat;
  }
  return null;
}

// Dry Store sub-categories — purely a client-side filtering/organisation aid.
export const DRY_STORE_SUBCATEGORIES = ['Spices', 'Whole Spices', 'Dried Herbs', 'Baking', 'Pasta & Rice', 'Tins & Jars', 'Oils & Vinegars', 'Sauces & Condiments', 'Nuts & Seeds', 'Bread & Bakery', 'Other'] as const;

// Vegetable sub-categories — same purpose, starts with just Herbs (fresh herbs like Basil,
// Thyme, Parsley — as opposed to Dry Store's "Dried Herbs").
export const VEGETABLE_SUBCATEGORIES = ['Herbs'] as const;

const DRY_STORE_SUBCATEGORY_KEYWORDS: Record<string, string[]> = {
  'Spices': ['paprika', 'cumin', 'turmeric', 'cinnamon', 'cayenne', 'nutmeg', 'cardamom', 'clove', 'star anise', 'curry', 'chilli powder', 'chili powder', 'spice', 'garam masala', 'five spice'],
  'Dried Herbs': ['oregano', 'thyme', 'basil', 'rosemary', 'coriander', 'bay leaf', 'dried herb', 'mixed herb', 'tarragon', 'sage', 'dill'],
  'Baking': ['flour', 'sugar', 'baking powder', 'bicarbonate', 'yeast', 'cornflour', 'custard', 'gelatine', 'icing', 'cocoa', 'vanilla', 'jelly'],
  'Pasta & Rice': ['pasta', 'rice', 'noodle', 'couscous', 'quinoa', 'polenta', 'semolina', 'lentil', 'chickpea', 'macaroni', 'spaghetti', 'penne', 'orzo'],
  'Tins & Jars': ['tin', 'tinned', 'canned', 'jar', 'conserve', 'preserve'],
  'Oils & Vinegars': ['oil', 'vinegar', 'balsamic'],
  'Sauces & Condiments': ['sauce', 'ketchup', 'mayo', 'mayonnaise', 'mustard', 'chutney', 'relish', 'jus', 'gravy', 'pesto', 'dressing'],
  'Nuts & Seeds': ['nut', 'seed', 'almond', 'walnut', 'cashew', 'pine nut', 'sunflower', 'pumpkin', 'sesame', 'peanut', 'pistachio', 'hazelnut', 'pecan'],
  'Bread & Bakery': ['bread', 'roll', 'bun', 'sourdough', 'brioche', 'focaccia', 'ciabatta', 'baguette', 'tortilla', 'wrap', 'pitta', 'crumpet', 'bagel', 'scone', 'croissant', 'pastry', 'shortcrust', 'puff', 'filo', 'breadcrumb', 'cracker', 'biscuit', 'oat', 'cereal'],
};

export function inferDryStoreSubCategory(name: string): string | null {
  const lower = name.toLowerCase();
  const testWord = (w: string) => new RegExp(`\\b${w.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(lower);
  for (const [sub, keywords] of Object.entries(DRY_STORE_SUBCATEGORY_KEYWORDS)) {
    if (keywords.some(testWord)) return sub;
  }
  return null;
}

// Rough starting-point defaults per category — staff can always override manually.
const CATEGORY_DEFAULTS: Record<string, { wastePercent: number; kcalPer100: number }> = {
  'Vegetable': { wastePercent: 10, kcalPer100: 35 },
  'Fruit': { wastePercent: 10, kcalPer100: 50 },
  'Meat': { wastePercent: 5, kcalPer100: 200 },
  'Fish': { wastePercent: 15, kcalPer100: 150 },
  'Dairy': { wastePercent: 2, kcalPer100: 250 },
  'Dry Store': { wastePercent: 0, kcalPer100: 350 },
  'Frozen': { wastePercent: 0, kcalPer100: 150 },
  'Alcohol': { wastePercent: 0, kcalPer100: 100 },
};

const ALLERGEN_KEYWORDS: Record<Allergen, string[]> = {
  'Milk': ['milk', 'cream', 'butter', 'cheese', 'yogurt', 'creme', 'crème', 'mascarpone', 'mozzarella', 'brie', 'cheddar', 'parmesan', 'halloumi', 'feta', 'stilton', 'camembert', 'goats cheese', 'dairy'],
  'Eggs': ['egg', 'mayo', 'mayonnaise', 'meringue', 'custard'],
  'Fish': ['salmon', 'cod', 'tuna', 'haddock', 'bass', 'mackerel', 'trout', 'plaice', 'halibut', 'sole', 'anchovy', 'sardine', 'fish', 'bream', 'monkfish', 'skate'],
  'Crustaceans': ['prawn', 'shrimp', 'crab', 'lobster', 'crayfish', 'langoustine'],
  'Molluscs': ['mussel', 'oyster', 'scallop', 'squid', 'clam', 'whelk', 'winkle'],
  'Peanuts': ['peanut'],
  'Nuts': ['almond', 'walnut', 'cashew', 'pine nut', 'pistachio', 'hazelnut', 'pecan', 'macadamia', 'brazil nut'],
  'Sesame': ['sesame', 'tahini'],
  'Soya': ['soya', 'soy', 'tofu', 'edamame'],
  'Wheat (Gluten)': ['flour', 'bread', 'pasta', 'pastry', 'wheat', 'breadcrumb', 'couscous', 'noodle', 'cracker', 'biscuit', 'roll', 'bun', 'sourdough', 'brioche', 'focaccia', 'ciabatta', 'baguette', 'tortilla', 'wrap', 'pitta', 'crumpet', 'bagel', 'scone', 'croissant', 'shortcrust', 'puff pastry', 'filo'],
  'Celery': ['celery', 'celeriac'],
  'Mustard': ['mustard'],
  'Sulphites': ['wine', 'prosecco', 'champagne', 'dried fruit', 'sherry', 'vinegar'],
  'Lupin': ['lupin'],
};

export function inferAllergens(name: string): Allergen[] {
  const lower = name.toLowerCase();
  const found: Allergen[] = [];
  for (const [allergen, keywords] of Object.entries(ALLERGEN_KEYWORDS) as [Allergen, string[]][]) {
    if (keywords.some(kw => lower.includes(kw))) found.push(allergen);
  }
  return found;
}

export interface IngredientAutofillResult {
  category: string | null;
  subCategory: string | null;
  wastePercent: number | null;
  kcalPer100: number | null;
  allergens: Allergen[];
}

export function inferIngredientDefaults(name: string): IngredientAutofillResult {
  const category = inferCategory(name);
  const defaults = category ? CATEGORY_DEFAULTS[category] : null;
  return {
    category,
    subCategory: category === 'Dry Store' ? inferDryStoreSubCategory(name) : null,
    wastePercent: defaults?.wastePercent ?? null,
    kcalPer100: defaults?.kcalPer100 ?? null,
    allergens: inferAllergens(name),
  };
}
