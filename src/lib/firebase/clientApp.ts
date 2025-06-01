
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

// Log the imported getFirestore function itself
console.log("[clientApp.ts] Typeof imported 'getFirestore':", typeof getFirestore);
if (typeof getFirestore === 'function') {
  console.log("[clientApp.ts] Imported 'getFirestore.name':", getFirestore.name); // Should be 'getFirestore'
} else {
  console.error("[clientApp.ts] CRITICAL: Imported 'getFirestore' is NOT a function at the module level. This is a major issue with imports or module resolution.");
}


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
  '[clientApp.ts] Firebase Config being used at module load:',
  JSON.stringify(
    effectiveConfigForLog,
    (key, value) => (value === undefined ? 'ENV_VAR_UNDEFINED' : value),
    2
  )
);

if (!firebaseConfig.projectId) {
  console.error(
    '[clientApp.ts] CRITICAL FIREBASE CONFIG ERROR: NEXT_PUBLIC_FIREBASE_PROJECT_ID is missing or undefined. Firestore (and potentially other services) will NOT work.'
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
    '[clientApp.ts] CRITICAL FIREBASE CONFIG ERROR: One or more NEXT_PUBLIC_FIREBASE_... environment variables are missing or undefined. Firebase services will NOT work correctly.'
  );
  (Object.keys(firebaseConfig) as Array<keyof typeof firebaseConfig>).forEach((key) => {
    if (!firebaseConfig[key]) {
      const envVarName = `NEXT_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
      console.warn(`[clientApp.ts] Missing Firebase config key: ${key} (expected as ${envVarName})`);
    }
  });
} else {
  console.log("[clientApp.ts] All Firebase config keys appear to be present in process.env.");
  if (!getApps().length) {
    try {
      console.log("[clientApp.ts] Initializing new Firebase app with provided configuration.");
      firebaseApp = initializeApp(firebaseConfig);
      console.log("[clientApp.ts] Firebase initializeApp SUCCEEDED. App Name:", firebaseApp.name);
    } catch (initError: any) {
      console.error("[clientApp.ts] Firebase initializeApp FAILED:", initError.message, initError.stack);
      firebaseApp = null;
    }
  } else {
    console.log("[clientApp.ts] Getting existing Firebase app.");
    firebaseApp = getApp();
    console.log("[clientApp.ts] Existing Firebase app obtained. App Name:", firebaseApp.name);
  }

  if (firebaseApp && typeof firebaseApp.name === 'string' && firebaseApp.options?.apiKey) {
    console.log("[clientApp.ts] firebaseApp seems valid (has name and apiKey). Proceeding to initialize Auth and Firestore.");

    // Initialize Auth
    try {
      console.log("[clientApp.ts] Attempting to get Auth instance from firebaseApp:", firebaseApp.name);
      const authInstance = getAuth(firebaseApp);
      console.log("[clientApp.ts] getAuth call completed. Auth object type:", typeof authInstance, ". Auth object itself:", authInstance);
      if (authInstance && typeof authInstance.onAuthStateChanged === 'function') {
        auth = authInstance;
        console.log("[clientApp.ts] Auth instance obtained successfully and seems valid (has onAuthStateChanged).");
      } else {
        console.error("[clientApp.ts] getAuth returned an INVALID or incomplete Auth object. Forcing auth to null. Auth object received:", authInstance);
        auth = null;
      }
    } catch (authError: any) {
      console.error("[clientApp.ts] getAuth FAILED with an exception:", authError.message, authError.stack);
      auth = null;
    }

    // Initialize Firestore
    try {
      console.log("[clientApp.ts] Attempting to get Firestore instance from firebaseApp:", firebaseApp.name);
      console.log("[clientApp.ts] Verifying 'getFirestore' function before call. Type:", typeof getFirestore, ". Name:", (getFirestore as any).name);
      if (typeof getFirestore !== 'function' || (getFirestore as any).name !== 'getFirestore') {
        console.error("[clientApp.ts] CRITICAL: imported 'getFirestore' is NOT the expected function! Name is:", (getFirestore as any).name, "Type is:", typeof getFirestore, ". This is likely the root cause of Firestore issues. Check for import conflicts or module resolution problems.");
        db = null;
      } else {
        const firestoreInstance = getFirestore(firebaseApp);
        console.log("[clientApp.ts] getFirestore call completed. Firestore object type:", typeof firestoreInstance);
        console.log("[clientApp.ts] Firestore object itself:", firestoreInstance);

        if (firestoreInstance && typeof firestoreInstance.collection === 'function') {
          db = firestoreInstance;
          console.log("[clientApp.ts] Firestore instance obtained successfully and seems valid (has collection method).");
        } else {
          console.error(
            `[clientApp.ts] getFirestore did NOT return a valid Firestore instance. ` +
            `This usually means the Firestore API is not enabled for your project OR, more commonly, ` +
            `the NEXT_PUBLIC_FIREBASE_PROJECT_ID ('${effectiveConfigForLog.projectId || 'NOT FOUND IN CONFIG'}') ` +
            `is missing, incorrect, or not accessible, or the Firestore database hasn't been created in the Firebase console. ` +
            `Firestore operations will fail. Forcing db to null.`
          );
          if (firestoreInstance) {
            try {
              console.log('[clientApp.ts] Keys of invalid object from getFirestore:', Object.keys(firestoreInstance));
            } catch (e) {
              console.log('[clientApp.ts] Could not get keys of invalid object from getFirestore:', firestoreInstance);
            }
          }
          db = null;
        }
      }
    } catch (dbError: any) {
      console.error('[clientApp.ts] getFirestore FAILED with an exception:', dbError.message, dbError.stack);
      db = null;
    }
  } else {
    console.error("[clientApp.ts] firebaseApp is NULL or invalid (e.g., initializeApp failed, no name, or no apiKey in options). Cannot initialize Auth and Firestore. Setting them to null. firebaseApp object:", firebaseApp);
    auth = null;
    db = null;
  }
}

// Final validation logs
console.log("[clientApp.ts] Final Auth instance check before export. Is auth object present?", !!auth);
if (auth) {
    console.log("[clientApp.ts] Final Auth object has onAuthStateChanged property:", Object.prototype.hasOwnProperty.call(auth, 'onAuthStateChanged'), "and it is a function:", typeof auth.onAuthStateChanged === 'function');
    console.log("[clientApp.ts] Final Auth object has fetchSignInMethodsForEmail property:", Object.prototype.hasOwnProperty.call(auth, 'fetchSignInMethodsForEmail'), "and it is a function:", typeof auth.fetchSignInMethodsForEmail === 'function');
}

console.log("[clientApp.ts] Final Firestore instance check before export. Is db object present?", !!db);
if (db) {
    console.log("[clientApp.ts] Final db object has collection property:", Object.prototype.hasOwnProperty.call(db, 'collection'), "and it is a function:", typeof db.collection === 'function');
}

if (!(auth && typeof auth.onAuthStateChanged === 'function' && typeof auth.fetchSignInMethodsForEmail === 'function')) {
    console.warn("[clientApp.ts] FINAL WARNING: Firebase Auth object is NOT correctly initialized or is NULL. Auth operations MAY fail or be unreliable.");
}
if (!(db && typeof db.collection === 'function')) {
    console.error("[clientApp.ts] FINAL CRITICAL CHECK: Firebase Firestore object is NOT correctly initialized or is NULL. Firestore operations WILL fail.");
}

export { firebaseApp, auth, db };
