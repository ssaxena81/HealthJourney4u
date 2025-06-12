
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
  if (typeof window !== 'undefined') { // CLIENT-SIDE INITIALIZATION BLOCK
    console.log("[clientApp.ts CLIENT-SIDE] All Firebase config keys appear to be present in process.env.");
    
    // Ensure firebaseAppInstance is resolved client-side for initializeAuth
    if (!getApps().length) {
      console.log("[clientApp.ts CLIENT-SIDE] No Firebase apps initialized yet on client. Initializing new Firebase app with config.");
      try {
        firebaseAppInstance = initializeApp(firebaseConfig);
        console.log("[clientApp.ts CLIENT-SIDE] Client-side initializeApp call completed. App Name:", firebaseAppInstance.name);
      } catch (e: any) {
        console.error('[clientApp.ts CLIENT-SIDE] Error initializing new Firebase app on client:', e.message, e.stack);
        firebaseAppInstance = null;
      }
    } else {
      console.log("[clientApp.ts CLIENT-SIDE] Firebase app already initialized on client. Getting existing Firebase app.");
      firebaseAppInstance = getApp();
      console.log("[clientApp.ts CLIENT-SIDE] Client-side getApp call completed. App Name:", firebaseAppInstance.name);
    }

    if (firebaseAppInstance) {
      if (firebaseAppInstance.options && firebaseAppInstance.options.apiKey) {
        console.log('[clientApp.ts CLIENT-SIDE] Client-side firebaseAppInstance.options.apiKey check SUCCEEDED.');
      } else {
        console.error('[clientApp.ts CLIENT-SIDE] Client-side firebaseAppInstance.options.apiKey check FAILED.');
        firebaseAppInstance = null; // Invalidate if options are missing
      }
      
      if (firebaseAppInstance) {
        console.log('[clientApp.ts CLIENT-SIDE] Client-side firebaseAppInstance seems valid. Initializing Auth and Firestore for client...');
        try {
          // MODIFIED PERSISTENCE ORDER: Prioritize browserLocalPersistence
          console.log('[clientApp.ts CLIENT-SIDE] Initializing Auth for client with initializeAuth, prioritizing browserLocalPersistence...');
          auth = initializeAuth(firebaseAppInstance, {
            persistence: [browserLocalPersistence, indexedDBLocalPersistence], // Try localStorage first
            popupRedirectResolver: browserPopupRedirectResolver,
          });
          console.log('[clientApp.ts CLIENT-SIDE] initializeAuth call completed. Auth object type:', typeof auth);
          if (auth) {
             console.log('[clientApp.ts CLIENT-SIDE] Client Auth initialized. Current user from instance (immediately after init):', auth.currentUser?.uid || 'null');
             // Attempt to log persistence type using internal property (for debugging only)
             if ((auth as any)._persistenceManager && (auth as any)._persistenceManager._persistence && (auth as any)._persistenceManager._persistence.type) {
               console.log('[clientApp.ts CLIENT-SIDE] Auth effective persistence type (path 1):', (auth as any)._persistenceManager._persistence.type);
             } else if ((auth as any).persistenceManager && (auth as any).persistenceManager.persistence && (auth as any).persistenceManager.persistence.type) { // Alternative possible path
               console.log('[clientApp.ts CLIENT-SIDE] Auth effective persistence type (path 2):', (auth as any).persistenceManager.persistence.type);
             } else {
               console.log('[clientApp.ts CLIENT-SIDE] Could not determine auth persistence type from instance structure.');
             }
          } else {
             console.error('[clientApp.ts CLIENT-SIDE] initializeAuth returned null or undefined.');
          }
        } catch (e: any) {
          console.error('[clientApp.ts CLIENT-SIDE] Error initializing Auth on client:', e.message, e.stack);
          auth = null;
        }

        try {
          db = getFirestore(firebaseAppInstance);
          console.log('[clientApp.ts CLIENT-SIDE] getFirestore call completed for client. Firestore object type:', typeof db, 'Project ID in db.app.options:', (db as any)?.app?.options?.projectId);
        } catch (e:any) {
          console.error('[clientApp.ts CLIENT-SIDE] Error getting Firestore on client:', e.message, e.stack);
          db = null;
        }
      }
    } else {
      console.error('[clientApp.ts CLIENT-SIDE] Failed to obtain/initialize firebaseAppInstance on client.');
    }
  } else { // SERVER-SIDE (or non-browser environment)
    console.log("[clientApp.ts SERVER-SIDE] Running in non-browser environment.");
    if (!getApps().length) {
      firebaseAppInstance = initializeApp(firebaseConfig);
      console.log("[clientApp.ts SERVER-SIDE] Initialized Firebase app on server. App Name:", firebaseAppInstance.name);
    } else {
      firebaseAppInstance = getApp();
      console.log("[clientApp.ts SERVER-SIDE] Got existing Firebase app on server. App Name:", firebaseAppInstance.name);
    }
    if (firebaseAppInstance) {
      try {
        auth = getAuth(firebaseAppInstance); // No persistence config needed for server-side getAuth
        console.log('[clientApp.ts SERVER-SIDE] getAuth (server context) call completed. Auth object type:', typeof auth);
      } catch (e:any) {
        console.error('[clientApp.ts SERVER-SIDE] Error getting Auth on server:', e.message, e.stack);
        auth = null;
      }
      try {
        db = getFirestore(firebaseAppInstance);
        console.log('[clientApp.ts SERVER-SIDE] getFirestore (server context) call completed. DB object type:', typeof db);
      } catch (e:any) {
        console.error('[clientApp.ts SERVER-SIDE] Error getting Firestore on server:', e.message, e.stack);
        db = null;
      }
    } else {
      console.error('[clientApp.ts SERVER-SIDE] Failed to obtain/initialize firebaseAppInstance on server.');
    }
  }

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
    
