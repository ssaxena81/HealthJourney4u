
'use server';

// [2025-06-29] COMMENT: This file contains utility functions for handling Withings OAuth 2.0 authentication flow, including token management using secure cookies.

import { cookies } from 'next/headers';

// [2025-06-29] COMMENT: Define constant names for the cookies to ensure consistency.
const WITHINGS_ACCESS_TOKEN_COOKIE = 'withings_access_token';
const WITHINGS_REFRESH_TOKEN_COOKIE = 'withings_refresh_token';
const WITHINGS_TOKEN_EXPIRES_AT_COOKIE = 'withings_token_expires_at';
const WITHINGS_USER_ID_COOKIE = 'withings_user_id';

// [2025-06-29] COMMENT: Define the URL for Withings token exchange and refresh. Note the /v2/ path.
const WITHINGS_TOKEN_URL = 'https://wbsapi.withings.net/v2/oauth2';

// [2025-06-29] COMMENT: Define the structure of the token response from Withings API.
interface WithingsTokenResponse {
  status: number; // [2025-06-29] COMMENT: Withings uses a status field in the body, 0 means success.
  body: {
    userid: string;
    access_token: string;
    refresh_token: string;
    expires_in: number; // [2025-06-29] COMMENT: This is in seconds.
    scope: string;
    token_type: "Bearer";
  };
  error?: string;
}

// [2025-06-29] COMMENT: Define the internal structure for storing tokens.
interface StoredWithingsTokens {
  accessToken: string | undefined;
  refreshToken: string | undefined;
  expiresAt: number | undefined; // [2025-06-29] COMMENT: This will be a timestamp in milliseconds.
  userId: string | undefined;
}

// [2025-06-29] COMMENT: This function retrieves Withings tokens from the browser's cookies.
export async function getWithingsTokens(): Promise<StoredWithingsTokens> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(WITHINGS_ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(WITHINGS_REFRESH_TOKEN_COOKIE)?.value;
  const expiresAtString = cookieStore.get(WITHINGS_TOKEN_EXPIRES_AT_COOKIE)?.value;
  const expiresAt = expiresAtString ? parseInt(expiresAtString, 10) : undefined;
  const userId = cookieStore.get(WITHINGS_USER_ID_COOKIE)?.value;

  return { accessToken, refreshToken, expiresAt, userId };
}

// [2025-06-29] COMMENT: This function sets the Withings tokens in secure, httpOnly cookies.
export async function setWithingsTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number, // [2025-06-29] COMMENT: Expects seconds, as provided by Withings API.
  withingsUserId: string
): Promise<void> {
  const cookieStore = await cookies();
  const now = Date.now();
  const expiresAt = now + expiresIn * 1000;

  // [2025-06-29] COMMENT: Define common options for secure cookies.
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    sameSite: 'lax' as const,
  };

  // [2025-06-29] COMMENT: Set the access token cookie with a maxAge based on its expiration.
  cookieStore.set(WITHINGS_ACCESS_TOKEN_COOKIE, accessToken, {
    ...cookieOptions,
    maxAge: expiresIn,
  });

  // [2025-06-29] COMMENT: Set the refresh token cookie with a long lifespan.
  cookieStore.set(WITHINGS_REFRESH_TOKEN_COOKIE, refreshToken, {
    ...cookieOptions,
    maxAge: 365 * 24 * 60 * 60, // [2025-06-29] COMMENT: Refresh token is long-lived, set for 1 year.
  });

  // [2025-06-29] COMMENT: Set the expiry timestamp cookie.
  cookieStore.set(WITHINGS_TOKEN_EXPIRES_AT_COOKIE, expiresAt.toString(), {
    ...cookieOptions,
    maxAge: expiresIn,
  });

  // [2025-06-29] COMMENT: Store the Withings User ID, as it's required for some API calls.
  cookieStore.set(WITHINGS_USER_ID_COOKIE, withingsUserId, {
    ...cookieOptions,
    maxAge: 365 * 24 * 60 * 60, // [2025-06-29] COMMENT: Store user ID as long as the refresh token.
  });
  console.log('[WithingsAuthUtils] Withings tokens and UserID stored in cookies.');
}

// [2025-06-29] COMMENT: This function clears all Withings-related cookies.
export async function clearWithingsTokens(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(WITHINGS_ACCESS_TOKEN_COOKIE);
  cookieStore.delete(WITHINGS_REFRESH_TOKEN_COOKIE);
  cookieStore.delete(WITHINGS_TOKEN_EXPIRES_AT_COOKIE);
  cookieStore.delete(WITHINGS_USER_ID_COOKIE);
  console.log('[WithingsAuthUtils] Withings tokens cleared from cookies.');
}

// [2025-06-29] COMMENT: This function handles refreshing an expired access token.
export async function refreshWithingsTokens(
  currentRefreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; userId: string } | null> {
  console.log('[WithingsAuthUtils] Attempting to refresh Withings tokens...');
  const clientId = process.env.NEXT_PUBLIC_WITHINGS_CLIENT_ID;
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[WithingsAuthUtils] Withings client ID or secret is not configured for token refresh.');
    throw new Error("Withings client credentials not configured on the server.");
  }

  try {
    const response = await fetch(WITHINGS_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      // [2025-06-29] COMMENT: Construct the body with Withings-specific parameters for token refresh.
      body: new URLSearchParams({
        action: 'requesttoken', // [2025-06-29] COMMENT: This action is required by Withings.
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: currentRefreshToken,
      }),
    });

    const data: WithingsTokenResponse = await response.json();

    // [2025-06-29] COMMENT: Check for both HTTP errors and errors within the Withings response body.
    if (data.status !== 0 || !data.body?.access_token) {
      console.error('[WithingsAuthUtils] Withings token refresh failed:', data.status, data.error);
      if (data.status === 100 || data.status === 101 || data.status === 102) { // [2025-06-29] COMMENT: Specific Withings error codes for invalid tokens.
         console.warn('[WithingsAuthUtils] Refresh token might be invalid. User may need to re-authenticate with Withings.');
      }
      return null;
    }

    const tokenData = data.body;
    console.log('[WithingsAuthUtils] Withings tokens refreshed successfully.');
    
    // [2025-06-29] COMMENT: Store the newly acquired tokens.
    await setWithingsTokens(tokenData.access_token, tokenData.refresh_token, tokenData.expires_in, tokenData.userid);

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      userId: tokenData.userid,
    };
  } catch (error) {
    console.error('[WithingsAuthUtils] Exception during Withings token refresh:', error);
    return null;
  }
}

// [2025-06-29] COMMENT: This is the main function to be called by services; it gets a token, refreshing it if necessary.
export async function getValidWithingsAccessToken(): Promise<string | null> {
  let { accessToken, refreshToken, expiresAt } = await getWithingsTokens();

  if (!accessToken || !refreshToken) {
    console.log('[WithingsAuthUtils] No Withings tokens found in cookies.');
    return null;
  }

  // [2025-06-29] COMMENT: Use a 5-minute buffer to refresh the token before it actually expires.
  const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
  if (!expiresAt || Date.now() >= expiresAt - bufferTime) {
    console.log('[WithingsAuthUtils] Withings access token expired or nearing expiry. Attempting refresh.');
    const newTokens = await refreshWithingsTokens(refreshToken);
    if (newTokens) {
      accessToken = newTokens.accessToken;
    } else {
      console.error('[WithingsAuthUtils] Failed to refresh Withings access token. User may need to re-authenticate.');
      return null;
    }
  }
  return accessToken;
}
