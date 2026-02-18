
import { Allergen } from '../types';

const ALLERGEN_KEYWORDS: Record<Allergen, string[]> = {
  [Allergen.MILK]: ['milk', 'cream', 'butter', 'cheese', 'yogurt', 'whey', 'casein', 'lactose', 'ghee', 'dairy', 'paneer', 'fraiche', 'mascarpone', 'parmesan', 'cheddar', 'mozzarella', 'ricotta', 'feta'],
  [Allergen.EGGS]: ['egg', 'mayo', 'albumin', 'yolk', 'meringue', 'ovalgumin', 'aioli', 'custard'],
  [Allergen.FISH]: ['fish', 'salmon', 'cod', 'tuna', 'haddock', 'bass', 'bream', 'anchovy', 'halibut', 'trout', 'hake', 'monkfish', 'snapper', 'mackerel', 'sardine', 'turbot', 'sole'],
  [Allergen.CRUSTACEANS]: ['crab', 'lobster', 'prawn', 'shrimp', 'scampi', 'langoustine', 'crayfish', 'bisque', 'gambas'],
  [Allergen.MOLLUSCS]: ['mussel', 'clam', 'oyster', 'scallop', 'squid', 'octopus', 'snail', 'whelk', 'calamari', 'cockle'],
  [Allergen.PEANUTS]: ['peanut', 'groundnut', 'monkey nut'],
  [Allergen.TREE_NUTS]: ['nut', 'almond', 'walnut', 'cashew', 'pecan', 'brazil', 'pistachio', 'macadamia', 'hazelnut', 'praline', 'marzipan', 'chestnut', 'pine nut', 'nuts', 'pecans', 'walnuts', 'almonds', 'cashews'],
  [Allergen.SESAME]: ['sesame', 'tahini', 'hummus', 'furikake', 'gomasio'],
  [Allergen.SOYA]: ['soya', 'soy', 'tofu', 'edamame', 'tempeh', 'miso', 'tamari', 'lecithin', 'teriyaki', 'soybean'],
  [Allergen.WHEAT]: ['wheat', 'flour', 'gluten', 'bread', 'pasta', 'semolina', 'couscous', 'spelt', 'bulgur', 'rye', 'barley', 'panko', 'brioche', 'ciabatta', 'sourdough', 'pastry', 'noodle'],
  [Allergen.CELERY]: ['celery', 'celeriac', 'celery salt'],
  [Allergen.MUSTARD]: ['mustard', 'dijon', 'moutarde'],
  [Allergen.SULPHITES]: [
    'sulphite', 'sulfite', 'wine', 'cider', 'vinegar', 'dried fruit', 'preservative 220', 
    'prosecco', 'champagne', 'sherry', 'brandy', 'rum', 'whisky', 'whiskey', 'gin', 
    'vodka', 'liqueur', 'alcohol', 'spirit', 'bourbon', 'tequila', 'vermouth', 'port', 
    'marsala', 'cognac', 'armagnac', 'schnapps', 'triple sec', 'cointreau', 'amaretto'
  ],
  [Allergen.LUPIN]: ['lupin']
};

/**
 * Keywords that must match a WHOLE word only.
 * e.g. 'gin' matches "Gin" but NOT "Ginger" or "Aubergine".
 * e.g. 'rum' matches "Rum" but NOT "Crumbs" or "Rump".
 */
const EXACT_MATCH_KEYWORDS = new Set(['gin', 'rum', 'port', 'rye', 'nut', 'soy', 'barley', 'rice', 'tea']);

