// Categorizes Booker/Urban supplierProducts docs (from the local emulator) into keep/remove,
// using the same fuzzy-match logic as the in-app catalogue capture (src/utils/matching.ts),
// plus explicit rules for herbs/spices/seeds/nuts, baking staples, cooking wine, soft drinks,
// vs. meat/fish/frozen-premade/alcohol/tinned-prepared/non-consumables.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
initializeApp({ projectId: 'kings-head-kitchen-claude' });
const db = getFirestore();

// --- reimplementation of src/utils/matching.ts (plain JS, no TS ingredient typing needed) ---
function getLevenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[b.length][a.length];
}

function cleanProductName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/['"’]/g, '')
    .replace(/[,&/\-_+]/g, ' ')
    .replace(/\b(sachet|box|tray|pack|bag|case|bottle|tin|jar|can|pcs|slices|guide|catt|urban)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTransposition(w1, w2) {
  if (w1.length !== w2.length) return false;
  let diffCount = 0;
  const diffIndices = [];
  for (let i = 0; i < w1.length; i++) {
    if (w1[i] !== w2[i]) { diffCount++; diffIndices.push(i); }
  }
  if (diffCount === 2 && diffIndices[1] - diffIndices[0] === 1) {
    const [i1, i2] = diffIndices;
    return w1[i1] === w2[i2] && w1[i2] === w2[i1];
  }
  return false;
}

function areWordsFuzzyEqual(w1, w2) {
  if (w1 === w2) return true;
  if (isTransposition(w1, w2)) return true;
  if (w1.length >= 3 && w2.length >= 3) {
    if (w1.startsWith(w2) || w2.startsWith(w1)) return true;
  }
  const maxLen = Math.max(w1.length, w2.length);
  if (maxLen <= 5) return false;
  return getLevenshteinDistance(w1, w2) <= maxLen * 0.25;
}

function getDistinctWords(wordsA, wordsB) {
  const unmatchedA = wordsA.filter(wa => !wordsB.some(wb => areWordsFuzzyEqual(wa, wb)));
  const unmatchedB = wordsB.filter(wb => !wordsA.some(wa => areWordsFuzzyEqual(wa, wb)));
  return [unmatchedA, unmatchedB];
}

function findBestIngredientMatch(productName, ingredients) {
  const cleanProd = cleanProductName(productName);
  if (!cleanProd || cleanProd.length < 2) return null;
  let bestMatch = null;
  let bestScore = Infinity;
  const prodWords = cleanProd.split(/\s+/).filter(Boolean);
  for (const ing of ingredients) {
    const cleanIng = cleanProductName(ing.name);
    if (cleanProd === cleanIng) return { ingredient: ing, score: 0 };
    const ingWords = cleanIng.split(/\s+/).filter(Boolean);
    const [unmatchedProd, unmatchedIng] = getDistinctWords(prodWords, ingWords);
    if (unmatchedIng.length > 0) continue;
    const score = unmatchedProd.length;
    if (score <= 2 && score < bestScore) { bestScore = score; bestMatch = ing; }
  }
  return bestMatch ? { ingredient: bestMatch, score: bestScore } : null;
}

// --- category rule keywords ---
const HERB_SPICE_SEED_NUT = [
  'herb', 'spice', 'seasoning', 'cumin', 'paprika', 'oregano', 'basil', 'thyme', 'rosemary',
  'cinnamon', 'nutmeg', 'clove', 'coriander', 'turmeric', 'chilli powder', 'chili powder',
  'pepper corn', 'peppercorn', 'bay leaf', 'bay leaves', 'sage', 'tarragon', 'dill', 'mint',
  'parsley', 'chive', 'fennel seed', 'mustard seed', 'sesame seed', 'poppy seed', 'caraway',
  'cardamom', 'star anise', 'saffron', 'vanilla pod', 'chilli flake', 'chili flake',
  'garlic powder', 'onion powder', 'ginger powder', 'mixed spice', 'curry powder',
  'seed', 'nuts', 'almond', 'cashew', 'walnut', 'pistachio', 'hazelnut', 'peanut', 'pecan',
  'pine nut', 'sunflower seed', 'pumpkin seed', 'linseed', 'chia seed',
];
const BAKING_STAPLES = ['flour', 'baking powder', 'gelatin', 'gelatine', 'bicarbonate', 'bicarb', 'sugar'];
const COOKING_WINE = ['cooking wine'];
const SOFT_DRINKS = ['soft drink', 'cola', 'lemonade', 'tonic', 'soda', 'squash', 'fizzy', 'pop ', 'carbonated'];

// explicit user-specified keeps: vegan butter/cream alternatives, Flora, specialist baking items, dried macaroni, eggs
const SPECIALIST_KEEP = ['vegan double cream', 'plant double cream', 'plant based double cream', 'flora', 'trimoline', 'glucose', 'macaroni', 'egg'];

// explicit user-specified brand purge — hard exclude, overrides pantry-match/condiment/specialist-keep.
// Matched as whole words/phrases (word-boundary), not raw substrings, to avoid collisions
// (e.g. bare "hp" or "kind" or "vial" inside unrelated words).
const BRAND_EXCLUDE = [
  "cooks & co", "cooks&co", "cooks and co", "coolmore", "curtis", "chewing gum",
  "euro shopper", "euroshopper", "farm fresh", "frosty jack", "fry's", "frys",
  "fulfil", "fyffes", "getpro", "grenade", "griffiths", "guinness", "guiness",
  "heinz", "itac", "hellmann's", "hellmanns", "hellmans", "hoops", "big hoops",
  "hovis", "hp", "jack's", "jacks", "judes", "just tapas", "kind", "kinder",
  "lichfields", "lichfileds", "knights", "lee kum kee", "levi roots", "lindt",
  "love struck", "m&ms", "m&m's", "magnum", "mahal", "matthew cottswold",
  "nestle", "nestlé", "muller", "müller", "nakd", "nic sugar", "nobby's", "nobbys",
  "pringles", "polo", "reese's", "reeses", "noel's", "noels", "nutella", "omega",
  "onken", "peka", "pipers", "reggia", "rifter", "rustlers", "sarsons",
  "silre pail", "skips", "snacksters", "snickers", "spice magic", "tyrell's",
  "tyrells", "vadsz", "vial", "viennetta", "vk", "walkers", "warrior",
  "werther's", "werthers", "whirlz", "wright's", "wrights", "wyke",
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const BRAND_EXCLUDE_REGEXES = BRAND_EXCLUDE.map(b => new RegExp(`\\b${escapeRegex(b)}\\b`, 'i'));

function matchesBrandExclude(name) {
  return BRAND_EXCLUDE_REGEXES.some(re => re.test(name));
}

// catering-size condiments — keep large multi-serve tubs/bottles, exclude single-serve sachets/portions
const CONDIMENTS = ['ketchup', 'mayonnaise', 'brown sauce', 'mustard', 'salad cream', 'horseradish', 'tartare', 'tartar sauce', 'chilli sauce', 'chili sauce', 'soy sauce', 'bbq sauce', 'barbecue sauce', 'apple sauce', 'vinegar', 'piccalilli', 'relish', 'salsa'];
const SACHET_INDICATORS = ['sachet', 'sachets', 'portion', 'portions', ' x 7g', ' x 8g', ' x 9g', ' x 10ml', ' x 10g', ' x 11g', ' x 12g', ' x 14ml', ' x 15ml', ' x 20ml', 'mini pack', 'single serve'];

const MEAT = ['beef', 'pork', 'lamb', 'chicken', 'turkey', 'duck', 'veal', 'venison', 'bacon', 'sausage', 'gammon', 'mince', 'steak', 'burger pattie', 'ham ', 'pigs in blanket', 'pepperoni', 'salami', 'wagyu', 'rump', 'ribeye', 'rib eye', 'tomahawk', 'sirloin', 'brisket', 'fillet steak', 'silverside'];
const FISH = ['fish', 'salmon', 'cod', 'haddock', 'tuna', 'prawn', 'shrimp', 'mackerel', 'trout', 'plaice', 'sole', 'seabass', 'sea bass', 'scallop', 'squid', 'crab', 'lobster', 'mussel', 'oyster'];
const FROZEN_PREMADE = ['chips', 'mash', 'wedges', 'hash brown', 'onion ring', 'battered', 'breaded', 'nugget', 'goujon', 'pie ', 'pastry case', 'ready meal', 'lasagne', 'yorkshire pudding', 'jacket potato', 'samosa', 'bhajis', 'vol au vent', 'tarte tatin', 'tartelette'];
const ALCOHOL = ['beer', 'lager', 'ale', 'cider', 'vodka', 'gin', 'rum', 'whisky', 'whiskey', 'brandy', 'liqueur', 'wine', 'brewlock', 'keg', 'cocktail', 'buzzballz', 'stout', 'porter', 'kronenbourg', 'moretti', 'budweiser', 'guinness']; // cooking wine excluded separately, checked first
const TINNED_PREPARED = ['baked bean', 'tinned tuna', 'tuna tin', 'tuna chunk', 'sandwich filling', 'tinned meat', 'corned beef', 'spam', 'tinned soup', 'ravioli', 'spaghetti hoop', 'tinned hot dog', 'tinned curry', 'tinned chilli', 'tinned chili', 'tinned stew', 'in brine', 'chilli con carne'];
const NON_CON = ['napkin', 'foil', 'cling film', 'clingfilm', 'glove', 'bag liner', 'bin liner', 'straw', 'cup lid', 'cutlery', 'disposable', 'apron', 'tissue', 'paper towel', 'toilet roll', 'cleaning', 'detergent', 'sanitiser', 'sanitizer', 'bleach', 'sponge', 'menu holder', 'greaseproof', 'container with lid', 'plastic pp', 'platter', 'takeaway tray', 'window bag', 'paper plate', 'wooden dessert spoon'];

function matchesAny(name, list) {
  return list.some(k => name.includes(k));
}

function classify(productName, ingredients) {
  const name = productName.toLowerCase();

  // 0. Explicit brand purge — overrides everything, including pantry-match/condiments/specialist-keep/
  // herb-spice-seed-nut. User wants these brands gone outright (e.g. Curtis, Sarsons), even where a
  // same-category item would otherwise be kept — other brands (Chef's Larder etc.) cover those needs.
  if (matchesBrandExclude(name)) return { keep: false, reason: 'brand-exclude' };

  // 1. Hard removals — meat and fish are excluded from Booker/Urban no matter what,
  // even if they happen to fuzzy-match a pantry ingredient (e.g. "Blackgate Beef Ribeye"
  // matching pantry "Beef - Ribeye" must NOT be kept — explicit user rule overrides pantry-match).
  if (matchesAny(name, MEAT)) return { keep: false, reason: 'meat' };
  if (matchesAny(name, FISH)) return { keep: false, reason: 'fish' };

  // 2. Pantry match — keep (for everything that isn't meat/fish)
  const match = findBestIngredientMatch(productName, ingredients);
  if (match) return { keep: true, reason: `pantry-match: ${match.ingredient.name}` };

  // 3. Cooking wine — keep before generic alcohol check
  if (matchesAny(name, COOKING_WINE)) return { keep: true, reason: 'cooking-wine' };

  // 3. Herbs/spices/seeds/nuts — keep
  if (matchesAny(name, HERB_SPICE_SEED_NUT)) return { keep: true, reason: 'herb-spice-seed-nut' };

  // 4. Baking staples — keep
  if (matchesAny(name, BAKING_STAPLES)) return { keep: true, reason: 'baking-staple' };

  // 5. Specialist user-requested keeps — vegan butter/cream alts, Flora, trimoline, glucose, dried macaroni, eggs
  // (excludes "macaroni cheese" ready meals, which aren't dried pasta; excludes eggplant, which isn't eggs)
  if (matchesAny(name, SPECIALIST_KEEP) && !name.includes('macaroni cheese') && !name.includes('eggplant')) {
    return { keep: true, reason: 'specialist-keep' };
  }

  // 5b. Catering-size condiments — keep large tubs/bottles, reject single-serve sachets/portions.
  // (meat/fish already hard-excluded above, so no need to guard against that here anymore)
  if (
    matchesAny(name, CONDIMENTS) &&
    !matchesAny(name, SACHET_INDICATORS) &&
    !matchesAny(name, FROZEN_PREMADE) &&
    !matchesAny(name, TINNED_PREPARED)
  ) {
    return { keep: true, reason: 'catering-condiment' };
  }

  // 6. Remaining removal categories
  if (matchesAny(name, SOFT_DRINKS)) return { keep: false, reason: 'soft-drink' };
  if (matchesAny(name, FROZEN_PREMADE)) return { keep: false, reason: 'frozen-premade' };
  if (matchesAny(name, ALCOHOL)) return { keep: false, reason: 'alcohol' };
  if (matchesAny(name, TINNED_PREPARED)) return { keep: false, reason: 'tinned-prepared' };
  if (matchesAny(name, NON_CON)) return { keep: false, reason: 'non-consumable' };

  // 7. Default: no rule matched, no pantry match — remove (per user: trim aggressively, re-add manually if needed)
  return { keep: false, reason: 'no-rule-matched (default remove)' };
}

async function run() {
  console.log('Loading ingredients and Booker/Urban supplierProducts from emulator...');
  const ingSnap = await db.collection('ingredients').get();
  const ingredients = ingSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Loaded ${ingredients.length} pantry ingredients.`);

  const prodSnap = await db.collection('supplierProducts').where('supplier', 'in', ['Booker', 'Urban']).get();
  console.log(`Loaded ${prodSnap.docs.length} Booker/Urban supplierProducts docs.`);

  const results = [];
  for (const doc of prodSnap.docs) {
    const data = doc.data();
    const { keep, reason } = classify(data.name || '', ingredients);
    results.push({ id: doc.id, name: data.name, supplier: data.supplier, packCost: data.packCost, packSize: data.packSize, packUnit: data.packUnit, keep, reason });
  }

  const toRemove = results.filter(r => !r.keep);
  const toKeep = results.filter(r => r.keep);

  const reasonCounts = {};
  for (const r of results) reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1;

  console.log('\n=== Classification summary ===');
  console.log(`Total: ${results.length}`);
  console.log(`Keep: ${toKeep.length}`);
  console.log(`Remove: ${toRemove.length}`);
  console.log('By reason:', reasonCounts);

  fs.writeFileSync('scripts/booker_urban_removal_list.json', JSON.stringify(toRemove, null, 2));
  fs.writeFileSync('scripts/booker_urban_keep_list.json', JSON.stringify(toKeep.map(r => ({ id: r.id, name: r.name, supplier: r.supplier, reason: r.reason })), null, 2));
  console.log('\nWrote scripts/booker_urban_removal_list.json and scripts/booker_urban_keep_list.json');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
