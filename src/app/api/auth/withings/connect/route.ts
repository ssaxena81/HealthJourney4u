
import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

const WITHINGS_AUTHORIZE_URL = 'https://account.withings.com/oauth2_user/authorize2';

export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_WITHINGS_CLIENT_ID;
  const oauthStateSecret = process.env.OAUTH_STATE_SECRET;

  // Dynamically determine the app URL from request headers for robust proxy support
  const protocol = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const host = request.headers.get('host');

  if (!clientId || !oauthStateSecret || !host) {
    console.error("Withings OAuth configuration is missing or host could not be determined. Env vars: NEXT_PUBLIC_WITHINGS_CLIENT_ID, OAUTH_STATE_SECRET, host header.");
    return NextResponse.json({ error: 'Server configuration error for Withings OAuth.' }, { status: 500 });
  }

  const appUrl = `${protocol}://${host}`;
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
