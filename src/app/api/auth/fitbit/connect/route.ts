
import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_FITBIT_CLIENT_ID;

  // [2024-08-01] COMMENT: The environment variable approach for the app URL is commented out to test if dynamic headers resolve a proxy issue.
  // const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  
  // [2024-08-01] ADD: Reverting to dynamic URL construction from request headers.
  const protocol = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const host = request.headers.get('host');

  // [2024-08-01] UPDATE: The check now validates the dynamic host instead of the environment variable.
  if (!clientId || !host) {
    // [2024-08-01] COMMENT: Commenting out the old check for the environment variable.
    // console.error("Fitbit OAuth configuration is missing (connect route). Required: NEXT_PUBLIC_FITBIT_CLIENT_ID, NEXT_PUBLIC_APP_URL.");
    // [2024-08-01] ADD: Adding new error message for the dynamic host requirement.
    console.error("Fitbit OAuth configuration is missing (connect route). Required: NEXT_PUBLIC_FITBIT_CLIENT_ID and a valid host header.");
    return NextResponse.json({ error: 'Server configuration error for Fitbit OAuth.' }, { status: 500 });
  }
  
  // [2024-08-01] ADD: Constructing the app URL dynamically from headers.
  const appUrl = `${protocol}://${host}`;
  // [2024-08-01] UPDATE: Construct the redirect URI from the dynamically generated appUrl.
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
