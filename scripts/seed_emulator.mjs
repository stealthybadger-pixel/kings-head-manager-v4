import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Force client to use emulator
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

initializeApp({
  projectId: 'kings-head-kitchen-claude'
});
const db = getFirestore();

function deserializeData(data) {
  if (data === null || data === undefined) return data;
  if (typeof data === 'object') {
    if (data.__type__ === 'timestamp') {
      return new Timestamp(data.seconds, data.nanoseconds);
    }
    if (data.__type__ === 'date') {
      return new Date(data.iso);
    }
    if (Array.isArray(data)) {
      return data.map(deserializeData);
    }
    const res = {};
    for (const [key, val] of Object.entries(data)) {
      res[key] = deserializeData(val);
    }
    return res;
  }
  return data;
}

async function run() {
  try {
    const dumpDir = path.resolve('firestore-dump');
    const manifestPath = path.join(dumpDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      console.error("Manifest not found. Run dump script first.");
      process.exit(1);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const collections = Object.keys(manifest.collections);

    for (const colName of collections) {
      console.log(`Seeding collection '${colName}'...`);
      const filePath = path.join(dumpDir, `${colName}.json`);
      if (!fs.existsSync(filePath)) {
        console.warn(`File ${filePath} not found. Skipping.`);
        continue;
      }
      const docsData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const docIds = Object.keys(docsData);
      console.log(`- Found ${docIds.length} docs to write`);

      let currentBatch = db.batch();
      let opCount = 0;
      let totalWritten = 0;

      for (const docId of docIds) {
        const docRef = db.collection(colName).doc(docId);
        currentBatch.set(docRef, deserializeData(docsData[docId]));
        opCount++;
        totalWritten++;

        if (opCount === 500) {
          await currentBatch.commit();
          currentBatch = db.batch();
          opCount = 0;
          console.log(`  - Committed ${totalWritten}/${docIds.length}`);
        }
      }

      if (opCount > 0) {
        await currentBatch.commit();
        console.log(`  - Committed ${totalWritten}/${docIds.length}`);
      }
    }
    console.log("Seeding completed successfully!");
  } catch (err) {
    console.error("Error during seeding:", err);
    process.exit(1);
  }
}

run();
