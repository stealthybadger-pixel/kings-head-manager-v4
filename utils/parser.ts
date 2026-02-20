
import { Ingredient, Unit } from '../types';
import { normalizeName as intelligentNormalize, spellCorrect } from './intelligence';

export interface ParsedIngredient {
  originalText: string;
  qty: number;
  unit: Unit;
  name: string;
  originalName: string; // The raw name segment before prep extraction
  normalizedName: string;
  matchedId?: string;
  mappedNote?: string; // For Alias Mapping or Prep Notes
  needsReview?: boolean; // OCR fix was applied to this line
}

export interface ParsedRecipe {
  ingredients: ParsedIngredient[];
  method: string[];
  matchRate: number; // 0-1
  suggestedBatchSize?: number;
  suggestedBatchUnit?: Unit;
}

const NORMALIZE_UNITS: Record<string, Unit> = {
  'g': 'g', 'gram': 'g', 'grams': 'g',
  'ml': 'ml', 'milliliter': 'ml', 'milliliters': 'ml', 'millilitre': 'ml', 'millilitres': 'ml',
  'kg': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
  'l': 'l', 'liter': 'l', 'litres': 'l', 'liters': 'l', 'litre': 'l',
  'ea': 'ea', 'each': 'ea', 'unit': 'ea', 'pcs': 'ea', 'piece': 'ea', 'pieces': 'ea',
  // Volumetric → ml (multipliers applied separately below)
  'tsp': 'ml', 'teaspoon': 'ml', 'teaspoons': 'ml',
  'tbsp': 'ml', 'tablespoon': 'ml', 'tablespoons': 'ml',
  'cup': 'ml', 'cups': 'ml',
  'fl': 'ml', 'floz': 'ml',
  // Imperial mass → g/kg (multipliers applied separately below)
  'oz': 'g', 'ounce': 'g', 'ounces': 'g',
  'lb': 'kg', 'pound': 'kg', 'pounds': 'kg',
};

// Quantity multipliers: scale qty when converting from these raw units to the normalised unit above
const UNIT_MULTIPLIERS: Record<string, number> = {
  'tsp': 5,      'teaspoon': 5,      'teaspoons': 5,    // 1 tsp = 5 ml
  'tbsp': 15,    'tablespoon': 15,   'tablespoons': 15, // 1 tbsp = 15 ml
  'cup': 240,    'cups': 240,                           // 1 cup = 240 ml
  'fl': 29.57,   'floz': 29.57,                         // 1 fl oz = 29.57 ml
  'oz': 28.35,   'ounce': 28.35,     'ounces': 28.35,   // 1 oz = 28.35 g
  'lb': 0.4536,  'pound': 0.4536,    'pounds': 0.4536,  // 1 lb = 0.4536 kg
};

const FRACTION_MAP: Record<string, number> = {
  '½': 0.5, '⅓': 1/3, '¼': 0.25, '¾': 0.75, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, 
  '⅙': 1/6, '⅚': 5/6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
};

// ── OCR Artefact Fix Table ────────────────────────────────────────────────
// Scanned recipe documents commonly drop the first letter of a word.
// Apply these whole-word substitutions before any other processing.
const OCR_FIXES: Record<string, string> = {
  'emon': 'lemon', 'ime': 'lime', 'reen': 'green', 'eeks': 'leeks',
  'eaf': 'leaf', 'eaves': 'leaves', 'elatin': 'gelatin', 'elatine': 'gelatine',
  'itre': 'litre', 'itres': 'litres', 'uinea': 'guinea',
  'rated': 'grated', 'arlic': 'garlic', 'arge': 'large',
};

const applyOCRFixes = (line: string): string =>
  line.replace(/\b([A-Za-z]+)\b/g, (word) => {
    const fix = OCR_FIXES[word.toLowerCase()];
    if (!fix) return word;
    // Preserve capitalisation of the original word
    return word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()
      ? fix.charAt(0).toUpperCase() + fix.slice(1)
      : fix;
  });