/**
 * COMPREHENSIVE KEYWORD DICTIONARY
 * Categorizes ingredients based on name strings to drive automated routing.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Vegetable': [
    'potato', 'potatoes', 'onion', 'onions', 'garlic', 'carrot', 'carrots', 'broccoli', 'cauliflower',
    'cabbage', 'savoy', 'lettuce', 'spinach', 'sprout', 'sprouts', 'brussels',
    'kale', 'cavolo nero', 'spring green', 'chard', 'pepper', 'peppers', 'chilli', 'chillies',
    'scotch bonnet', 'jalapeno', 'habanero',
    'tomato', 'tomatoes', 'cherry tom', 'cucumber', 'courgette', 'courgettes', 'zucchini',
    'mushroom', 'mushrooms', 'leek', 'leeks', 'celery', 'celeriac',
    'asparagus', 'beetroot', 'parsnip', 'parsnips', 'radish', 'radishes', 'mooli',
    'pea', 'peas', 'petit pois', 'sweetcorn', 'corn on',
    'ginger', 'lemongrass', 'galangal', 'coriander', 'basil', 'mint', 'parsley', 'rosemary', 'thyme',
    'chive', 'chives', 'dill', 'tarragon', 'sage', 'oregano', 'marjoram', 'bay leaf', 'curry leaf',
    'shallot', 'shallots', 'spring onion', 'squash', 'butternut', 'pumpkin', 'aubergine', 'fennel',
    'pak choi', 'bok choi', 'mange tout', 'sugar snap', 'tenderstem', 'purple sprouting', 'broccolini',
    'micro', 'leaf', 'rocket', 'watercress', 'samphire', 'sea beet',
    'endive', 'radicchio', 'chicory', 'artichoke', 'turnip', 'swede', 'kohlrabi', 'yam', 'okra',
    'sweet potato', 'edamame', 'beansprout', 'bamboo shoot', 'water chestnut', 'daikon',
    'broad bean', 'runner bean', 'green bean', 'french bean', 'borlotti',
    'baby gem', 'gem lettuce', 'little gem', 'romaine', 'iceberg', 'lollo', 'frisee',
    'sorrel', 'nettle', 'wild garlic', 'ramp', 'truffle'
  ],
  'Fruit': [
    'apple', 'apples', 'banana', 'bananas', 'orange', 'oranges', 'lemon', 'lemons', 'lime', 'limes',
    'strawberry', 'strawberries', 'raspberry', 'raspberries', 'blueberry', 'blueberries',
    'blackberry', 'blackberries', 'cherry', 'cherries', 'grape', 'grapes',
    'melon', 'pineapple', 'mango', 'mangoes', 'kiwi', 'peach', 'peaches', 'nectarine', 'nectarines',
    'plum', 'plums', 'apricot', 'apricots', 'fig', 'figs', 'date', 'avocado',
    'passion fruit', 'pomegranate', 'rhubarb', 'pear', 'pears', 'grapefruit', 'clementine', 'clementines',
    'satsuma', 'blood orange', 'kumquat', 'dragon fruit', 'lychee', 'papaya', 'guava', 'star fruit',
    'redcurrant', 'blackcurrant', 'gooseberry', 'gooseberries', 'cranberry', 'cranberries'
  ],
  'Meat': [
    'beef', 'chicken', 'pork', 'lamb', 'steak', 'mince', 'sausage', 'sausages', 'bacon', 'ham', 'gammon',
    'turkey', 'duck', 'goose', 'venison', 'veal', 'rabbit', 'chorizo', 'salami', 'pepperoni', 'pancetta',
    'brisket', 'shoulder', 'loin', 'breast', 'thigh', 'wing', 'drumstick', 'rib', 'fillet',
    'black pudding', 'haggis', 'offal', 'liver', 'kidney', 'cheek', 'tail', 'bone', 'suet',
    'quail', 'pigeon', 'pheasant', 'grouse', 'marrow',
    'tomahawk', 'ribeye', 'sirloin', 'rump', 'bavette', 'onglet', 'nduja', 'bresaola', 'prosciutto',
    'coppa', 'guanciale', 'speck', 'oxtail', 'shin', 'shank'
  ],
  'Fish': [
    'salmon', 'cod', 'tuna', 'haddock', 'bass', 'sea bass', 'bream', 'trout', 'mackerel', 'sardine', 'sardines',
    'prawn', 'prawns', 'shrimp', 'lobster', 'crab', 'mussel', 'mussels', 'clam', 'clams',
    'oyster', 'oysters', 'scallop', 'scallops', 'squid', 'octopus', 'anchovy', 'anchovies', 'snapper',
    'swordfish', 'halibut', 'turbot', 'monkfish', 'kipper', 'hake', 'sole', 'plaice', 'brill', 'skate',
    'john dory', 'mullet', 'eel', 'roach', 'perch', 'pike', 'caviar', 'roe',
    'langoustine', 'crayfish', 'calamari', 'whitebait', 'whelk', 'cockle', 'cockles',
    'smoked salmon', 'smoked haddock', 'smoked mackerel', 'fish cake', 'fish pie',
    'ceviche', 'gravlax', 'sashimi', 'seabream', 'sea trout', 'lemon sole', 'dover sole'
  ],
  'Dry Store': [
    'flour', 'sugar', 'salt', 'oil', 'vinegar', 'rice', 'pasta', 'couscous', 'quinoa', 'lentil', 'lentils',
    'chickpea', 'chickpeas', 'nut', 'seed', 'spice', 'herb', 'chocolate', 'cocoa', 'honey', 'syrup', 'jam',
    'pickle', 'stock', 'broth', 'coffee', 'tea', 'biscuit', 'cracker', 'cereal', 'oats', 'yeast',
    'baking powder', 'vanilla', 'coconut milk', 'curry paste', 'mustard', 'mayo', 'ketchup', 'soy', 'miso',
    'tahini', 'gelatine', 'pectin', 'xanthan', 'lecithin', 'cornflour', 'bulgur', 'polenta', 'semolina',
    'kidney bean', 'cannellini', 'haricot', 'pinto', 'black bean'
  ],
  'Frozen': [
    'frozen', 'ice', 'gelato', 'sorbet', 'chips', 'frozen peas', 'frozen berries', 'par-baked', 'ice cream'
  ],
  'Dairy': [
    'milk', 'cream', 'butter', 'cheese', 'yogurt', 'egg', 'margarine', 'mascarpone', 'parmesan', 'cheddar', 
    'mozzarella', 'ricotta', 'feta', 'dairy', 'whey', 'brie', 'camembert', 'stilton', 'halloumi', 'paneer', 
    'kefir', 'creme fraiche', 'sour cream', 'buttermilk', 'chilled'
  ],
  'Alcohol': [
    'wine', 'beer', 'cider', 'spirit', 'brandy', 'rum', 'gin', 'vodka', 'whisky', 'liqueur', 'prosecco', 'champagne', 'sherry', 'port', 'bourbon', 'tequila', 'cognac', 'armagnac'
  ]
};

/**
 * SUPPLIER ROUTING RULES
 * Maps categories to specific wholesale partners.
 */
