
import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_FITBIT_CLIENT_ID;

  // [2024-08-01] COMMENT: The dynamic URL construction from headers was unreliable and is being removed.
  // const protocol = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  // const host = request.headers.get('host');

  // [2024-08-01] ADD: Use a single, reliable environment variable for the application's base URL.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  // [2024-08-01] UPDATE: The check now validates NEXT_PUBLIC_APP_URL instead of the dynamic host.
  if (!clientId || !appUrl) {
    // [2024-08-01] UPDATE: The error message is updated to reflect the new required environment variable.
    console.error("Fitbit OAuth configuration is missing (connect route). Required: NEXT_PUBLIC_FITBIT_CLIENT_ID, NEXT_PUBLIC_APP_URL.");
    return NextResponse.json({ error: 'Server configuration error for Fitbit OAuth.' }, { status: 500 });
  }
  
  // [2024-08-01] COMMENT: The old dynamic appUrl is commented out.
  // const appUrl = `${protocol}://${host}`;
  // [2024-08-01] UPDATE: Construct the redirect URI from the reliable environment variable. This is the fix for the `invalid_redirect_uri` error.
  const redirectUri = `${appUrl}/api/auth/fitbit/callback`;
  const state = randomBytes(16).toString('hex');
  
  const scopes = [
    'activity', 'heartrate', 'location', 'nutrition',
    'profile', 'settings', 'sleep', 'social', 'weight'
  ].join(' ');
  
  const fitbitAuthUrl = new URL('https://www.fitbit.com/oauth2/authorize');
  fitbitAuthUrl.searchParams.append('response_type', 'code');
  fitbitAuthUrl.searchParams.append('client_id', clientId);
  fitbitAuthUrl.searchParams.append('redirect_uri', redirectUri);
  fitbitAuthUrl.searchParams.append('scope', scopes);
  fitbitAuthUrl.searchParams.append('state', state);

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
