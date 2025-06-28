
// [2024-08-05] COMMENT: The 'use server' directive below was causing a build error because this file exports objects, not async functions. It has been commented out to resolve the issue. The 'server-only' package is the correct way to mark this module as exclusively for server-side use.
// 'use server';

import 'server-only';
import admin from 'firebase-admin';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { cookies } from 'next/headers';
import type { DecodedIdToken } from 'firebase-admin/auth';
// [2025-06-28] COMMENT: This line imports the service account key directly from the JSON file.
import serviceAccount from '../../../firebaseServiceAccountKey.json';

// --- Admin SDK Initialization ---
// [2025-06-28] COMMENT: This line, which reads from the environment variable, is being commented out in favor of a direct file import.
// const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

// [2024-08-01] COMMENT: Declare adminAuth and adminDb with `let` to allow for conditional initialization.
let adminAuth: admin.auth.Auth;
let adminDb: admin.firestore.Firestore;

// [2024-08-01] COMMENT: Check if the admin app needs initialization.
if (!admin.apps.length) {
  // [2025-06-28] COMMENT: Check if the imported service account object from the JSON file is valid.
  if (!serviceAccount || !serviceAccount.project_id) {
    // [2025-06-28] COMMENT: The warning message is updated to refer to the JSON file instead of the environment variable.
    console.error(`
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!!! FIREBASE SERVICE ACCOUNT KEY (firebaseServiceAccountKey.json) IS INVALID OR MISSING !!!
!!! Admin features (like server-side authentication) will be disabled.      !!!
!!! Please ensure the file exists and is a valid service account key JSON.    !!!
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    `);
  } else {
    try {
      // [2025-06-28] COMMENT: Initialize the app using the directly imported service account object.
      admin.initializeApp({
        // [2025-06-28] COMMENT: The serviceAccount object is cast to the type expected by the credential method.
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      });
      // [2025-06-28] COMMENT: This is the old initialization method using JSON.parse, which is now commented out.
      /*
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccountKey)),
      });
      */
      // [2025-06-28] COMMENT: A success log to confirm initialization from the JSON file.
      console.log("[serverApp.ts] Firebase Admin SDK initialized successfully from JSON file.");
      // [2024-08-01] COMMENT: Assign the initialized services.
      adminAuth = admin.auth();
      adminDb = admin.firestore();
    } catch (error: any) {
      // [2025-06-28] COMMENT: The error message is updated to point to the JSON file as the source of the problem.
      console.error('Error initializing Firebase Admin SDK from firebaseServiceAccountKey.json:', error);
      throw new Error(`Could not initialize Firebase Admin SDK. Please check your firebaseServiceAccountKey.json file. Error: ${error.message}`);
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
