// Read-only: lists PROD ingredients whose name looks like "<Herb> - Fresh" (or contains
// "Fresh"), to preview which ones would get the new "Herbs" subcategory under Vegetable.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'kings-head-kitchen-claude' });
const db = getFirestore();

async function run() {
  const snap = await db.collection('ingredients').get();
  const matches = [];
  snap.forEach((doc) => {
    const d = doc.data();
    if (/fresh/i.test(d.name || '')) {
      matches.push({ id: doc.id, name: d.name, category: d.category, subCategory: d.subCategory || null });
    }
  });
  matches.sort((a, b) => a.name.localeCompare(b.name));
  console.log(`Found ${matches.length} ingredient(s) with "fresh" in the name:`);
  matches.forEach(m => console.log(`  [${m.category}${m.subCategory ? ' / ' + m.subCategory : ''}] ${m.name} (${m.id})`));
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
