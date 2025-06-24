
// src/lib/firebase/clientApp.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, enableNetwork, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase for client side
let app: FirebaseApp;
try {
  app = getApp();
} catch (error) {
  app = initializeApp(firebaseConfig);
}

const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

// Explicitly enable the network for Firestore to potentially resolve "client is offline" issues.
// This should be called after getFirestore() and is safe to call multiple times.
try {
    enableNetwork(db);
    console.log("Firestore network connection has been explicitly enabled.");
} catch(e) {
    console.error("Failed to explicitly enable Firestore network", e);
}


export { app as firebaseApp, auth, db };
