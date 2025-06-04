
import { NextResponse } from 'next/server';
// cookies import is no longer needed here for setting
import { randomBytes } from 'crypto';

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export async function GET() { // Make async if other async operations are needed, but not for just setting cookies on response
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID_WEB; // Use Web Client ID
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const oauthStateSecret = process.env.OAUTH_STATE_SECRET; // Re-use for consistency if desired, or generate unique

  if (!clientId || !appUrl || !oauthStateSecret) {
    console.error("Google OAuth (Web) configuration is missing in environment variables for connect route. Required: NEXT_PUBLIC_GOOGLE_CLIENT_ID_WEB, NEXT_PUBLIC_APP_URL, OAUTH_STATE_SECRET");
    return NextResponse.json({ error: 'Server configuration error for Google OAuth.' }, { status: 500 });
  }

  const redirectUri = `${appUrl}/api/auth/googlefit/callback`;
  const state = randomBytes(16).toString('hex');

  // Define Google Fit scopes. Choose based on data needed.
  const scopes = [
    'https://www.googleapis.com/auth/fitness.activity.read',    // Read activity data
    'https://www.googleapis.com/auth/fitness.location.read',    // Read location data for activities
    'https://www.googleapis.com/auth/fitness.body.read',        // Read body measurements (weight, height)
    'https://www.googleapis.com/auth/fitness.heart_rate.read',  // Read heart rate data
  ].join(' ');
  
  const googleAuthUrl = new URL(GOOGLE_AUTHORIZE_URL);
  googleAuthUrl.searchParams.append('client_id', clientId);
  googleAuthUrl.searchParams.append('redirect_uri', redirectUri);
  googleAuthUrl.searchParams.append('response_type', 'code');
  googleAuthUrl.searchParams.append('scope', scopes);
  googleAuthUrl.searchParams.append('state', state);
  googleAuthUrl.searchParams.append('access_type', 'offline'); // Request refresh token
  googleAuthUrl.searchParams.append('prompt', 'consent'); // Force consent screen for refresh token

  console.log('[Google Fit Connect] Redirecting to Google for authorization:', googleAuthUrl.toString());
  
  const response = NextResponse.redirect(googleAuthUrl.toString());
  response.cookies.set('google_oauth_state', state, { // Use a distinct cookie name for Google
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax',
  });

  return response;
}

