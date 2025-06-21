
// src/lib/firebase/clientApp.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let firebaseAppInstance: FirebaseApp;
let authInstance: Auth;
let dbInstance: Firestore;

// Ensure Firebase is initialized only on the client-side and only once
if (typeof window !== 'undefined') {
  if (!getApps().length) {
    try {
      firebaseAppInstance = initializeApp(firebaseConfig);
      console.log("[clientApp.ts] Firebase app initialized on client.");
    } catch (e: any) {
      console.error('[clientApp.ts] Error initializing new Firebase app on client:', e.message, e.stack);
      // @ts-ignore
      firebaseAppInstance = null;
    }
  } else {
    firebaseAppInstance = getApp();
    console.log("[clientApp.ts] Existing Firebase app retrieved on client.");
  }

  if (firebaseAppInstance) {
    try {
      authInstance = getAuth(firebaseAppInstance);
      console.log("[clientApp.ts] Firebase Auth instance obtained for client.");
    } catch (e: any) {
      console.error('[clientApp.ts] Error getting client-side Auth:', e.message, e.stack);
      // @ts-ignore
      authInstance = null;
    }

    try {
      dbInstance = getFirestore(firebaseAppInstance);
      console.log("[clientApp.ts] Firebase Firestore instance obtained for client.");
    } catch (e: any) {
      console.error('[clientApp.ts] Error getting client-side Firestore:', e.message, e.stack);
      // @ts-ignore
      dbInstance = null;
    }
  } else {
    console.error("[clientApp.ts] Firebase app instance is null after initialization attempt.");
    // @ts-ignore
    authInstance = null;
    // @ts-ignore
    dbInstance = null;
  }
} else {
  // Server-side or build time
  console.log('[clientApp.ts] Not client-side. Firebase client instances are not initialized here.');
  // @ts-ignore
  firebaseAppInstance = null;
  // @ts-ignore
  authInstance = null;
  // @ts-ignore
  dbInstance = null;
}

console.log('[clientApp.ts] Firebase app instance:',firebaseAppInstance);


export const firebaseApp = firebaseAppInstance;
export const auth = authInstance;
export const db = dbInstance;
