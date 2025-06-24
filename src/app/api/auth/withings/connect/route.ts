
import { NextResponse } from 'next/server';
// cookies import is no longer needed here for setting
import { randomBytes } from 'crypto';

const WITHINGS_AUTHORIZE_URL = 'https://account.withings.com/oauth2_user/authorize2';

export async function GET() { // Make async if other async operations are needed
  const clientId = process.env.NEXT_PUBLIC_WITHINGS_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9004'; // Corrected fallback
  const oauthStateSecret = process.env.OAUTH_STATE_SECRET;

  if (!clientId || !appUrl || !oauthStateSecret) {
    console.error("Withings OAuth configuration is missing (connect route). Env vars: NEXT_PUBLIC_WITHINGS_CLIENT_ID, NEXT_PUBLIC_APP_URL, OAUTH_STATE_SECRET");
    return NextResponse.json({ error: 'Server configuration error for Withings OAuth.' }, { status: 500 });
  }

  const redirectUri = `${appUrl}/api/auth/withings/callback`;
  const state = randomBytes(16).toString('hex');

  const scopes = 'user.info,user.metrics,user.activity';

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    state: state,
    scope: scopes,
    redirect_uri: redirectUri,
  });

  const authorizationUrl = `${WITHINGS_AUTHORIZE_URL}?${params.toString()}`;
  
  console.log('[Withings Connect] Redirecting to Withings for authorization:', authorizationUrl);
  
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set('withings_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax',
  });

  return response;
}
