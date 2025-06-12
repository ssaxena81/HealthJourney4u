
// src/lib/firebase/clientApp.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  type Auth,
  // Persistence-related imports are no longer directly used here
  // setPersistence,
  // browserLocalPersistence,
  // indexedDBLocalPersistence,
} from 'firebase/auth';
import { getFirestore, type Firestore, collection as diagnosticCollection } from 'firebase/firestore';

console.log("[clientApp.ts Module Scope] Typeof imported 'initializeApp':", typeof initializeApp, ". Name:", initializeApp.name);
console.log("[clientApp.ts Module Scope] Typeof imported 'getAuth':", typeof getAuth, ". Name:", getAuth.name);
// console.log("[clientApp.ts Module Scope] Typeof imported 'setPersistence':", typeof setPersistence, ". Name:", setPersistence.name);
// console.log("[clientApp.ts Module Scope] Typeof imported 'indexedDBLocalPersistence':", typeof indexedDBLocalPersistence);
// console.log("[clientApp.ts Module Scope] Typeof imported 'browserLocalPersistence':", typeof browserLocalPersistence);
console.log("[clientApp.ts Module Scope] Typeof imported 'getFirestore':", typeof getFirestore, ". Name:", getFirestore.name);
// console.log("[clientApp.ts Module Scope] Diagnostic: typeof imported fetchSignInMethodsForEmail is", typeof fetchSignInMethodsForEmail);
// console.log("[clientApp.ts Module Scope] Diagnostic: typeof imported collection is", typeof diagnosticCollection);


const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let firebaseApp: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

// This block now only runs on the client
if (typeof window !== 'undefined') {
  console.log('[clientApp.ts CLIENT-SIDE] Running client-side Firebase initialization.');
  console.log('[clientApp.ts CLIENT-SIDE] Firebase Config being used:', JSON.stringify(firebaseConfig, null, 2));

  const allConfigKeysPresent =
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.storageBucket &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId;

  if (!allConfigKeysPresent) {
    console.error(
      '[clientApp.ts CLIENT-SIDE] CRITICAL FIREBASE CONFIG ERROR: One or more NEXT_PUBLIC_FIREBASE_... environment variables are missing. Firebase services will NOT be initialized.'
    );
  } else {
    if (!getApps().length) {
      console.log("[clientApp.ts CLIENT-SIDE] No Firebase apps initialized yet on client. Initializing new Firebase app with config.");
      try {
        firebaseApp = initializeApp(firebaseConfig);
        console.log("[clientApp.ts CLIENT-SIDE] Client-side initializeApp call completed. App Name:", firebaseApp.name);
      } catch (e: any) {
        console.error('[clientApp.ts CLIENT-SIDE] Error initializing new Firebase app on client:', e.message, e.stack);
      }
    } else {
      console.log("[clientApp.ts CLIENT-SIDE] Firebase app already initialized on client. Getting existing Firebase app.");
      firebaseApp = getApp();
      console.log("[clientApp.ts CLIENT-SIDE] Client-side getApp call completed. App Name:", firebaseApp.name);
    }

    if (firebaseApp) {
      if (firebaseApp.options && firebaseApp.options.apiKey) {
        console.log('[clientApp.ts CLIENT-SIDE] Client-side firebaseAppInstance.options.apiKey check SUCCEEDED.');
      } else {
        console.error('[clientApp.ts CLIENT-SIDE] Client-side firebaseAppInstance.options.apiKey check FAILED.');
        firebaseApp = null; // Invalidate if options are missing
      }

      if (firebaseApp) {
        console.log('[clientApp.ts CLIENT-SIDE] Client-side firebaseAppInstance seems valid. Initializing Auth and Firestore for client...');
        try {
          auth = getAuth(firebaseApp);
          console.log('[clientApp.ts CLIENT-SIDE] getAuth call completed for client. Auth object type:', typeof auth);
          
          // REMOVED explicit setPersistence call
          console.log('[clientApp.ts CLIENT-SIDE] Relying on default Firebase Auth persistence.');
          // const persistenceType = (auth as any)?.config?.persistence || (auth as any)?.persistenceManager?.persistence?.type;
          // console.log('[clientApp.ts CLIENT-SIDE] Firebase Auth default persistence type (may be async):', persistenceType);

          console.log('[clientApp.ts CLIENT-SIDE] Client Auth initialized. Current user from instance (immediately after getAuth):', auth.currentUser?.uid || 'null');
        } catch (e: any) {
          console.error('[clientApp.ts CLIENT-SIDE] Error initializing client-side Auth:', e.message, e.stack);
          auth = null;
        }

        try {
          db = getFirestore(firebaseApp);
          console.log('[clientApp.ts CLIENT-SIDE] getFirestore call completed for client. Firestore object type:', typeof db, 'Project ID in db.app.options:', (db as any)?.app?.options?.projectId);
        } catch (e: any) {
          console.error('[clientApp.ts CLIENT-SIDE] Error getting client-side Firestore:', e.message, e.stack);
          db = null;
        }
      }
    } else {
      console.error('[clientApp.ts CLIENT-SIDE] Failed to obtain/initialize client-side firebaseAppInstance.');
    }
  }
} else {
  console.log('[clientApp.ts SERVER-SIDE] Skipping client-side Firebase initialization.');
}

