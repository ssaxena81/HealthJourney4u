
import { NextResponse } from 'next/server';
// cookies import is no longer needed here for setting
import { randomBytes } from 'crypto';

export async function GET() { // Make async if other async operations are needed
  const clientId = process.env.NEXT_PUBLIC_FITBIT_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const oauthStateSecret = process.env.OAUTH_STATE_SECRET;

  if (!clientId || !appUrl || !oauthStateSecret) {
    console.error("Fitbit OAuth configuration is missing in environment variables (connect route).");
    return NextResponse.json({ error: 'Server configuration error for Fitbit OAuth.' }, { status: 500 });
  }

  const redirectUri = `${appUrl}/api/auth/fitbit/callback`;
  
  const state = randomBytes(16).toString('hex');
  
  const scopes = [
    'activity',
    'heartrate',
    'location',
    'nutrition',
    'profile',
    'settings',
    'sleep',
    'social',
    'weight'
  ].join(' ');
  
  const fitbitAuthUrl = new URL('https://www.fitbit.com/oauth2/authorize');
  fitbitAuthUrl.searchParams.append('response_type', 'code');
  fitbitAuthUrl.searchParams.append('client_id', clientId);
  fitbitAuthUrl.searchParams.append('redirect_uri', redirectUri);
  fitbitAuthUrl.searchParams.append('scope', scopes);
  fitbitAuthUrl.searchParams.append('state', state);

  console.log('[Fitbit Connect] Redirecting to Fitbit for authorization:', fitbitAuthUrl.toString());
  
  const response = NextResponse.redirect(fitbitAuthUrl.toString());
  response.cookies.set('fitbit_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax',
  });

  return response;
}
