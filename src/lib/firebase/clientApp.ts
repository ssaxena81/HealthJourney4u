
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let firebaseApp: FirebaseApp;
let db: ReturnType<typeof getFirestore>;

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
    console.warn(
      'Firebase config is incomplete. Please ensure all NEXT_PUBLIC_FIREBASE_ environment variables are set in .env.local and the server is restarted.'
    );
    // Log which keys might be missing for easier debugging
    (Object.keys(firebaseConfig) as Array<keyof typeof firebaseConfig>).forEach((key) => {
      if (!firebaseConfig[key]) {
        // Construct the expected environment variable name
        const envVarName = `NEXT_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
        console.warn(`Missing Firebase config key: ${key} (expected as ${envVarName} in .env.local)`);
      }
    });
    // Provide a default stub if not configured, to prevent app crash during build or initial load
    firebaseApp = {} as FirebaseApp; 
    db = {} as ReturnType<typeof getFirestore>; 
  } else {
    firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp); 
  }
} else {
  firebaseApp = getApp();
  db = getFirestore(firebaseApp); 
}

// Initialize Auth only if Firebase app was properly initialized (i.e., firebaseApp.name is set)
const auth = firebaseApp && firebaseApp.name ? getAuth(firebaseApp) : ({} as ReturnType<typeof getAuth>);

export { firebaseApp, auth, db };
