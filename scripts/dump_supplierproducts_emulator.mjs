// Reads ALL supplierProducts docs from the local Firestore EMULATOR and saves them to a
// JSON file, keyed by doc ID, ready for scripts/replace_supplierproducts_prod.mjs to write
// into production. Read-only against the emulator — touches nothing in prod.
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
  console.log('Reading supplierProducts from EMULATOR (127.0.0.1:8080)...');
  const snap = await db.collection('supplierProducts').get();
  const docs = {};
  snap.forEach((doc) => {
    docs[doc.id] = serializeData(doc.data());
  });
  const count = Object.keys(docs).length;
  console.log(`Read ${count} docs from emulator supplierProducts.`);

  const outPath = 'scripts/supplierProducts_emulator_export.json';
  fs.writeFileSync(outPath, JSON.stringify(docs, null, 2), 'utf8');
  console.log(`Saved to ${outPath}`);
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