// Comprehensive Kitchen Noise Blacklist
// These words are stripped from ingredient names before DB matching.
// The original text is always preserved for display.
const PREP_WORDS = new Set([
  // Cutting / prep technique
  'chopped', 'finely', 'roughly', 'coarsely', 'thinly', 'thickly',
  'minced', 'sliced', 'diced', 'julienned', 'shredded', 'torn', 'picked',
  'crushed', 'cracked', 'halved', 'quartered', 'trimmed', 'peeled',
  'deseeded', 'pitted', 'zested', 'segmented', 'scored', 'butterflied',

  // Cooking state
  'ground', 'toasted', 'roasted', 'fried', 'deep-fried', 'pan-fried',
  'blanched', 'poached', 'steamed', 'braised', 'grilled', 'charred',
  'caramelised', 'caramelized', 'glazed', 'reduced', 'rendered',
  'cooked', 'raw', 'smoked', 'cured', 'dried', 'dry', 'dehydrated',
  'pickled', 'marinated', 'aged', 'fermented',

  // Texture / processing
  'pureed', 'puréed', 'blended', 'whipped', 'beaten', 'whisked',
  'melted', 'softened', 'grated', 'sieved', 'strained', 'passed',
  'squeezed', 'drained', 'rinsed', 'washed', 'patted',

  // Temperature / state
  'cold', 'hot', 'warm', 'frozen', 'thawed', 'chilled', 'room-temperature',

  // Size descriptors
  'whole', 'large', 'medium', 'small', 'mini', 'baby', 'extra',

  // Container / portion descriptors
  'bulb', 'bulbs', 'clove', 'cloves', 'head', 'heads',
  'bunch', 'bunches', 'pinch', 'pinches', 'sprig', 'sprigs',
  'leaf', 'leaves', 'stalk', 'stalks', 'knob', 'knobs', 'rasher', 'rashers',

  // Quality / sourcing
  'fresh', 'dried', 'organic', 'free-range', 'free', 'range',
  'boneless', 'skinless', 'lean', 'fat', 'trimmed',

  // Butchery cuts used as descriptors
  'fillet', 'fillets', 'breast', 'breasts', 'thigh', 'thighs',
  'wing', 'wings', 'drumstick', 'drumsticks',

  // Misc
  'lightly', 'lightly-crushed', 'optional', 'to', 'taste',
]);

