
'use server';

import { auth } from 'firebase-admin';
import { cookies } from 'next/headers';
import { getFirebaseAdminApp } from './firebase-admin';

// This utility requires Firebase Admin SDK to be set up.
// It's used to verify session cookies on the server.
export async function getFirebaseUserFromCookie(cookieStore: ReturnType<typeof cookies>) {
  const sessionCookie = cookieStore.get('__session')?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const app = getFirebaseAdminApp();
    const decodedToken = await auth(app).verifySessionCookie(sessionCookie, true);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying session cookie:', error);
    return null;
  }
}
