// Sets subCategory = 'Herbs' on the Vegetable-category fresh herb ingredients found by
// find_fresh_vegetables.mjs. Scope: only genuine herbs (Basil, Chives, Coriander, Dill,
// Mint, Parsley, Rosemary, Sage, Tarragon, Thyme) — deliberately excludes Garlic/Ginger/Tomato
// (Vegetable + "Fresh" in name, but not herbs) and the Fruit/Dry Store "*-fresh" items.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'kings-head-kitchen-claude' });
const db = getFirestore();

const ids = [
  'ing_master_basil_fresh',
  'ing_master_chives_fresh',
  'ing_master_coriander_fresh',
  'ing_master_dill_fresh',
  'ing_master_mint_fresh',
  'ing_master_parsley_fresh',
  'ing_master_rosemary_fresh',
  'ing_master_sage_fresh',
  'ing_master_tarragon_fresh',
  'ing_master_thyme_fresh'
];

async function run() {
  for (const id of ids) {
    const ref = db.collection('ingredients').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`SKIP (not found): ${id}`);
      continue;
    }
    await ref.update({ subCategory: 'Herbs', updatedAt: new Date().toISOString() });
    console.log(`Tagged "Herbs": ${snap.data().name} (${id})`);
  }
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
