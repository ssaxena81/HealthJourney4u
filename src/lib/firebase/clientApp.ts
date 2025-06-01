
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

let firebaseApp: FirebaseApp;
let auth: Auth; // Declared here
let db: Firestore; // Declared here

// Check if all essential Firebase config keys are present
const allConfigKeysPresent =
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.storageBucket &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId;

if (!getApps().length) {
  if (!allConfigKeysPresent) {
    console.error(
      'CRITICAL FIREBASE CONFIG ERROR (clientApp.ts - Initializing App): Firebase config from environment variables is incomplete. This usually means one or more NEXT_PUBLIC_FIREBASE_... variables are missing or undefined in your .env.local file or server environment. Firebase services (Auth, Firestore) will NOT work correctly. Ensure all required Firebase environment variables are set and the server is restarted.'
    );
    (Object.keys(firebaseConfig) as Array<keyof typeof firebaseConfig>).forEach((key) => {
      if (!firebaseConfig[key]) {
        const envVarName = `NEXT_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
        console.warn(`(clientApp.ts - Initializing App) Missing Firebase config key: ${key} (expected as ${envVarName})`);
      }
    });
    // Provide a default stub if not configured, to prevent app crash during build or initial load
    // but functionality relying on Firebase will fail.
    firebaseApp = {} as FirebaseApp; // Stub app
    auth = {} as Auth;             // Stub auth - this will cause issues downstream
    db = {} as Firestore;           // Stub db - this will cause issues downstream
  } else {
    console.log("(clientApp.ts) Initializing new Firebase app with provided configuration.");
    firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp); // Initialize auth here
    db = getFirestore(firebaseApp); // Initialize db here
  }
} else {
  console.log("(clientApp.ts) Getting existing Firebase app.");
  firebaseApp = getApp();
  auth = getAuth(firebaseApp); // Initialize auth here
  db = getFirestore(firebaseApp); // Initialize db here
}

if (!auth || typeof auth.fetchSignInMethodsForEmail !== 'function') {
    console.error("(clientApp.ts) CRITICAL: Firebase Auth object is not correctly initialized or is a stub. `auth.fetchSignInMethodsForEmail` is undefined. This likely means Firebase configuration was incomplete during initialization (see previous logs). Operations requiring Firebase Auth will fail.");
}


export { firebaseApp, auth, db };