// --- Post-initialization checks and diagnostic listener (client-side only) ---
if (typeof window !== 'undefined') {
  if (auth) {
    const hasOnAuthStateChanged = typeof (auth as any).onAuthStateChanged === 'function';
    if (hasOnAuthStateChanged) {
      console.log('[clientApp.ts CLIENT-SIDE] Auth instance obtained and has onAuthStateChanged, considered VALID for basic auth operations.');
    } else {
      console.error('[clientApp.ts CLIENT-SIDE] Auth instance is INVALID (missing onAuthStateChanged or auth is null). Has onAuthStateChanged:', hasOnAuthStateChanged);
      auth = null;
    }
  } else {
     console.error('[clientApp.ts CLIENT-SIDE] Auth object is null after client-side initialization block.');
  }

  if (db && typeof db === 'object' && (db as any).app) {
    console.log(`[clientApp.ts CLIENT-SIDE] Firestore instance obtained and appears VALID for project: ${(db as any).app.options.projectId}.`);
  } else {
    console.error(`[clientApp.ts CLIENT-SIDE] Firestore instance is considered INVALID or its app property is not accessible. Firestore operations might fail. Firestore instance received:`, db);
    db = null;
  }

  console.log('[clientApp.ts CLIENT-SIDE] Attempting to set up DIAGNOSTIC listener. Current `auth` object is:', auth ? 'Instance' : 'NULL');
  if (auth && typeof auth.onAuthStateChanged === 'function') {
      console.log('[clientApp.ts CLIENT-SIDE] `auth` is truthy for diagnostic listener. typeof auth.onAuthStateChanged:', typeof auth.onAuthStateChanged);
      console.log('[clientApp.ts CLIENT-SIDE] Attaching DIAGNOSTIC onAuthStateChanged listener now...');
      try {
          const diagnosticUnsubscribe = auth.onAuthStateChanged(user => {
              console.log('!!! [clientApp.ts DIAGNOSTIC onAuthStateChanged FIRED] !!! User from clientApp.ts listener:', user ? user.uid : 'null');
          });
          console.log('[clientApp.ts CLIENT-SIDE] DIAGNOSTIC onAuthStateChanged listener attached successfully. Unsubscribe function details:', String(diagnosticUnsubscribe).substring(0,100) + "...");
      } catch (e: any) {
          console.error('[clientApp.ts CLIENT-SIDE] CRITICAL ERROR attaching DIAGNOSTIC onAuthStateChanged listener:', e.message, e.stack);
      }
  } else {
      console.warn('[clientApp.ts CLIENT-SIDE] `auth` is NULL or UNDEFINED or onAuthStateChanged is not a function at the point of diagnostic listener setup. Cannot attach diagnostic listener. Auth:', auth, 'typeof auth.onAuthStateChanged:', typeof auth?.onAuthStateChanged);
  }
}

console.log('[clientApp.ts Module Scope End] Exporting final state: auth is', auth ? 'Instance (client-side)' : 'NULL', ', db is', db ? 'Instance (client-side)' : 'NULL', ', firebaseApp is', firebaseApp ? 'Instance (client-side)' : 'NULL');
export { firebaseApp, auth, db };
    
    