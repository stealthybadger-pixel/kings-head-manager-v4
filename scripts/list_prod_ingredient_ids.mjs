// Reads ONLY doc IDs (no field data) from PROD `ingredients` — used to diff against the
// emulator export and find which ingredient IDs are new. Cheapest possible prod read.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

initializeApp({ projectId: 'kings-head-kitchen-claude' });
const db = getFirestore();

async function run() {
  const snap = await db.collection('ingredients').select().get();
  const ids = snap.docs.map((d) => d.id);
  console.log(`PROD ingredients doc count: ${ids.length}`);
  fs.writeFileSync('scripts/ingredients_prod_ids.json', JSON.stringify(ids, null, 2), 'utf8');
  console.log('Saved to scripts/ingredients_prod_ids.json');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
