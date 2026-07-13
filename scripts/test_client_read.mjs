import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

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

try {
  console.log("Attempting to query stocktake_reports...");
  const snap = await getDocs(query(collection(db, 'stocktake_reports'), limit(5)));
  console.log(`Success! Found ${snap.size} docs`);
  for (const d of snap.docs) {
    console.log(d.id, d.data().createdAt || d.data().date);
  }
} catch (e) {
  console.error("Error running test query:", e);
}
process.exit(0);
