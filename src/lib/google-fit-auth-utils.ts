
'use server';

import { adminDb } from '@/lib/firebase/serverApp';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface GoogleTokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Timestamp in milliseconds
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number; // seconds
  refresh_token?: string; 
  scope: string;
  token_type: string;
}


// Store tokens in Firestore, scoped to the user
async function getGoogleFitTokens(userId: string): Promise<GoogleTokenData | null> {
  const tokenDocRef = adminDb.collection('users').doc(userId).collection('private_tokens').doc('google-fit');
  const docSnap = await tokenDocRef.get();
  if (docSnap.exists) {
    return docSnap.data() as GoogleTokenData;
  }
  return null;
}

export async function setGoogleFitTokens(
  userId: string,
  accessToken: string,
  refreshToken: string, // Refresh token might not always be provided on refresh
  expiresIn: number // seconds
): Promise<void> {
  const tokenDocRef = adminDb.collection('users').doc(userId).collection('private_tokens').doc('google-fit');
  const now = Date.now();
  const expiresAt = now + expiresIn * 1000;
  
  const tokenData: GoogleTokenData = { accessToken, refreshToken, expiresAt };
  await tokenDocRef.set(tokenData, { merge: true });
  console.log('[GoogleFitAuthUtils] Google Fit tokens stored in Firestore.');
}

export async function refreshGoogleFitTokens(userId: string): Promise<string | null> {
  const tokenData = await getGoogleFitTokens(userId);
  if (!tokenData?.refreshToken) {
    console.error('[GoogleFitAuthUtils] No refresh token available to refresh.');
    return null;
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID_WEB;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET_WEB;
  if (!clientId || !clientSecret) {
    throw new Error("Google client credentials not configured.");
  }

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: tokenData.refreshToken,
      }),
    });

    const data: GoogleTokenResponse | { error: string; error_description?: string } = await response.json();
    if (!response.ok) {
      console.error('[GoogleFitAuthUtils] Google Fit token refresh failed:', data);
      return null;
    }
    
    const refreshedTokenData = data as GoogleTokenResponse;

    // Google might not return a new refresh token; use the old one if not provided.
    await setGoogleFitTokens(userId, refreshedTokenData.access_token, refreshedTokenData.refresh_token || tokenData.refreshToken, refreshedTokenData.expires_in);
    
    return refreshedTokenData.access_token;

  } catch (error) {
    console.error('[GoogleFitAuthUtils] Exception during token refresh:', error);
    return null;
  }
}

export async function getValidGoogleFitAccessToken(userId: string): Promise<string | null> {
  const tokenData = await getGoogleFitTokens(userId);
  if (!tokenData) return null;

  const bufferTime = 5 * 60 * 1000; // 5 minutes
  if (Date.now() >= tokenData.expiresAt - bufferTime) {
    console.log('[GoogleFitAuthUtils] Token expired or nearing expiry, refreshing...');
    return await refreshGoogleFitTokens(userId);
  }
  
  return tokenData.accessToken;
}
