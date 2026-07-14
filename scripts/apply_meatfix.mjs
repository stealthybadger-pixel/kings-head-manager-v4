// Deletes the 235 leftover Booker/Urban meat/fish docs (missed by the earlier pantry-match/whirl
// bugs) from both the local emulator and, if PROD env passed, live production.
// Usage: node scripts/apply_meatfix.mjs           -> emulator
//        node scripts/apply_meatfix.mjs --prod     -> production
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const isProd = process.argv.includes('--prod');
if (!isProd) {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
}
initializeApp({ projectId: 'kings-head-kitchen-claude' });
const db = getFirestore();

async function run() {
  const ids = JSON.parse(fs.readFileSync('scripts/booker_urban_meatfix_removal_ids.json', 'utf8'));
  console.log(`Target: ${isProd ? 'PRODUCTION' : 'LOCAL EMULATOR'}. Deleting ${ids.length} docs from supplierProducts...`);

  const pre = await db.collection('supplierProducts').count().get();
  console.log(`supplierProducts count before: ${pre.data().count}`);

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

  const post = await db.collection('supplierProducts').count().get();
  console.log(`Deleted ${deleted} docs. supplierProducts count after: ${post.data().count}`);
  console.log(`Expected drop: ${ids.length}, actual drop: ${pre.data().count - post.data().count}`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
