
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth, fetchSignInMethodsForEmail as diagnosticFetchSignInMethodsForEmail } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

// Log the imported functions themselves to check for import issues
console.log("[clientApp.ts] Typeof imported 'initializeApp':", typeof initializeApp, ". Name:", (initializeApp as any).name);
console.log("[clientApp.ts] Typeof imported 'getAuth':", typeof getAuth, ". Name:", (getAuth as any).name);
console.log("[clientApp.ts] Typeof imported 'getFirestore':", typeof getFirestore, ". Name:", (getFirestore as any).name);
console.log("[clientApp.ts] Diagnostic: typeof imported fetchSignInMethodsForEmail is", typeof diagnosticFetchSignInMethodsForEmail);


const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const effectiveConfigForLog = { ...firebaseConfig };
console.log(
  '[clientApp.ts] Firebase Config being used:',
  JSON.stringify(
    effectiveConfigForLog,
    (key, value) => (value === undefined ? 'ENV_VAR_UNDEFINED' : value),
    2
  )
);

if (!firebaseConfig.projectId) {
  console.error(
    '[clientApp.ts] CRITICAL FIREBASE CONFIG ERROR: NEXT_PUBLIC_FIREBASE_PROJECT_ID is missing or undefined.'
  );
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
    '[clientApp.ts] CRITICAL FIREBASE CONFIG ERROR: One or more NEXT_PUBLIC_FIREBASE_... environment variables are missing. Firebase services will NOT work.'
  );
   (Object.keys(firebaseConfig) as Array<keyof typeof firebaseConfig>).forEach((key) => {
    if (!firebaseConfig[key]) {
      const envVarName = `NEXT_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
      console.warn(`[clientApp.ts] Missing Firebase config key: ${key} (expected as ${envVarName})`);
    }
  });
  // Explicitly nullify if config is bad
  firebaseApp = null; 
  auth = null;
  db = null;
} else {
  console.log("[clientApp.ts] All Firebase config keys appear to be present in process.env.");
  
  console.log("[clientApp.ts] typeof firebaseConfig before initializeApp:", typeof firebaseConfig);
  console.log("[clientApp.ts] Keys of firebaseConfig:", Object.keys(firebaseConfig));

  if (!getApps().length) {
    try {
      console.log("[clientApp.ts] Initializing new Firebase app with config."); // Config logged above
      firebaseApp = initializeApp(firebaseConfig);
      console.log("[clientApp.ts] initializeApp call completed.");
      if (firebaseApp && typeof firebaseApp.name === 'string') {
        console.log("[clientApp.ts] Firebase initializeApp SUCCEEDED. App Name:", firebaseApp.name);
      } else {
        console.error("[clientApp.ts] Firebase initializeApp call completed but returned an INVALID app object. App Object:", firebaseApp);
        firebaseApp = null; 
      }
    } catch (initError: any) {
      console.error("[clientApp.ts] Firebase initializeApp FAILED with exception:", initError.message, initError.stack);
      firebaseApp = null;
    }
  } else {
    console.log("[clientApp.ts] Getting existing Firebase app.");
    firebaseApp = getApp();
    if (firebaseApp && typeof firebaseApp.name === 'string') {
        console.log("[clientApp.ts] Existing Firebase app obtained. App Name:", firebaseApp.name);
    } else {
        console.error("[clientApp.ts] getApp() returned an INVALID app object. App Object:", firebaseApp);
        firebaseApp = null;
    }
  }

  if (firebaseApp && typeof firebaseApp.name === 'string' && firebaseApp.options?.apiKey) {
    console.log("[clientApp.ts] firebaseApp seems valid (has name and apiKey). Proceeding to initialize Auth and Firestore.");

    // Initialize Auth
    try {
      console.log("[clientApp.ts] Attempting to get Auth instance from firebaseApp:", firebaseApp.name);
      const authInstance = getAuth(firebaseApp);
      console.log("[clientApp.ts] getAuth call completed. Auth object type:", typeof authInstance);
      
      if (authInstance && typeof authInstance.onAuthStateChanged === 'function' && typeof authInstance.fetchSignInMethodsForEmail === 'function') {
        auth = authInstance;
        console.log("[clientApp.ts] Auth instance obtained successfully and seems valid (has onAuthStateChanged & fetchSignInMethodsForEmail).");
      } else {
        console.error("[clientApp.ts] getAuth returned an INVALID Auth object. Details: Type -", typeof authInstance, ", Has onAuthStateChanged:", !!(authInstance as any)?.onAuthStateChanged, ", Has fetchSignInMethodsForEmail:", !!(authInstance as any)?.fetchSignInMethodsForEmail);
        auth = null;
      }
    } catch (authError: any) {
      console.error("[clientApp.ts] getAuth FAILED with an exception:", authError.message, authError.stack);
      auth = null;
    }

    // Initialize Firestore
    try {
      console.log("[clientApp.ts] Attempting to get Firestore instance from firebaseApp:", firebaseApp.name);
      const firestoreInstance = getFirestore(firebaseApp);
      console.log("[clientApp.ts] getFirestore call completed. Firestore object type:", typeof firestoreInstance);
      
      if (firestoreInstance && typeof firestoreInstance.collection === 'function') {
        db = firestoreInstance;
        console.log("[clientApp.ts] Firestore instance obtained successfully and seems valid (has collection method).");
      } else {
        console.error(
          `[clientApp.ts] getFirestore did NOT return a valid Firestore instance (e.g., missing 'collection' method), for projectId ('${effectiveConfigForLog.projectId || 'NOT FOUND IN CONFIG'}'). ` +
          `Firestore operations will fail. Forcing db to null. Firestore instance received type: ${typeof firestoreInstance}`
        );
        try {
          console.log('[clientApp.ts] Keys of invalid object from getFirestore (if any):', Object.keys(firestoreInstance || {}));
        } catch (e) {
           // console.log('[clientApp.ts] Could not get keys of invalid object from getFirestore.');
        }
        db = null;
      }
    } catch (dbError: any) {
      console.error('[clientApp.ts] getFirestore FAILED with an exception:', dbError.message, dbError.stack);
      db = null;
    }
  } else {
    console.error("[clientApp.ts] firebaseApp is NULL or invalid. Cannot initialize Auth and Firestore.");
    auth = null; // Ensure these are null if firebaseApp is bad
    db = null;
  }
}

// Final validation logs
console.log("[clientApp.ts] Final Auth instance check before export. Is auth object present?", !!auth);
if (auth) {
    console.log("[clientApp.ts] Final Auth object has onAuthStateChanged property:", Object.prototype.hasOwnProperty.call(auth, 'onAuthStateChanged'), "and it is a function:", typeof auth.onAuthStateChanged === 'function');
    console.log("[clientApp.ts] Final Auth object has fetchSignInMethodsForEmail property:", Object.prototype.hasOwnProperty.call(auth, 'fetchSignInMethodsForEmail'), "and it is a function:", typeof auth.fetchSignInMethodsForEmail === 'function');
} else {
    console.warn("[clientApp.ts] FINAL WARNING: Firebase Auth object is NULL. Auth operations WILL fail.");
}

console.log("[clientApp.ts] Final Firestore instance check before export. Is db object present?", !!db);
if (db) {
    console.log("[clientApp.ts] Final db object has collection property:", Object.prototype.hasOwnProperty.call(db, 'collection'), "and it is a function:", typeof db.collection === 'function');
} else {
    console.error("[clientApp.ts] FINAL CRITICAL CHECK: Firebase Firestore object is NULL. Firestore operations WILL fail.");
}

export { firebaseApp, auth, db };
