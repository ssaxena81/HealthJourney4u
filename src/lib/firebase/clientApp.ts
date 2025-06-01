
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

let firebaseApp: FirebaseApp;
let auth: Auth; 
let db: Firestore; 

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
  // Provide stub if not configured, to prevent app crash during build or initial load
  // but functionality relying on Firebase will fail.
  firebaseApp = {} as FirebaseApp; // Stub app
  auth = {} as Auth;             // Stub auth
  db = {} as Firestore;           // Stub db
} else {
  if (!getApps().length) {
    try {
      console.log("[clientApp.ts] Initializing new Firebase app with provided configuration.");
      firebaseApp = initializeApp(firebaseConfig);
      console.log("[clientApp.ts] Firebase initializeApp SUCCEEDED.");
    } catch (initError: any) {
      console.error("[clientApp.ts] Firebase initializeApp FAILED:", initError.message, initError.stack);
      firebaseApp = {} as FirebaseApp; // stub on error
    }
  } else {
    console.log("[clientApp.ts] Getting existing Firebase app.");
    firebaseApp = getApp();
  }

  // Initialize Auth and Firestore, checking if firebaseApp is valid
  if (firebaseApp && firebaseApp.name) { // Check if firebaseApp is a real app (not a {} stub)
    try {
      console.log("[clientApp.ts] Attempting to get Auth instance...");
      auth = getAuth(firebaseApp);
      console.log("[clientApp.ts] Auth instance obtained:", auth && typeof auth.onAuthStateChanged === 'function' ? 'Seems Valid' : 'INVALID or STUBBED');
    } catch (authError: any) {
      console.error("[clientApp.ts] getAuth FAILED:", authError.message, authError.stack);
      auth = {} as Auth; // stub on error
    }

    try {
      console.log("[clientApp.ts] Attempting to get Firestore instance...");
      db = getFirestore(firebaseApp);
      console.log("[clientApp.ts] Firestore instance obtained:", db && typeof db.collection === 'function' ? 'Seems Valid' : 'INVALID or STUBBED');
    } catch (dbError: any) {
      console.error("[clientApp.ts] getFirestore FAILED:", dbError.message, dbError.stack);
      db = {} as Firestore; // stub on error
    }
  } else {
    console.error("[clientApp.ts] firebaseApp is not valid (likely due to missing config or init error), cannot initialize Auth and Firestore. Using stubs.");
    auth = {} as Auth;
    db = {} as Firestore;
  }
}

// Final check, particularly for the `auth` object
if (!auth || typeof auth.fetchSignInMethodsForEmail !== 'function') {
    console.error("[clientApp.ts] FINAL CRITICAL CHECK: Firebase Auth object is NOT correctly initialized or is a STUB. `auth.fetchSignInMethodsForEmail` is undefined. This indicates a problem with Firebase initialization, likely due to missing config or SDK errors during init. Server-side Auth operations will fail.");
} else {
    console.log("[clientApp.ts] FINAL CHECK: Firebase Auth object appears to be correctly initialized and `fetchSignInMethodsForEmail` is available.");
}

export { firebaseApp, auth, db };