const CATEGORY_TO_SUPPLIER: Record<string, string> = {
  'Fruit': 'David Catt',
  'Vegetable': 'David Catt',
  'Dairy': 'David Catt',
  'Dry Store': 'Urban',
  'Frozen': 'Urban',
  'Fish': 'Cranbrook',
  'Meat': 'Crouch',
  'Alcohol': 'Urban'
};

const COMMON_TYPOS: Record<string, string> = {
  'tomatos': 'Tomatoes',
  'tomatoe': 'Tomato',
  'potatos': 'Potatoes',
  'potatoe': 'Potato',
  'chili': 'Chilli', 
  'chilis': 'Chillis',
  'yoghurt': 'Yogurt',
  'yogurt': 'Yogurt',
  'spinich': 'Spinach',
  'brocolli': 'Broccoli',
  'broccoli': 'Broccoli',
  'avocadoe': 'Avocado',
  'omlette': 'Omelette',
  'omnelette': 'Omelette',
  'mayonaise': 'Mayonnaise',
  'vinagar': 'Vinegar',
  'vinager': 'Vinegar',
  'mozarella': 'Mozzarella',
  'parmesian': 'Parmesan',
  'vanila': 'Vanilla',
  'whiskey': 'Whisky',
};

const TITLE_CASE_EXCEPTIONS = ['and', 'of', 'in', 'with', 'a', 'the', 'or', 'for', 'w/', 'b/l', 's/r'];

