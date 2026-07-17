// Adds the ingredient docs that exist in the emulator but not yet in PROD `ingredients`
// (scripts/ingredients_new_ids.json, computed from ingredients_emulator_export.json vs
// ingredients_prod_ids.json). Uses doc.create() so it hard-fails on any ID collision instead
// of silently overwriting an existing prod ingredient. Does NOT touch any existing prod doc.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import fs from 'fs';

initializeApp({ projectId: 'kings-head-kitchen-claude' });
const db = getFirestore();

function deserializeData(data) {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) return data.map(deserializeData);
  if (typeof data === 'object') {
    if (data.__type__ === 'timestamp') return new Timestamp(data.seconds, data.nanoseconds);
    const res = {};
    for (const [key, val] of Object.entries(data)) res[key] = deserializeData(val);
    return res;
  }
  return data;
}

async function run() {
  const emu = JSON.parse(fs.readFileSync('scripts/ingredients_emulator_export.json', 'utf8'));
  const newIds = JSON.parse(fs.readFileSync('scripts/ingredients_new_ids.json', 'utf8'));
  console.log(`Adding ${newIds.length} new ingredient docs to PROD...`);

  const preCount = await db.collection('ingredients').count().get();
  console.log(`PROD ingredients count before: ${preCount.data().count}`);

  let written = 0;
  for (let i = 0; i < newIds.length; i += 500) {
    const chunk = newIds.slice(i, i + 500);
    const batch = db.batch();
    for (const id of chunk) {
      batch.create(db.collection('ingredients').doc(id), deserializeData(emu[id]));
    }
    await batch.commit();
    written += chunk.length;
    console.log(`  wrote ${written}/${newIds.length}...`);
  }

  const postCount = await db.collection('ingredients').count().get();
  console.log(`PROD ingredients count after: ${postCount.data().count}`);
  console.log(`Expected: ${preCount.data().count + newIds.length}, actual: ${postCount.data().count}`);

  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
