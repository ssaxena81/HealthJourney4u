
'use server';

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { cookies } from 'next/headers';

// --- Admin SDK Initialization ---
// Using modular imports to be explicit and avoid potential conflicts.
import { initializeApp as initializeAdminApp, getApps as getAdminApps, credential, type App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
let adminApp: AdminApp;

// This check prevents re-initialization in hot-reload environments
if (!getAdminApps().length) {
  if (!serviceAccountKey) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set. Admin SDK initialization failed.');
  }
  try {
    adminApp = initializeAdminApp({
      credential: credential.cert(JSON.parse(serviceAccountKey)),
    });
    console.log("[serverApp.ts] Firebase Admin SDK initialized successfully.");
  } catch (error: any) {
    console.error('Error initializing Firebase Admin SDK in serverApp.ts:', error);
    // Provide a more specific error to help with debugging service account key issues.
    throw new Error(`Could not initialize Firebase Admin SDK. Please check your FIREBASE_SERVICE_ACCOUNT_KEY. Error: ${error.message}`);
  }
} else {
    adminApp = getAdminApps()[0];
}

const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);


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
const appName = 'firebase-server-client-sdk'; // Use a unique name to avoid conflicts

if (!getApps().some(a => a.name === appName)) {
  app = initializeApp(firebaseConfigServer, appName);
} else {
  app = getApp(appName);
}

const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

/**
 * Verifies the Firebase session cookie from the request and returns the decoded user token.
 * This function now resides here, as the single source for server auth utilities.
 * @param cookieStore The cookie store from the incoming request.
 * @returns A promise that resolves to the decoded user token or null if invalid.
 */
export async function getFirebaseUserFromCookie(cookieStore: ReturnType<typeof cookies>) {
  const sessionCookie = cookieStore.get('__session')?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    return decodedToken;
  } catch (error) {
    // This is expected if the cookie is invalid or expired.
    // console.error('Error verifying session cookie:', error);
    return null;
  }
}

// Export everything needed by other server-side files
export { auth, db, adminAuth, adminDb };
