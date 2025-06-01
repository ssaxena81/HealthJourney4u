
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

// Log the config that is being read AT THE TIME OF MODULE EXECUTION
const effectiveConfigForLog = { ...firebaseConfig };
console.log(
  '[clientApp.ts] Firebase Config being used at module load:',
  JSON.stringify(
    effectiveConfigForLog,
    (key, value) => (value === undefined ? 'ENV_VAR_UNDEFINED' : value),
    2
  )
);

// Specific check for projectId early on
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
    '[clientApp.ts] CRITICAL FIREBASE CONFIG ERROR: One or more NEXT_PUBLIC_FIREBASE_... environment variables are missing or undefined. Firebase services (Auth, Firestore) will NOT work correctly.'
  );
  (Object.keys(firebaseConfig) as Array<keyof typeof firebaseConfig>).forEach((key) => {
    if (!firebaseConfig[key]) {
      const envVarName = `NEXT_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
      console.warn(`[clientApp.ts] Missing Firebase config key: ${key} (expected as ${envVarName})`);
    }
  });
  if (!firebaseConfig.projectId) {
    console.warn(`[clientApp.ts] Specifically, NEXT_PUBLIC_FIREBASE_PROJECT_ID is missing, which is vital for Firestore.`);
  }
} else {
  if (!getApps().length) {
    try {
      console.log("[clientApp.ts] Initializing new Firebase app with provided configuration.");
      firebaseApp = initializeApp(firebaseConfig);
      console.log("[clientApp.ts] Firebase initializeApp SUCCEEDED.");
    } catch (initError: any) {
      console.error("[clientApp.ts] Firebase initializeApp FAILED:", initError.message, initError.stack);
      firebaseApp = null;
    }
  } else {
    console.log("[clientApp.ts] Getting existing Firebase app.");
    firebaseApp = getApp();
  }

  if (firebaseApp) {
    try {
      console.log("[clientApp.ts] Attempting to get Auth instance...");
      auth = getAuth(firebaseApp);
      console.log("[clientApp.ts] Auth instance obtained successfully from getAuth.");
    } catch (authError: any) {
      console.error("[clientApp.ts] getAuth FAILED with an exception:", authError.message, authError.stack);
      auth = null;
    }

    try {
      console.log('[clientApp.ts] Attempting to get Firestore instance...');
      db = getFirestore(firebaseApp);
      if (!(db && typeof db.collection === 'function')) {
        console.error(
          `[clientApp.ts] getFirestore did NOT return a valid Firestore instance. ` +
          `This usually means the Firestore API is not enabled for your project OR, more commonly, ` +
          `the NEXT_PUBLIC_FIREBASE_PROJECT_ID ('${effectiveConfigForLog.projectId || 'NOT FOUND IN CONFIG'}') ` +
          `is missing, incorrect, or not accessible. Firestore operations will fail. Forcing db to null.`
        );
        db = null; // Explicitly null
      } else {
        console.log('[clientApp.ts] Firestore instance obtained successfully from getFirestore.');
      }
    } catch (dbError: any) {
      console.error('[clientApp.ts] getFirestore FAILED with an exception:', dbError.message, dbError.stack);
      db = null;
    }
  } else {
    console.error("[clientApp.ts] firebaseApp is not valid (likely due to missing config or initializeApp failure). Cannot initialize Auth and Firestore. Using nulls.");
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
