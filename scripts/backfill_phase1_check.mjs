import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({
  projectId: 'kings-head-kitchen-claude'
});

const db = getFirestore();

async function run() {
  try {
    const reportId = 'dlPZ4bBwJ9OCtyrSR627';
    console.log(`Fetching report ${reportId}...`);
    const docSnap = await db.collection('stocktake_reports').doc(reportId).get();
    if (!docSnap.exists) {
      console.error(`Report ${reportId} does not exist!`);
      process.exit(1);
    }
    const reportData = docSnap.data();
    
    console.log("Fetching all ingredients...");
    const ingSnap = await db.collection('ingredients').get();
    const ingredientsMap = {};
    const allIngredientIds = new Set();
    ingSnap.forEach(d => {
      const data = d.data();
      ingredientsMap[d.id] = data.name || 'Unnamed';
      allIngredientIds.add(d.id);
    });

    const counts = reportData.counts || {};
    const reportEntries = Object.entries(counts);
    console.log(`Number of items in counts map of ${reportId}: ${reportEntries.length}`);

    // Map counts to Names
    const reportSorted = reportEntries.map(([id, count]) => {
      return {
        id,
        name: ingredientsMap[id] || `Unknown Ingredient (${id})`,
        count
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    console.log("\n=== REPORT INGREDIENT LIST (Sorted by Name) ===");
    reportSorted.forEach((item, index) => {
      console.log(`${String(index + 1).padStart(3, ' ')}. [${item.id}] ${item.name}: count = ${item.count}`);
    });

    // List ingredients that are NOT in the report
    const missingIngredients = [];
    for (const id of allIngredientIds) {
      if (!(id in counts)) {
        missingIngredients.push({
          id,
          name: ingredientsMap[id] || `Unknown (${id})`
        });
      }
    }
    missingIngredients.sort((a, b) => a.name.localeCompare(b.name));

    console.log(`\n=== INGREDIENTS NOT IN REPORT (${missingIngredients.length} items) ===`);
    missingIngredients.forEach((item, index) => {
      console.log(`${String(index + 1).padStart(3, ' ')}. [${item.id}] ${item.name}`);
    });

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
