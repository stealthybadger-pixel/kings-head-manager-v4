import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBx_7Raw_xgM2dQWBmUU29W9ggbcmVmo_Y",
  authDomain: "kings-head-kitchen-claude.firebaseapp.com",
  projectId: "kings-head-kitchen-claude",
  storageBucket: "kings-head-kitchen-claude.firebasestorage.app",
  messagingSenderId: "661815699598",
  appId: "1:661815699598:web:e05a12781db09844f241df"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const DRY_STORE_SUBCATEGORY_KEYWORDS = {
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

function inferDryStoreSubCategory(name) {
  const lower = name.toLowerCase();
  for (const [sub, keywords] of Object.entries(DRY_STORE_SUBCATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return sub;
  }
  return null;
}

const snap = await getDocs(query(collection(db, 'ingredients'), where('category', '==', 'Dry Store')));

let updated = 0;
let skippedHasSubCategory = 0;
let skippedNoMatch = 0;
const breakdown = {};

for (const d of snap.docs) {
  const data = d.data();
  if (data.subCategory) { skippedHasSubCategory++; continue; }
  const guess = inferDryStoreSubCategory(data.name || '');
  if (!guess) { skippedNoMatch++; continue; }
  await updateDoc(doc(db, 'ingredients', d.id), { subCategory: guess, updatedAt: new Date().toISOString() });
  updated++;
  breakdown[guess] = (breakdown[guess] || 0) + 1;
}

console.log(`Total Dry Store ingredients: ${snap.size}`);
console.log(`Updated: ${updated}`);
console.log(`Already had a sub-category: ${skippedHasSubCategory}`);
console.log(`No keyword match (left blank — falls under "Other"): ${skippedNoMatch}`);
console.log('Breakdown:', breakdown);
process.exit(0);
