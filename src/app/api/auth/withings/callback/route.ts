// [2025-06-29] COMMENT: This API route handles the callback from the Withings OAuth 2.0 flow.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
// [2025-06-29] COMMENT: Import the utility function to store tokens in cookies.
import { setWithingsTokens } from '@/lib/withings-auth-utils';

// [2025-06-29] COMMENT: Define the URL for Withings token exchange.
const WITHINGS_TOKEN_URL = 'https://wbsapi.withings.net/v2/oauth2';

// [2025-06-29] COMMENT: Define the structure for the token response from Withings.
interface WithingsTokenResponseBody {
  userid: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: "Bearer";
}

interface WithingsTokenResponse {
  status: number; // [2025-06-29] COMMENT: Withings uses a status field where 0 means success.
  body?: WithingsTokenResponseBody;
  error?: string;
}

export async function GET(request: NextRequest) {
  // [2025-06-29] COMMENT: Extract OAuth parameters from the request URL.
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const withingsError = searchParams.get('error'); 

  // [2025-06-29] COMMENT: Dynamically determine the application's URL to construct the redirect URI for the token exchange.
  const protocol = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const host = request.headers.get('host');

  if (!host) {
      console.error("[Withings Callback] Cannot determine host from headers.");
      return NextResponse.redirect('/profile?withings_error=internal_server_error');
  }

  const appUrl = `${protocol}://${host}`;
  const profileUrl = `${appUrl}/profile`;
  const redirectUri = `${appUrl}/api/auth/withings/callback`;

  // [2025-06-29] COMMENT: Retrieve and validate the state cookie for CSRF protection.
  const cookieStore = cookies();
  const storedState = cookieStore.get('withings_oauth_state')?.value;
  // [2025-06-29] COMMENT: Clean up the state cookie after use.
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

  // [2025-06-29] COMMENT: Retrieve credentials from environment variables.
  const clientId = process.env.NEXT_PUBLIC_WITHINGS_CLIENT_ID;
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET; // [2025-06-29] COMMENT: This is the "Consumer Secret" from Withings developer portal.
  
  if (!clientId || !clientSecret) {
    console.error('[Withings Callback] Withings client ID or secret is not configured.');
    return NextResponse.redirect(`${profileUrl}?withings_error=server_config_error`);
  }

  try {
    console.log('[Withings Callback] Exchanging code for tokens...');
    // [2025-06-29] COMMENT: Make a POST request to Withings to exchange the authorization code for tokens.
    const response = await fetch(WITHINGS_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      // [2025-06-29] COMMENT: The body includes Withings-specific parameters like 'action'.
      body: new URLSearchParams({
        action: 'requesttoken', 
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    const data: WithingsTokenResponse = await response.json();

    // [2025-06-29] COMMENT: Check for both HTTP-level errors and application-level errors in the response body.
    if (!response.ok || data.status !== 0 || !data.body) {
      console.error('[Withings Callback] Failed to exchange code for tokens. Status:', response.status, 'Withings Status:', data.status, 'Error:', data.error, 'Body:', data.body);
      const errorMessage = data.error || `token_exchange_failed (status ${data.status || response.status})`;
      return NextResponse.redirect(`${profileUrl}?withings_error=${encodeURIComponent(errorMessage)}`);
    }

    const tokenData = data.body;
    console.log('[Withings Callback] Tokens received from Withings:', { access_token_present: !!tokenData.access_token, refresh_token_present: !!tokenData.refresh_token, expires_in: tokenData.expires_in, userid: tokenData.userid });
    
    // [2025-06-29] COMMENT: Ensure all necessary token data is present before proceeding.
    if (!tokenData.access_token || !tokenData.refresh_token || !tokenData.expires_in || !tokenData.userid) {
        console.error('[Withings Callback] Incomplete token data received from Withings:', tokenData);
        return NextResponse.redirect(`${profileUrl}?withings_error=incomplete_token_data`);
    }

    // [2025-06-29] COMMENT: Store the received tokens securely in cookies.
    await setWithingsTokens(tokenData.access_token, tokenData.refresh_token, tokenData.expires_in, tokenData.userid);
    console.log('[Withings Callback] Withings tokens stored successfully.');
    
    // [2025-06-29] COMMENT: Redirect the user back to the profile page with a success indicator.
    return NextResponse.redirect(`${profileUrl}?withings_connected=true`);

  } catch (err: any) {
    console.error('[Withings Callback] Exception during token exchange:', err);
    return NextResponse.redirect(`${profileUrl}?withings_error=${encodeURIComponent(err.message || 'unknown_exception')}`);
  }
}
