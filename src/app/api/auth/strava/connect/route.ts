
import { NextResponse } from 'next/server';
// cookies import is no longer needed here for setting
import { randomBytes } from 'crypto';

export async function GET() { // Make async if other async operations are needed
  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9004'; // Corrected fallback
  const oauthStateSecret = process.env.OAUTH_STATE_SECRET;

  if (!clientId || !appUrl || !oauthStateSecret) {
    console.error("Strava OAuth configuration is missing in environment variables (connect route).");
    return NextResponse.json({ error: 'Server configuration error for Strava OAuth.' }, { status: 500 });
  }

  const redirectUri = `${appUrl}/api/auth/strava/callback`;
  
  const state = randomBytes(16).toString('hex');
  
  const scopes = 'read,activity:read_all'; 
  
  const stravaAuthUrl = new URL('https://www.strava.com/oauth/authorize');
  stravaAuthUrl.searchParams.append('client_id', clientId);
  stravaAuthUrl.searchParams.append('redirect_uri', redirectUri);
  stravaAuthUrl.searchParams.append('response_type', 'code');
  stravaAuthUrl.searchParams.append('approval_prompt', 'auto'); 
  stravaAuthUrl.searchParams.append('scope', scopes);
  stravaAuthUrl.searchParams.append('state', state);

  console.log('[Strava Connect] Redirecting to Strava for authorization:', stravaAuthUrl.toString());
  
  const response = NextResponse.redirect(stravaAuthUrl.toString());
  response.cookies.set('strava_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax',
  });

  return response;
}
