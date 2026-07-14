// Applies the Booker/Urban removal list to the LOCAL EMULATOR ONLY.
// Scope: deletes only docs in `supplierProducts` whose IDs are in booker_urban_removal_list.json,
// plus clears three disposable collections (heston_sessions, market_queries, scrapeLog) per user request.
// Does NOT touch ingredients, recipes, dishes, stock_movements, stocktake_reports, or any other collection.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
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
      batch = db.batch();
      opCount = 0;
    }
  }
  if (opCount > 0) await batch.commit();
  return deleted;
}

async function clearCollection(collectionName) {
  const snap = await db.collection(collectionName).get();
  const ids = snap.docs.map(d => d.id);
  const deleted = await deleteInBatches(ids, collectionName);
  return deleted;
}

async function run() {
  const removalList = JSON.parse(fs.readFileSync('scripts/booker_urban_removal_list.json', 'utf8'));
  const ids = removalList.map(r => r.id);
  console.log(`Deleting ${ids.length} Booker/Urban supplierProducts docs from LOCAL EMULATOR...`);
  const deletedProducts = await deleteInBatches(ids, 'supplierProducts');
  console.log(`Deleted ${deletedProducts} supplierProducts docs.`);

  const remainingSnap = await db.collection('supplierProducts').count().get();
  console.log(`supplierProducts docs remaining: ${remainingSnap.data().count}`);

  for (const coll of ['heston_sessions', 'market_queries', 'scrapeLog']) {
    const n = await clearCollection(coll);
    console.log(`Cleared ${coll}: ${n} docs deleted.`);
  }

  console.log('\nUntouched collections (verify counts unchanged): ingredients, recipes, dishes, stock_movements, stocktake_reports, stocktake_drafts, equipment, equipment_temp_checks, food_temp_checks, invoices, suppliers, unresolved_ingredients, users, ocr-queue.');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
