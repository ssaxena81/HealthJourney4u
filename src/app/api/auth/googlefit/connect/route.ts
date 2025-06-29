
import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_FIT_CLIENT_ID;

  // This is the single source of truth for the redirect URI.
  // It must EXACTLY match what is in your Google Cloud Console.
  const redirectUri = `https://9003-firebase-studio-1747406301563.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev/api/auth/googlefit/callback`;

  if (!clientId) {
    console.error("Google OAuth configuration is missing. Required: NEXT_PUBLIC_GOOGLE_FIT_CLIENT_ID.");
    return NextResponse.json({ error: 'Server configuration error for Google OAuth.' }, { status: 500 });
  }

  const state = randomBytes(16).toString('hex');

  // Define the permissions your app requires.
  const scopes = [
    'https://www.googleapis.com/auth/fitness.activity.read',
    'https://www.googleapis.com/auth/fitness.location.read',
    'https://www.googleapis.com/auth/fitness.body.read',
    'https://www.googleapis.com/auth/fitness.heart_rate.read',
  ].join(' ');
  
  // Construct the URL parameters.
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    state: state,
    access_type: 'offline', // Request a refresh token.
    prompt: 'consent',      // Force the consent screen to ensure a refresh token is issued.
  });

  const authorizationUrl = `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
  
  // --- DIAGNOSTIC LOG ---
  // This will print the exact full URL to your terminal.
  // The 'redirect_uri' in this URL is what needs to be in the Google Cloud Console.
  console.log('[Google Fit Connect] FULL REDIRECT URL:', authorizationUrl);
  
  const response = NextResponse.redirect(authorizationUrl);
  
  // Set a state cookie to prevent CSRF attacks.
  response.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax',
  });

  return response;
}