const QTY_REGEX = /^((?:\d+\s+)?\d+\/\d+|[\d\.]+|[½⅓¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+)\s*([a-zA-Z]+)?\s+(.*)$/;

const parseQuantity = (raw: string): number => {
  if (!raw) return 0;
  
  if (FRACTION_MAP[raw]) return FRACTION_MAP[raw];

  if (raw.includes('/')) {
    const parts = raw.trim().split(/\s+/);
    let total = 0;
    for (const part of parts) {
      if (part.includes('/')) {
        const [num, den] = part.split('/').map(Number);
        if (den !== 0) total += num / den;
      } else {
        total += parseFloat(part) || 0;
      }
    }
    return total;
  }

  return parseFloat(raw) || 0;
};

// Irregular plurals that basic s/es stripping won't handle correctly
const PLURAL_MAP: Record<string, string> = {
  'chillies': 'chilli', 'chilies': 'chilli',
  'potatoes': 'potato', 'tomatoes': 'tomato',
  'raspberries': 'raspberry', 'blackberries': 'blackberry', 'strawberries': 'strawberry',
  'blueberries': 'blueberry', 'cranberries': 'cranberry', 'gooseberries': 'gooseberry',
  'cherries': 'cherry', 'anchovies': 'anchovy', 'leaves': 'leaf',
};

// Normalization: Lowercase + Strip common plurals ('s', 'es')
const normalizeName = (name: string): string => {
  let lower = name.trim().toLowerCase();

  // Check irregular plurals first
  if (PLURAL_MAP[lower]) return PLURAL_MAP[lower];

  // Basic plural stripping
  if (lower.endsWith('es') && lower.length > 4) {
    lower = lower.slice(0, -2);
  } else if (lower.endsWith('s') && !lower.endsWith('ss') && lower.length > 3) {
    lower = lower.slice(0, -1);
  }

  return lower;
};

const extractPrepNotes = (rawName: string): { cleanName: string, notes: string | undefined } => {
  const words = rawName.split(/\s+/);
  const nameParts: string[] = [];
  const prepParts: string[] = [];

  for (const word of words) {
    // Remove punctuation for checking
    const checkWord = word.toLowerCase().replace(/[(),]/g, '');
    if (PREP_WORDS.has(checkWord)) {
      prepParts.push(word.replace(/[(),]/g, ''));
    } else {
      nameParts.push(word);
    }
  }

  return {
    cleanName: nameParts.join(' '),
    notes: prepParts.length > 0 ? prepParts.join(' ') : undefined
  };
};

// ── Unit-weight conversion table ──────────────────────────────────────────
// When an ingredient is parsed with unit 'ea' (counted whole items), convert
// to grams so cost/nutrition calculations work correctly.
//
// ORDERING RULES:
//   1. More specific (longer) phrases MUST precede shorter ones.
//      e.g. 'egg yolk' before 'egg', 'cherry tomato' before 'tomato'.
//   2. Matching uses word-boundary logic (see wordBoundaryMatch below), so
//      the iteration order within each group generally doesn't matter —
//      but longest-first is kept as an extra safety net.
//
// Sources: British Lion Eggs; USDA; UK chef-school standards.
const UNIT_WEIGHTS: Record<string, number> = {

  // ── Eggs (British Lion Eggs) ─────────────────────────────────────────────
  'egg yolk': 18,           // 1 yolk
  'egg white': 38,          // 1 white
  'egg': 60,                // 1 large egg out of shell

  // ── Alliums ──────────────────────────────────────────────────────────────
  'spring onion': 15,       // 1 stalk (trimmed)
  'shallot': 20,            // 1 banana shallot
  'red onion': 150,
  'white onion': 150,
  'brown onion': 150,
  'spanish onion': 200,     // noticeably larger
  'onion': 150,             // medium — must come after named varieties
  'leek': 200,              // 1 medium leek (trimmed)
  'garlic': 5,              // 1 clove

  // ── Root vegetables ──────────────────────────────────────────────────────
  'jersey royal': 30,
  'new potato': 40,
  'sweet potato': 200,
  'king edward': 200,
  'maris piper': 180,
  'potato': 150,            // medium — must come after varieties
  'carrot': 80,             // medium (trimmed)
  'parsnip': 100,
  'beetroot': 100,
  'turnip': 150,
  'swede': 500,             // usually a whole head
  'celeriac': 600,          // whole head
  'jerusalem artichoke': 60,
  'ginger': 10,             // 1 "thumb" of ginger

  // ── Brassicas & stalks ───────────────────────────────────────────────────
  'celery': 30,             // 1 stalk

  // ── Fruiting vegetables ──────────────────────────────────────────────────
  'cherry tomato': 15,
  'plum tomato': 90,
  'vine tomato': 100,
  'tomato': 100,            // medium — must come after varieties
  'courgette': 200,
  'zucchini': 200,
  'aubergine': 300,
  'eggplant': 300,
  'bell pepper': 160,
  'red pepper': 160,
  'yellow pepper': 160,
  'orange pepper': 160,
  'green pepper': 160,
  'pepper': 160,            // bare "pepper" = bell pepper by count — must come after colours
  'scotch bonnet': 15,
  'jalapeno': 15,
  'chilli': 15,             // 1 medium chilli
  'avocado': 200,           // 1 medium (Hass)
  'cucumber': 300,
  'corn on the cob': 250,
  'sweetcorn': 250,         // whole cob
  'fennel': 250,            // 1 fennel bulb
  'globe artichoke': 350,
  'artichoke': 350,

  // ── Citrus fruits ────────────────────────────────────────────────────────
  'grapefruit': 300,
  'blood orange': 180,
  'seville orange': 180,
  'orange': 180,
  'lemon': 115,
  'lime': 65,
  'clementine': 75,
  'satsuma': 75,

  // ── Tree / stone fruits ──────────────────────────────────────────────────
  'cooking apple': 200,
  'bramley apple': 250,
  'apple': 182,
  'conference pear': 170,
  'pear': 170,
  'banana': 120,            // medium with skin
  'mango': 300,
  'kiwi': 70,
  'peach': 150,
  'nectarine': 150,
  'plum': 60,
  'damson': 30,
  'apricot': 50,
  'fig': 50,
  'passion fruit': 35,
  'pomegranate': 300,
  'pineapple': 900,         // whole (usually sliced in recipes — edge case)

  // ── Fresh herbs (per bunch unless noted) ─────────────────────────────────
  // "½ bunch parsley" → 0.5 ea → 0.5 × 30 = 15 g
  // Sprigs (thyme, rosemary) are ~5 g each — less precise but better than 0
  'flat leaf parsley': 30,
  'curly parsley': 30,
  'parsley': 30,
  'coriander': 30,
  'cilantro': 30,
  'dill': 25,
  'mint': 25,
  'tarragon': 15,
  'chervil': 15,
  'chives': 20,
  'basil': 20,
  'sage': 15,               // 1 bunch (small bunch by UK convention)
  'thyme': 5,               // per sprig
  'rosemary': 5,            // per sprig
  'oregano': 5,             // per sprig

  // ── Small produce / flavourings ──────────────────────────────────────────
  'vanilla pod': 3,         // 1 pod
  'vanilla bean': 3,
  'bay leaf': 1,
  'kaffir lime leaf': 1,
  'gelatine leaf': 2,       // 1 standard platinum-grade leaf
  'gelatine sheet': 2,
};

// Returns true if `phrase` appears as a complete word-sequence within `text`.
// Prevents false positives like "pea" → "peanut", "plum" → "plum tomato".
const wordBoundaryMatch = (text: string, phrase: string): boolean =>
  text === phrase ||
  text.startsWith(phrase + ' ') ||
  text.endsWith(' ' + phrase) ||
  text.includes(' ' + phrase + ' ');

// Pre-sorted keys (longest/most-specific first) so "cherry tomato" wins over "tomato".
const UNIT_WEIGHT_KEYS = Object.keys(UNIT_WEIGHTS).sort((a, b) => b.length - a.length);

// Action verbs that start method/instruction lines (never ingredient lines)
const METHOD_VERBS = new Set([
  'peel', 'boil', 'steam', 'simmer', 'roast', 'bake', 'cook', 'heat', 'mix', 'combine',
  'place', 'add', 'remove', 'pass', 'reduce', 'allow', 'transfer', 'cover', 'season',
  'fry', 'blend', 'blitz', 'whisk', 'melt', 'stir', 'bring', 'rest', 'roll', 'cut',
  'slice', 'shape', 'mould', 'freeze', 'chill', 'turn', 'glaze', 'arrange', 'fold',
  'knead', 'prove', 'hang', 'take', 'once', 'after', 'using', 'done', 'make', 'fill',
  'brush', 'pour', 'drain', 'coat', 'store', 'when', 'while', 'leave', 'serve', 'note',
  'total', 'yield', 'serves', 'portion', 'method', 'instruction', 'preparation',
  'etc', 'this', 'you', 'the', 'if', 'in', 'for', 'sift', 'skim', 'shred',
  'separate', 'set', 'confit', 'deglaze', 'deseed', 'divide', 'gently', 'marinate',
]);

const isMethodLine = (line: string): boolean => {
  const lower = line.toLowerCase().trim();
  if (!lower) return false;

  // Explicit section header words on their own
  if (lower === 'method' || lower === 'instructions' || lower === 'preparation') return true;

  // Line starts with a recognised method/instruction verb
  const firstWord = lower.split(/[\s,]+/)[0];
  if (METHOD_VERBS.has(firstWord)) return true;

  // Long lines with no measurement unit are almost certainly method sentences
  if (line.length > 60) {
    const hasUnit = /\b(g|kg|ml|l|litres?|tsp|tbsp|teaspoons?|tablespoons?|bunches?|cloves?|sprigs?|heads?|oz|lb|pints?|rashers?|sheets?)\b/i.test(line);
    if (!hasUnit) return true;
  }

  return false;
};

// Remove bracket content and truncate at first comma before prep-word extraction.
// e.g. "butter (unsalted)"      → "butter"
// e.g. "garlic, finely chopped" → "garlic"
const preCleanName = (rawName: string): string => {
  let clean = rawName.replace(/\s*\([^)]*\)/g, '').trim();   // strip (...)
  const commaIdx = clean.indexOf(',');
  if (commaIdx > 0) clean = clean.substring(0, commaIdx).trim();
  return clean.replace(/[.,;:]+$/, '').trim();
};

