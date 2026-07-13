import fs from 'fs';

const ingredients = Object.values(JSON.parse(fs.readFileSync('firestore-dump/ingredients.json', 'utf8')));
const products = JSON.parse(fs.readFileSync('firestore-dump/supplierProducts.json', 'utf8'));
const cattItems = Object.entries(products)
  .filter(([id, p]) => p.supplier === 'David Catt')
  .map(([id, p]) => ({ id, ...p }));

// --- simplified fuzzy matcher (mirrors src/utils/matching.ts) ---
function cleanProductName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/['"'']/g, '')
    .replace(/[,&/\-_+]/g, ' ')
    .replace(/\b(sachet|box|tray|pack|bag|case|bottle|tin|jar|can|pcs|slices|guide|catt|urban)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++)
    for (let j = 1; j <= a.length; j++)
      m[i][j] = b[i-1] === a[j-1] ? m[i-1][j-1] : Math.min(m[i-1][j-1]+1, m[i][j-1]+1, m[i-1][j]+1);
  return m[b.length][a.length];
}
function fuzzyEq(w1, w2) {
  if (w1 === w2) return true;
  const maxLen = Math.max(w1.length, w2.length);
  if (w1.length >= 3 && w2.length >= 3 && (w1.startsWith(w2) || w2.startsWith(w1))) return true;
  if (maxLen <= 5) return false;
  return levenshtein(w1, w2) <= maxLen * 0.25;
}
function distinctWords(a, b) {
  return [a.filter(x => !b.some(y => fuzzyEq(x,y))), b.filter(y => !a.some(x => fuzzyEq(x,y)))];
}
function bestMatch(prodName, ings) {
  const cleanProd = cleanProductName(prodName);
  if (!cleanProd || cleanProd.length < 2) return null;
  const prodWords = cleanProd.split(/\s+/).filter(Boolean);
  let best = null, bestScore = Infinity;
  for (const ing of ings) {
    const cleanIng = cleanProductName(ing.name);
    if (cleanProd === cleanIng) return ing;
    const ingWords = cleanIng.split(/\s+/).filter(Boolean);
    const [unmatchedProd, unmatchedIng] = distinctWords(prodWords, ingWords);
    if (unmatchedIng.length > 0) continue;
    const score = unmatchedProd.length;
    if (score <= 2 && score < bestScore) { bestScore = score; best = ing; }
  }
  return best;
}

const categorized = {};
for (const item of cattItems) {
  const match = bestMatch(item.name, ingredients);
  const category = match ? match.category : 'Unmatched / No Master Ingredient';
  if (!categorized[category]) categorized[category] = [];
  categorized[category].push({
    id: item.id,
    name: item.name,
    packCost: item.packCost,
    packSize: item.packSize,
    packUnit: item.packUnit,
    matchedIngredient: match ? match.name : null
  });
}

for (const cat of Object.keys(categorized)) {
  categorized[cat].sort((a,b) => a.name.localeCompare(b.name));
}

const summary = Object.entries(categorized).map(([cat, items]) => `${cat}: ${items.length}`).sort();
console.log('Total David Catt items:', cattItems.length);
console.log(summary.join('\n'));

fs.writeFileSync('scripts/catt_categorized.json', JSON.stringify(categorized, null, 2));
console.log('Saved scripts/catt_categorized.json');
