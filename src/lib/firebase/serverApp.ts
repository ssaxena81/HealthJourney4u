
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import * as admin from 'firebase-admin';

// --- Client SDK for server-side operations (e.g., in Server Actions) ---
const firebaseConfigServer = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
const appName = 'firebase-server-app';

try {
  app = getApp(appName);
} catch (error) {
  app = initializeApp(firebaseConfigServer, appName);
}

const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);


// --- Admin SDK for privileged operations (e.g., verifying session cookies) ---
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!admin.apps.length) {
  if (!serviceAccountKey) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set. Admin SDK initialization failed.');
  }
  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountKey)),
    });
    console.log("[serverApp.ts] Firebase Admin SDK initialized.");
  } catch (error: any) {
    console.error('Error initializing Firebase Admin SDK:', error);
    throw new Error(`Could not initialize Firebase Admin SDK. Check service account key. Error: ${error.message}`);
  }
}

const adminAuth = admin.auth();
const adminDb = admin.firestore();

export { auth, db, adminAuth, adminDb };
