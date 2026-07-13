import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({
  projectId: 'kings-head-kitchen-claude'
});

const db = getFirestore();

async function run() {
  try {
    const reportId = 'dlPZ4bBwJ9OCtyrSR627';
    console.log(`Loading report ${reportId}...`);
    const docSnap = await db.collection('stocktake_reports').doc(reportId).get();
    if (!docSnap.exists) {
      console.error(`Report ${reportId} does not exist!`);
      process.exit(1);
    }
    const reportData = docSnap.data();
    const counts = reportData.counts || {};
    
    console.log("Loading all ingredients from database...");
    const ingSnap = await db.collection('ingredients').get();
    
    const batchList = [];
    let currentBatch = db.batch();
    let opCount = 0;
    
    let reportUpdatesCount = 0;
    let zeroedUpdatesCount = 0;

    ingSnap.forEach(d => {
      const ingredientId = d.id;
      let newStockLevel = 0;
      let isFromReport = false;
      
      if (ingredientId in counts) {
        newStockLevel = counts[ingredientId];
        isFromReport = true;
        reportUpdatesCount++;
      } else {
        zeroedUpdatesCount++;
      }

      const docRef = db.collection('ingredients').doc(ingredientId);
      currentBatch.update(docRef, {
        stockLevel: newStockLevel,
        updatedAt: new Date().toISOString()
      });
      opCount++;

      if (opCount === 500) {
        batchList.push(currentBatch);
        currentBatch = db.batch();
        opCount = 0;
      }
    });

    if (opCount > 0) {
      batchList.push(currentBatch);
    }

    console.log(`\nPrepared ${batchList.length} batches for writing.`);
    console.log(`- Ingredients to update from report counts: ${reportUpdatesCount}`);
    console.log(`- Ingredients to zero: ${zeroedUpdatesCount}`);
    console.log(`- Total operations: ${reportUpdatesCount + zeroedUpdatesCount}`);

    console.log("\nExecuting Firestore batch writes...");
    for (let i = 0; i < batchList.length; i++) {
      console.log(`Committing batch ${i + 1}/${batchList.length}...`);
      await batchList[i].commit();
    }

    console.log("\nBackfill successfully completed!");

  } catch (err) {
    console.error("Error committing batch writes:", err);
  }
}

run();
