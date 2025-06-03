
'use server';

import { cookies } from 'next/headers';

const GOOGLE_FIT_ACCESS_TOKEN_COOKIE = 'google_fit_access_token';
const GOOGLE_FIT_REFRESH_TOKEN_COOKIE = 'google_fit_refresh_token';
const GOOGLE_FIT_TOKEN_EXPIRES_AT_COOKIE = 'google_fit_token_expires_at';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number; // seconds
  refresh_token?: string; // Google might not always return a new refresh token
  scope: string;
  token_type: string; // "Bearer"
  id_token?: string; // If 'openid' scope was requested
}

interface StoredGoogleFitTokens {
  accessToken: string | undefined;
  refreshToken: string | undefined;
  expiresAt: number | undefined; // Timestamp in milliseconds
}

export async function getGoogleFitTokens(): Promise<StoredGoogleFitTokens> {
  const cookieStore = cookies();
  const accessToken = cookieStore.get(GOOGLE_FIT_ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(GOOGLE_FIT_REFRESH_TOKEN_COOKIE)?.value;
  const expiresAtString = cookieStore.get(GOOGLE_FIT_TOKEN_EXPIRES_AT_COOKIE)?.value;
  const expiresAt = expiresAtString ? parseInt(expiresAtString, 10) : undefined;

  return { accessToken, refreshToken, expiresAt };
}

export async function setGoogleFitTokens(
  accessToken: string,
  refreshToken: string | undefined, // Refresh token might not always be provided on refresh
  expiresIn: number // seconds
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

  cookieStore.set(GOOGLE_FIT_ACCESS_TOKEN_COOKIE, accessToken, {
    ...cookieOptions,
    maxAge: expiresIn,
  });

  if (refreshToken) { // Only set refresh token if it's provided
    cookieStore.set(GOOGLE_FIT_REFRESH_TOKEN_COOKIE, refreshToken, {
      ...cookieOptions,
      maxAge: 365 * 24 * 60 * 60, // Refresh token typically has a longer life
    });
  }

  cookieStore.set(GOOGLE_FIT_TOKEN_EXPIRES_AT_COOKIE, expiresAt.toString(), {
    ...cookieOptions,
    maxAge: expiresIn,
  });
  console.log('[GoogleFitAuthUtils] Google Fit tokens stored/updated in cookies.');
}

export async function clearGoogleFitTokens(): Promise<void> {
  const cookieStore = cookies();
  cookieStore.delete(GOOGLE_FIT_ACCESS_TOKEN_COOKIE);
  cookieStore.delete(GOOGLE_FIT_REFRESH_TOKEN_COOKIE);
  cookieStore.delete(GOOGLE_FIT_TOKEN_EXPIRES_AT_COOKIE);
  console.log('[GoogleFitAuthUtils] Google Fit tokens cleared from cookies.');
}

export async function refreshGoogleFitTokens(
  currentRefreshToken: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number } | null> {
  console.log('[GoogleFitAuthUtils] Attempting to refresh Google Fit tokens...');
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID_WEB; // Ensure this is the Web Client ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET_WEB; // Ensure this is the Web Client Secret

  if (!clientId || !clientSecret) {
    console.error('[GoogleFitAuthUtils] Google Client ID or Secret for Web is not configured for token refresh.');
    throw new Error("Google client credentials not configured on the server.");
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
        refresh_token: currentRefreshToken,
      }),
    });

    const data: GoogleTokenResponse | { error: string; error_description?: string } = await response.json();

    if (!response.ok) {
      const errorDetails = data as { error: string; error_description?: string };
      console.error('[GoogleFitAuthUtils] Google Fit token refresh failed:', response.status, errorDetails);
      if (errorDetails.error === 'invalid_grant') {
         console.warn('[GoogleFitAuthUtils] Google Fit refresh token might be invalid or revoked. User may need to re-authenticate.');
      }
      return null;
    }

    const tokenData = data as GoogleTokenResponse;
    console.log('[GoogleFitAuthUtils] Google Fit tokens refreshed successfully.');
    
    // Google might not return a new refresh token; use the old one if not provided.
    await setGoogleFitTokens(tokenData.access_token, tokenData.refresh_token || currentRefreshToken, tokenData.expires_in);

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || currentRefreshToken,
      expiresIn: tokenData.expires_in,
    };
  } catch (error) {
    console.error('[GoogleFitAuthUtils] Exception during Google Fit token refresh:', error);
    return null;
  }
}

export async function getValidGoogleFitAccessToken(): Promise<string | null> {
  let { accessToken, refreshToken, expiresAt } = await getGoogleFitTokens();

  if (!accessToken || !refreshToken) {
    console.log('[GoogleFitAuthUtils] No Google Fit tokens found in cookies.');
    return null;
  }

  const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
  if (!expiresAt || Date.now() >= expiresAt - bufferTime) {
    console.log('[GoogleFitAuthUtils] Google Fit access token expired or nearing expiry. Attempting refresh.');
    const newTokens = await refreshGoogleFitTokens(refreshToken);
    if (newTokens) {
      accessToken = newTokens.accessToken;
    } else {
      console.error('[GoogleFitAuthUtils] Failed to refresh Google Fit access token. User may need to re-authenticate.');
      return null;
    }
  }
  return accessToken;
}
