
'use server';

import * as admin from 'firebase-admin';
import type { App } from 'firebase-admin/app';
import { auth as adminAuth } from 'firebase-admin';
import { cookies } from 'next/headers';

// --- Start of consolidated Firebase Admin logic ---
// This logic is consolidated here to resolve a module naming conflict
// with the 'firebase-admin' package. This should be the only file importing 'firebase-admin'.
let app: App;

async function initFirebaseAdminApp() {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set.');
    }
    
    // If the app is already initialized, return it.
    if (admin.apps.length > 0) {
        return admin.app();
    }

    try {
        const serviceAccount = JSON.parse(serviceAccountKey);
        // Initialize the app.
        return admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (error) {
        console.error('Error parsing Firebase service account key:', error);
        throw new Error('Could not initialize Firebase Admin SDK. Check service account key.');
    }
}

async function getFirebaseAdminApp() {
    if (!app) {
        app = await initFirebaseAdminApp();
    }
    return app;
}
// --- End of consolidated Firebase Admin logic ---

/**
 * Verifies the Firebase session cookie from the request and returns the decoded user token.
 * Requires Firebase Admin SDK to be initialized.
 * @param cookieStore The cookie store from the incoming request.
 * @returns A promise that resolves to the decoded user token or null if invalid.
 */
export async function getFirebaseUserFromCookie(cookieStore: ReturnType<typeof cookies>) {
  const sessionCookie = cookieStore.get('__session')?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const adminApp = await getFirebaseAdminApp();
    const decodedToken = await adminAuth(adminApp).verifySessionCookie(sessionCookie, true);
    return decodedToken;
  } catch (error) {
    // This is expected if the cookie is invalid or expired.
    // console.error('Error verifying session cookie:', error); 
    return null;
  }
}
