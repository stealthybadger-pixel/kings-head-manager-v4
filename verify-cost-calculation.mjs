import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { z } from "zod";

const firebaseConfig = {
  apiKey: "AIzaSyBx_7Raw_xgM2dQWBmUU29W9ggbcmVmo_Y",
  authDomain: "kings-head-kitchen-claude.firebaseapp.com",
  projectId: "kings-head-kitchen-claude",
  storageBucket: "kings-head-kitchen-claude.firebasestorage.app",
  messagingSenderId: "661815699598",
  appId: "1:661815699598:web:e05a12781db09844f241df"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Simple getBaseUnit
const getBaseUnit = (unit) => {
  if (unit === 'kg' || unit === 'g') return 'g';
  if (unit === 'l' || unit === 'ml') return 'ml';
  return 'ea';
};

// Replicate the exact calculateIngredientCost function
const calculateIngredientCostSim = (ingredient, quantity, unit) => {
  const pref = ingredient.suppliers?.find(s => s.isPreferred) || ingredient.suppliers?.[0];
  if (!pref) {
    console.log(`- No supplier for ${ingredient.name}`);
    return 0;
  }

  const packSize = pref.packSize;
  const packCost = pref.packCost;
  const packUnit = pref.packUnit;

  const ingBaseUnit = getBaseUnit(packUnit);
  const itemBaseUnit = getBaseUnit(unit);

  let packQtyBase = packSize;
  if (packUnit === 'kg' || packUnit === 'l') packQtyBase *= 1000;

  let itemQtyBase = quantity;
  if (unit === 'kg' || unit === 'l') itemQtyBase *= 1000;

  let finalCost = 0;

  console.log(`[CostSim] Ingredient: "${ingredient.name}" (${ingredient.id})`);
  console.log(`  Recipe Item: Qty = ${quantity} ${unit} (Base Qty = ${itemQtyBase} ${itemBaseUnit})`);
  console.log(`  Preferred Supplier: ${pref.name} | Cost = £${packCost} | Size = ${packSize} ${packUnit} (Base Size = ${packQtyBase} ${ingBaseUnit})`);
  console.log(`  Ingredient pieceWeight = ${ingredient.pieceWeight}g | eaWeight = ${ingredient.eaWeight}g`);

  if (ingBaseUnit === itemBaseUnit) {
    const rate = packCost / packQtyBase;
    finalCost = rate * itemQtyBase;
    console.log(`  Calculation: (ingBaseUnit === itemBaseUnit)`);
    console.log(`    rate = ${packCost} / ${packQtyBase} = ${rate}`);
    console.log(`    finalCost = ${rate} * ${itemQtyBase} = ${finalCost}`);
  } else if (ingBaseUnit === 'ea' && (itemBaseUnit === 'g' || itemBaseUnit === 'ml')) {
    const pieceWeight = ingredient.pieceWeight || ingredient.eaWeight || 1;
    const packQtyInWeight = packQtyBase * pieceWeight;
    const rate = packCost / packQtyInWeight;
    finalCost = rate * itemQtyBase;
    console.log(`  Calculation: (ingBaseUnit === 'ea' && itemBaseUnit === weight)`);
    console.log(`    pieceWeight = ${pieceWeight}g`);
    console.log(`    packQtyInWeight = ${packQtyBase} * ${pieceWeight} = ${packQtyInWeight}g`);
    console.log(`    rate = ${packCost} / ${packQtyInWeight} = ${rate}`);
    console.log(`    finalCost = ${rate} * ${itemQtyBase} = ${finalCost}`);
  } else if ((ingBaseUnit === 'g' || ingBaseUnit === 'ml') && itemBaseUnit === 'ea') {
    const pieceWeight = ingredient.pieceWeight || ingredient.eaWeight || 1;
    const itemQtyInWeight = itemQtyBase * pieceWeight;
    const rate = packCost / packQtyBase;
    finalCost = rate * itemQtyInWeight;
    console.log(`  Calculation: (ingBaseUnit === weight && itemBaseUnit === 'ea')`);
    console.log(`    pieceWeight = ${pieceWeight}g`);
    console.log(`    itemQtyInWeight = ${itemQtyBase} * ${pieceWeight} = ${itemQtyInWeight}g`);
    console.log(`    rate = ${packCost} / ${packQtyBase} = ${rate}`);
    console.log(`    finalCost = ${rate} * ${itemQtyInWeight} = ${finalCost}`);
  } else {
    const rate = packCost / packQtyBase;
    finalCost = rate * itemQtyBase;
    console.log(`  Calculation: Fallback`);
    console.log(`    rate = ${packCost} / ${packQtyBase} = ${rate}`);
    console.log(`    finalCost = ${rate} * ${itemQtyBase} = ${finalCost}`);
  }

  const adjustedCost = finalCost * (1 + (ingredient.wastePercent || 0) / 100);
  console.log(`  Waste Percent: ${ingredient.wastePercent}%`);
  console.log(`  Final Adjusted Cost: £${adjustedCost.toFixed(2)}`);
  return adjustedCost;
};

async function testIng(id, qty, unit) {
  const docRef = doc(db, 'ingredients', id);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = { id: snap.id, ...snap.data() };
    calculateIngredientCostSim(data, qty, unit);
  } else {
    console.log(`Ingredient ${id} not found!`);
  }
}

async function run() {
  console.log("--- TESTING COST CALCULATIONS ---");
  await testIng('ing_master_thyme_fresh', 20, 'g');
  console.log("");
  await testIng('ing_master_rosemary_fresh', 20, 'g');
}

run();
