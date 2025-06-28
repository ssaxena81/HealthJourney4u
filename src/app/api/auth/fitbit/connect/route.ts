import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_FITBIT_CLIENT_ID;

  if (!clientId) {
      console.error("Fitbit OAuth configuration is missing. Required: NEXT_PUBLIC_FITBIT_CLIENT_ID.");
      return NextResponse.json({ error: 'Server configuration error for Fitbit OAuth.' }, { status: 500 });
  }

  // [2024-08-07] COMMENT: Hardcoding the redirect URI to a specific known-good value to ensure it matches the Fitbit developer console exactly.
  const redirectUri = `https://9003-firebase-studio-1747406301563.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev/api/auth/fitbit/callback`;
  
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
