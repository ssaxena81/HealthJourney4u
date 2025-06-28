
import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_FITBIT_CLIENT_ID;

  if (!clientId) {
      console.error("Fitbit OAuth configuration is missing. Required: NEXT_PUBLIC_FITBIT_CLIENT_ID.");
      return NextResponse.json({ error: 'Server configuration error for Fitbit OAuth.' }, { status: 500 });
  }

  // [2024-08-05] COMMENT: Create a more robust dynamic URL by prioritizing proxy headers (`x-forwarded-*`) before falling back to the `request.nextUrl` object. This ensures the correct public-facing URL is used.
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol;
  const host = request.headers.get("x-forwarded-host") ?? request.nextUrl.host;
  const appUrl = `${protocol}://${host}`;
  // [2024-08-05] COMMENT: Updated the path to match the Fitbit developer console configuration and the `next.config.js` rewrite rule.
  // const redirectUri = `${appUrl}/api/auth/callback/fitbit`;
  // [2024-08-06] COMMENT: Corrected the redirect URI to match the actual file path and the verified Fitbit developer console setting.
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
