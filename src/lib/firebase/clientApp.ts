
// src/lib/firebase/clientApp.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth, fetchSignInMethodsForEmail as diagnosticFetchSignInMethodsForEmail } from 'firebase/auth';
import { getFirestore, type Firestore, collection as diagnosticCollection } from 'firebase/firestore';

// Explicitly log the types of imported Firebase functions at the module's top level
console.log("[clientApp.ts] Typeof imported 'initializeApp':", typeof initializeApp, ". Name:", initializeApp.name);
console.log("[clientApp.ts] Typeof imported 'getAuth':", typeof getAuth, ". Name:", getAuth.name);
console.log("[clientApp.ts] Typeof imported 'getFirestore':", typeof getFirestore, ". Name:", getFirestore.name);
console.log("[clientApp.ts] Diagnostic: typeof imported fetchSignInMethodsForEmail is", typeof diagnosticFetchSignInMethodsForEmail);
console.log("[clientApp.ts] Diagnostic: typeof imported collection is", typeof diagnosticCollection);


const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

console.log('[clientApp.ts] Firebase Config being used:', JSON.stringify(firebaseConfig, null, 2));

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
  console.log("[clientApp.ts] All Firebase config keys appear to be present in process.env.");

  if (!getApps().length) {
    try {
      console.log("[clientApp.ts] Initializing new Firebase app with config.");
      firebaseApp = initializeApp(firebaseConfig);
      console.log("[clientApp.ts] initializeApp call completed.");
    } catch (e: any) {
      console.error('[clientApp.ts] Error initializing new Firebase app:', e.message, e.stack);
      firebaseApp = null;
    }
  } else {
    console.log("[clientApp.ts] Getting existing Firebase app.");
    firebaseApp = getApp();
    console.log("[clientApp.ts] getApp call completed.");
  }

  if (firebaseApp) {
    console.log('[clientApp.ts] Firebase initializeApp/getApp SUCCEEDED. App Name:', firebaseApp.name);
    if (firebaseApp.options && firebaseApp.options.apiKey) {
      console.log('[clientApp.ts] firebaseApp.options.apiKey check SUCCEEDED.');
    } else {
      console.error('[clientApp.ts] firebaseApp.options.apiKey check FAILED. firebaseApp.options:', firebaseApp.options);
      firebaseApp = null;
    }
  } else {
    console.error('[clientApp.ts] Firebase initializeApp/getApp FAILED to return a valid app object.');
  }

  if (firebaseApp) {
    console.log('[clientApp.ts] firebaseApp seems valid. Proceeding to initialize Auth and Firestore.');
    // Initialize Auth
    try {
      console.log('[clientApp.ts] Attempting to get Auth instance from firebaseApp:', firebaseApp.name);
      auth = getAuth(firebaseApp);
      console.log('[clientApp.ts] getAuth call completed. Auth object type:', typeof auth);

      const hasOnAuthStateChanged = !!(auth && typeof (auth as any).onAuthStateChanged === 'function');

      if (hasOnAuthStateChanged) {
        console.log('[clientApp.ts] Auth instance obtained and has onAuthStateChanged, considered VALID for basic auth operations.');
      } else {
        console.error(
          '[clientApp.ts] Auth instance from getAuth() is INVALID (missing onAuthStateChanged). Has onAuthStateChanged:', hasOnAuthStateChanged
        );
        auth = null;
      }
    } catch (e: any) {
      console.error('[clientApp.ts] Error calling getAuth():', e.message, e.stack);
      auth = null;
    }

    // Initialize Firestore
    try {
      console.log('[clientApp.ts] Attempting to get Firestore instance from firebaseApp:', firebaseApp.name);
      db = getFirestore(firebaseApp);
      console.log('[clientApp.ts] getFirestore call completed. Firestore object type:', typeof db, 'Project ID in db.app.options:', (db as any)?.app?.options?.projectId);

      // A more reliable check for a modular Firestore instance is its 'app' property
      // or simply if it's an object and getFirestore didn't throw.
      // The previous check for `db.collection` was incorrect for the modular SDK.
      if (db && typeof db === 'object' && (db as any).app) {
        console.log(`[clientApp.ts] Firestore instance obtained and appears VALID for project: ${(db as any).app.options.projectId}.`);
      } else {
        console.error(
            `[clientApp.ts] Firestore instance from getFirestore() is considered INVALID or its app property is not accessible. Firestore operations might fail. Firestore instance received:`, db
        );
        // Do not nullify db here if getFirestore itself didn't throw,
        // let subsequent operations fail if it's truly unusable.
        // db = null; 
      }
    } catch (e: any) {
      console.error('[clientApp.ts] Error calling getFirestore():', e.message, e.stack);
      db = null;
    }
  } else {
    console.error('[clientApp.ts] firebaseApp object is null or invalid. Auth and Firestore NOT initialized.');
    auth = null;
    db = null;
  }
}

console.log('[clientApp.ts] Exporting final state: auth is', auth ? 'Instance (basic validity)' : 'NULL', ', db is', db ? 'Instance' : 'NULL');
export { firebaseApp, auth, db };
