
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { setWithingsTokens } from '@/lib/withings-auth-utils';

const WITHINGS_TOKEN_URL = 'https://wbsapi.withings.net/v2/oauth2';

interface WithingsTokenResponseBody {
  userid: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: "Bearer";
  // Potentially other fields like csrf_token if using
}

interface WithingsTokenResponse {
  status: number; // 0 for success
  body?: WithingsTokenResponseBody;
  error?: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  // Withings might also return an 'error' parameter or a non-zero status in the body
  const withingsError = searchParams.get('error'); 

  // Dynamically determine the app URL from request headers for robust proxy support
  const protocol = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const host = request.headers.get('host');

  if (!host) {
      console.error("[Withings Callback] Cannot determine host from headers.");
      return NextResponse.redirect('/profile?withings_error=internal_server_error');
  }

  const appUrl = `${protocol}://${host}`;
  const profileUrl = `${appUrl}/profile`;
  const redirectUri = `${appUrl}/api/auth/withings/callback`;

  const cookieStore = cookies();
  const storedState = cookieStore.get('withings_oauth_state')?.value;
  cookieStore.delete('withings_oauth_state');

  if (withingsError) {
    console.error('[Withings Callback] Error from Withings (URL param):', withingsError);
    return NextResponse.redirect(`${profileUrl}?withings_error=${encodeURIComponent(withingsError)}`);
  }

  if (!state || state !== storedState) {
    console.error('[Withings Callback] Invalid OAuth state. Stored:', storedState, 'Received:', state);
    return NextResponse.redirect(`${profileUrl}?withings_error=invalid_state`);
  }

  if (!code) {
    console.error('[Withings Callback] No authorization code received from Withings.');
    return NextResponse.redirect(`${profileUrl}?withings_error=missing_code`);
  }

  const clientId = process.env.NEXT_PUBLIC_WITHINGS_CLIENT_ID;
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET; // This is the "Consumer Secret" from Withings
  
  if (!clientId || !clientSecret) {
    console.error('[Withings Callback] Withings client ID or secret is not configured.');
    return NextResponse.redirect(`${profileUrl}?withings_error=server_config_error`);
  }

  try {
    console.log('[Withings Callback] Exchanging code for tokens...');
    const response = await fetch(WITHINGS_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        action: 'requesttoken', // Withings specific parameter
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    const data: WithingsTokenResponse = await response.json();

    if (!response.ok || data.status !== 0 || !data.body) {
      console.error('[Withings Callback] Failed to exchange code for tokens. Status:', response.status, 'Withings Status:', data.status, 'Error:', data.error, 'Body:', data.body);
      const errorMessage = data.error || `token_exchange_failed (status ${data.status || response.status})`;
      return NextResponse.redirect(`${profileUrl}?withings_error=${encodeURIComponent(errorMessage)}`);
    }

    const tokenData = data.body;
    console.log('[Withings Callback] Tokens received from Withings:', { access_token_present: !!tokenData.access_token, refresh_token_present: !!tokenData.refresh_token, expires_in: tokenData.expires_in, userid: tokenData.userid });
    
    if (!tokenData.access_token || !tokenData.refresh_token || !tokenData.expires_in || !tokenData.userid) {
        console.error('[Withings Callback] Incomplete token data received from Withings:', tokenData);
        return NextResponse.redirect(`${profileUrl}?withings_error=incomplete_token_data`);
    }

    await setWithingsTokens(tokenData.access_token, tokenData.refresh_token, tokenData.expires_in, tokenData.userid);
    console.log('[Withings Callback] Withings tokens stored successfully.');
    
    return NextResponse.redirect(`${profileUrl}?withings_connected=true`);

  } catch (err: any) {
    console.error('[Withings Callback] Exception during token exchange:', err);
    return NextResponse.redirect(`${profileUrl}?withings_error=${encodeURIComponent(err.message || 'unknown_exception')}`);
  }
}
