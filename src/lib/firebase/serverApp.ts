
'use server';

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { cookies } from 'next/headers';

// Import pre-initialized admin instances from the isolated admin.ts file
import { adminAuth, adminDb } from './admin';

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
    // Use the pre-initialized adminAuth instance directly from ./admin
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    return decodedToken;
  } catch (error) {
    // This is expected if the cookie is invalid or expired.
    // console.error('Error verifying session cookie:', error); 
    return null;
  }
}

export { auth, db, adminAuth, adminDb };
