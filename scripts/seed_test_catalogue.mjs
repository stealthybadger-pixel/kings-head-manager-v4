// Local-only helper: seeds a handful of real-looking supplierProducts docs
// into the local Firestore emulator so the Catalog page has something to
// browse while testing. Never touches prod (relies on FIRESTORE_EMULATOR_HOST).
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
initializeApp({ projectId: 'kings-head-kitchen-claude' });
const db = getFirestore();

const items = [
  { name: 'Affilla Cress (Box)', supplier: 'David Catt', packCost: 13.13, packSize: 1, packUnit: 'ea' },
  { name: "Agar Agar 'Sosa'", supplier: 'David Catt', packCost: 33.75, packSize: 500, packUnit: 'g' },
  { name: 'Agave Nectar', supplier: 'David Catt', packCost: 8.92, packSize: 500, packUnit: 'g' },
  { name: 'Allspice - Ground', supplier: 'David Catt', packCost: 20.81, packSize: 520, packUnit: 'g' },
  { name: 'Allspice - Whole', supplier: 'David Catt', packCost: 22.42, packSize: 1, packUnit: 'kg' },
  { name: 'Almond Essence', supplier: 'David Catt', packCost: 10.40, packSize: 1, packUnit: 'l' },
  { name: 'Almonds - Blanched (Box)', supplier: 'David Catt', packCost: 10.84, packSize: 1, packUnit: 'ea' },
];

const now = new Date().toISOString();

for (const item of items) {
  const unitPrice = item.packCost / item.packSize;
  await db.collection('supplierProducts').add({
    ...item,
    unitPrice,
    capturedAt: now,
    importedAt: now,
  });
  console.log(`Seeded: ${item.name} (${item.supplier}) £${item.packCost}`);
}

console.log(`\nDone — ${items.length} supplierProducts seeded into the local emulator.`);
process.exit(0);
