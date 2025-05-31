
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';

const WITHINGS_AUTHORIZE_URL = 'https://account.withings.com/oauth2_user/authorize2';

export async function GET() {
  const clientId = process.env.NEXT_PUBLIC_WITHINGS_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL; // Your app's base URL
  const oauthStateSecret = process.env.OAUTH_STATE_SECRET;

  if (!clientId || !appUrl || !oauthStateSecret) {
    console.error("Withings OAuth configuration is missing (connect route). Env vars: NEXT_PUBLIC_WITHINGS_CLIENT_ID, NEXT_PUBLIC_APP_URL, OAUTH_STATE_SECRET");
    return NextResponse.json({ error: 'Server configuration error for Withings OAuth.' }, { status: 500 });
  }

  const redirectUri = `${appUrl}/api/auth/withings/callback`;
  const state = randomBytes(16).toString('hex');

  const cookieStore = cookies();
  cookieStore.set('withings_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax',
  });

  // Common scopes for Withings: user.info, user.metrics (weight, height, heart rate etc.), user.activity
  // Refer to Withings API documentation for a full list of scopes.
  const scopes = 'user.info,user.metrics,user.activity';

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    state: state,
    scope: scopes,
    redirect_uri: redirectUri,
    // mode: 'demo', // Optional: for testing with demo data if your app is not yet validated by Withings
  });

  const authorizationUrl = `${WITHINGS_AUTHORIZE_URL}?${params.toString()}`;
  
  console.log('[Withings Connect] Redirecting to Withings for authorization:', authorizationUrl);
  return NextResponse.redirect(authorizationUrl);
}
