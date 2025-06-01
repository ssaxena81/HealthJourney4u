
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth'; // Import Auth type
import { getFirestore, type Firestore } from 'firebase/firestore'; // Import Firestore type

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
  firebaseConfig.projectId && // Crucial check
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
  if (!getApps().length) {
    try {
      console.log("[clientApp.ts] Initializing new Firebase app with provided configuration.");
      firebaseApp = initializeApp(firebaseConfig);
      console.log("[clientApp.ts] Firebase initializeApp SUCCEEDED. App Name:", firebaseApp.name);
    } catch (initError: any) {
      console.error("[clientApp.ts] Firebase initializeApp FAILED:", initError.message, initError.stack);
      firebaseApp = null; // Ensure it's null on failure
    }
  } else {
    console.log("[clientApp.ts] Getting existing Firebase app.");
    firebaseApp = getApp();
    console.log("[clientApp.ts] Existing Firebase app obtained. App Name:", firebaseApp.name);
  }

  if (firebaseApp) {
    // Initialize Auth
    try {
      console.log("[clientApp.ts] Attempting to get Auth instance...");
      auth = getAuth(firebaseApp);
      console.log("[clientApp.ts] Auth instance obtained successfully from getAuth.");
    } catch (authError: any) {
      console.error("[clientApp.ts] getAuth FAILED with an exception:", authError.message, authError.stack);
      auth = null; // Ensure it's null on failure
    }

    // Initialize Firestore
    try {
      console.log('[clientApp.ts] Attempting to get Firestore instance...');
      const firestoreInstance = getFirestore(firebaseApp); // Attempt to get Firestore instance

      if (!firestoreInstance) {
        console.error(
          `[clientApp.ts] getFirestore() returned null or undefined for projectId ('${effectiveConfigForLog.projectId || 'NOT FOUND IN CONFIG'}'). This is highly unusual. Firestore operations will fail. Setting db to null.`
        );
        db = null;
      } else if (typeof firestoreInstance.collection !== 'function') {
        console.error(
          `[clientApp.ts] getFirestore did NOT return a valid Firestore instance. ` +
          `This usually means the Firestore API is not enabled for your project OR, more commonly, ` +
          `the NEXT_PUBLIC_FIREBASE_PROJECT_ID ('${effectiveConfigForLog.projectId || 'NOT FOUND IN CONFIG'}') ` +
          `is missing, incorrect, or not accessible OR the database has not been created in the Firebase console. Firestore operations will fail. Forcing db to null.`
        );
        // Log keys of the "invalid" db object to understand what kind of object it is
        try {
            console.log('[clientApp.ts] Keys of invalid object from getFirestore:', Object.keys(firestoreInstance));
        } catch (e) {
            console.log('[clientApp.ts] Could not get keys of invalid object from getFirestore:', firestoreInstance);
        }
        db = null; // Explicitly nullify if it's not a valid Firestore instance
      } else {
        db = firestoreInstance; // Assign to module-scoped db only if valid
        console.log("[clientApp.ts] Firestore instance obtained successfully from getFirestore AND seems valid.");
      }
    } catch (dbError: any) {
      console.error('[clientApp.ts] getFirestore FAILED with an exception:', dbError.message, dbError.stack);
      db = null; // Ensure it's null on failure
    }
  } else {
    console.error("[clientApp.ts] firebaseApp is not valid (likely due to missing config or initializeApp failure). Cannot initialize Auth and Firestore. Setting them to null.");
    auth = null;
    db = null;
  }
}

// Final validation logs
console.log("[clientApp.ts] Final Auth instance check:", auth && typeof auth.onAuthStateChanged === 'function' ? 'Seems Valid' : 'INVALID or NULL');
console.log("[clientApp.ts] Final Firestore instance check:", db && typeof db.collection === 'function' ? 'Seems Valid' : 'INVALID or NULL');

if (!(auth && typeof auth.fetchSignInMethodsForEmail === 'function')) {
    console.error("[clientApp.ts] FINAL CRITICAL CHECK: Firebase Auth object is NOT correctly initialized or is NULL. Operations like `fetchSignInMethodsForEmail` will fail.");
}
if (!(db && typeof db.collection === 'function')) {
    console.error("[clientApp.ts] FINAL CRITICAL CHECK: Firebase Firestore object is NOT correctly initialized or is NULL. Firestore operations will fail.");
}

export { firebaseApp, auth, db };
