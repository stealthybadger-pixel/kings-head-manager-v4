// Applies David Catt + Booker/Urban removals to LIVE PRODUCTION Firestore.
// Scope: deletes ONLY docs in `supplierProducts` whose IDs are in the removal lists below.
// Does NOT touch any other collection.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

// No FIRESTORE_EMULATOR_HOST set — this targets real production Firestore.
initializeApp({ projectId: 'kings-head-kitchen-claude' });
const db = getFirestore();

async function deleteInBatches(ids, collectionName) {
  let batch = db.batch();
  let opCount = 0;
  let deleted = 0;
  for (const id of ids) {
    batch.delete(db.collection(collectionName).doc(id));
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
  return deleted;
}

async function run() {
  const preCount = await db.collection('supplierProducts').count().get();
  console.log(`PROD supplierProducts count before delete: ${preCount.data().count}`);

  const cattDupes = JSON.parse(fs.readFileSync('scripts/catt_dropped_dupe_ids.json', 'utf8'));
  const cattRemovals = JSON.parse(fs.readFileSync('scripts/removal_list.json', 'utf8')).map(r => r.id);
  const bookerUrbanRemovals = JSON.parse(fs.readFileSync('scripts/booker_urban_removal_list.json', 'utf8')).map(r => r.id);

  const allIds = [...new Set([...cattDupes, ...cattRemovals, ...bookerUrbanRemovals])];
  console.log(`Total unique IDs to delete from PROD supplierProducts: ${allIds.length}`);

  const deleted = await deleteInBatches(allIds, 'supplierProducts');
  console.log(`Deleted ${deleted} docs from PROD supplierProducts.`);

  const postCount = await db.collection('supplierProducts').count().get();
  console.log(`PROD supplierProducts count after delete: ${postCount.data().count}`);
  console.log(`Expected drop: ${allIds.length}, actual drop: ${preCount.data().count - postCount.data().count}`);

  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