// Ingredients that should never be sourced / saved.
// Plain 'salt' is a seasoning; specific salt types (rock salt, sea salt) are kept.
// Zests are a technique applied to fruit, not a separate item to order.
// Water in any form is not a sourced ingredient.
const SKIP_INGREDIENT_NAMES = new Set([
  'water', 'tepid water', 'warm water', 'cold water', 'hot water', 'boiling water', 'iced water',
  'salt',
]);

const shouldSkipIngredient = (cleanName: string): boolean => {
  const lower = cleanName.toLowerCase().trim();
  if (SKIP_INGREDIENT_NAMES.has(lower)) return true;
  if (/\bzest\b/.test(lower)) return true;
  return false;
};

// SCORCHED EARTH: Force Ingredient Matching Only.
// This function must NEVER accept a Recipe list for matching.
export const parseRecipeContent = (text: string, ingredientsDB: Ingredient[], recipeTitle?: string): ParsedRecipe => {
  if (!text) return { ingredients: [], method: [], matchRate: 0 };

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  let parsedIngredients: ParsedIngredient[] = [];
  const methodLines: string[] = [];
  
  let parsingMethodSection = false;
  
  // Guard: Normalize title for comparison using intelligence utils for consistent comparison
  const normalizedTitle = recipeTitle ? intelligentNormalize(recipeTitle).toLowerCase() : null;

  // Batch Size Guessing Accumulators
  let totalWeight = 0; // grams
  let totalVolume = 0; // ml

  // Standalone ingredient expansions — only when the whole name matches exactly.
  // Plain 'salt' removed: standalone salt is a seasoning, not a sourced ingredient.
  const INGREDIENT_EXPANSIONS: Record<string, string> = {
    'flour': 'plain flour',
  };

  for (const line of lines) {
    // ── STEP 1: Fix OCR artefacts (dropped first-letter) ──────────────────
    const fixedLine = applyOCRFixes(line);

    // ── STEP 2: Detect method/instruction lines ────────────────────────────
    if (isMethodLine(fixedLine)) {
      parsingMethodSection = true;
      continue;
    }

    if (parsingMethodSection) {
      methodLines.push(spellCorrect(fixedLine));
      continue;
    }

    // ── STEP 3: NER Parse — [Qty] [Unit?] [Name] ──────────────────────────
    const match = fixedLine.match(QTY_REGEX);

    if (match) {
      let qty = parseQuantity(match[1]);
      const rawUnit = match[2]?.toLowerCase();
      const rawName = match[3];

      // ── STEP 4: Pre-clean name (brackets, comma-after) ────────────────
      const preCleaned = preCleanName(rawName);

      // Apply quantity multiplier BEFORE unit normalisation
      // e.g. "2 tbsp" → qty × 15 = 30, then unit → 'ml'
      if (rawUnit && UNIT_MULTIPLIERS[rawUnit]) {
        qty = qty * UNIT_MULTIPLIERS[rawUnit];
      }

      // Unit Normalization
      let unit: Unit = rawUnit && NORMALIZE_UNITS[rawUnit] ? NORMALIZE_UNITS[rawUnit] : 'ea';

      // ── STEP 5: Separate prep notes, then spell-correct ───────────────
      const { cleanName: rawClean, notes } = extractPrepNotes(preCleaned);
      const spellCorrected = spellCorrect(rawClean);

      const cleanName = INGREDIENT_EXPANSIONS[spellCorrected.toLowerCase().trim()] ?? spellCorrected;

      // ── STEP 6: Skip non-ingredient items (water, plain salt, zests) ──
      if (shouldSkipIngredient(cleanName)) continue;

      // ea → g conversion: for whole counted items (onion, garlic, egg, lemon, etc.)
      // Uses pre-sorted UNIT_WEIGHT_KEYS (longest first) with word-boundary matching.
      if (unit === 'ea') {
        const lowerClean = cleanName.toLowerCase();
        for (const key of UNIT_WEIGHT_KEYS) {
          if (wordBoundaryMatch(lowerClean, key)) {
            qty = qty * UNIT_WEIGHTS[key];
            unit = 'g';
            break;
          }
        }
      }

      // Name Normalization
      const normalized = normalizeName(cleanName);
      const comparisonName = intelligentNormalize(cleanName).toLowerCase();

      // TITLE GUARD: Prevent parsing the recipe title as an ingredient of itself
      if (normalizedTitle && (comparisonName === normalizedTitle)) {
        console.debug(`[GUARD] REMOVED TITLE "${recipeTitle}" FROM INGREDIENTS`);
        continue;
      }

      // Batch Accumulation
      if (unit === 'kg') totalWeight += qty * 1000;
      else if (unit === 'g') totalWeight += qty;
      else if (unit === 'l') totalVolume += qty * 1000;
      else if (unit === 'ml') totalVolume += qty;

      // STRICT MATCHING: ONLY INGREDIENTS.
      // We explicitly search the ingredientsDB.
      // We do NOT search any recipe collection.
      let matchedIng = ingredientsDB.find(i => normalizeName(i.name) === normalized);

      // FUZZY FALLBACK: if no exact match, try unambiguous substring match.
      // e.g. "black pepper" → "Cracked Black Pepper" (1 candidate → auto-resolve)
      // e.g. "anise"        → "Star Anise"           (1 candidate → auto-resolve)
      // e.g. "pepper"       → multiple hits          → left unresolved (correct)
      if (!matchedIng && normalized.length > 3) {
        const candidates = ingredientsDB.filter(i => normalizeName(i.name).includes(normalized));
        if (candidates.length === 1) matchedIng = candidates[0];
      }

      parsedIngredients.push({
        originalText: line,
        qty,
        unit,
        name: cleanName,
        originalName: rawName,
        normalizedName: normalized,
        matchedId: matchedIng?.id,
        mappedNote: notes,
        needsReview: fixedLine !== line, // OCR fix was applied
      });

    } else {
      // If line doesn't match Qty Regex, treat as Method (or title)
      methodLines.push(fixedLine);
    }
  }

  // DEDUPLICATION: keep the first occurrence of each normalised name
  const seenNormalized = new Set<string>();
  parsedIngredients = parsedIngredients.filter(ing => {
    if (seenNormalized.has(ing.normalizedName)) return false;
    seenNormalized.add(ing.normalizedName);
    return true;
  });

  // METHOD SANITATION FILTER
  const fullMethodText = methodLines.join('\n');
  parsedIngredients = parsedIngredients.filter(ing => !fullMethodText.includes(ing.originalText));

  // Calculate Match Rate
  const total = parsedIngredients.length;
  const matched = parsedIngredients.filter(p => !!p.matchedId).length;
  const matchRate = total > 0 ? matched / total : 0;

  // Calculate Batch Suggestion
  let suggestedBatchSize = 1;
  let suggestedBatchUnit: Unit = 'ea';
  
  if (totalWeight > 0 && totalWeight > totalVolume) {
     if (totalWeight >= 1000) {
        suggestedBatchSize = Number((totalWeight / 1000).toFixed(2));
        suggestedBatchUnit = 'kg';
     } else {
        suggestedBatchSize = Number(totalWeight.toFixed(0));
        suggestedBatchUnit = 'g';
     }
  } else if (totalVolume > 0) {
      if (totalVolume >= 1000) {
        suggestedBatchSize = Number((totalVolume / 1000).toFixed(2));
        suggestedBatchUnit = 'l';
     } else {
        suggestedBatchSize = Number(totalVolume.toFixed(0));
        suggestedBatchUnit = 'ml';
     }
  }

  return {
    ingredients: parsedIngredients,
    method: methodLines,
    matchRate,
    suggestedBatchSize,
    suggestedBatchUnit
  };
};
