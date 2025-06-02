
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth, fetchSignInMethodsForEmail as diagnosticFetchSignInMethodsForEmail } from 'firebase/auth';
import { getFirestore, type Firestore, collection as diagnosticCollection } from 'firebase/firestore';

console.log("[clientApp.ts] Imports: initializeApp, getAuth, getFirestore loaded.");
console.log("[clientApp.ts] Diagnostic: Directly imported 'fetchSignInMethodsForEmail' type:", typeof diagnosticFetchSignInMethodsForEmail);
console.log("[clientApp.ts] Diagnostic: Directly imported 'collection' type:", typeof diagnosticCollection);


const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

console.log('[clientApp.ts] Firebase Project ID from config:', firebaseConfig.projectId || 'MISSING');

let firebaseApp: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

const allConfigKeysPresent =
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.storageBucket &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId;

if (!allConfigKeysPresent) {
  console.error(
    '[clientApp.ts] CRITICAL FIREBASE CONFIG ERROR: One or more NEXT_PUBLIC_FIREBASE_... environment variables are missing. Firebase services will NOT be initialized.'
  );
} else {
  console.log("[clientApp.ts] All Firebase config keys appear to be present.");

  if (!getApps().length) {
    try {
      firebaseApp = initializeApp(firebaseConfig);
      console.log('[clientApp.ts] Firebase app NEWLY initialized. Name:', firebaseApp?.name || 'Unknown');
    } catch (e: any) {
      console.error('[clientApp.ts] Error initializing new Firebase app:', e.message);
      firebaseApp = null;
    }
  } else {
    firebaseApp = getApp();
    console.log('[clientApp.ts] Existing Firebase app retrieved. Name:', firebaseApp?.name || 'Unknown');
  }

  if (firebaseApp && firebaseApp.name) { // Check if firebaseApp itself is valid
    // Initialize Auth
    try {
      auth = getAuth(firebaseApp);
      console.log('[clientApp.ts] getAuth() called.');
      // Check for essential Auth methods
      if (auth && typeof auth.onAuthStateChanged === 'function' && typeof auth.fetchSignInMethodsForEmail === 'function') {
        console.log('[clientApp.ts] Auth instance obtained and appears VALID.');
      } else {
        console.error(
          '[clientApp.ts] Auth instance from getAuth() is INVALID. Has onAuthStateChanged:',
          !!(auth && typeof (auth as any).onAuthStateChanged === 'function'),
          ', Has fetchSignInMethodsForEmail:',
          !!(auth && typeof (auth as any).fetchSignInMethodsForEmail === 'function')
        );
        auth = null; // Nullify if invalid
      }
    } catch (e: any) {
      console.error('[clientApp.ts] Error calling getAuth():', e.message);
      auth = null;
    }

    // Initialize Firestore
    try {
      db = getFirestore(firebaseApp);
      console.log('[clientApp.ts] getFirestore() called.');
      // Check for essential Firestore methods
      if (db && typeof db.collection === 'function') {
        console.log('[clientApp.ts] Firestore instance obtained and appears VALID.');
      } else {
        console.error(
          '[clientApp.ts] Firestore instance from getFirestore() is INVALID. Has collection method:',
          !!(db && typeof (db as any).collection === 'function')
        );
        db = null; // Nullify if invalid
      }
    } catch (e: any) {
      console.error('[clientApp.ts] Error calling getFirestore():', e.message);
      db = null;
    }
  } else {
    console.error('[clientApp.ts] Firebase app object is null or invalid after initialization/retrieval. Auth and Firestore NOT initialized.');
    auth = null; // Ensure these are null if firebaseApp is bad
    db = null;
  }
}

console.log('[clientApp.ts] Exporting final state: auth is', auth ? 'VALID Instance' : 'NULL', ', db is', db ? 'VALID Instance' : 'NULL');
export { firebaseApp, auth, db };
