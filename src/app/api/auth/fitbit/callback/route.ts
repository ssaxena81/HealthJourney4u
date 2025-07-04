
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { setFitbitTokens } from '@/lib/fitbit-auth-utils';
import { adminDb } from '@/lib/firebase/serverApp';
import { getFirebaseUserFromCookie } from '@/lib/firebase/serverApp';
import admin from 'firebase-admin';
import type { UserProfile } from '@/types';

async function addFitbitConnectionToProfile(userId: string) {
    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
        throw new Error("User profile not found in Firestore.");
    }
    const userProfile = userSnap.data() as UserProfile;
    
    // Defensively filter out any existing connections for this service to prevent duplicates
    const otherConnections = (userProfile.connectedFitnessApps || []).filter(conn => conn.id !== 'fitbit');

    const newConnection = {
        id: 'fitbit',
        name: 'Fitbit',
        connectedAt: new Date().toISOString()
    };
    
    // Create the final, clean array of connections
    const updatedConnections = [...otherConnections, newConnection];
    
    await userRef.update({ 
        connectedFitnessApps: updatedConnections
    });
    console.log(`[Fitbit Callback] Ensured 'fitbit' is connected for user ${userId}.`);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  
  // [2025-06-28] COMMENT: Using a hardcoded URL with the correct public-facing path as defined in next.config.js rewrites.
  // [2025-06-28] COMMENT: This ensures consistency between the connect and callback steps, preventing mismatch errors.
  const redirectUri = `https://9003-firebase-studio-1747406301563.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev/api/auth/fitbit/callback`;
  const profileUrl = `https://9003-firebase-studio-1747406301563.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev/profile`;

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

    const firebaseUser = await getFirebaseUserFromCookie(cookies());
    if (!firebaseUser) {
        return NextResponse.redirect(`${profileUrl}?fitbit_error=auth_required`);
    }

    await setFitbitTokens(firebaseUser.uid, data.access_token, data.refresh_token, data.expires_in);
    
    await addFitbitConnectionToProfile(firebaseUser.uid);
    
    return NextResponse.redirect(`${profileUrl}?fitbit_connected=true`);

  } catch (err: any) {
    console.error('[Fitbit Callback] Exception during token exchange:', err.message);
    return NextResponse.redirect(`${profileUrl}?fitbit_error=${encodeURIComponent(err.message || 'unknown_exception')}`);
  }
}
