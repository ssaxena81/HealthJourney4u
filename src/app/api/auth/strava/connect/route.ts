
import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
  const oauthStateSecret = process.env.OAUTH_STATE_SECRET;

  // Dynamically determine the app URL from request headers for robust proxy support
  const protocol = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const host = request.headers.get('host');

  if (!clientId || !oauthStateSecret || !host) {
    console.error("Strava OAuth configuration is missing or host could not be determined. Required: NEXT_PUBLIC_STRAVA_CLIENT_ID, OAUTH_STATE_SECRET, host header.");
    return NextResponse.json({ error: 'Server configuration error for Strava OAuth.' }, { status: 500 });
  }

  const appUrl = `${protocol}://${host}`;
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
