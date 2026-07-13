import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Force client to connect to local Firestore Emulator
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

initializeApp({
  projectId: 'kings-head-kitchen-claude'
});
const db = getFirestore();

// --- SCHEMAS / INTERFACES ---
interface IngredientSupplier {
  name: string;
  packCost: number;
  packSize: number;
  packUnit: string;
  isPreferred: boolean;
}

interface Ingredient {
  id: string;
  name: string;
  category: string;
  suppliers: IngredientSupplier[];
  parentIngredientId?: string;
}

interface RecipeItem {
  type: 'ingredient' | 'recipe';
  ingredientId?: string;
  subRecipeId?: string;
}

interface Recipe {
  id: string;
  items: RecipeItem[];
}

interface Dish {
  id: string;
  isLive?: boolean;
  items: any[];
}

interface SupplierProduct {
  id: string;
  name: string;
  supplier: string;
  packCost: number;
  packSize: number;
  packUnit: string;
}

// --- FUZZY NAME MATCHING ENGINE (src/utils/matching.ts parity) ---
const getLevenshteinDistance = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const cleanProductName = (name: string): string => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/['"’]/g, '')
    .replace(/[,&/\-_+]/g, ' ')
    .replace(/\b(sachet|box|tray|pack|bag|case|bottle|tin|jar|can|pcs|slices|guide|catt|urban)\b/g, '')
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

const areWordsFuzzyEqual = (w1: string, w2: string): boolean => {
  if (w1 === w2) return true;
  if (isTransposition(w1, w2)) return true;
  if (w1.length >= 3 && w2.length >= 3) {
    if (w1.startsWith(w2) || w2.startsWith(w1)) return true;
  }
  const maxLen = Math.max(w1.length, w2.length);
  if (maxLen <= 5) return false;
  const dist = getLevenshteinDistance(w1, w2);
  return dist <= maxLen * 0.25;
};

const getDistinctWords = (wordsA: string[], wordsB: string[]): [string[], string[]] => {
  const unmatchedA = wordsA.filter(wa => !wordsB.some(wb => areWordsFuzzyEqual(wa, wb)));
  const unmatchedB = wordsB.filter(wb => !wordsA.some(wa => areWordsFuzzyEqual(wa, wb)));
  return [unmatchedA, unmatchedB];
};

const findBestIngredientMatch = (
  productName: string,
  ingredients: Ingredient[]
): { ingredient: Ingredient; score: number } | null => {
  const cleanProd = cleanProductName(productName);
  if (!cleanProd || cleanProd.length < 2) return null;

  let bestMatch: Ingredient | null = null;
  let bestScore = Infinity;

  const prodWords = cleanProd.split(/\s+/).filter(w => w.length > 0);

  for (const ing of ingredients) {
    const cleanIng = cleanProductName(ing.name);
    if (cleanProd === cleanIng) {
      return { ingredient: ing, score: 0 };
    }
    const ingWords = cleanIng.split(/\s+/).filter(w => w.length > 0);
    const [unmatchedProd, unmatchedIng] = getDistinctWords(prodWords, ingWords);

    if (unmatchedIng.length > 0) continue;

    const score = unmatchedProd.length;
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

// --- ACTIVE MATRIX TRAVERSER (Stock.tsx parity) ---
function collectIngredientIds(items: RecipeItem[], allRecipes: Recipe[], visited = new Set<string>()): Set<string> {
  const ids = new Set<string>();
  for (const item of items ?? []) {
    if (item.type === 'ingredient' && item.ingredientId) {
      ids.add(item.ingredientId);
    } else if (item.type === 'recipe' && item.subRecipeId && !visited.has(item.subRecipeId)) {
      visited.add(item.subRecipeId);
      const sub = allRecipes.find(r => r.id === item.subRecipeId);
      if (sub) {
        collectIngredientIds(sub.items, allRecipes, visited).forEach(id => ids.add(id));
      }
    }
  }
  return ids;
}

// --- CATEGORY INFERENCE ENGINE (ingredientAutofill.ts parity) ---
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Vegetable': ['tomato', 'potato', 'onion', 'carrot', 'pepper', 'lettuce', 'cucumber', 'courgette', 'broccoli', 'leek', 'mushroom', 'celery', 'spinach', 'kale', 'asparagus', 'garlic', 'shallot', 'beetroot', 'parsnip', 'cabbage', 'sweetcorn', 'pea', 'bean', 'salad', 'radish', 'fennel', 'artichoke', 'celeriac', 'chard', 'watercress', 'rocket', 'chicory', 'endive', 'samphire', 'vegetable'],
  'Fruit': ['apple', 'pear', 'lemon', 'lime', 'orange', 'strawberry', 'raspberry', 'mango', 'pineapple', 'banana', 'melon', 'cherry', 'grape', 'peach', 'blueberry', 'blackberry', 'avocado', 'fig', 'pomegranate', 'passion fruit', 'grapefruit', 'plum', 'apricot', 'watermelon'],
  'Meat': ['chicken', 'beef', 'pork', 'lamb', 'duck', 'turkey', 'steak', 'mince', 'sausage', 'bacon', 'ham', 'gammon', 'venison', 'veal', 'liver', 'kidney', 'rib', 'loin', 'brisket', 'rump', 'sirloin', 'chorizo', 'salami', 'pancetta', 'prosciutto'],
  'Fish': ['salmon', 'cod', 'tuna', 'haddock', 'prawn', 'shrimp', 'crab', 'lobster', 'scallop', 'bass', 'mackerel', 'trout', 'plaice', 'halibut', 'sole', 'anchovy', 'sardine', 'squid', 'mussel', 'oyster', 'fish', 'seafood', 'bream', 'monkfish', 'skate'],
  'Dairy': ['milk', 'cream', 'butter', 'cheese', 'yogurt', 'creme', 'mascarpone', 'mozzarella', 'brie', 'cheddar', 'parmesan', 'halloumi', 'feta', 'stilton', 'camembert', 'goats', 'dairy', 'crème', 'egg'],
  'Dry Store': ['pasta', 'rice', 'flour', 'sugar', 'salt', 'lentil', 'chickpea', 'breadcrumb', 'couscous', 'quinoa', 'oat', 'cereal', 'noodle', 'cracker', 'biscuit', 'polenta', 'semolina', 'cornflour', 'custard', 'jelly', 'gelatine', 'bread', 'roll', 'bun', 'sourdough', 'brioche', 'focaccia', 'ciabatta', 'baguette', 'tortilla', 'wrap', 'pitta', 'crumpet', 'bagel', 'scone', 'croissant', 'oil', 'vinegar', 'dressing', 'balsamic', 'pastry', 'shortcrust', 'puff', 'filo', 'sauce', 'ketchup', 'mayo', 'mayonnaise', 'mustard', 'chutney', 'relish', 'jus', 'gravy', 'pesto', 'nut', 'seed', 'almond', 'walnut', 'cashew', 'pine nut', 'sunflower', 'pumpkin', 'sesame', 'peanut', 'pistachio', 'hazelnut', 'pecan', 'spice', 'paprika', 'cumin', 'coriander', 'turmeric', 'cinnamon', 'oregano', 'thyme', 'basil', 'rosemary', 'herb', 'cayenne', 'nutmeg', 'cardamom', 'clove', 'star anise', 'bay leaf', 'curry', 'tin', 'canned', 'jar', 'tinned', 'conserve', 'preserve'],
  'Frozen': ['frozen'],
  'Alcohol': ['wine', 'beer', 'spirit', 'gin', 'rum', 'vodka', 'whisky', 'brandy', 'champagne', 'prosecco', 'port', 'ale', 'lager', 'cider', 'sherry', 'liqueur', 'aperol'],
};

function inferCategory(name: string): string | null {
  const lower = name.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return null;
}

const DRY_STORE_SUBCATEGORY_KEYWORDS: Record<string, string[]> = {
  'Spices': ['paprika', 'cumin', 'turmeric', 'cinnamon', 'cayenne', 'nutmeg', 'cardamom', 'clove', 'star anise', 'curry', 'chilli powder', 'chili powder', 'spice', 'garam masala', 'five spice'],
  'Dried Herbs': ['oregano', 'thyme', 'basil', 'rosemary', 'coriander', 'bay leaf', 'dried herb', 'mixed herb', 'tarragon', 'sage', 'dill'],
};

function inferDryStoreSubCategory(name: string): string | null {
  const lower = name.toLowerCase();
  for (const [sub, keywords] of Object.entries(DRY_STORE_SUBCATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return sub;
  }
  return null;
}

async function cleanDatabase() {
  try {
    console.log("--------------------------------------------------");
    console.log("[START]: Initializing Local Firestore Emulator Clean-Up...");
    
    // Load Master Data
    const ingSnap = await db.collection('ingredients').get();
    const ingredients: Ingredient[] = [];
    ingSnap.forEach(doc => ingredients.push({ id: doc.id, ...doc.data() } as Ingredient));

    const recSnap = await db.collection('recipes').get();
    const recipes: Recipe[] = [];
    recSnap.forEach(doc => recipes.push({ id: doc.id, ...doc.data() } as Recipe));

    const dishSnap = await db.collection('dishes').get();
    const dishes: Dish[] = [];
    dishSnap.forEach(doc => dishes.push({ id: doc.id, ...doc.data() } as Dish));

    console.log(`- Loaded database items: ${ingredients.length} ingredients, ${recipes.length} recipes, ${dishes.length} dishes.`);

    // Cascade down from Live Dishes to establish "Active Matrix"
    const activeIds = new Set<string>();
    const liveDishes = dishes.filter(d => d.isLive);
    for (const dish of liveDishes) {
      for (const item of dish.items ?? []) {
        if (item.type === 'ingredient' && item.ingredientId) {
          activeIds.add(item.ingredientId);
        } else if (item.type === 'recipe' && item.subRecipeId) {
          const recipe = recipes.find(r => r.id === item.subRecipeId);
          if (recipe) {
            collectIngredientIds(recipe.items, recipes).forEach(id => activeIds.add(id));
          }
        }
      }
    }

    // Include parent/child yields (whole-animal relationships)
    const finalActiveIds = new Set<string>(activeIds);
    for (const id of activeIds) {
      const ing = ingredients.find(i => i.id === id);
      if (ing) {
        if (ing.parentIngredientId) {
          finalActiveIds.add(ing.parentIngredientId);
        }
        ingredients.forEach(i => {
          if (i.parentIngredientId === ing.id) {
            finalActiveIds.add(i.id);
          }
        });
      }
    }

    console.log(`- Found ${finalActiveIds.size} active (menu-relevant) master ingredients.`);
    console.log("--------------------------------------------------");

    console.log("[MATCHING STRATEGY]: Active Item Criteria & Matching Rules:");
    console.log("- Non-targeted Wholesalers: Crouch, Cranbrook, Glovers, and others are strictly KEPT.");
    console.log("- Target Wholesalers: Booker and Urban items are evaluated.");
    console.log("- Core Match: Clean name normalization + fuzzy word containment (Levenstein distance score <= 2).");
    console.log("- Fresh Fruit & Veg: David Catt is preferred; Booker & Urban are deleted.");
    console.log("- Meat: Preferred meat supplier is kept; Booker & Urban are deleted.");
    console.log("- Interchangeable (Dry/Dairy/Alcohol/Non Consumables): Alternative lines from David Catt, Booker, & Urban are preserved.");
    console.log("--------------------------------------------------");

    // Filter Active Ingredient list
    const activeIngredientsList = ingredients;

    // Load Wholesaler Products
    const prodSnap = await db.collection('supplierProducts').get();
    const supplierProducts: SupplierProduct[] = [];
    prodSnap.forEach(doc => supplierProducts.push({ id: doc.id, ...doc.data() } as SupplierProduct));

    console.log(`Loaded ${supplierProducts.length} total catalog products.`);

    const toDelete: string[] = [];
    const toKeep: string[] = [];

    for (const prod of supplierProducts) {
      const { supplier, name: prodName } = prod;

      // 1. Skip non-targeted wholesalers
      if (supplier !== 'Booker' && supplier !== 'Urban') {
        toKeep.push(prod.id);
        continue;
      }

      // Keep ALL dried herbs, spices, and cheeses (cheddar, brie, blue, stilton) from Booker or Urban (regardless of matching a master ingredient)
      const inferredCat = inferCategory(prodName);
      const inferredSubCat = inferredCat === 'Dry Store' ? inferDryStoreSubCategory(prodName) : null;
      
      const isSpiceOrHerb = inferredCat === 'Dry Store' && (inferredSubCat === 'Spices' || inferredSubCat === 'Dried Herbs');
      const isCheese = inferredCat === 'Dairy' && (
        prodName.toLowerCase().includes('cheddar') ||
        prodName.toLowerCase().includes('brie') ||
        prodName.toLowerCase().includes('stilton') ||
        (prodName.toLowerCase().includes('blue') && !prodName.toLowerCase().includes('blueberry') && !prodName.toLowerCase().includes('blueberries'))
      );

      if (isSpiceOrHerb || isCheese) {
        toKeep.push(prod.id);
        continue;
      }

      // Find the matched active ingredient (fuzzy match)
      const match = findBestIngredientMatch(prodName, activeIngredientsList);
      const matchedIng = match ? match.ingredient : null;

      // Core Anchor Rule: If it does not match an active master ingredient, DELETE
      if (!matchedIng) {
        toDelete.push(prod.id);
        continue;
      }

      const category = matchedIng.category;

      // Fruit & Vegetables
      if (category === 'Fruit' || category === 'Vegetable') {
        if (supplier === 'David Catt') {
          toKeep.push(prod.id);
        } else {
          // Purge Booker/Urban options for fresh produce
          toDelete.push(prod.id);
        }
        continue;
      }

      // Meat
      if (category === 'Meat') {
        const prefSup = matchedIng.suppliers?.find(s => s.isPreferred) || matchedIng.suppliers?.[0];
        if (prefSup && prefSup.name === supplier) {
          toKeep.push(prod.id);
        } else {
          toDelete.push(prod.id);
        }
        continue;
      }

      // Interchangeable (Dairy, Dry Store, Alcohol, Non Consumables, etc.)
      if (['Dairy', 'Dry Store', 'Alcohol', 'Non Consumables', 'Frozen'].includes(category)) {
        toKeep.push(prod.id);
        continue;
      }

      // Default keep fallback
      toKeep.push(prod.id);
    }

    console.log("--------------------------------------------------");
    console.log(`[STAGE 1 COMPLETE]: Evaluation Complete.`);
    console.log(`- Total Items to Keep: ${toKeep.length}`);
    console.log(`- Total Items to Delete: ${toDelete.length}`);
    console.log("--------------------------------------------------");

    if (toDelete.length === 0) {
      console.log("No items marked for deletion. Clean-up complete!");
      return;
    }

    console.log("[BATCH PROCESSING]: Executing batch deletions...");
    let batchCount = 1;
    let currentBatch = db.batch();
    let opCount = 0;

    for (let i = 0; i < toDelete.length; i++) {
      const docRef = db.collection('supplierProducts').doc(toDelete[i]);
      currentBatch.delete(docRef);
      opCount++;

      if (opCount === 500) {
        await currentBatch.commit();
        console.log(`- Processing batch ${batchCount}... ${i + 1}/${toDelete.length} items deleted.`);
        currentBatch = db.batch();
        opCount = 0;
        batchCount++;
      }
    }

    if (opCount > 0) {
      await currentBatch.commit();
      console.log(`- Processing batch ${batchCount}... ${toDelete.length}/${toDelete.length} items deleted.`);
    }

    console.log("--------------------------------------------------");
    console.log("[COMPLETE]: Database Optimization complete!");
    console.log(`- Purged: ${toDelete.length} bloated supplier products.`);
    console.log(`- Kept: ${toKeep.length} relevant supplier products.`);
    console.log("- Please check the Firebase Emulator Suite UI at http://127.0.0.1:4000/firestore to verify the cleaned state.");
    console.log("--------------------------------------------------");

  } catch (err) {
    console.error("Error running database clean-up:", err);
  }
}

cleanDatabase();
