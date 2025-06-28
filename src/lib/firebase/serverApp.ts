
import 'server-only';
import admin from 'firebase-admin';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { cookies } from 'next/headers';
import type { DecodedIdToken } from 'firebase-admin/auth';

// --- Admin SDK Initialization ---
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

// [2024-08-01] COMMENT: Declare adminAuth and adminDb with `let` to allow for conditional initialization.
let adminAuth: admin.auth.Auth;
let adminDb: admin.firestore.Firestore;

// [2024-08-01] COMMENT: Check if the admin app needs initialization.
if (!admin.apps.length) {
  // [2024-08-01] COMMENT: Check if the service account key is provided in the environment.
  if (!serviceAccountKey) {
    // [2024-08-01] COMMENT: Instead of throwing an error that crashes the server, log a clear warning.
    // [2024-08-01] COMMENT: The application can now start, but features requiring the Admin SDK will be disabled.
    console.error(`
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!!! FIREBASE_SERVICE_ACCOUNT_KEY IS NOT SET IN YOUR ENVIRONMENT               !!!
!!! Admin features (like server-side authentication) will be disabled.      !!!
!!! Please add your Firebase Service Account Key to your environment variables. !!!
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    `);
  } else {
    // [2024-08-01] COMMENT: If the key exists, proceed with initialization.
    try {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccountKey)),
      });
      console.log("[serverApp.ts] Firebase Admin SDK initialized successfully.");
      // [2024-08-01] COMMENT: Assign the initialized services.
      adminAuth = admin.auth();
      adminDb = admin.firestore();
    } catch (error: any) {
      console.error('Error initializing Firebase Admin SDK in serverApp.ts:', error);
      // [2024-08-01] COMMENT: The original error for malformed keys is kept, as it's a configuration error.
      throw new Error(`Could not initialize Firebase Admin SDK. Please check your FIREBASE_SERVICE_ACCOUNT_KEY. Error: ${error.message}`);
    }
  }
} else {
  // [2024-08-01] COMMENT: If the app is already initialized, just get the services.
  adminAuth = admin.auth();
  adminDb = admin.firestore();
}


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
export async function getFirebaseUserFromCookie(cookieStore: ReturnType<typeof cookies>): Promise<DecodedIdToken | null> {
  // [2024-08-01] COMMENT: Add a guard clause to prevent crashes if the Admin SDK is not initialized.
  // [2024-08-01] COMMENT: If adminAuth is not available, server-side authentication is skipped, allowing the app to run.
  if (!adminAuth || typeof adminAuth.verifySessionCookie !== 'function') {
    return null;
  }
  
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
