
// [2025-06-29] COMMENT: This is the new callback route, created based on user's diagnosis of the Google error.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { setGoogleFitTokens } from '@/lib/google-fit-auth-utils';
import { getFirebaseUserFromCookie, adminDb } from '@/lib/firebase/serverApp';
import admin from 'firebase-admin';
import type { UserProfile } from '@/types';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number; // seconds
  refresh_token?: string; // Google might not always return a new refresh token
  scope: string;
  token_type: string; // "Bearer"
}

async function addGoogleFitConnectionToProfile(userId: string) {
    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
        throw new Error("User profile not found in Firestore.");
    }
    const userProfile = userSnap.data() as UserProfile;
    
    // Defensively filter out any existing connections for this service to prevent duplicates
    const otherConnections = (userProfile.connectedFitnessApps || []).filter(conn => conn.id !== 'googlefit');

    const newConnection = {
        id: 'googlefit',
        name: 'Google Fit',
        connectedAt: new Date().toISOString()
    };
    
    // Create the final, clean array of connections
    const updatedConnections = [...otherConnections, newConnection];
    
    await userRef.update({ 
        connectedFitnessApps: updatedConnections
    });
    console.log(`[Google Fit Callback] Ensured 'googlefit' is connected for user ${userId}.`);
}


export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // [2025-06-29] COMMENT: This is the single source of truth for the redirect URI.
  // [2025-06-29] COMMENT: It must EXACTLY match what is in your Google Cloud Console and what is sent from the /connect route.
  // [2025-06-29] COMMENT: The original redirect URI is commented out to be replaced with the new one.
  // const redirectUri = `https://9003-firebase-studio-1747406301563.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev/api/auth/googlefit/callback`;
  // [2025-06-29] COMMENT: The redirect URI has been updated to match this new file's path.
  const redirectUri = `https://9003-firebase-studio-1747406301563.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev/api/auth/googlefit/callbackflowName`;
  // [2025-06-29] COMMENT: The profile URL remains the same for redirecting the user back to the UI.
  const profileUrl = `https://9003-firebase-studio-1747406301563.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev/profile`;

  const cookieStore = cookies();
  const storedState = cookieStore.get('google_oauth_state')?.value;
  cookieStore.delete('google_oauth_state'); // Clean up state cookie

  if (error) {
    console.error('[Google Fit Callback] Error from Google OAuth:', error);
    return NextResponse.redirect(`${profileUrl}?googlefit_error=${encodeURIComponent(error)}`);
  }

  if (!state || state !== storedState) {
    console.error('[Google Fit Callback] Invalid OAuth state. Stored:', storedState, 'Received:', state);
    return NextResponse.redirect(`${profileUrl}?googlefit_error=invalid_state`);
  }

  if (!code) {
    console.error('[Google Fit Callback] No authorization code received from Google.');
    return NextResponse.redirect(`${profileUrl}?googlefit_error=missing_code`);
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_FIT_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_FIT_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    console.error('[Google Fit Callback] Google Client ID or Secret is not configured.');
    return NextResponse.redirect(`${profileUrl}?googlefit_error=server_config_error`);
  }

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const data: GoogleTokenResponse | { error: string; error_description?: string } = await response.json();

    if (!response.ok) {
      const errorDetails = data as { error: string; error_description?: string };
      console.error('[Google Fit Callback] Failed to exchange code for tokens with Google:', errorDetails);
      const errorMessage = errorDetails.error_description || errorDetails.error || 'token_exchange_failed';
      return NextResponse.redirect(`${profileUrl}?googlefit_error=${encodeURIComponent(errorMessage)}`);
    }

    const tokenData = data as GoogleTokenResponse;
    if (!tokenData.access_token || !tokenData.refresh_token || !tokenData.expires_in) {
        console.error('[Google Fit Callback] Incomplete token data received from Google:', tokenData);
        return NextResponse.redirect(`${profileUrl}?googlefit_error=incomplete_token_data`);
    }

    const firebaseUser = await getFirebaseUserFromCookie(cookies());
    if (!firebaseUser) {
        return NextResponse.redirect(`${profileUrl}?googlefit_error=auth_required`);
    }

    await setGoogleFitTokens(firebaseUser.uid, tokenData.access_token, tokenData.refresh_token, tokenData.expires_in);
    
    await addGoogleFitConnectionToProfile(firebaseUser.uid);
    
    return NextResponse.redirect(`${profileUrl}?googlefit_connected=true`);

  } catch (err: any) {
    console.error('[Google Fit Callback] Exception during token exchange:', err);
    return NextResponse.redirect(`${profileUrl}?googlefit_error=${encodeURIComponent(err.message || 'unknown_exception')}`);
  }
}
