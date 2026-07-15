// Local-only helper: seeds ingredients + a live dish linking two of the
// catalogue items from seed_test_catalogue.mjs, with deliberately WRONG
// packCost values on their David Catt supplier entry — so the active-menu
// price-sync orchestrator (scripts/reconcile_active_menu_prices.ts) has a
// real discrepancy to find and fix when it scrapes the real David Catt price.
// Emulator-only (relies on FIRESTORE_EMULATOR_HOST), never touches prod.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
initializeApp({ projectId: 'kings-head-kitchen-claude' });
const db = getFirestore();

const FRESHO_BASE = 'https://app.fresho.com/marketplace/products?company_id=053d4097-ab85-4017-b807-1699698f15b4&mode=buy&supplier_id=a7648017-0863-418e-a301-16aed6fa3d0d';
const freshoUrl = (name) => `${FRESHO_BASE}&term=${encodeURIComponent(name)}`;

// Real price (per the live catalogue screenshot) is £33.75 — deliberately
// seeded low so the sync should detect an increase.
const agarAgarRef = db.collection('ingredients').doc();
const agaveNectarRef = db.collection('ingredients').doc();

const now = new Date().toISOString();

await agarAgarRef.set({
  name: 'Agar Agar',
  category: 'Dry Store',
  subCategory: 'Spices',
  wastePercent: 0,
  allergens: [],
  kcalPer100: 0,
  stockLevel: 0,
  suppliers: [
    {
      name: 'David Catt',
      packCost: 20.00, // fudged — real live price is £33.75
      packSize: 500,
      packUnit: 'g',
      isPreferred: true,
      sourceUrl: freshoUrl("Agar Agar 'Sosa'"),
      productName: "Agar Agar 'Sosa'",
      priceUpdatedAt: now,
    },
  ],
  createdAt: now,
  updatedAt: now,
});

await agaveNectarRef.set({
  name: 'Agave Nectar',
  category: 'Dry Store',
  subCategory: 'Condiments',
  wastePercent: 0,
  allergens: [],
  kcalPer100: 0,
  stockLevel: 0,
  suppliers: [
    {
      name: 'David Catt',
      packCost: 15.00, // fudged — real live price is £8.92
      packSize: 500,
      packUnit: 'g',
      isPreferred: true,
      sourceUrl: freshoUrl('Agave Nectar'),
      productName: 'Agave Nectar',
      priceUpdatedAt: now,
    },
  ],
  createdAt: now,
  updatedAt: now,
});

// A live dish using both ingredients directly, so they show up in the
// active-menu ("menuIngredientIds") cascade the orchestrator filters on.
await db.collection('dishes').add({
  name: 'Test Dish (seeded for price-sync testing)',
  retailPrice: 12,
  targetGP: 72,
  isLive: true,
  items: [
    { type: 'ingredient', ingredientId: agarAgarRef.id, quantity: 5, unit: 'g' },
    { type: 'ingredient', ingredientId: agaveNectarRef.id, quantity: 10, unit: 'g' },
  ],
  createdAt: now,
  updatedAt: now,
});

console.log('Seeded:');
console.log(`- Agar Agar (ingredient ${agarAgarRef.id}) — fudged £20.00 (real ~£33.75)`);
console.log(`- Agave Nectar (ingredient ${agaveNectarRef.id}) — fudged £15.00 (real ~£8.92)`);
console.log('- Test Dish (isLive: true) referencing both, so they count as active-menu ingredients.');
console.log('\nRunning "Sync Active-Menu Prices" (with a real David Catt login session) should now find both as changed.');
process.exit(0);
