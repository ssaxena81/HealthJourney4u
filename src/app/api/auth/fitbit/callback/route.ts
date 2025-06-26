
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { setFitbitTokens } from '@/lib/fitbit-auth-utils';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase/serverApp';
import { getFirebaseUserFromCookie } from '@/lib/auth/server-auth-utils';

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

  // Dynamically determine the app URL from request headers
  const protocol = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const host = request.headers.get('host');
  if (!host) {
      // This is an unlikely edge case, but good to handle. Redirect to a generic error on the profile page.
      return NextResponse.redirect('/profile?fitbit_error=internal_server_error_no_host');
  }
  const appUrl = `${protocol}://${host}`;
  const profileUrl = `${appUrl}/profile`;
  const redirectUri = `${appUrl}/api/auth/fitbit/callback`; // This must match exactly what was sent in the connect step.

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
        redirect_uri: redirectUri, // Use the dynamically generated redirectUri
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
