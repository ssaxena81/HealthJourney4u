
'use server';

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

const FITBIT_ACCESS_TOKEN_COOKIE = 'fitbit_access_token';
const FITBIT_REFRESH_TOKEN_COOKIE = 'fitbit_refresh_token';
const FITBIT_TOKEN_EXPIRES_AT_COOKIE = 'fitbit_token_expires_at'; // Store expiry time

const FITBIT_TOKEN_URL = 'https://api.fitbit.com/oauth2/token';

interface FitbitTokenResponse {
  access_token: string;
  expires_in: number; // seconds
  refresh_token: string;
  scope: string;
  token_type: string;
  user_id: string; // Fitbit user ID
}

interface StoredFitbitTokens {
  accessToken: string | undefined;
  refreshToken: string | undefined;
  expiresAt: number | undefined; // Timestamp in milliseconds
}

export async function getFitbitTokens(): Promise<StoredFitbitTokens> {
  const cookieStore = cookies();
  const accessToken = cookieStore.get(FITBIT_ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(FITBIT_REFRESH_TOKEN_COOKIE)?.value;
  const expiresAtString = cookieStore.get(FITBIT_TOKEN_EXPIRES_AT_COOKIE)?.value;
  const expiresAt = expiresAtString ? parseInt(expiresAtString, 10) : undefined;

  return { accessToken, refreshToken, expiresAt };
}

export async function setFitbitTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number // seconds
): Promise<void> {
  const cookieStore = cookies();
  const now = Date.now();
  const expiresAt = now + expiresIn * 1000; // Convert expiresIn to milliseconds and add to now

  cookieStore.set(FITBIT_ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: expiresIn, // Cookie maxAge in seconds
    sameSite: 'lax',
  });

  cookieStore.set(FITBIT_REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 365 * 24 * 60 * 60, // Refresh token typically has a longer life, e.g., 1 year
    sameSite: 'lax',
  });

  cookieStore.set(FITBIT_TOKEN_EXPIRES_AT_COOKIE, expiresAt.toString(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: expiresIn, // Store expiry for easy checking
    sameSite: 'lax',
  });
  console.log('[FitbitAuthUtils] Fitbit tokens stored in cookies.');
}

export async function clearFitbitTokens(): Promise<void> {
  const cookieStore = cookies();
  cookieStore.delete(FITBIT_ACCESS_TOKEN_COOKIE);
  cookieStore.delete(FITBIT_REFRESH_TOKEN_COOKIE);
  cookieStore.delete(FITBIT_TOKEN_EXPIRES_AT_COOKIE);
  console.log('[FitbitAuthUtils] Fitbit tokens cleared from cookies.');
}

export async function refreshFitbitTokens(
  currentRefreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
  console.log('[FitbitAuthUtils] Attempting to refresh Fitbit tokens...');
  const clientId = process.env.NEXT_PUBLIC_FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[FitbitAuthUtils] Fitbit client ID or secret is not configured for token refresh.');
    throw new Error("Fitbit client credentials not configured on the server.");
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
        refresh_token: currentRefreshToken,
      }),
    });

    const data: FitbitTokenResponse | { errors: any[] } = await response.json();

    if (!response.ok) {
      const errorDetails = data as { errors: any[] };
      console.error('[FitbitAuthUtils] Fitbit token refresh failed:', response.status, errorDetails);
      // If refresh token is invalid, clear stored tokens to force re-auth
      if (response.status === 400 || response.status === 401) {
         // It's tricky to call clearFitbitTokens here as it might operate on a different cookie context
         // The caller should handle clearing tokens if refresh fails this way.
         console.warn('[FitbitAuthUtils] Refresh token might be invalid. User may need to re-authenticate with Fitbit.');
      }
      return null;
    }

    const tokenData = data as FitbitTokenResponse;
    console.log('[FitbitAuthUtils] Fitbit tokens refreshed successfully.');
    
    // Update cookies with new tokens
    await setFitbitTokens(tokenData.access_token, tokenData.refresh_token, tokenData.expires_in);

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
    };
  } catch (error) {
    console.error('[FitbitAuthUtils] Exception during Fitbit token refresh:', error);
    return null;
  }
}

// Helper to get a valid access token, attempting refresh if needed
export async function getValidFitbitAccessToken(): Promise<string | null> {
  let { accessToken, refreshToken, expiresAt } = await getFitbitTokens();

  if (!accessToken || !refreshToken) {
    console.log('[FitbitAuthUtils] No Fitbit tokens found in cookies.');
    return null;
  }

  // Check if token is expired or close to expiring (e.g., within next 5 minutes)
  const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
  if (!expiresAt || Date.now() >= expiresAt - bufferTime) {
    console.log('[FitbitAuthUtils] Fitbit access token expired or nearing expiry. Attempting refresh.');
    const newTokens = await refreshFitbitTokens(refreshToken);
    if (newTokens) {
      accessToken = newTokens.accessToken;
    } else {
      console.error('[FitbitAuthUtils] Failed to refresh Fitbit access token. User needs to re-authenticate.');
      // It's important to clear tokens if refresh fails definitively due to invalid refresh token
      // await clearFitbitTokens(); // Caller should handle this if needed
      return null; // Indicate failure to get a valid token
    }
  }

  return accessToken;
}
