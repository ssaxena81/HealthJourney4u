
import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_FITBIT_CLIENT_ID;

  // [2024-08-02] COMMENT: The original hardcoded redirect_uri was not flexible for different environments.
  // const redirectUri = 'http://localhost:9004/api/auth/fitbit/callback';
  
  // [2024-08-02] COMMENT: The previous dynamic URL generation using headers was unreliable and is now commented out.
  /*
  // [2024-08-01] COMMENT: Dynamically determine the app URL from request headers for robust proxy support.
  const protocol = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  // [2024-08-01] COMMENT: Dynamically determine the app URL from request headers for robust proxy support.
  const host = request.headers.get('host');
  */

  // [2024-08-02] COMMENT: The previous check did not account for a missing host header.
  /*
  if (!clientId) {
    console.error("Fitbit OAuth configuration is missing. Required: NEXT_PUBLIC_FITBIT_CLIENT_ID");
    return NextResponse.json({ error: 'Server configuration error for Fitbit OAuth.' }, { status: 500 });
  }
  */

  // [2024-08-02] COMMENT: New check includes the host, which is required for the dynamic redirect URI.
  // [2024-08-02] COMMENT: This check is simplified as `request.nextUrl.host` will be used instead.
  if (!clientId) {
      console.error("Fitbit OAuth configuration is missing. Required: NEXT_PUBLIC_FITBIT_CLIENT_ID.");
      return NextResponse.json({ error: 'Server configuration error for Fitbit OAuth.' }, { status: 500 });
  }

  // [2024-08-02] COMMENT: The previous dynamic URL generation using `request.nextUrl` was unreliable in some proxy environments. It is now commented out.
  // const appUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  // [2024-08-02] COMMENT: Create a more robust dynamic URL by prioritizing proxy headers (`x-forwarded-*`) before falling back to the `request.nextUrl` object. This ensures the correct public-facing URL is used.
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol;
  const host = request.headers.get("x-forwarded-host") ?? request.nextUrl.host;
  const appUrl = `${protocol}://${host}`;
  const redirectUri = `${appUrl}/api/auth/fitbit/callback`;
  
  // [2024-08-02] COMMENT: Add a debugger statement to pause execution here when dev tools are open.
  debugger;

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
