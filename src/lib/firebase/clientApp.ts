
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
console.log("[clientApp.ts] Firebase Config being used at module load:", JSON.stringify(firebaseConfig, (key, value) => value === undefined ? 'ENV_VAR_UNDEFINED' : value, 2));

// Specific check for projectId early on
if (!firebaseConfig.projectId) {
  console.error(
    '[clientApp.ts] CRITICAL FIREBASE CONFIG ERROR: NEXT_PUBLIC_FIREBASE_PROJECT_ID is missing or undefined. Firestore (and potentially other services) will NOT work.'
  );
}

let firebaseApp: FirebaseApp;
let auth: Auth; 
let db: Firestore; 

const allConfigKeysPresent =
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId && // Ensuring projectId is part of this check
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
   if (!firebaseConfig.projectId) { // Re-emphasize projectId if it's the culprit
      console.warn(`[clientApp.ts] Specifically, NEXT_PUBLIC_FIREBASE_PROJECT_ID is missing, which is vital for Firestore.`);
  }
  firebaseApp = {} as FirebaseApp;
  auth = {} as Auth;
  db = {} as Firestore;
} else {
  if (!getApps().length) {
    try {
      console.log("[clientApp.ts] Initializing new Firebase app with provided configuration.");
      firebaseApp = initializeApp(firebaseConfig);
      console.log("[clientApp.ts] Firebase initializeApp SUCCEEDED.");
    } catch (initError: any) {
      console.error("[clientApp.ts] Firebase initializeApp FAILED:", initError.message, initError.stack);
      firebaseApp = {} as FirebaseApp; 
    }
  } else {
    console.log("[clientApp.ts] Getting existing Firebase app.");
    firebaseApp = getApp();
  }

  if (firebaseApp && firebaseApp.name) { 
    try {
      console.log("[clientApp.ts] Attempting to get Auth instance...");
      auth = getAuth(firebaseApp);
      console.log("[clientApp.ts] Auth instance obtained successfully from getAuth.");
    } catch (authError: any) {
      console.error("[clientApp.ts] getAuth FAILED with an exception:", authError.message, authError.stack);
      auth = {} as Auth; 
    }

    try {
      console.log("[clientApp.ts] Attempting to get Firestore instance...");
      db = getFirestore(firebaseApp);
      // Add a specific check right after getFirestore attempt
      if (!(db && typeof db.collection === 'function')) {
        console.error("[clientApp.ts] getFirestore did NOT return a valid instance (e.g., missing 'collection' method), even if it didn't throw. Forcing stub. This often indicates a projectId issue or Firestore API not enabled.");
        db = {} as Firestore; // Force stub if not valid
      } else {
        console.log("[clientApp.ts] Firestore instance obtained successfully from getFirestore.");
      }
    } catch (dbError: any) {
      console.error("[clientApp.ts] getFirestore FAILED with an exception:", dbError.message, dbError.stack);
      db = {} as Firestore; 
    }
  } else {
    console.error("[clientApp.ts] firebaseApp is not valid (likely due to missing config or initializeApp failure). Cannot initialize Auth and Firestore. Using stubs.");
    auth = {} as Auth;
    db = {} as Firestore;
  }
}

// Final validation logs
console.log("[clientApp.ts] Final Auth instance check:", auth && typeof auth.onAuthStateChanged === 'function' ? 'Seems Valid' : 'INVALID or STUBBED');
console.log("[clientApp.ts] Final Firestore instance check:", db && typeof db.collection === 'function' ? 'Seems Valid' : 'INVALID or STUBBED');

if (!(auth && typeof auth.fetchSignInMethodsForEmail === 'function')) {
    console.error("[clientApp.ts] FINAL CRITICAL CHECK: Firebase Auth object is NOT correctly initialized or is a STUB. Operations like `fetchSignInMethodsForEmail` will fail.");
}
if (!(db && typeof db.collection === 'function')) {
    console.error("[clientApp.ts] FINAL CRITICAL CHECK: Firebase Firestore object is NOT correctly initialized or is a STUB. Firestore operations will fail.");
}

export { firebaseApp, auth, db };
