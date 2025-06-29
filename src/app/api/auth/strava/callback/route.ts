
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
// [2025-06-29] COMMENT: Updated to use the new Firestore-based token setter.
import { setStravaTokens } from '@/lib/strava-auth-utils';
// [2025-06-29] COMMENT: Added imports for user authentication and Firestore access.
import { getFirebaseUserFromCookie, adminDb } from '@/lib/firebase/serverApp';
import admin from 'firebase-admin';

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

// [2025-06-29] COMMENT: New helper function to update the user's profile with the new Strava connection.
async function addStravaConnectionToProfile(userId: string) {
    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
        throw new Error("User profile not found in Firestore.");
    }
    const userProfile = userSnap.data();
    const currentConnections = userProfile?.connectedFitnessApps || [];
    
    if (!currentConnections.some((conn: any) => conn.id === 'strava')) {
        await userRef.update({ 
            connectedFitnessApps: admin.firestore.FieldValue.arrayUnion({
                id: 'strava',
                name: 'Strava',
                connectedAt: new Date().toISOString()
            }) 
        });
        console.log(`[Strava Callback] Added 'strava' to user ${userId} profile.`);
    }
}


export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // [2025-06-29] COMMENT: Commenting out dynamic URL generation for consistency.
  /*
  // Dynamically determine the app URL from request headers for robust proxy support
  const protocol = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const host = request.headers.get('host');

  if (!host) {
      console.error("[Strava Callback] Cannot determine host from headers.");
      return NextResponse.redirect('/profile?strava_error=internal_server_error');
  }

  const appUrl = `${protocol}://${host}`;
  const profileUrl = `${appUrl}/profile`;
  const redirectUri = `${appUrl}/api/auth/strava/callback`; // Define redirectUri for the token exchange
  */

  // [2025-06-29] COMMENT: New hardcoded URLs to prevent mismatch errors.
  const profileUrl = `https://9003-firebase-studio-1747406301563.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev/profile`;

  const cookieStore = cookies();
  const storedState = cookieStore.get('strava_oauth_state')?.value;
  cookieStore.delete('strava_oauth_state'); // Clean up state cookie

  if (error) {
    console.error('[Strava Callback] Error from Strava:', error);
    return NextResponse.redirect(`${profileUrl}?strava_error=${encodeURIComponent(error)}`);
  }

  if (!state || state !== storedState) {
    console.error('[Strava Callback] Invalid OAuth state. Stored:', storedState, 'Received:', state);
    return NextResponse.redirect(`${profileUrl}?strava_error=invalid_state`);
  }

  if (!code) {
    console.error('[Strava Callback] No authorization code received from Strava.');
    return NextResponse.redirect(`${profileUrl}?strava_error=missing_code`);
  }

  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[Strava Callback] Strava client ID or secret is not configured.');
    return NextResponse.redirect(`${profileUrl}?strava_error=server_config_error`);
  }

  try {
    console.log('[Strava Callback] Exchanging code for tokens...');
    const response = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        // [2025-06-29] COMMENT: Strava does not require redirect_uri in the token exchange request, so it's omitted.
        // Note: Strava does not require redirect_uri in the token exchange request
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Strava Callback] Failed to exchange code for tokens:', data);
      const errorMessage = data.message || 'token_exchange_failed';
      return NextResponse.redirect(`${profileUrl}?strava_error=${encodeURIComponent(errorMessage)}`);
    }

    console.log('[Strava Callback] Tokens received from Strava:', { access_token_present: !!data.access_token, refresh_token_present: !!data.refresh_token, expires_at: data.expires_at });
    
    if (!data.access_token || !data.refresh_token || !data.expires_at) {
        console.error('[Strava Callback] Incomplete token data received from Strava:', data);
        return NextResponse.redirect(`${profileUrl}?strava_error=incomplete_token_data`);
    }

    // [2025-06-29] COMMENT: New logic to get the authenticated user and save tokens to their Firestore document.
    const firebaseUser = await getFirebaseUserFromCookie(cookies());
    if (!firebaseUser) {
        return NextResponse.redirect(`${profileUrl}?strava_error=auth_required`);
    }

    await setStravaTokens(firebaseUser.uid, data.access_token, data.refresh_token, data.expires_at);
    console.log('[Strava Callback] Strava tokens stored successfully for user:', firebaseUser.uid);
    
    // [2025-06-29] COMMENT: New step to add the connection to the user's profile for the UI to reflect the change.
    await addStravaConnectionToProfile(firebaseUser.uid);
    
    return NextResponse.redirect(`${profileUrl}?strava_connected=true`);

  } catch (err: any) {
    console.error('[Strava Callback] Exception during token exchange:', err);
    return NextResponse.redirect(`${profileUrl}?strava_error=${encodeURIComponent(err.message || 'unknown_exception')}`);
  }
}
