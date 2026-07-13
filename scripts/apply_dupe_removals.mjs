import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
initializeApp({ projectId: 'kings-head-kitchen-claude' });
const db = getFirestore();

const ids = JSON.parse(fs.readFileSync('scripts/catt_dropped_dupe_ids.json', 'utf8'));
console.log(`Deleting ${ids.length} duplicate supplierProducts docs from the LOCAL EMULATOR...`);

let batch = db.batch();
let opCount = 0;
let deleted = 0;
for (const id of ids) {
  batch.delete(db.collection('supplierProducts').doc(id));
  opCount++;
  deleted++;
  if (opCount === 500) {
    await batch.commit();
    batch = db.batch();
    opCount = 0;
  }
}
if (opCount > 0) await batch.commit();
console.log(`Deleted ${deleted} duplicate docs from emulator.`);

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
