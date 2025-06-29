// [2025-06-29] COMMENT: This file is an API route that initiates the Withings OAuth 2.0 authorization flow.
import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

// [2025-06-29] COMMENT: Define the base URL for Withings authorization.
const WITHINGS_AUTHORIZE_URL = 'https://account.withings.com/oauth2_user/authorize2';

export async function GET(request: NextRequest) {
  // [2025-06-29] COMMENT: Retrieve Withings Client ID from environment variables.
  const clientId = process.env.NEXT_PUBLIC_WITHINGS_CLIENT_ID;
  const oauthStateSecret = process.env.OAUTH_STATE_SECRET;

  // [2025-06-29] COMMENT: Dynamically determine the application's URL from request headers to support various deployment environments.
  // const protocol = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  // const host = request.headers.get('host');

  // [2025-06-29] COMMENT: The dynamic host detection is removed to prevent local development URLs (like 127.0.0.1) from being used as the redirect URI.
  // if (!clientId || !oauthStateSecret || !host) {
  if (!clientId || !oauthStateSecret) {
    console.error("Withings OAuth configuration is missing or host could not be determined. Env vars: NEXT_PUBLIC_WITHINGS_CLIENT_ID, OAUTH_STATE_SECRET, host header.");
    return NextResponse.json({ error: 'Server configuration error for Withings OAuth.' }, { status: 500 });
  }

  // [2025-06-29] COMMENT: Construct the full redirect URI that Withings will call back to after authorization. This must match the URI in the Withings developer portal.
  // const appUrl = `${protocol}://${host}`;
  // [2025-06-29] COMMENT: Hardcoding the redirect URI to the public-facing URL to prevent mismatches during local development.
  const redirectUri = `https://9003-firebase-studio-1747406301563.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev/api/auth/withings/callback`;
  
  // [2025-06-29] COMMENT: Generate a random 'state' parameter for CSRF protection.
  const state = randomBytes(16).toString('hex');
  
  // [2025-06-29] COMMENT: Define the permissions (scopes) our application is requesting.
  const scopes = 'user.info,user.metrics,user.activity';

  // [2025-06-29] COMMENT: Build the full authorization URL with all required parameters.
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    state: state,
    scope: scopes,
    redirect_uri: redirectUri,
  });

  const authorizationUrl = `${WITHINGS_AUTHORIZE_URL}?${params.toString()}`;
  
  console.log('[Withings Connect] Redirecting to Withings for authorization:', authorizationUrl);
  
  // [2025-06-29] COMMENT: Create a redirect response to send the user to Withings.
  const response = NextResponse.redirect(authorizationUrl);
  
  // [2025-06-29] COMMENT: Set the state value in a secure, httpOnly cookie to verify it on callback.
  response.cookies.set('withings_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10, // [2025-06-29] COMMENT: 10-minute validity for the state cookie.
    sameSite: 'lax',
  });

  return response;
}
