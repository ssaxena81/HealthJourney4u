
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';

export async function GET() {
  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const oauthStateSecret = process.env.OAUTH_STATE_SECRET;

  if (!clientId || !appUrl || !oauthStateSecret) {
    console.error("Strava OAuth configuration is missing in environment variables (connect route).");
    return NextResponse.json({ error: 'Server configuration error for Strava OAuth.' }, { status: 500 });
  }

  const redirectUri = `${appUrl}/api/auth/strava/callback`;
  
  // Generate a random state string for CSRF protection
  const state = randomBytes(16).toString('hex');
  const cookieStore = cookies();
  cookieStore.set('strava_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax',
  });

  const scopes = 'read,activity:read_all'; // Request necessary scopes. 'read_all' for private activities.
  
  const stravaAuthUrl = new URL('https://www.strava.com/oauth/authorize');
  stravaAuthUrl.searchParams.append('client_id', clientId);
  stravaAuthUrl.searchParams.append('redirect_uri', redirectUri);
  stravaAuthUrl.searchParams.append('response_type', 'code');
  stravaAuthUrl.searchParams.append('approval_prompt', 'auto'); // 'force' to always show auth screen
  stravaAuthUrl.searchParams.append('scope', scopes);
  stravaAuthUrl.searchParams.append('state', state);

  console.log('[Strava Connect] Redirecting to Strava for authorization:', stravaAuthUrl.toString());
  return NextResponse.redirect(stravaAuthUrl.toString());
}
