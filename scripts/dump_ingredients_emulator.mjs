// Reads ALL ingredients docs from the local Firestore EMULATOR and saves them to JSON,
// keyed by doc ID. Read-only against the emulator — touches nothing in prod.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import fs from 'fs';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

initializeApp({ projectId: 'kings-head-kitchen-claude' });
const db = getFirestore();

function serializeData(data) {
  if (data === null || data === undefined) return data;
  if (data instanceof Timestamp) {
    return { __type__: 'timestamp', seconds: data.seconds, nanoseconds: data.nanoseconds };
  }
  if (Array.isArray(data)) return data.map(serializeData);
  if (typeof data === 'object') {
    const res = {};
    for (const [key, val] of Object.entries(data)) res[key] = serializeData(val);
    return res;
  }
  return data;
}

async function run() {
  console.log('Reading ingredients from EMULATOR (127.0.0.1:8080)...');
  const snap = await db.collection('ingredients').get();
  const docs = {};
  snap.forEach((doc) => {
    docs[doc.id] = serializeData(doc.data());
  });
  console.log(`Read ${Object.keys(docs).length} docs from emulator ingredients.`);
  fs.writeFileSync('scripts/ingredients_emulator_export.json', JSON.stringify(docs, null, 2), 'utf8');
  console.log('Saved to scripts/ingredients_emulator_export.json');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
