
'use server';

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

const STRAVA_ACCESS_TOKEN_COOKIE = 'strava_access_token';
const STRAVA_REFRESH_TOKEN_COOKIE = 'strava_refresh_token';
const STRAVA_TOKEN_EXPIRES_AT_COOKIE = 'strava_token_expires_at'; // Store expiry time (timestamp)

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

interface StravaTokenResponse {
  token_type: string; // "Bearer"
  expires_at: number; // Timestamp (seconds since epoch)
  expires_in: number; // Seconds from now
  refresh_token: string;
  access_token: string;
  athlete?: any; // Strava includes athlete details in token response
}

interface StoredStravaTokens {
  accessToken: string | undefined;
  refreshToken: string | undefined;
  expiresAt: number | undefined; // Timestamp in milliseconds
}

export async function getStravaTokens(): Promise<StoredStravaTokens> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(STRAVA_ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(STRAVA_REFRESH_TOKEN_COOKIE)?.value;
  const expiresAtString = cookieStore.get(STRAVA_TOKEN_EXPIRES_AT_COOKIE)?.value;
  const expiresAt = expiresAtString ? parseInt(expiresAtString, 10) : undefined;

  return { accessToken, refreshToken, expiresAt };
}

export async function setStravaTokens(
  accessToken: string,
  refreshToken: string,
  expiresAtTimestampSeconds: number // Strava provides expires_at directly as a Unix timestamp
): Promise<void> {
  const cookieStore = await cookies();
  const expiresAtMilliseconds = expiresAtTimestampSeconds * 1000;
  const now = Date.now();
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAtMilliseconds - now) / 1000));

  cookieStore.set(STRAVA_ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds > 0 ? maxAgeSeconds : 3600, // Default to 1 hour if somehow in the past
    sameSite: 'lax',
  });

  // Strava refresh tokens might not expire or have very long expiry.
  // Set a long maxAge for the refresh token cookie.
  cookieStore.set(STRAVA_REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 365 * 24 * 60 * 60, // 1 year
    sameSite: 'lax',
  });

  cookieStore.set(STRAVA_TOKEN_EXPIRES_AT_COOKIE, expiresAtMilliseconds.toString(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds > 0 ? maxAgeSeconds : 3600,
    sameSite: 'lax',
  });
  console.log('[StravaAuthUtils] Strava tokens stored in cookies. Access token expires in approx:', maxAgeSeconds, 'seconds.');
}

export async function clearStravaTokens(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(STRAVA_ACCESS_TOKEN_COOKIE);
  cookieStore.delete(STRAVA_REFRESH_TOKEN_COOKIE);
  cookieStore.delete(STRAVA_TOKEN_EXPIRES_AT_COOKIE);
  console.log('[StravaAuthUtils] Strava tokens cleared from cookies.');
}

export async function refreshStravaTokens(
  currentRefreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number } | null> {
  console.log('[StravaAuthUtils] Attempting to refresh Strava tokens...');
  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[StravaAuthUtils] Strava client ID or secret is not configured for token refresh.');
    throw new Error("Strava client credentials not configured on the server.");
  }

  try {
    const response = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: currentRefreshToken,
      }),
    });

    const data: StravaTokenResponse | { message: string; errors: any[] } = await response.json();

    if (!response.ok) {
      const errorDetails = data as { message: string; errors: any[] };
      console.error('[StravaAuthUtils] Strava token refresh failed:', response.status, errorDetails);
      if (response.status === 400 || response.status === 401) { // Bad request often means invalid refresh token
         console.warn('[StravaAuthUtils] Strava refresh token might be invalid. User may need to re-authenticate with Strava.');
      }
      return null;
    }

    const tokenData = data as StravaTokenResponse;
    console.log('[StravaAuthUtils] Strava tokens refreshed successfully.');
    
    await setStravaTokens(tokenData.access_token, tokenData.refresh_token, tokenData.expires_at);

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token, // Strava might return a new refresh token
      expiresAt: tokenData.expires_at, // Unix timestamp (seconds)
    };
  } catch (error) {
    console.error('[StravaAuthUtils] Exception during Strava token refresh:', error);
    return null;
  }
}

export async function getValidStravaAccessToken(): Promise<string | null> {
  let { accessToken, refreshToken, expiresAt } = await getStravaTokens();

  if (!accessToken || !refreshToken) {
    console.log('[StravaAuthUtils] No Strava tokens found in cookies.');
    return null;
  }

  const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
  if (!expiresAt || Date.now() >= expiresAt - bufferTime) {
    console.log('[StravaAuthUtils] Strava access token expired or nearing expiry. Attempting refresh.');
    const newTokens = await refreshStravaTokens(refreshToken);
    if (newTokens) {
      accessToken = newTokens.accessToken;
    } else {
      console.error('[StravaAuthUtils] Failed to refresh Strava access token. User may need to re-authenticate with Strava.');
      // Consider clearing tokens if refresh fails due to invalid refresh token
      // await clearStravaTokens(); // Caller can decide to do this
      return null;
    }
  }

  return accessToken;
}

