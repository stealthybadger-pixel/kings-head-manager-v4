import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
initializeApp({ projectId: 'kings-head-kitchen-claude' });
const db = getFirestore();

const removal = JSON.parse(fs.readFileSync('scripts/removal_list.json', 'utf8'));
const ids = removal.map(r => r.id);

console.log(`Deleting ${ids.length} supplierProducts docs from the LOCAL EMULATOR...`);

let deleted = 0;
let batch = db.batch();
let opCount = 0;
for (let i = 0; i < ids.length; i++) {
  batch.delete(db.collection('supplierProducts').doc(ids[i]));
  opCount++;
  deleted++;
  if (opCount === 500) {
    await batch.commit();
    console.log(`  committed batch, ${deleted}/${ids.length}`);
    batch = db.batch();
    opCount = 0;
  }
}
if (opCount > 0) {
  await batch.commit();
  console.log(`  committed final batch, ${deleted}/${ids.length}`);
}
console.log('Emulator deletion complete.');

// Also update the local dump file so future emulator re-seeds and the categorized
// review data stay consistent with what's actually kept.
const dumpPath = 'firestore-dump/supplierProducts.json';
const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
const idSet = new Set(ids);
let removedFromDump = 0;
for (const id of Object.keys(dump)) {
  if (idSet.has(id)) {
    delete dump[id];
    removedFromDump++;
  }
}
fs.writeFileSync(dumpPath, JSON.stringify(dump));
console.log(`Removed ${removedFromDump} entries from ${dumpPath}. Remaining: ${Object.keys(dump).length}`);

process.exit(0);
