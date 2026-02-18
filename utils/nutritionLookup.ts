
export type KcalResult = {
  value: number;
  source: 'COFID' | 'USDA';
};

// UK COFID / McCance & Widdowson — kcal per 100g
// Keys are matched via string.includes() so use the most specific substring
export const COFID_DATA: Record<string, number> = {
  // Vegetables
  'potato': 77, 'sweet potato': 86, 'onion': 40, 'spring onion': 32, 'shallot': 20,
  'garlic': 149, 'carrot': 41, 'broccoli': 34, 'cauliflower': 25, 'cabbage': 25,
  'lettuce': 15, 'spinach': 23, 'kale': 49, 'pepper': 20, 'chilli': 40,
  'tomato': 18, 'cucumber': 15, 'courgette': 17, 'mushroom': 22, 'leek': 22,
  'celery': 7, 'celeriac': 42, 'asparagus': 20, 'beetroot': 43, 'parsnip': 75,
  'radish': 16, 'pea': 81, 'sweetcorn': 86, 'corn': 86, 'ginger': 80,
  'aubergine': 25, 'fennel': 31, 'pak choi': 13, 'squash': 34, 'butternut': 45,
  'pumpkin': 26, 'turnip': 28, 'swede': 24, 'artichoke': 47, 'okra': 33,
  'watercress': 11, 'rocket': 25, 'broad bean': 88, 'runner bean': 22,
  'green bean': 25, 'mange tout': 32, 'sugar snap': 42, 'edamame': 122,
  'lemongrass': 99, 'samphire': 20,

  // Fruits
  'apple': 52, 'banana': 89, 'orange': 47, 'blood orange': 50, 'clementine': 47,
  'satsuma': 35, 'lemon': 29, 'lime': 30, 'grapefruit': 33,
  'strawberry': 32, 'raspberry': 52, 'blueberry': 57, 'blackberry': 43,
  'cherry': 50, 'grape': 69, 'melon': 34, 'watermelon': 30,
  'pineapple': 50, 'mango': 60, 'kiwi': 61, 'peach': 39, 'nectarine': 44,
  'plum': 46, 'apricot': 48, 'fig': 74, 'date': 282, 'avocado': 190,
  'passion fruit': 97, 'pomegranate': 83, 'rhubarb': 21, 'pear': 57,
  'cranberry': 46, 'papaya': 43, 'guava': 68, 'lychee': 66,
  'redcurrant': 56, 'blackcurrant': 63, 'gooseberry': 40,

  // Meat
  'chicken breast': 165, 'chicken thigh': 177, 'chicken wing': 203, 'chicken': 165,
  'beef steak': 271, 'beef mince': 250, 'beef': 250, 'mince': 225,
  'pork loin': 184, 'pork belly': 518, 'pork': 184,
  'lamb shoulder': 235, 'lamb leg': 203, 'lamb': 294,
  'bacon': 541, 'ham': 145, 'sausage': 301, 'chorizo': 455, 'pancetta': 460,
  'duck breast': 337, 'duck': 404, 'turkey': 104, 'venison': 158, 'veal': 172,
  'liver': 135, 'kidney': 103, 'black pudding': 297,
  'quail': 192, 'rabbit': 136, 'pigeon': 213, 'pheasant': 220, 'grouse': 173,
  'bresaola': 172, 'salami': 438, 'prosciutto': 195, 'nduja': 350,
  'suet': 891, 'bone marrow': 786, 'oxtail': 262, 'brisket': 250,

  // Fish & Seafood
  'salmon': 208, 'cod': 82, 'tuna': 144, 'haddock': 89, 'sea bass': 97, 'bass': 97,
  'bream': 100, 'trout': 148, 'mackerel': 262, 'sardine': 208,
  'prawn': 99, 'shrimp': 99, 'lobster': 89, 'crab': 87,
  'mussel': 86, 'clam': 74, 'oyster': 81, 'scallop': 69,
  'squid': 92, 'calamari': 92, 'octopus': 82, 'anchovy': 210,
  'halibut': 111, 'monkfish': 76, 'sole': 70, 'plaice': 79, 'hake': 71,
  'turbot': 95, 'john dory': 80, 'skate': 89, 'brill': 86,
  'langoustine': 90, 'crayfish': 72, 'caviar': 264, 'roe': 143,
  'smoked salmon': 183, 'kipper': 205, 'whitebait': 525,

  // Dairy & Eggs
  'double cream': 450, 'single cream': 193, 'cream': 450, 'clotted cream': 586,
  'creme fraiche': 300, 'sour cream': 193, 'buttermilk': 40,
  'whole milk': 63, 'semi-skimmed': 46, 'skimmed milk': 35, 'milk': 63,
  'butter': 717, 'ghee': 898, 'margarine': 720,
  'cheddar': 416, 'parmesan': 431, 'mozzarella': 280, 'ricotta': 174,
  'feta': 264, 'brie': 334, 'camembert': 300, 'stilton': 410,
  'gouda': 356, 'gruyere': 413, 'halloumi': 320, 'paneer': 265,
  'mascarpone': 429, 'cream cheese': 342, 'goat cheese': 364,
  'yogurt': 61, 'greek yogurt': 97,
  'egg': 155, 'eggs': 155, 'egg yolk': 322, 'egg white': 52,

  // Dry Store & Pantry
  'plain flour': 364, 'self-raising': 345, 'flour': 364, 'cornflour': 356,
  'semolina': 360, 'polenta': 370, 'breadcrumb': 395, 'panko': 395,
  'caster sugar': 400, 'demerara': 394, 'icing sugar': 400, 'brown sugar': 380, 'sugar': 400,
  'salt': 0, 'black pepper': 251, 'peppercorn': 251,
  'rice': 130, 'basmati': 121, 'arborio': 130, 'wild rice': 101,
  'pasta': 131, 'spaghetti': 158, 'penne': 131, 'noodle': 138,
  'couscous': 376, 'quinoa': 120, 'bulgur': 342, 'freekeh': 325,
  'lentil': 116, 'chickpea': 164, 'cannellini': 91, 'kidney bean': 127,
  'oats': 389, 'porridge': 71,
  'honey': 304, 'golden syrup': 325, 'treacle': 290, 'maple syrup': 260,
  'chocolate': 546, 'dark chocolate': 546, 'white chocolate': 539, 'cocoa': 228,
  'coconut milk': 197, 'coconut cream': 330, 'coconut': 354,
  'olive oil': 884, 'vegetable oil': 884, 'sunflower oil': 884, 'rapeseed oil': 884,
  'sesame oil': 884, 'truffle oil': 884, 'oil': 884,
  'vinegar': 22, 'balsamic': 88, 'cider vinegar': 21, 'red wine vinegar': 19,
  'stock cube': 235, 'bouillon': 235, 'marmite': 260,
  'yeast': 169, 'baking powder': 53, 'bicarbonate': 0,
  'vanilla': 288, 'vanilla extract': 288, 'vanilla pod': 288,
  'gelatine': 335, 'agar': 306, 'pectin': 162, 'xanthan': 333,
  'soy sauce': 53, 'tamari': 60, 'fish sauce': 35,
  'miso': 199, 'tahini': 595, 'harissa': 70, 'gochujang': 120,
  'curry paste': 110, 'pesto': 317, 'tomato paste': 82, 'tomato puree': 76,
  'worcestershire': 78, 'tabasco': 12, 'sriracha': 93,
  'mayonnaise': 680, 'ketchup': 112, 'mustard': 66, 'dijon': 66, 'horseradish': 62,
  'pickle': 28, 'capers': 23, 'chutney': 200, 'jam': 252, 'marmalade': 261,
  'bread': 265, 'sourdough': 259, 'brioche': 346, 'ciabatta': 271,
  'pita': 275, 'tortilla': 312, 'crouton': 407,

  // Nuts & Seeds
  'almond': 575, 'walnut': 654, 'cashew': 553, 'pecan': 691,
  'pistachio': 560, 'hazelnut': 628, 'macadamia': 718, 'brazil nut': 656,
  'pine nut': 673, 'chestnut': 170, 'peanut': 567, 'peanut butter': 588,
  'sesame seed': 573, 'poppy seed': 525, 'sunflower seed': 584,
  'pumpkin seed': 559, 'flaxseed': 534, 'chia': 486,

  // Alcohol
  'red wine': 85, 'white wine': 82, 'wine': 85, 'beer': 43, 'cider': 36,
  'brandy': 220, 'rum': 231, 'gin': 263, 'vodka': 231, 'whisky': 250,
  'prosecco': 80, 'champagne': 76, 'sherry': 116, 'port': 157,
  'marsala': 123, 'vermouth': 145, 'amaretto': 310, 'kahlua': 275,
  'cointreau': 240, 'grand marnier': 240, 'limoncello': 310,

  // Herbs & Spices (dried)
  'cinnamon': 247, 'cumin': 375, 'coriander seed': 298, 'turmeric': 312,
  'paprika': 282, 'smoked paprika': 282, 'cayenne': 318,
  'nutmeg': 525, 'clove': 274, 'cardamom': 311, 'star anise': 337,
  'saffron': 310, 'sumac': 239, 'za\'atar': 276, 'five spice': 340,
};

