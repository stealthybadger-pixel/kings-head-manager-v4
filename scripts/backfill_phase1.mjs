import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({
  projectId: 'kings-head-kitchen-claude'
});

const db = getFirestore();

async function run() {
  try {
    console.log("Fetching all ingredients...");
    const ingSnap = await db.collection('ingredients').get();
    const ingredientsMap = {};
    const allIngredientIds = new Set();
    ingSnap.forEach(doc => {
      const data = doc.data();
      ingredientsMap[doc.id] = data.name || 'Unnamed';
      allIngredientIds.add(doc.id);
    });
    console.log(`Total ingredients in database: ${allIngredientIds.size}`);

    console.log("\nFetching stocktake_reports...");
    const reportsSnap = await db.collection('stocktake_reports').get();
    
    console.log("Available reports:");
    reportsSnap.forEach(doc => {
      const data = doc.data();
      const createdAt = data.createdAt;
      const date = data.date;
      console.log(`- ID: ${doc.id}, date: ${date}, createdAt: ${createdAt}, items count: ${data.counts ? Object.keys(data.counts).length : 0}`);
    });

  } catch (err) {
    console.error("Error in script:", err);
  }
}

run();
