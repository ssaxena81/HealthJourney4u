
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

if (!getApps().length) {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.warn(
      'Firebase config is missing. Please set NEXT_PUBLIC_FIREBASE_ environment variables.'
    );
    // Provide a default stub if not configured, to prevent app crash during build or initial load
    firebaseApp = {} as FirebaseApp; // This is a stub
    db = {} as ReturnType<typeof getFirestore>; // Stub db
  } else {
    firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp); // Initialize db
  }
} else {
  firebaseApp = getApp();
  db = getFirestore(firebaseApp); // Get existing db instance
}

// Initialize Auth only if Firebase app was properly initialized
const auth = firebaseApp.name ? getAuth(firebaseApp) : ({} as ReturnType<typeof getAuth>);

export { firebaseApp, auth, db };