export const detectAllergens = (name: string): Allergen[] => {
  const detected: Allergen[] = [];
  
  Object.entries(ALLERGEN_KEYWORDS).forEach(([allergen, keywords]) => {
    // Check if any keyword matches
    const hasMatch = keywords.some(keyword => {
      // 1. Exact matches only for short/common overlapping words
      // e.g. "gin" should not match "ginger", "rum" should not match "crumbs"
      if (EXACT_MATCH_KEYWORDS.has(keyword)) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        return regex.test(name);
      }
      
      // 2. Standard Match: Must start at a word boundary
      // e.g. "egg" matches "eggs" (good)
      // "rum" matches "crumbs" (bad) -> Fixed by \b check
      // "gin" matches "aubergine" (bad) -> Fixed by \b check
      const regex = new RegExp(`\\b${keyword}`, 'i');
      return regex.test(name);
    });

    if (hasMatch) {
      detected.push(allergen as Allergen);
    }
  });
  
  return detected;
};

// Override keywords: if the name contains any of these, force Dry Store
// regardless of other matches (e.g. "Coriander Seeds" → Dry Store, not Vegetable)
const DRY_STORE_OVERRIDES = ['seed', 'dried', 'ground', 'powder', 'paste', 'extract', 'essence', 'puree', 'concentrate'];

// Category name normalization: map common variants to canonical names
const CATEGORY_ALIASES: Record<string, string> = {
  'veg': 'Vegetable', 'vegetables': 'Vegetable', 'vegetable': 'Vegetable',
  'fruit': 'Fruit', 'fruits': 'Fruit',
  'meat': 'Meat', 'meats': 'Meat', 'butcher': 'Meat',
  'fish': 'Fish', 'seafood': 'Fish',
  'dairy': 'Dairy',
  'dry store': 'Dry Store', 'dry': 'Dry Store', 'pantry': 'Dry Store', 'store cupboard': 'Dry Store',
  'frozen': 'Frozen',
  'alcohol': 'Alcohol', 'drinks': 'Alcohol', 'beverage': 'Alcohol',
};

export const normalizeCategory = (category: string): string => {
  return CATEGORY_ALIASES[category.toLowerCase().trim()] || category;
};

export const detectCategory = (name: string): string => {
  const lowercaseName = name.toLowerCase();

  // Check Dry Store overrides first (seeds, dried, ground, powder, etc.)
  if (DRY_STORE_OVERRIDES.some(ov => lowercaseName.includes(ov))) {
    return 'Dry Store';
  }

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(keyword => lowercaseName.includes(keyword))) {
      return category;
    }
  }
  return 'Dry Store'; // Safe default
};

export const detectSupplierFromCategory = (category: string): string => {
  return CATEGORY_TO_SUPPLIER[category] || 'Internal';
};

export const estimateKcal = (name: string): number => {
  const lowercaseName = name.toLowerCase();
  if (lowercaseName.includes('oil') || lowercaseName.includes('fat')) return 900;
  if (lowercaseName.includes('butter')) return 717;
  if (lowercaseName.includes('sugar')) return 400;
  if (lowercaseName.includes('flour')) return 360;
  if (lowercaseName.includes('cream')) return 450;
  if (lowercaseName.includes('water') || lowercaseName.includes('salt')) return 0;
  return 0;
};

export const getLevenshteinDistance = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

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

export const normalizeName = (name: string): string => {
  if (!name) return '';
  
  // 1. Clean whitespace
  const words = name.toLowerCase().trim().split(/\s+/);
  
  const fixed = words.map((w, i) => {
    // 2. Fix Common Typos (check lower case)
    let word = COMMON_TYPOS[w] || w;
    
    // 3. Title Case Rules
    // Always capitalize first word
    // Ignore exceptions unless it's the first word
    if (i === 0 || !TITLE_CASE_EXCEPTIONS.includes(word)) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
    return word; // keep lowercase for exceptions like 'and', 'of'
  });
  
  return fixed.join(' ');
};
