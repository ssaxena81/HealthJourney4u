
// src/lib/firebase/clientApp.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  type Auth, 
  indexedDBLocalPersistence, 
  browserLocalPersistence, 
  initializeAuth, 
  browserPopupRedirectResolver,
  fetchSignInMethodsForEmail // Keep if used elsewhere, or remove if not. For diagnostic log.
} from 'firebase/auth';
import { getFirestore, type Firestore, collection as diagnosticCollection } from 'firebase/firestore';

console.log("[clientApp.ts Module Scope] Typeof imported 'initializeApp':", typeof initializeApp, ". Name:", initializeApp.name);
console.log("[clientApp.ts Module Scope] Typeof imported 'getAuth':", typeof getAuth, ". Name:", getAuth.name);
console.log("[clientApp.ts Module Scope] Typeof imported 'initializeAuth':", typeof initializeAuth, ". Name:", initializeAuth.name);
console.log("[clientApp.ts Module Scope] Typeof imported 'getFirestore':", typeof getFirestore, ". Name:", getFirestore.name);
console.log("[clientApp.ts Module Scope] Diagnostic: typeof imported fetchSignInMethodsForEmail is", typeof fetchSignInMethodsForEmail);
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
      if (typeof window !== 'undefined') { // CLIENT-SIDE
        console.log('[clientApp.ts CLIENT-SIDE] Initializing Auth for client with initializeAuth...');
        auth = initializeAuth(firebaseApp, {
          persistence: [indexedDBLocalPersistence, browserLocalPersistence],
          popupRedirectResolver: browserPopupRedirectResolver,
        });
        console.log('[clientApp.ts CLIENT-SIDE] initializeAuth call completed. Auth object type:', typeof auth);
        if (auth) {
           console.log('[clientApp.ts CLIENT-SIDE] Client Auth initialized. Current user from instance (immediately after init):', auth.currentUser?.uid || 'null');
           // Attempt to log persistence type using internal property (for debugging only)
           // This structure might change between Firebase SDK versions.
           if ((auth as any)._persistenceManager && (auth as any)._persistenceManager._persistence && (auth as any)._persistenceManager._persistence.type) {
             console.log('[clientApp.ts CLIENT-SIDE] Auth effective persistence type:', (auth as any)._persistenceManager._persistence.type);
           } else if ((auth as any).persistenceManager && (auth as any).persistenceManager.persistence && (auth as any).persistenceManager.persistence.type) { // Alternative possible path
             console.log('[clientApp.ts CLIENT-SIDE] Auth effective persistence type (alt path):', (auth as any).persistenceManager.persistence.type);
           } else {
             console.log('[clientApp.ts CLIENT-SIDE] Could not determine auth persistence type from instance structure.');
           }
        }
      } else { // SERVER-SIDE
        console.log('[clientApp.ts SERVER-SIDE] Getting Auth for server with getAuth...');
        auth = getAuth(firebaseApp);
        console.log('[clientApp.ts SERVER-SIDE] getAuth (server context) call completed. Auth object type:', typeof auth);
         if (auth) {
           console.log('[clientApp.ts SERVER-SIDE] Server Auth obtained. Current user from instance (immediately after getAuth):', auth.currentUser?.uid || 'null');
         }
      }
      
      const hasOnAuthStateChanged = !!(auth && typeof (auth as any).onAuthStateChanged === 'function');
      if (hasOnAuthStateChanged) {
        if (typeof window !== 'undefined') console.log('[clientApp.ts CLIENT-SIDE] Auth instance obtained and has onAuthStateChanged, considered VALID for basic auth operations.');
      } else {
        console.error(
          '[clientApp.ts Module Scope] Auth instance is INVALID (missing onAuthStateChanged or auth is null). Has onAuthStateChanged:', hasOnAuthStateChanged
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

// Diagnostic listener for client-side Auth state
if (typeof window !== 'undefined') {
    console.log('[clientApp.ts CLIENT-SIDE] Attempting to set up DIAGNOSTIC listener. Current `auth` object is:', auth ? 'Instance' : 'NULL');
    if (auth) {
        console.log('[clientApp.ts CLIENT-SIDE] `auth` is truthy for diagnostic listener. typeof auth.onAuthStateChanged:', typeof auth.onAuthStateChanged);
        if (typeof auth.onAuthStateChanged === 'function') {
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
            console.error('[clientApp.ts CLIENT-SIDE] `auth.onAuthStateChanged` IS NOT A FUNCTION. Cannot attach diagnostic listener.');
        }
    } else {
        console.warn('[clientApp.ts CLIENT-SIDE] `auth` is NULL or UNDEFINED at the point of diagnostic listener setup. Cannot attach diagnostic listener.');
    }
} else {
    console.log('[clientApp.ts Module Scope] Not client-side (typeof window === "undefined"), so DIAGNOSTIC listener not attached.');
}

console.log('[clientApp.ts Module Scope End] Exporting final state: auth is', auth ? 'Instance (basic validity check passed)' : 'NULL', ', db is', db ? 'Instance' : 'NULL');
export { firebaseApp, auth, db };

