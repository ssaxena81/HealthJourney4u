import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { setFitbitTokens } from '@/lib/fitbit-auth-utils';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase/serverApp';
import { getFirebaseUserFromCookie } from '@/lib/firebase/serverApp';

async function addFitbitConnectionToProfile(userId: string) {
    // [2025-06-28] COMMENT: This function updates the user's profile in Firestore to mark Fitbit as connected.
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
        throw new Error("User profile not found in Firestore.");
    }
    const userProfile = userSnap.data();
    const currentConnections = userProfile.connectedFitnessApps || [];
    
    // [2025-06-28] COMMENT: This check prevents adding a duplicate entry if the user reconnects.
    if (!currentConnections.some((conn: any) => conn.id === 'fitbit')) {
        await updateDoc(userRef, { 
            connectedFitnessApps: arrayUnion({
                id: 'fitbit',
                name: 'Fitbit',
                connectedAt: new Date().toISOString()
            }) 
        });
    }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  
  // [2025-06-28] COMMENT: The 'x-forwarded-proto' header is checked to correctly determine the protocol (http vs https) when the app is behind a proxy.
  const protocol = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  // [2025-06-28] COMMENT: The 'host' header provides the domain name of the application.
  const host = request.headers.get('host');
  
  if (!host) {
      // [2025-06-28] COMMENT: This error is triggered if the host header is missing, which is essential for creating the dynamic URL.
      console.error("[Fitbit Callback] Cannot determine host from request headers.");
      // [2025-06-28] COMMENT: Redirect to a generic error page on the root if the host is unknown.
      return NextResponse.redirect('/?fitbit_error=internal_server_error');
  }

  // [2025-06-28] COMMENT: Dynamically construct the application's base URL from the protocol and host.
  const appUrl = `${protocol}://${host}`;
  // [2025-06-28] COMMENT: Dynamically construct the redirect URI needed for the Fitbit token exchange. This must exactly match what was sent in the connect step.
  const redirectUri = `${appUrl}/api/auth/fitbit/callback`;
  // [2025-06-28] COMMENT: Dynamically construct the URL to redirect the user back to their profile page after the flow completes.
  const profileUrl = `${appUrl}/profile`;
  
  // [2025-06-28] COMMENT: The previous hardcoded URLs are now commented out in favor of dynamic generation.
  // const redirectUri = `https://9003-firebase-studio-1747406301563.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev/api/auth/fitbit/callback`;
  // const profileUrl = `https://9003-firebase-studio-1747406301563.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev/profile`;
  
  const cookieStore = cookies();
  const storedState = cookieStore.get('fitbit_oauth_state')?.value;
  // [2025-06-28] COMMENT: The state cookie is deleted immediately after being read for security purposes.
  cookieStore.delete('fitbit_oauth_state'); // Always clean up the state cookie

  if (error) {
    console.error('[Fitbit Callback] Error from Fitbit:', error);
    return NextResponse.redirect(`${profileUrl}?fitbit_error=${encodeURIComponent(error)}`);
  }

  // [2025-06-28] COMMENT: This is a critical security check to prevent CSRF attacks. The state from Fitbit must match the state stored in the cookie.
  if (!state || state !== storedState) {
    return NextResponse.redirect(`${profileUrl}?fitbit_error=invalid_state`);
  }

  if (!code) {
    return NextResponse.redirect(`${profileUrl}?fitbit_error=missing_code`);
  }

  const clientId = process.env.NEXT_PUBLIC_FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${profileUrl}?fitbit_error=server_config_error`);
  }
  
  // [2025-06-28] COMMENT: The client ID and secret are base64 encoded as required by the Fitbit API for the token exchange.
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    // [2025-06-28] COMMENT: This fetch call exchanges the authorization code received from Fitbit for an access token and refresh token.
    const response = await fetch('https://api.fitbit.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        clientId: clientId,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri, 
        code: code,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.errors?.[0]?.message || 'token_exchange_failed';
      return NextResponse.redirect(`${profileUrl}?fitbit_error=${encodeURIComponent(errorMessage)}`);
    }

    if (!data.access_token || !data.refresh_token || !data.expires_in) {
        return NextResponse.redirect(`${profileUrl}?fitbit_error=incomplete_token_data`);
    }

    // [2025-06-28] COMMENT: Since this is a server route, the user's identity is verified from their session cookie.
    const firebaseUser = await getFirebaseUserFromCookie(cookies());
    if (!firebaseUser) {
        // [2025-06-28] COMMENT: This can happen if the user's session expires during the OAuth flow.
        return NextResponse.redirect(`${profileUrl}?fitbit_error=auth_required`);
    }

    // [2025-06-28] COMMENT: The new tokens are saved securely to the user's document in Firestore.
    await setFitbitTokens(firebaseUser.uid, data.access_token, data.refresh_token, data.expires_in);
    
    // [2025-06-28] COMMENT: Update the user's profile to reflect that Fitbit is now connected.
    await addFitbitConnectionToProfile(firebaseUser.uid);
    
    // [2025-06-28] COMMENT: Redirect the user back to their profile page with a success indicator in the URL.
    return NextResponse.redirect(`${profileUrl}?fitbit_connected=true`);

  } catch (err: any) {
    console.error('[Fitbit Callback] Exception during token exchange:', err.message);
    return NextResponse.redirect(`${profileUrl}?fitbit_error=${encodeURIComponent(err.message || 'unknown_exception')}`);
  }
}