export async function lookupKcal(query: string): Promise<KcalResult | null> {
  if (!query) return null;

  // Simulate network latency for "lookup" feeling
  await new Promise(resolve => setTimeout(resolve, 600));

  const lower = query.toLowerCase();

  // 1. Try COFID (Simulated Local Lookup for robust demo)
  // In production, replace with fetch('https://api.eatwell.co.uk/...')
  for (const [key, val] of Object.entries(COFID_DATA)) {
    if (lower.includes(key)) {
      return { value: val, source: 'COFID' };
    }
  }

  // 2. Try USDA (Real API call if key exists)
  // Casting import.meta to any to avoid TS error about missing 'env' property
  const USDA_KEY = (import.meta as any).env?.VITE_USDA_API_KEY;
  if (USDA_KEY) {
     try {
       const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=1&api_key=${USDA_KEY}`);
       const data = await res.json();
       if (data.foods && data.foods.length > 0) {
         const food = data.foods[0];
         // Energy (Atwater General Factors) is nutrientId 1008, or Energy (KCAL) is 2047 or 1008
         const energy = food.foodNutrients.find((n: any) => n.nutrientId === 1008 || n.nutrientId === 2047);
         if (energy) {
           return { value: Math.round(energy.value), source: 'USDA' };
         }
       }
     } catch(e) {
       console.warn("USDA lookup failed", e);
     }
  }

  return null;
}
