
// src/lib/firebase/clientApp.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  type Auth, 
  indexedDBLocalPersistence, 
  browserLocalPersistence, 
  setPersistence, // Added setPersistence
  browserPopupRedirectResolver,
  fetchSignInMethodsForEmail // Keep if used elsewhere, or remove if not. For diagnostic log.
} from 'firebase/auth';
import { getFirestore, type Firestore, collection as diagnosticCollection } from 'firebase/firestore';

console.log("[clientApp.ts Module Scope] Typeof imported 'initializeApp':", typeof initializeApp, ". Name:", initializeApp.name);
console.log("[clientApp.ts Module Scope] Typeof imported 'getAuth':", typeof getAuth, ". Name:", getAuth.name);
console.log("[clientApp.ts Module Scope] Typeof imported 'setPersistence':", typeof setPersistence, ". Name:", setPersistence.name);
console.log("[clientApp.ts Module Scope] Typeof imported 'indexedDBLocalPersistence':", typeof indexedDBLocalPersistence);
console.log("[clientApp.ts Module Scope] Typeof imported 'browserLocalPersistence':", typeof browserLocalPersistence);
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

let firebaseAppInstance: FirebaseApp | null = null;
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
  // Initialize Firebase App
  if (!getApps().length) {
    console.log("[clientApp.ts Module Scope] No Firebase apps initialized yet. Initializing new Firebase app with config.");
    try {
      firebaseAppInstance = initializeApp(firebaseConfig);
      console.log("[clientApp.ts Module Scope] initializeApp call completed. App Name:", firebaseAppInstance.name);
    } catch (e: any) {
      console.error('[clientApp.ts Module Scope] Error initializing new Firebase app:', e.message, e.stack);
      firebaseAppInstance = null;
    }
  } else {
    console.log("[clientApp.ts Module Scope] Firebase app already initialized. Getting existing Firebase app.");
    firebaseAppInstance = getApp();
    console.log("[clientApp.ts Module Scope] getApp call completed. App Name:", firebaseAppInstance.name);
  }

  if (firebaseAppInstance) {
    if (firebaseAppInstance.options && firebaseAppInstance.options.apiKey) {
      console.log('[clientApp.ts Module Scope] firebaseAppInstance.options.apiKey check SUCCEEDED.');
    } else {
      console.error('[clientApp.ts Module Scope] firebaseAppInstance.options.apiKey check FAILED.');
      firebaseAppInstance = null; // Invalidate if options are missing
    }
    
    if (firebaseAppInstance) {
      console.log('[clientApp.ts Module Scope] firebaseAppInstance seems valid. Initializing Auth and Firestore...');
      try {
        auth = getAuth(firebaseAppInstance); // Get Auth instance
        console.log('[clientApp.ts Module Scope] getAuth call completed. Auth object type:', typeof auth);
        
        // Set persistence if on client-side
        if (typeof window !== 'undefined' && auth) {
          console.log('[clientApp.ts CLIENT-SIDE] Attempting to set persistence with browserLocalPersistence then indexedDBLocalPersistence...');
          setPersistence(auth, browserLocalPersistence) // Try localStorage first
            .then(() => {
              console.log('[clientApp.ts CLIENT-SIDE] Firebase Auth persistence set to browserLocalPersistence.');
              if ((auth as any)._persistenceManager && (auth as any)._persistenceManager._persistence && (auth as any)._persistenceManager._persistence.type) {
                console.log('[clientApp.ts CLIENT-SIDE] Auth effective persistence type (after setPersistence):', (auth as any)._persistenceManager._persistence.type);
              } else if ((auth as any).persistenceManager && (auth as any).persistenceManager.persistence && (auth as any).persistenceManager.persistence.type) {
                console.log('[clientApp.ts CLIENT-SIDE] Auth effective persistence type (after setPersistence, alt path):', (auth as any).persistenceManager.persistence.type);
              }
            })
            .catch((error) => {
              console.warn('[clientApp.ts CLIENT-SIDE] Failed to set browserLocalPersistence, trying indexedDBLocalPersistence. Error:', error.message);
              return setPersistence(auth!, indexedDBLocalPersistence); // Fallback to indexedDB
            })
            .then(() => { // This will run if browserLocal succeeded or if indexedDB succeeded as fallback
                // The previous logs already cover this, or will show if indexedDB was specifically set.
                 const currentPersistence = (auth as any)?.currentUser?.auth?.config?.persistence || (auth as any)?.config?.persistence || (auth as any)?.persistenceManager?.persistence?.type;
                 console.log('[clientApp.ts CLIENT-SIDE] Final check of effective persistence (may be async):', currentPersistence);
            })
            .catch((error) => {
              console.error('[clientApp.ts CLIENT-SIDE] Failed to set Firebase Auth persistence for both browserLocal and indexedDB. Error:', error.message, error.stack);
            });
            console.log('[clientApp.ts CLIENT-SIDE] Client Auth initialized. Current user from instance (immediately after getAuth):', auth.currentUser?.uid || 'null');
        }

      } catch (e: any) {
        console.error('[clientApp.ts Module Scope] Error initializing Auth:', e.message, e.stack);
        auth = null;
      }

      try {
        db = getFirestore(firebaseAppInstance);
        console.log('[clientApp.ts Module Scope] getFirestore call completed. Firestore object type:', typeof db, 'Project ID in db.app.options:', (db as any)?.app?.options?.projectId);
      } catch (e:any) {
        console.error('[clientApp.ts Module Scope] Error getting Firestore:', e.message, e.stack);
        db = null;
      }
    }
  } else {
    console.error('[clientApp.ts Module Scope] Failed to obtain/initialize firebaseAppInstance.');
  }

  // Basic validation of the auth object
  if (auth) {
    const hasOnAuthStateChanged = typeof (auth as any).onAuthStateChanged === 'function';
    if (hasOnAuthStateChanged) {
      console.log('[clientApp.ts Module Scope] Auth instance obtained and has onAuthStateChanged, considered VALID for basic auth operations. Environment:', typeof window !== 'undefined' ? 'Client' : 'Server');
    } else {
      console.error(
        '[clientApp.ts Module Scope] Auth instance is INVALID (missing onAuthStateChanged or auth is null). Has onAuthStateChanged:', hasOnAuthStateChanged, 'Environment:', typeof window !== 'undefined' ? 'Client' : 'Server'
      );
      auth = null; 
    }
  } else {
     console.error('[clientApp.ts Module Scope] Auth object is null after initialization block.');
  }

  if (db && typeof db === 'object' && (db as any).app) {
    console.log(`[clientApp.ts Module Scope] Firestore instance obtained and appears VALID for project: ${(db as any).app.options.projectId}. Environment:`, typeof window !== 'undefined' ? 'Client' : 'Server');
  } else {
    console.error(
        `[clientApp.ts Module Scope] Firestore instance is considered INVALID or its app property is not accessible. Firestore operations might fail. Firestore instance received:`, db, 'Environment:', typeof window !== 'undefined' ? 'Client' : 'Server'
    );
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

const firebaseApp = firebaseAppInstance; 
console.log('[clientApp.ts Module Scope End] Exporting final state: auth is', auth ? 'Instance (basic validity check passed)' : 'NULL', ', db is', db ? 'Instance' : 'NULL', ', firebaseApp is', firebaseApp ? 'Instance' : 'NULL');
export { firebaseApp, auth, db };
    
