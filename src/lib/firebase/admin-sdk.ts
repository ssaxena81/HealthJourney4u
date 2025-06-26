
import { initializeApp as initializeAdminApp, getApps as getAdminApps, credential, type App as AdminApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// This file isolates all Firebase Admin SDK imports and initialization
// to prevent module resolution conflicts with local files.

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

let adminApp: AdminApp;

if (!getAdminApps().length) {
  if (!serviceAccountKey) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set. Admin SDK initialization failed.');
  }
  try {
    adminApp = initializeAdminApp({
      credential: credential.cert(JSON.parse(serviceAccountKey)),
    });
    console.log("[admin-sdk.ts] Firebase Admin SDK initialized.");
  } catch (error: any) {
    console.error('Error initializing Firebase Admin SDK:', error);
    throw new Error(`Could not initialize Firebase Admin SDK. Check service account key. Error: ${error.message}`);
  }
} else {
    adminApp = getAdminApps()[0];
}

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
