
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { setFitbitTokens } from '@/lib/fitbit-auth-utils';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase/serverApp';
import { getFirebaseUserFromCookie } from '@/lib/firebase/serverApp';

async function addFitbitConnectionToProfile(userId: string) {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
        throw new Error("User profile not found in Firestore.");
    }
    const userProfile = userSnap.data();
    const currentConnections = userProfile.connectedFitnessApps || [];
    
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

  // [2024-08-01] COMMENT: The original hardcoded appUrl was not flexible for different environments.
  // const appUrl = 'http://localhost:9004';
  // const profileUrl = `${appUrl}/profile`;
  // const redirectUri = `${appUrl}/api/auth/fitbit/callback`;
  
  // [2024-08-01] COMMENT: The previous dynamic URL generation using headers was unreliable and is now commented out.
  /*
  // [2024-08-01] COMMENT: Dynamically determine the app URL from request headers for robust proxy support.
  const protocol = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  // [2024-08-01] COMMENT: Dynamically determine the app URL from request headers for robust proxy support.
  const host = request.headers.get('host');

  // [2024-08-01] COMMENT: New check to ensure the host header is present before proceeding.
  if (!host) {
      console.error("Fitbit callback failed: could not determine host from request headers.");
      return NextResponse.redirect('/profile?fitbit_error=internal_server_error_no_host');
  }
  */

  // [2024-08-01] COMMENT: The previous dynamic URL generation using headers was unreliable.
  // [2024-08-01] COMMENT: This new approach uses `request.nextUrl` to construct the base URL, which is a more stable method within Next.js route handlers.
  const appUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const profileUrl = `${appUrl}/profile`;
  const redirectUri = `${appUrl}/api/auth/fitbit/callback`;
  
  const cookieStore = cookies();
  const storedState = cookieStore.get('fitbit_oauth_state')?.value;
  cookieStore.delete('fitbit_oauth_state'); // Always clean up the state cookie

  if (error) {
    console.error('[Fitbit Callback] Error from Fitbit:', error);
    return NextResponse.redirect(`${profileUrl}?fitbit_error=${encodeURIComponent(error)}`);
  }

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
  
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
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

    // Since this is a server route, we need to get the user from their session cookie
    const firebaseUser = await getFirebaseUserFromCookie(cookies());
    if (!firebaseUser) {
        // This can happen if the user's session expires during the OAuth flow.
        return NextResponse.redirect(`${profileUrl}?fitbit_error=auth_required`);
    }

    // Now we have the user's UID, we can save their tokens securely
    await setFitbitTokens(firebaseUser.uid, data.access_token, data.refresh_token, data.expires_in);
    
    // Also, update their profile to show the connection
    await addFitbitConnectionToProfile(firebaseUser.uid);
    
    // Redirect to the profile page with a success indicator
    return NextResponse.redirect(`${profileUrl}?fitbit_connected=true`);

  } catch (err: any) {
    console.error('[Fitbit Callback] Exception during token exchange:', err.message);
    return NextResponse.redirect(`${profileUrl}?fitbit_error=${encodeURIComponent(err.message || 'unknown_exception')}`);
  }
}
