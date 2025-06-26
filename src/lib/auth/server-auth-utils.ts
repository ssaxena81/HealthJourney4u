'use server';

import * as admin from 'firebase-admin';
import type { App } from 'firebase-admin/app';
import { auth as adminAuth } from 'firebase-admin';
import { cookies } from 'next/headers';

// --- Start of consolidated Firebase Admin logic ---
let app: App;

async function initFirebaseAdminApp() {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set.');
    }
    
    if (admin.apps.length > 0) {
        return admin.app();
    }

    try {
        const serviceAccount = JSON.parse(serviceAccountKey);
        return admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (error) {
        console.error('Error parsing Firebase service account key:', error);
        throw new Error('Could not initialize Firebase Admin SDK.');
    }
}

async function getFirebaseAdminApp() {
    if (!app) {
        app = await initFirebaseAdminApp();
    }
    return app;
}
// --- End of consolidated Firebase Admin logic ---


// This utility requires Firebase Admin SDK to be set up.
// It's used to verify session cookies on the server.
export async function getFirebaseUserFromCookie(cookieStore: ReturnType<typeof cookies>) {
  const sessionCookie = cookieStore.get('__session')?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const app = await getFirebaseAdminApp();
    const decodedToken = await adminAuth(app).verifySessionCookie(sessionCookie, true);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying session cookie:', error);
    return null;
  }
}
