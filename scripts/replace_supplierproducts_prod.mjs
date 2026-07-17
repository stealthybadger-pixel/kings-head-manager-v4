// Replaces LIVE PRODUCTION `supplierProducts` with the reviewed set from the local emulator
// (scripts/supplierProducts_emulator_export.json, written by dump_supplierproducts_emulator.mjs).
// Scope: deletes ALL prod `supplierProducts` docs, then writes back the emulator's docs with
// their original IDs. Does NOT touch `ingredients` or any other collection.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import fs from 'fs';

// No FIRESTORE_EMULATOR_HOST set — this targets real production Firestore.
initializeApp({ projectId: 'kings-head-kitchen-claude' });
const db = getFirestore();

function deserializeData(data) {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) return data.map(deserializeData);
  if (typeof data === 'object') {
    if (data.__type__ === 'timestamp') {
      return new Timestamp(data.seconds, data.nanoseconds);
    }
    const res = {};
    for (const [key, val] of Object.entries(data)) res[key] = deserializeData(val);
    return res;
  }
  return data;
}

async function deleteAllInBatches(collectionName) {
  let deleted = 0;
  // Repeatedly pull pages of 500 and delete — safe for any collection size.
  while (true) {
    const snap = await db.collection(collectionName).limit(500).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
    console.log(`  deleted ${deleted} so far...`);
  }
  return deleted;
}

async function writeAllInBatches(collectionName, docsById) {
  const entries = Object.entries(docsById);
  let written = 0;
  for (let i = 0; i < entries.length; i += 500) {
    const chunk = entries.slice(i, i + 500);
    const batch = db.batch();
    for (const [id, data] of chunk) {
      batch.set(db.collection(collectionName).doc(id), deserializeData(data));
    }
    await batch.commit();
    written += chunk.length;
    console.log(`  wrote ${written}/${entries.length}...`);
  }
  return written;
}

async function run() {
  const preCount = await db.collection('supplierProducts').count().get();
  console.log(`PROD supplierProducts count before: ${preCount.data().count}`);

  const emulatorDocs = JSON.parse(
    fs.readFileSync('scripts/supplierProducts_emulator_export.json', 'utf8')
  );
  const emulatorCount = Object.keys(emulatorDocs).length;
  console.log(`Emulator export has ${emulatorCount} docs.`);

  console.log('Deleting all PROD supplierProducts docs...');
  const deleted = await deleteAllInBatches('supplierProducts');
  console.log(`Deleted ${deleted} docs from PROD.`);

  console.log('Writing emulator docs into PROD supplierProducts...');
  const written = await writeAllInBatches('supplierProducts', emulatorDocs);
  console.log(`Wrote ${written} docs into PROD.`);

  const postCount = await db.collection('supplierProducts').count().get();
  console.log(`PROD supplierProducts count after: ${postCount.data().count}`);
  console.log(`Expected: ${emulatorCount}, actual: ${postCount.data().count}`);

  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
