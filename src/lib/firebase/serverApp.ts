
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfigServer = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;

// This logic ensures that the server-side Firebase app is initialized only once.
if (!getApps().some(app => app.name === 'firebase-server-app')) {
  app = initializeApp(firebaseConfigServer, 'firebase-server-app');
  console.log("[serverApp.ts] Firebase server app initialized.");
} else {
  app = getApp('firebase-server-app');
  console.log("[serverApp.ts] Existing Firebase server app retrieved.");
}

const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

export { auth, db };
