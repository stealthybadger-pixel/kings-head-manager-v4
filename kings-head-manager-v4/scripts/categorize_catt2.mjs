import fs from 'fs';

const CATEGORY_KEYWORDS = {
  'Vegetable': ['tomato', 'potato', 'onion', 'carrot', 'pepper', 'lettuce', 'cucumber', 'courgette', 'broccoli', 'leek', 'mushroom', 'celery', 'spinach', 'kale', 'asparagus', 'garlic', 'shallot', 'beetroot', 'parsnip', 'cabbage', 'sweetcorn', 'pea', 'bean', 'salad', 'radish', 'fennel', 'artichoke', 'celeriac', 'chard', 'watercress', 'rocket', 'chicory', 'endive', 'samphire', 'vegetable', 'basil', 'parsley', 'coriander', 'thyme', 'rosemary', 'sage', 'dill'],
  'Fruit': ['apple', 'pear', 'lemon', 'lime', 'orange', 'strawberry', 'raspberry', 'mango', 'pineapple', 'banana', 'melon', 'cherry', 'grape', 'peach', 'blueberry', 'blackberry', 'avocado', 'fig', 'pomegranate', 'passion fruit', 'grapefruit', 'plum', 'apricot', 'watermelon', 'fruit'],
  'Meat': ['chicken', 'beef', 'pork', 'lamb', 'duck', 'turkey', 'steak', 'mince', 'sausage', 'bacon', 'ham', 'gammon', 'venison', 'veal', 'liver', 'kidney', 'brisket', 'rump', 'sirloin', 'chorizo', 'salami', 'pancetta', 'prosciutto', 'meat'],
  'Fish': ['salmon', 'cod', 'tuna', 'haddock', 'prawn', 'shrimp', 'crab', 'lobster', 'scallop', 'mackerel', 'trout', 'plaice', 'halibut', 'sole', 'anchovy', 'sardine', 'squid', 'mussel', 'oyster', 'fish', 'seafood', 'bream', 'monkfish', 'skate'],
  'Dairy': ['milk', 'cream', 'butter', 'cheese', 'yogurt', 'creme', 'mascarpone', 'mozzarella', 'brie', 'cheddar', 'parmesan', 'halloumi', 'feta', 'stilton', 'camembert', 'goats', 'dairy', 'egg'],
  'Frozen': ['frozen'],
  'Alcohol': ['wine', 'beer', 'spirit', 'gin', 'vodka', 'whisky', 'brandy', 'champagne', 'prosecco', 'ale', 'lager', 'cider', 'sherry', 'liqueur', 'aperol'],
  'Bakery / Bread': ['bread', 'sourdough', 'brioche', 'focaccia', 'ciabatta', 'baguette', 'tortilla', 'pitta', 'crumpet', 'bagel', 'scone', 'croissant', 'pastry', 'shortcrust', 'filo', 'breadcrumb', 'cracker', 'biscuit'],
  'Pasta & Rice': ['pasta', 'rice', 'noodle', 'couscous', 'quinoa', 'polenta', 'semolina', 'lentil', 'chickpea', 'macaroni', 'spaghetti', 'penne'],
  'Sauces & Condiments': ['sauce', 'ketchup', 'mayo', 'mustard', 'chutney', 'relish', 'gravy', 'pesto', 'dressing'],
  'Oils & Vinegars': ['oil', 'vinegar', 'balsamic'],
  'Tins & Jars': ['tinned', 'canned', 'conserve', 'preserve'],
  'Baking': ['flour', 'sugar', 'baking powder', 'bicarbonate', 'yeast', 'cornflour', 'custard', 'gelatine', 'icing', 'cocoa', 'vanilla', 'jelly'],
  'Nuts & Seeds': ['almond', 'walnut', 'cashew', 'sunflower seed', 'pumpkin seed', 'sesame', 'peanut', 'pistachio', 'hazelnut', 'pecan'],
  'Spices & Dry Store': ['paprika', 'cumin', 'turmeric', 'cinnamon', 'cayenne', 'nutmeg', 'cardamom', 'clove', 'star anise', 'curry', 'chilli powder', 'garam masala', 'spice'],
  'Non-Food / Disposables': ['napkin', 'foil', 'film', 'glove', 'cloth', 'liner', 'straw', 'cup', 'plate', 'container', 'candle', 'wipe', 'bleach', 'detergent', 'cleaner', 'polish'],
};

function inferCategory(name) {
  const lower = name.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return cat;
  }
  return 'Other / Uncategorized';
}

const categorized = JSON.parse(fs.readFileSync('scripts/catt_categorized.json', 'utf8'));
const unmatched = categorized['Unmatched / No Master Ingredient'] || [];
delete categorized['Unmatched / No Master Ingredient'];

const subBuckets = {};
for (const item of unmatched) {
  const cat = inferCategory(item.name);
  const key = `[Not in your pantry] ${cat}`;
  if (!subBuckets[key]) subBuckets[key] = [];
  subBuckets[key].push(item);
}

const final = { ...categorized, ...subBuckets };
for (const cat of Object.keys(final)) final[cat].sort((a, b) => a.name.localeCompare(b.name));

const summary = Object.entries(final).map(([cat, items]) => `${cat}: ${items.length}`).sort();
console.log(summary.join('\n'));
console.log('Total:', Object.values(final).reduce((s, a) => s + a.length, 0));

fs.writeFileSync('scripts/catt_categorized_final.json', JSON.stringify(final));
