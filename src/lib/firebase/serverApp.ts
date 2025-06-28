
// [2024-08-05] COMMENT: The 'use server' directive below was causing a build error because this file exports objects, not async functions. It has been commented out to resolve the issue. The 'server-only' package is the correct way to mark this module as exclusively for server-side use.
// 'use server';

import 'server-only';
import admin from 'firebase-admin';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { cookies } from 'next/headers';
import type { DecodedIdToken } from 'firebase-admin/auth';
import serviceAccount from '../../../firebaseServiceAccountKey.json';

// --- Admin SDK Initialization ---
let adminAuth: admin.auth.Auth;
let adminDb: admin.firestore.Firestore;

if (!admin.apps.length) {
  if (!serviceAccount || !serviceAccount.project_id) {
    console.error(`
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!!! FIREBASE SERVICE ACCOUNT KEY (firebaseServiceAccountKey.json) IS INVALID OR MISSING !!!
!!! Admin features (like server-side authentication) will be disabled.      !!!
!!! Please ensure the file exists and is a valid service account key JSON.    !!!
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    `);
  } else {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      });
      console.log("[serverApp.ts] Firebase Admin SDK initialized successfully from JSON file.");
      adminAuth = admin.auth();
      adminDb = admin.firestore();
    } catch (error: any) {
      console.error('Error initializing Firebase Admin SDK from firebaseServiceAccountKey.json:', error);
      throw new Error(`Could not initialize Firebase Admin SDK. Please check your firebaseServiceAccountKey.json file. Error: ${error.message}`);
    }
  }
} else {
  adminAuth = admin.auth();
  adminDb = admin.firestore();
}


// --- Client Auth SDK for server-side operations (e.g., in Server Actions) ---
// This is needed for functions like createUserWithEmailAndPassword in server actions.
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

/**
 * Verifies the Firebase session cookie from the request and returns the decoded user token.
 * This function now resides here, as the single source for server auth utilities.
 * @param cookieStore The cookie store from the incoming request.
 * @returns A promise that resolves to the decoded user token or null if invalid.
 */
export async function getFirebaseUserFromCookie(cookieStore: ReturnType<typeof cookies>): Promise<DecodedIdToken | null> {
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

// Export the necessary instances. Note that a client 'db' is no longer exported from here.
// Server-side code must use adminDb for all database operations.
export { auth, adminAuth, adminDb };
