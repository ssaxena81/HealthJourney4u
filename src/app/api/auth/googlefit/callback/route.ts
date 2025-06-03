
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { setGoogleFitTokens } from '@/lib/google-fit-auth-utils';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number; // seconds
  refresh_token?: string; // Google might not always return a new refresh token
  scope: string;
  token_type: string; // "Bearer"
  id_token?: string; // If 'openid' scope was requested
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';
  const profileUrl = `${appUrl}/profile`;

  const cookieStore = cookies();
  const storedState = cookieStore.get('google_oauth_state')?.value;
  cookieStore.delete('google_oauth_state'); // Clean up state cookie

  if (error) {
    console.error('[Google Fit Callback] Error from Google OAuth:', error);
    return NextResponse.redirect(`${profileUrl}?googlefit_error=${encodeURIComponent(error)}`);
  }

  if (!state || state !== storedState) {
    console.error('[Google Fit Callback] Invalid OAuth state. Stored:', storedState, 'Received:', state);
    return NextResponse.redirect(`${profileUrl}?googlefit_error=invalid_state`);
  }

  if (!code) {
    console.error('[Google Fit Callback] No authorization code received from Google.');
    return NextResponse.redirect(`${profileUrl}?googlefit_error=missing_code`);
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID_WEB;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET_WEB;
  const redirectUri = `${appUrl}/api/auth/googlefit/callback`;

  if (!clientId || !clientSecret) {
    console.error('[Google Fit Callback] Google Client ID or Secret for Web is not configured.');
    return NextResponse.redirect(`${profileUrl}?googlefit_error=server_config_error`);
  }

  try {
    console.log('[Google Fit Callback] Exchanging code for tokens with Google...');
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const data: GoogleTokenResponse | { error: string; error_description?: string } = await response.json();

    if (!response.ok) {
      const errorDetails = data as { error: string; error_description?: string };
      console.error('[Google Fit Callback] Failed to exchange code for tokens with Google:', errorDetails);
      const errorMessage = errorDetails.error_description || errorDetails.error || 'token_exchange_failed';
      return NextResponse.redirect(`${profileUrl}?googlefit_error=${encodeURIComponent(errorMessage)}`);
    }

    const tokenData = data as GoogleTokenResponse;
    console.log('[Google Fit Callback] Tokens received from Google:', { access_token_present: !!tokenData.access_token, refresh_token_present: !!tokenData.refresh_token, expires_in: tokenData.expires_in });
    
    if (!tokenData.access_token || !tokenData.expires_in) { // Refresh token can be optional on subsequent grants
        console.error('[Google Fit Callback] Incomplete token data received from Google:', tokenData);
        return NextResponse.redirect(`${profileUrl}?googlefit_error=incomplete_token_data`);
    }

    // Store the tokens
    await setGoogleFitTokens(tokenData.access_token, tokenData.refresh_token, tokenData.expires_in);
    console.log('[Google Fit Callback] Google Fit tokens stored successfully.');
    
    return NextResponse.redirect(`${profileUrl}?googlefit_connected=true`);

  } catch (err: any) {
    console.error('[Google Fit Callback] Exception during token exchange:', err);
    return NextResponse.redirect(`${profileUrl}?googlefit_error=${encodeURIComponent(err.message || 'unknown_exception')}`);
  }
}
