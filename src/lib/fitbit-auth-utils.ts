
'use server';

import { db } from '@/lib/firebase/serverApp';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const FITBIT_TOKEN_URL = 'https://api.fitbit.com/oauth2/token';

interface FitbitTokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Timestamp in milliseconds
}

// Store tokens in Firestore, scoped to the user
async function getFitbitTokens(userId: string): Promise<FitbitTokenData | null> {
  const tokenDocRef = doc(db, 'users', userId, 'private_tokens', 'fitbit');
  const docSnap = await getDoc(tokenDocRef);
  if (docSnap.exists()) {
    return docSnap.data() as FitbitTokenData;
  }
  return null;
}

export async function setFitbitTokens(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number // seconds
): Promise<void> {
  const tokenDocRef = doc(db, 'users', userId, 'private_tokens', 'fitbit');
  const now = Date.now();
  const expiresAt = now + expiresIn * 1000;

  const tokenData: FitbitTokenData = { accessToken, refreshToken, expiresAt };
  await setDoc(tokenDocRef, tokenData, { merge: true });
  console.log('[FitbitAuthUtils] Fitbit tokens stored in Firestore.');
}

export async function refreshFitbitTokens(userId: string): Promise<string | null> {
  const tokenData = await getFitbitTokens(userId);
  if (!tokenData?.refreshToken) {
    console.error('[FitbitAuthUtils] No refresh token available to refresh.');
    return null;
  }

  const clientId = process.env.NEXT_PUBLIC_FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Fitbit client credentials not configured.");
  }
  
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  try {
    const response = await fetch(FITBIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenData.refreshToken,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[FitbitAuthUtils] Fitbit token refresh failed:', data);
      return null;
    }

    await setFitbitTokens(userId, data.access_token, data.refresh_token, data.expires_in);
    return data.access_token;
  } catch (error) {
    console.error('[FitbitAuthUtils] Exception during token refresh:', error);
    return null;
  }
}

export async function getValidFitbitAccessToken(userId: string): Promise<string | null> {
  const tokenData = await getFitbitTokens(userId);
  if (!tokenData) return null;

  const bufferTime = 5 * 60 * 1000; // 5 minutes
  if (Date.now() >= tokenData.expiresAt - bufferTime) {
    console.log('[FitbitAuthUtils] Token expired or nearing expiry, refreshing...');
    return await refreshFitbitTokens(userId);
  }
  
  return tokenData.accessToken;
}
