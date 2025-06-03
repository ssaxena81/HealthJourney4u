
'use server';

import { cookies } from 'next/headers';

const WITHINGS_ACCESS_TOKEN_COOKIE = 'withings_access_token';
const WITHINGS_REFRESH_TOKEN_COOKIE = 'withings_refresh_token';
const WITHINGS_TOKEN_EXPIRES_AT_COOKIE = 'withings_token_expires_at';
const WITHINGS_USER_ID_COOKIE = 'withings_user_id';

const WITHINGS_TOKEN_URL = 'https://wbsapi.withings.net/v2/oauth2'; // Note: uses /v2/ for token endpoint

interface WithingsTokenResponse {
  status: number;
  body: {
    userid: string;
    access_token: string;
    refresh_token: string;
    expires_in: number; // seconds
    scope: string;
    token_type: "Bearer";
  };
  error?: string;
}

interface StoredWithingsTokens {
  accessToken: string | undefined;
  refreshToken: string | undefined;
  expiresAt: number | undefined; // Timestamp in milliseconds
  userId: string | undefined;
}

export async function getWithingsTokens(): Promise<StoredWithingsTokens> {
  const cookieStore = cookies();
  const accessToken = cookieStore.get(WITHINGS_ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(WITHINGS_REFRESH_TOKEN_COOKIE)?.value;
  const expiresAtString = cookieStore.get(WITHINGS_TOKEN_EXPIRES_AT_COOKIE)?.value;
  const expiresAt = expiresAtString ? parseInt(expiresAtString, 10) : undefined;
  const userId = cookieStore.get(WITHINGS_USER_ID_COOKIE)?.value;

  return { accessToken, refreshToken, expiresAt, userId };
}

export async function setWithingsTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number, // seconds
  withingsUserId: string
): Promise<void> {
  const cookieStore = cookies();
  const now = Date.now();
  const expiresAt = now + expiresIn * 1000;

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    sameSite: 'lax' as const,
  };

  cookieStore.set(WITHINGS_ACCESS_TOKEN_COOKIE, accessToken, {
    ...cookieOptions,
    maxAge: expiresIn,
  });

  cookieStore.set(WITHINGS_REFRESH_TOKEN_COOKIE, refreshToken, {
    ...cookieOptions,
    maxAge: 365 * 24 * 60 * 60, // Refresh token typically has a longer life
  });

  cookieStore.set(WITHINGS_TOKEN_EXPIRES_AT_COOKIE, expiresAt.toString(), {
    ...cookieOptions,
    maxAge: expiresIn,
  });

  cookieStore.set(WITHINGS_USER_ID_COOKIE, withingsUserId, {
    ...cookieOptions,
    maxAge: 365 * 24 * 60 * 60, // Store user ID as long as refresh token
  });
  console.log('[WithingsAuthUtils] Withings tokens and UserID stored in cookies.');
}

export async function clearWithingsTokens(): Promise<void> {
  const cookieStore = cookies();
  cookieStore.delete(WITHINGS_ACCESS_TOKEN_COOKIE);
  cookieStore.delete(WITHINGS_REFRESH_TOKEN_COOKIE);
  cookieStore.delete(WITHINGS_TOKEN_EXPIRES_AT_COOKIE);
  cookieStore.delete(WITHINGS_USER_ID_COOKIE);
  console.log('[WithingsAuthUtils] Withings tokens cleared from cookies.');
}

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
      body: new URLSearchParams({
        action: 'requesttoken', // Withings specific
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: currentRefreshToken,
      }),
    });

    const data: WithingsTokenResponse = await response.json();

    if (data.status !== 0 || !data.body?.access_token) {
      console.error('[WithingsAuthUtils] Withings token refresh failed:', data.status, data.error);
      if (data.status === 100 || data.status === 101 || data.status === 102) { // Specific Withings error codes for invalid tokens
         console.warn('[WithingsAuthUtils] Refresh token might be invalid. User may need to re-authenticate with Withings.');
      }
      return null;
    }

    const tokenData = data.body;
    console.log('[WithingsAuthUtils] Withings tokens refreshed successfully.');
    
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

export async function getValidWithingsAccessToken(): Promise<string | null> {
  let { accessToken, refreshToken, expiresAt } = await getWithingsTokens();

  if (!accessToken || !refreshToken) {
    console.log('[WithingsAuthUtils] No Withings tokens found in cookies.');
    return null;
  }

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
