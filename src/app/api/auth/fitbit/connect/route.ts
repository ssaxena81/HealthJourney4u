
import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_FITBIT_CLIENT_ID;

  if (!clientId) {
      console.error("Fitbit OAuth configuration is missing. Required: NEXT_PUBLIC_FITBIT_CLIENT_ID.");
      return NextResponse.json({ error: 'Server configuration error for Fitbit OAuth.' }, { status: 500 });
  }

  // [2025-06-28] COMMENT: Dynamically construct the application's base URL from the request URL's origin. This is more robust than inspecting headers.
  const appUrl = new URL(request.url).origin;
  // [2025-06-28] COMMENT: This is the old dynamic redirect URI. It is being commented out.
  // const redirectUri = `${appUrl}/api/auth/fitbit/callback`;
  // [2025-06-28] COMMENT: This new redirect URI is constructed to match the `source` path in the `next.config.js` rewrites. This is the public-facing URL we send to Fitbit.
  const redirectUri = `${appUrl}/api/auth/callback/fitbit`;

  // [2025-06-28] COMMENT: Generate a random string to use for CSRF protection in the OAuth flow.
  const state = randomBytes(16).toString('hex');
  
  // [2025-06-28] COMMENT: Define the permission scopes being requested from Fitbit.
  const scopes = [
    'activity', 'heartrate', 'location', 'nutrition',
    'profile', 'settings', 'sleep', 'social', 'weight'
  ].join(' ');
  
  // [2025-06-28] COMMENT: Construct the final authorization URL to redirect the user to Fitbit's site.
  const fitbitAuthUrl = new URL('https://www.fitbit.com/oauth2/authorize');
  fitbitAuthUrl.searchParams.append('response_type', 'code');
  fitbitAuthUrl.searchParams.append('client_id', clientId);
  fitbitAuthUrl.searchParams.append('redirect_uri', redirectUri);
  fitbitAuthUrl.searchParams.append('scope', scopes);
  fitbitAuthUrl.searchParams.append('state', state);

  // [2025-06-28] COMMENT: Create a redirect response to the Fitbit authorization URL.
  const response = NextResponse.redirect(fitbitAuthUrl.toString());
  // [2025-06-28] COMMENT: Set the CSRF state token in a secure, http-only cookie to be verified in the callback.
  response.cookies.set('fitbit_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax',
  });

  return response;
}
