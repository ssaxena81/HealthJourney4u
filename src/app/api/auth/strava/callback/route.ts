
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { setStravaTokens } from '@/lib/strava-auth-utils'; // Assuming this function exists

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002'; // Fallback for redirect
  const profileUrl = `${appUrl}/profile`;

  const cookieStore = await cookies();
  const storedState = cookieStore.get('strava_oauth_state')?.value;
  cookieStore.delete('strava_oauth_state'); // Clean up state cookie

  if (error) {
    console.error('[Strava Callback] Error from Strava:', error);
    return NextResponse.redirect(`${profileUrl}?strava_error=${encodeURIComponent(error)}`);
  }

  if (!state || state !== storedState) {
    console.error('[Strava Callback] Invalid OAuth state. Stored:', storedState, 'Received:', state);
    return NextResponse.redirect(`${profileUrl}?strava_error=invalid_state`);
  }

  if (!code) {
    console.error('[Strava Callback] No authorization code received from Strava.');
    return NextResponse.redirect(`${profileUrl}?strava_error=missing_code`);
  }

  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[Strava Callback] Strava client ID or secret is not configured.');
    return NextResponse.redirect(`${profileUrl}?strava_error=server_config_error`);
  }

  try {
    console.log('[Strava Callback] Exchanging code for tokens...');
    const response = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Strava Callback] Failed to exchange code for tokens:', data);
      const errorMessage = data.message || 'token_exchange_failed';
      return NextResponse.redirect(`${profileUrl}?strava_error=${encodeURIComponent(errorMessage)}`);
    }

    console.log('[Strava Callback] Tokens received from Strava:', { access_token_present: !!data.access_token, refresh_token_present: !!data.refresh_token, expires_at: data.expires_at });
    
    if (!data.access_token || !data.refresh_token || !data.expires_at) {
        console.error('[Strava Callback] Incomplete token data received from Strava:', data);
        return NextResponse.redirect(`${profileUrl}?strava_error=incomplete_token_data`);
    }

    await setStravaTokens(data.access_token, data.refresh_token, data.expires_at);
    console.log('[Strava Callback] Strava tokens stored successfully.');
    
    return NextResponse.redirect(`${profileUrl}?strava_connected=true`);

  } catch (err: any) {
    console.error('[Strava Callback] Exception during token exchange:', err);
    return NextResponse.redirect(`${profileUrl}?strava_error=${encodeURIComponent(err.message || 'unknown_exception')}`);
  }
}
