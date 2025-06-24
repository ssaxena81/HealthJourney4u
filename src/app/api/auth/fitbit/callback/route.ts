
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { setFitbitTokens } from '@/lib/fitbit-auth-utils';

const FITBIT_TOKEN_URL = 'https://api.fitbit.com/oauth2/token';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002'; // Fallback for redirect
  const profileUrl = `${appUrl}/profile`;

  const cookieStore = await cookies();
  const storedState = cookieStore.get('fitbit_oauth_state')?.value;
  cookieStore.delete('fitbit_oauth_state'); // Clean up state cookie

  if (error) {
    console.error('[Fitbit Callback] Error from Fitbit:', error);
    return NextResponse.redirect(`${profileUrl}?fitbit_error=${encodeURIComponent(error)}`);
  }

  if (!state || state !== storedState) {
    console.error('[Fitbit Callback] Invalid OAuth state. Stored:', storedState, 'Received:', state);
    return NextResponse.redirect(`${profileUrl}?fitbit_error=invalid_state`);
  }

  if (!code) {
    console.error('[Fitbit Callback] No authorization code received from Fitbit.');
    return NextResponse.redirect(`${profileUrl}?fitbit_error=missing_code`);
  }

  const clientId = process.env.NEXT_PUBLIC_FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  const redirectUri = `${appUrl}/api/auth/fitbit/callback`;

  if (!clientId || !clientSecret) {
    console.error('[Fitbit Callback] Fitbit client ID or secret is not configured.');
    return NextResponse.redirect(`${profileUrl}?fitbit_error=server_config_error`);
  }
  
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    console.log('[Fitbit Callback] Exchanging code for tokens...');
    const response = await fetch(FITBIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        clientId: clientId,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: code,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Fitbit Callback] Failed to exchange code for tokens:', data);
      const errorMessage = data.errors?.[0]?.message || 'token_exchange_failed';
      return NextResponse.redirect(`${profileUrl}?fitbit_error=${encodeURIComponent(errorMessage)}`);
    }

    console.log('[Fitbit Callback] Tokens received from Fitbit:', { access_token_present: !!data.access_token, refresh_token_present: !!data.refresh_token, expires_in: data.expires_in });
    
    if (!data.access_token || !data.refresh_token || !data.expires_in) {
        console.error('[Fitbit Callback] Incomplete token data received from Fitbit:', data);
        return NextResponse.redirect(`${profileUrl}?fitbit_error=incomplete_token_data`);
    }

    // Store the tokens
    await setFitbitTokens(data.access_token, data.refresh_token, data.expires_in);
    console.log('[Fitbit Callback] Fitbit tokens stored successfully.');
    
    // Redirect back to the profile page with a success flag
    return NextResponse.redirect(`${profileUrl}?fitbit_connected=true`);

  } catch (err: any) {
    console.error('[Fitbit Callback] Exception during token exchange:', err);
    return NextResponse.redirect(`${profileUrl}?fitbit_error=${encodeURIComponent(err.message || 'unknown_exception')}`);
  }
}
