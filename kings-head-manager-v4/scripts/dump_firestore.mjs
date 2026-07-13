import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

initializeApp({
  projectId: 'kings-head-kitchen-claude'
});

const db = getFirestore();

function serializeData(data) {
  if (data === null || data === undefined) return data;
  if (data instanceof Timestamp) {
    return { __type__: 'timestamp', seconds: data.seconds, nanoseconds: data.nanoseconds };
  }
  if (data instanceof Date) {
    return { __type__: 'date', iso: data.toISOString() };
  }
  if (Array.isArray(data)) {
    return data.map(serializeData);
  }
  if (typeof data === 'object') {
    const res = {};
    for (const [key, val] of Object.entries(data)) {
      res[key] = serializeData(val);
    }
    return res;
  }
  return data;
}

async function run() {
  try {
    const dumpDir = path.resolve('firestore-dump');
    if (!fs.existsSync(dumpDir)) {
      fs.mkdirSync(dumpDir, { recursive: true });
    }

    console.log("Listing all top-level collections in Firestore...");
    const collections = await db.listCollections();
    const collectionNames = collections.map(col => col.id);
    console.log(`Found collections: ${collectionNames.join(', ')}`);

    const manifest = {
      timestamp: new Date().toISOString(),
      collections: {}
    };

    for (const col of collections) {
      const colName = col.id;
      console.log(`Dumping collection '${colName}'...`);
      const snapshot = await col.get();
      const docsData = {};

      snapshot.forEach(doc => {
        docsData[doc.id] = serializeData(doc.data());
      });

      const count = Object.keys(docsData).length;
      manifest.collections[colName] = count;
      console.log(`- Read ${count} documents from '${colName}'`);

      const filePath = path.join(dumpDir, `${colName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(docsData, null, 2), 'utf8');
      console.log(`- Saved to ${filePath}`);
    }

    const manifestPath = path.join(dumpDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`\nManifest written to ${manifestPath}`);
    console.log("Dump completed successfully!");

  } catch (err) {
    console.error("Error during Firestore dump:", err);
    process.exit(1);
  }
}

run();
