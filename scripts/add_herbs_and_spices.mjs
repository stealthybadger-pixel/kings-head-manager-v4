// Creates a pantry ingredient for every herb/spice in the definitive_culinary_herbs_and_spices.csv
// that doesn't already exist (case-insensitive name match). No suppliers are linked — user adds
// those manually as needed. Category: Dry Store. Sub-category mapped from the CSV's Category column:
//   Dried Herb            -> Dried Herbs
//   Whole Spice           -> Whole Spices (new sub-category)
//   Ground / Powdered Spice -> Spices
//
// Usage: node scripts/add_herbs_and_spices.mjs           -> emulator
//        node scripts/add_herbs_and_spices.mjs --prod     -> production
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const isProd = process.argv.includes('--prod');
if (!isProd) {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
}
initializeApp({ projectId: 'kings-head-kitchen-claude' });
const db = getFirestore();

const CSV_PATH = 'C:/Users/paul/Downloads/definitive_culinary_herbs_and_spices.csv';

const SUBCATEGORY_MAP = {
  'Dried Herb': 'Dried Herbs',
  'Whole Spice': 'Whole Spices',
  'Ground / Powdered Spice': 'Spices',
};

// Minimal CSV line parser handling quoted fields with embedded commas.
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { fields.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

async function run() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows = lines.slice(1).map(parseCsvLine); // skip header

  const csvItems = rows.map(([category, name]) => ({
    csvCategory: category.trim(),
    name: name.trim(),
    subCategory: SUBCATEGORY_MAP[category.trim()],
  })).filter(item => item.name && item.subCategory);

  console.log(`Parsed ${csvItems.length} herb/spice rows from CSV.`);

  const existingSnap = await db.collection('ingredients').get();
  const existingNames = new Set(existingSnap.docs.map(d => (d.data().name || '').trim().toLowerCase()));
  console.log(`${existingNames.size} existing pantry ingredients loaded from ${isProd ? 'PRODUCTION' : 'LOCAL EMULATOR'}.`);

  const toCreate = csvItems.filter(item => !existingNames.has(item.name.toLowerCase()));
  console.log(`${toCreate.length} new ingredients to create (${csvItems.length - toCreate.length} already exist, skipped).`);

  let batch = db.batch();
  let opCount = 0;
  let created = 0;
  const now = new Date().toISOString();
  for (const item of toCreate) {
    const docRef = db.collection('ingredients').doc();
    const ingredient = {
      id: docRef.id,
      name: item.name,
      category: 'Dry Store',
      subCategory: item.subCategory,
      wastePercent: 0,
      kcalPer100: 0,
      stockLevel: 0,
      allergens: [],
      suppliers: [],
      createdAt: now,
      updatedAt: now,
    };
    batch.set(docRef, ingredient);
    opCount++;
    created++;
    if (opCount === 500) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  }
  if (opCount > 0) await batch.commit();

  console.log(`Created ${created} new pantry ingredients in ${isProd ? 'PRODUCTION' : 'LOCAL EMULATOR'}.`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
