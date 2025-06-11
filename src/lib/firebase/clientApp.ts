
// src/lib/firebase/clientApp.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth, indexedDBLocalPersistence, browserLocalPersistence, initializeAuth, browserPopupRedirectResolver, type Persistence } from 'firebase/auth';
import { getFirestore, type Firestore, collection as diagnosticCollection } from 'firebase/firestore';

// Explicitly log the types of imported Firebase functions at the module's top level
console.log("[clientApp.ts Module Scope] Typeof imported 'initializeApp':", typeof initializeApp, ". Name:", initializeApp.name);
console.log("[clientApp.ts Module Scope] Typeof imported 'getAuth':", typeof getAuth, ". Name:", getAuth.name);
console.log("[clientApp.ts Module Scope] Typeof imported 'initializeAuth':", typeof initializeAuth, ". Name:", initializeAuth.name);
console.log("[clientApp.ts Module Scope] Typeof imported 'getFirestore':", typeof getFirestore, ". Name:", getFirestore.name);
console.log("[clientApp.ts Module Scope] Diagnostic: typeof imported collection is", typeof diagnosticCollection);


const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (typeof window !== 'undefined') {
    console.log('[clientApp.ts CLIENT-SIDE] Firebase Config being used:', JSON.stringify(firebaseConfig, null, 2));
}


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
    '[clientApp.ts Module Scope] CRITICAL FIREBASE CONFIG ERROR: One or more NEXT_PUBLIC_FIREBASE_... environment variables are missing. Firebase services will NOT be initialized.'
  );
} else {
    if (typeof window !== 'undefined') {
        console.log("[clientApp.ts CLIENT-SIDE] All Firebase config keys appear to be present in process.env.");
    }

  if (!getApps().length) {
    try {
      if (typeof window !== 'undefined') console.log("[clientApp.ts CLIENT-SIDE] Initializing new Firebase app with config.");
      firebaseApp = initializeApp(firebaseConfig);
      if (typeof window !== 'undefined') console.log("[clientApp.ts CLIENT-SIDE] initializeApp call completed.");
    } catch (e: any) {
      console.error('[clientApp.ts Module Scope] Error initializing new Firebase app:', e.message, e.stack);
      firebaseApp = null;
    }
  } else {
    if (typeof window !== 'undefined') console.log("[clientApp.ts CLIENT-SIDE] Getting existing Firebase app.");
    firebaseApp = getApp();
    if (typeof window !== 'undefined') console.log("[clientApp.ts CLIENT-SIDE] getApp call completed.");
  }

  if (firebaseApp) {
    if (typeof window !== 'undefined') console.log('[clientApp.ts CLIENT-SIDE] Firebase initializeApp/getApp SUCCEEDED. App Name:', firebaseApp.name);
    if (firebaseApp.options && firebaseApp.options.apiKey) {
      if (typeof window !== 'undefined') console.log('[clientApp.ts CLIENT-SIDE] firebaseApp.options.apiKey check SUCCEEDED.');
    } else {
      console.error('[clientApp.ts Module Scope] firebaseApp.options.apiKey check FAILED. firebaseApp.options:', firebaseApp.options);
      firebaseApp = null;
    }
  } else {
    console.error('[clientApp.ts Module Scope] Firebase initializeApp/getApp FAILED to return a valid app object.');
  }

  if (firebaseApp) {
    if (typeof window !== 'undefined') console.log('[clientApp.ts CLIENT-SIDE] firebaseApp seems valid. Proceeding to initialize Auth and Firestore.');
    
    // Initialize Auth
    try {
      if (typeof window !== 'undefined') {
        console.log('[clientApp.ts CLIENT-SIDE] Attempting to initialize Auth with persistence for app:', firebaseApp.name);
        // Use initializeAuth for client-side with persistence
        auth = initializeAuth(firebaseApp, {
          persistence: [indexedDBLocalPersistence, browserLocalPersistence], // indexedDBLocalPersistence preferred
          popupRedirectResolver: browserPopupRedirectResolver, // Optional, for popup/redirect operations
        });
        console.log('[clientApp.ts CLIENT-SIDE] initializeAuth call completed. Auth object type:', typeof auth);
      } else {
        // For server-side (e.g., server actions, Route Handlers), use getAuth
        console.log('[clientApp.ts Module Scope] Attempting to get Auth instance (server context) for app:', firebaseApp.name);
        auth = getAuth(firebaseApp);
        console.log('[clientApp.ts Module Scope] getAuth (server context) call completed. Auth object type:', typeof auth);
      }
      
      const hasOnAuthStateChanged = !!(auth && typeof (auth as any).onAuthStateChanged === 'function');
      if (hasOnAuthStateChanged) {
        if (typeof window !== 'undefined') console.log('[clientApp.ts CLIENT-SIDE] Auth instance obtained and has onAuthStateChanged, considered VALID for basic auth operations.');
      } else {
        console.error(
          '[clientApp.ts Module Scope] Auth instance is INVALID (missing onAuthStateChanged). Has onAuthStateChanged:', hasOnAuthStateChanged
        );
        auth = null;
      }
    } catch (e: any) {
      console.error('[clientApp.ts Module Scope] Error initializing/getting Auth:', e.message, e.stack);
      auth = null;
    }

    // Initialize Firestore
    try {
      if (typeof window !== 'undefined') console.log('[clientApp.ts CLIENT-SIDE] Attempting to get Firestore instance from firebaseApp:', firebaseApp.name);
      db = getFirestore(firebaseApp);
      if (typeof window !== 'undefined') console.log('[clientApp.ts CLIENT-SIDE] getFirestore call completed. Firestore object type:', typeof db, 'Project ID in db.app.options:', (db as any)?.app?.options?.projectId);

      if (db && typeof db === 'object' && (db as any).app) {
        if (typeof window !== 'undefined') console.log(`[clientApp.ts CLIENT-SIDE] Firestore instance obtained and appears VALID for project: ${(db as any).app.options.projectId}.`);
      } else {
        console.error(
            `[clientApp.ts Module Scope] Firestore instance from getFirestore() is considered INVALID or its app property is not accessible. Firestore operations might fail. Firestore instance received:`, db
        );
      }
    } catch (e: any) {
      console.error('[clientApp.ts Module Scope] Error calling getFirestore():', e.message, e.stack);
      db = null;
    }
  } else {
    console.error('[clientApp.ts Module Scope] firebaseApp object is null or invalid. Auth and Firestore NOT initialized.');
    auth = null;
    db = null;
  }
}

// Diagnostic listener
if (typeof window !== 'undefined' && auth) {
    console.log('[clientApp.ts CLIENT-SIDE] Setting up a DIAGNOSTIC onAuthStateChanged listener directly on the `auth` instance.');
    try {
        const diagnosticUnsubscribe = auth.onAuthStateChanged(user => {
            console.log('!!! [clientApp.ts DIAGNOSTIC onAuthStateChanged FIRED] !!! User from clientApp.ts listener:', user ? user.uid : 'null');
        });
        // This diagnostic listener typically isn't unsubscribed for debugging purposes during development.
        console.log('[clientApp.ts CLIENT-SIDE] DIAGNOSTIC onAuthStateChanged listener attached.');
    } catch (e) {
        console.error('[clientApp.ts CLIENT-SIDE] ERROR attaching DIAGNOSTIC onAuthStateChanged listener:', e);
    }
}


console.log('[clientApp.ts Module Scope End] Exporting final state: auth is', auth ? 'Instance (basic validity)' : 'NULL', ', db is', db ? 'Instance' : 'NULL');
export { firebaseApp, auth, db };
