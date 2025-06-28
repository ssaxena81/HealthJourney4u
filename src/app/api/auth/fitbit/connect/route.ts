import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_FITBIT_CLIENT_ID;

  if (!clientId) {
      console.error("Fitbit OAuth configuration is missing. Required: NEXT_PUBLIC_FITBIT_CLIENT_ID.");
      return NextResponse.json({ error: 'Server configuration error for Fitbit OAuth.' }, { status: 500 });
  }

  // [2025-06-28] COMMENT: The 'x-forwarded-proto' header is checked to correctly determine the protocol (http vs https) when the app is behind a proxy.
  const protocol = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  // [2025-06-28] COMMENT: The 'host' header provides the domain name of the application.
  const host = request.headers.get('host');

  if (!host) {
      // [2025-06-28] COMMENT: This error is triggered if the host header is missing, which is essential for creating the dynamic URL.
      console.error("[Fitbit Connect] Cannot determine host from request headers.");
      return NextResponse.json({ error: 'Internal server error: could not determine host.' }, { status: 500 });
  }

  // [2025-06-28] COMMENT: Dynamically construct the application's base URL from the protocol and host.
  const appUrl = `${protocol}://${host}`;
  // [2025-06-28] COMMENT: Dynamically construct the full redirect URI that will be sent to Fitbit.
  const redirectUri = `${appUrl}/api/auth/fitbit/callback`;
  
  // [2025-06-28] COMMENT: The previous hardcoded redirect URI is now commented out in favor of dynamic generation.
  // const redirectUri = `https://9003-firebase-studio-1747406301563.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev/api/auth/fitbit/callback`;
  
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
