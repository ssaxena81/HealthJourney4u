
'use server';

import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase/serverApp'; // Import the initialized adminAuth instance

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
    // Use the pre-initialized adminAuth instance directly
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    return decodedToken;
  } catch (error) {
    // This is expected if the cookie is invalid or expired.
    // console.error('Error verifying session cookie:', error); 
    return null;
  }
}
