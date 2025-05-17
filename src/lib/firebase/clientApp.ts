
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let firebaseApp: FirebaseApp;

if (!getApps().length) {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.warn(
      'Firebase config is missing. Please set NEXT_PUBLIC_FIREBASE_ environment variables.'
    );
    // Provide a default stub if not configured, to prevent app crash during build or initial load
    // You might want to handle this differently, e.g., by throwing an error or disabling Firebase features.
    firebaseApp = {} as FirebaseApp; // This is a stub
  } else {
    firebaseApp = initializeApp(firebaseConfig);
  }
} else {
  firebaseApp = getApp();
}

// Initialize Auth only if Firebase app was properly initialized
const auth = firebaseApp.name ? getAuth(firebaseApp) : ({} as ReturnType<typeof getAuth>);

export { firebaseApp, auth };
