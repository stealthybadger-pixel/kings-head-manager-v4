import { initializeApp, deleteApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBx_7Raw_xgM2dQWBmUU29W9ggbcmVmo_Y",
  authDomain: "kings-head-kitchen-claude.firebaseapp.com",
  projectId: "kings-head-kitchen-claude",
  storageBucket: "kings-head-kitchen-claude.firebasestorage.app",
  messagingSenderId: "661815699598",
  appId: "1:661815699598:web:e05a12781db09844f241df"
};

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
});
export const auth = getAuth(app);

// A throwaway secondary Firebase app instance, used only when a manager
// creates a new staff account. createUserWithEmailAndPassword signs in as
// the new user on whatever app instance it's called against — running it
// here instead of on the primary `auth` keeps the manager's own session
// intact.
export async function createUserWithoutSigningIn(email: string, password: string) {
  const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
  try {
    const secondaryAuth = getAuth(secondaryApp);
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await signOut(secondaryAuth);
    return credential.user.uid;
  } finally {
    await deleteApp(secondaryApp);
  }
}
