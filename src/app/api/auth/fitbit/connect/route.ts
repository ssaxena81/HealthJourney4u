import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_FITBIT_CLIENT_ID;

  // [2024-08-01] COMMENT: The hardcoded redirect_uri is not flexible for different environments.
  // const redirectUri = 'http://localhost:9004/api/auth/fitbit/callback';

  // [2024-08-01] COMMENT: Dynamically determine the app URL from request headers for robust proxy support.
  const protocol = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  // [2024-08-01] COMMENT: Dynamically determine the app URL from request headers for robust proxy support.
  const host = request.headers.get('host');

  // [2024-08-01] COMMENT: The previous check did not account for a missing host header.
  /*
  if (!clientId) {
    console.error("Fitbit OAuth configuration is missing. Required: NEXT_PUBLIC_FITBIT_CLIENT_ID");
    return NextResponse.json({ error: 'Server configuration error for Fitbit OAuth.' }, { status: 500 });
  }
  */

  // [2024-08-01] COMMENT: New check includes the host, which is required for the dynamic redirect URI.
  if (!clientId || !host) {
      console.error("Fitbit OAuth configuration is missing or host could not be determined. Required: NEXT_PUBLIC_FITBIT_CLIENT_ID, host header.");
      return NextResponse.json({ error: 'Server configuration error for Fitbit OAuth.' }, { status: 500 });
  }

  // [2024-08-01] COMMENT: New appUrl and redirectUri are built dynamically.
  const appUrl = `${protocol}://${host}`;
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
