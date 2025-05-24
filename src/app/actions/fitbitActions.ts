
'use server';

import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import type { UserProfile, SubscriptionTier, FitbitActivitySummaryFirestore } from '@/types';
import * from '@/lib/services/fitbitService'; // Assuming fitbitService exports getDailyActivitySummary
import { getValidFitbitAccessToken, clearFitbitTokens } from '@/lib/fitbit-auth-utils';
import { isSameDay, startOfDay } from 'date-fns';

interface FetchFitbitActivityResult {
  success: boolean;
  message?: string;
  data?: FitbitActivitySummaryFirestore;
  errorCode?: string;
}

function getRateLimitConfig(tier: SubscriptionTier): { limit: number; periodHours: number } {
  switch (tier) {
    case 'platinum':
      return { limit: 3, periodHours: 24 };
    case 'free':
    case 'silver':
    case 'gold':
    default:
      return { limit: 1, periodHours: 24 };
  }
}

export async function fetchAndStoreFitbitDailyActivity(
  targetDate: string // YYYY-MM-DD format
): Promise<FetchFitbitActivityResult> {
  console.log(`[FitbitActions] Initiating fetchAndStoreFitbitDailyActivity for date: ${targetDate}`);

  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) {
    console.error('[FitbitActions] User not authenticated.');
    return { success: false, message: 'User not authenticated.', errorCode: 'AUTH_REQUIRED' };
  }
  const userId = currentUser.uid;

  if (!db) {
    console.error('[FitbitActions] Firestore not initialized.');
    return { success: false, message: 'Database service unavailable.', errorCode: 'DB_UNAVAILABLE' };
  }

  try {
    // 1. Get User Profile for tier and stats
    const userProfileDocRef = doc(db, 'users', userId);
    const userProfileSnap = await getDoc(userProfileDocRef);

    if (!userProfileSnap.exists()) {
      console.error(`[FitbitActions] User profile not found for UID: ${userId}.`);
      return { success: false, message: 'User profile not found.', errorCode: 'PROFILE_NOT_FOUND' };
    }
    const userProfile = userProfileSnap.data() as UserProfile;

    // Check if Fitbit is connected
    if (!userProfile.connectedFitnessApps?.some(app => app.id === 'fitbit')) {
        console.log(`[FitbitActions] Fitbit not connected for user: ${userId}`);
        return { success: false, message: 'Fitbit not connected. Please connect Fitbit in your profile.', errorCode: 'FITBIT_NOT_CONNECTED'};
    }

    // 2. Rate Limiting Check
    const rateLimitConfig = getRateLimitConfig(userProfile.subscriptionTier);
    const stats = userProfile.fitbitApiCallStats?.dailyActivitySummary;
    const now = new Date();
    const todayStart = startOfDay(now);

    let callCountToday = stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) ? stats.callCountToday || 0 : 0;

    if (stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart)) {
      if (callCountToday >= rateLimitConfig.limit) {
        console.warn(`[FitbitActions] Rate limit exceeded for user ${userId}. Tier: ${userProfile.subscriptionTier}, Count: ${callCountToday}, Limit: ${rateLimitConfig.limit}`);
        return { success: false, message: `API call limit for daily activity summary reached for your tier (${rateLimitConfig.limit} per ${rateLimitConfig.periodHours} hours). Try again later.`, errorCode: 'RATE_LIMIT_EXCEEDED' };
      }
    } else {
      // Reset count if it's a new day or no previous calls
      callCountToday = 0;
    }

    // 3. Token Management (Get valid access token, refresh if needed)
    console.log('[FitbitActions] Attempting to get valid Fitbit access token...');
    const accessToken = await getValidFitbitAccessToken();

    if (!accessToken) {
      console.error('[FitbitActions] Failed to obtain valid Fitbit access token for user:', userId);
      // If token refresh fails and returns null, it might mean re-authentication is needed.
      // The `getValidFitbitAccessToken` handles logging, but we might want to clear tokens if refresh fails.
      // Consider calling clearFitbitTokens() here IF refreshFitbitTokens signals an irrecoverable refresh token.
      // For now, we assume getValidFitbitAccessToken has logged the issue.
      // We should also ensure `finalizeFitbitConnection` is robust if tokens are cleared.
      return { success: false, message: 'Could not connect to Fitbit. Your session might have expired. Please try reconnecting Fitbit in your profile settings.', errorCode: 'FITBIT_AUTH_ERROR' };
    }
    console.log('[FitbitActions] Successfully obtained Fitbit access token.');

    // 4. Call Fitbit Service
    console.log(`[FitbitActions] Calling Fitbit service for daily activity summary. Date: ${targetDate}`);
    let fitbitData;
    try {
        fitbitData = await getDailyActivitySummary(accessToken, targetDate);
         if (!fitbitData || !fitbitData.summary) {
            console.error('[FitbitActions] Fitbit API returned no summary data or unexpected format for date:', targetDate);
            return { success: false, message: `No activity data found from Fitbit for ${targetDate}.`, errorCode: 'FITBIT_NO_DATA' };
        }
    } catch (error: any) {
        console.error(`[FitbitActions] Error calling fitbitService.getDailyActivitySummary for user ${userId}, date ${targetDate}:`, error);
        if (error.message?.includes('401') || error.message?.toLowerCase().includes('unauthorized')) {
            // This suggests the token became invalid even after potential refresh, or refresh failed.
            // Clear tokens to prompt re-authentication.
            await clearFitbitTokens(); 
            return { success: false, message: 'Fitbit authentication error. Please reconnect Fitbit in your profile settings.', errorCode: 'FITBIT_AUTH_EXPIRED_POST_REFRESH' };
        }
        return { success: false, message: `Failed to fetch data from Fitbit: ${error.message}`, errorCode: 'FITBIT_API_ERROR' };
    }
    
    console.log(`[FitbitActions] Successfully fetched data from Fitbit for user ${userId}, date ${targetDate}.`);

    // 5. Store Data in Firestore
    const summary = fitbitData.summary;
    const firestoreData: FitbitActivitySummaryFirestore = {
      date: targetDate, // Storing as YYYY-MM-DD
      steps: summary.steps,
      distance: summary.distance, // Ensure fitbitService normalizes unit or store unit here
      caloriesOut: summary.caloriesOut,
      activeMinutes: (summary.fairlyActiveMinutes || 0) + (summary.veryActiveMinutes || 0),
      lastFetched: new Date().toISOString(),
      dataSource: 'fitbit',
    };

    const activityDocRef = doc(db, 'users', userId, 'fitbit_activity_summaries', targetDate);
    await setDoc(activityDocRef, firestoreData);
    console.log(`[FitbitActions] Fitbit activity summary stored in Firestore for user ${userId}, date ${targetDate}.`);

    // 6. Update Rate Limiting Stats in UserProfile
    callCountToday++;
    const updatedStats = {
      ...userProfile.fitbitApiCallStats,
      dailyActivitySummary: {
        lastCalledAt: now.toISOString(),
        callCountToday: callCountToday,
      },
    };
    await updateDoc(userProfileDocRef, { fitbitApiCallStats: updatedStats });
    console.log(`[FitbitActions] Updated API call stats for user ${userId}.`);

    return { success: true, message: 'Successfully fetched and stored Fitbit daily activity.', data: firestoreData };

  } catch (error: any) {
    console.error(`[FitbitActions] Unhandled error in fetchAndStoreFitbitDailyActivity for user ${userId}:`, error);
    // Attempt to clear tokens if it's an auth-related error during the process
    if (error.code?.startsWith('auth/') || error.message?.toLowerCase().includes('permission-denied')) {
        await clearFitbitTokens();
    }
    return { success: false, message: `An unexpected error occurred: ${error.message}`, errorCode: 'UNEXPECTED_SERVER_ERROR' };
  }
}

    