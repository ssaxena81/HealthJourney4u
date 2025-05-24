
'use server';

import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import type { UserProfile, SubscriptionTier, StravaActivityFirestore, StravaApiCallStats } from '@/types';
import { getStravaActivities, type StravaActivity } from '@/lib/services/stravaService';
import { getValidStravaAccessToken, clearStravaTokens } from '@/lib/strava-auth-utils';
import { isSameDay, startOfDay } from 'date-fns';

interface FetchStravaDataResult {
  success: boolean;
  message?: string;
  activitiesProcessed?: number;
  errorCode?: string;
}

function getRateLimitConfigStrava(
  tier: SubscriptionTier
): { limit: number; periodHours: number } {
  // Using the same rate limits as Fitbit for consistency, can be adjusted
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

export async function fetchAndStoreStravaRecentActivities(
  params?: { before?: number; after?: number; page?: number; per_page?: number }
): Promise<FetchStravaDataResult> {
  console.log('[StravaActions] Initiating fetchAndStoreStravaRecentActivities with params:', params);

  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) {
    console.error('[StravaActions] User not authenticated for fetchAndStoreStravaRecentActivities.');
    return { success: false, message: 'User not authenticated.', errorCode: 'AUTH_REQUIRED' };
  }
  const userId = currentUser.uid;

  if (!db || !db.app) {
    console.error('[StravaActions] Firestore not initialized for fetchAndStoreStravaRecentActivities. DB App:', db?.app);
    return { success: false, message: 'Database service unavailable.', errorCode: 'DB_UNAVAILABLE' };
  }

  try {
    const userProfileDocRef = doc(db, 'users', userId);
    const userProfileSnap = await getDoc(userProfileDocRef);

    if (!userProfileSnap.exists()) {
      console.error(`[StravaActions] User profile not found for UID: ${userId} in fetchAndStoreStravaRecentActivities.`);
      return { success: false, message: 'User profile not found.', errorCode: 'PROFILE_NOT_FOUND' };
    }
    const userProfile = userProfileSnap.data() as UserProfile;

    if (!userProfile.connectedFitnessApps?.some(app => app.id === 'strava')) {
      console.log(`[StravaActions] Strava not connected for user: ${userId}.`);
      return { success: false, message: 'Strava not connected. Please connect Strava in your profile.', errorCode: 'STRAVA_NOT_CONNECTED' };
    }

    const rateLimitConfig = getRateLimitConfigStrava(userProfile.subscriptionTier);
    const stats = userProfile.stravaApiCallStats?.activities;
    const now = new Date();
    const todayStart = startOfDay(now);
    let callCountToday = stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) ? stats.callCountToday || 0 : 0;

    if (stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart)) {
      if (callCountToday >= rateLimitConfig.limit) {
        console.warn(`[StravaActions] Strava activities rate limit exceeded for user ${userId}. Tier: ${userProfile.subscriptionTier}, Count: ${callCountToday}, Limit: ${rateLimitConfig.limit}`);
        return { success: false, message: `API call limit for Strava activities reached for your tier (${rateLimitConfig.limit} per ${rateLimitConfig.periodHours} hours). Try again later.`, errorCode: 'RATE_LIMIT_EXCEEDED' };
      }
    } else {
      callCountToday = 0; // Reset for a new day
    }

    const accessToken = await getValidStravaAccessToken();
    if (!accessToken) {
      console.error('[StravaActions] Failed to obtain valid Strava access token for user:', userId);
      return { success: false, message: 'Could not connect to Strava. Your session might have expired. Please try reconnecting Strava in your profile settings.', errorCode: 'STRAVA_AUTH_ERROR' };
    }

    let stravaActivities: StravaActivity[];
    try {
      stravaActivities = await getStravaActivities(accessToken, params);
      if (!stravaActivities || stravaActivities.length === 0) {
        console.log(`[StravaActions] No new activities found from Strava for user ${userId} with current params.`);
        // Update API call stats even if no new activities, as an API call was made.
        callCountToday++;
        const updatedStats: StravaApiCallStats = {
          ...userProfile.stravaApiCallStats,
          activities: {
            lastCalledAt: now.toISOString(),
            callCountToday: callCountToday,
          },
        };
        await updateDoc(userProfileDocRef, { stravaApiCallStats: updatedStats });
        console.log(`[StravaActions] Updated Strava activities API call stats for user ${userId}.`);
        return { success: true, message: 'Successfully connected to Strava. No new activities found with the given parameters.', activitiesProcessed: 0 };
      }
    } catch (error: any) {
      console.error(`[StravaActions] Error calling stravaService.getStravaActivities for user ${userId}:`, error);
      if (error.status === 401) { // Strava API unauthorized
        await clearStravaTokens(); // Clear potentially invalid tokens
        return { success: false, message: 'Strava authentication error. Your Strava session may have expired. Please reconnect Strava in your profile settings.', errorCode: 'STRAVA_AUTH_EXPIRED_POST_REFRESH' };
      }
      return { success: false, message: `Failed to fetch activities from Strava: ${error.message}`, errorCode: 'STRAVA_API_ERROR' };
    }

    const relevantActivityTypes = ['Walk', 'Run', 'Hike', 'Swim'];
    const processedActivities: StravaActivityFirestore[] = [];
    let activitiesStoredCount = 0;

    for (const activity of stravaActivities) {
      if (relevantActivityTypes.includes(activity.type)) {
        const firestoreData: StravaActivityFirestore = {
          id: activity.id,
          type: activity.type,
          name: activity.name,
          distance: activity.distance,
          movingTime: activity.moving_time,
          elapsedTime: activity.elapsed_time,
          totalElevationGain: activity.total_elevation_gain,
          startDate: activity.start_date, // UTC
          startDateLocal: activity.start_date_local,
          timezone: activity.timezone,
          mapPolyline: activity.map?.summary_polyline || undefined,
          averageSpeed: activity.average_speed,
          maxSpeed: activity.max_speed,
          averageHeartrate: activity.average_heartrate,
          maxHeartrate: activity.max_heartrate,
          calories: activity.calories,
          lastFetched: new Date().toISOString(),
          dataSource: 'strava',
        };
        processedActivities.push(firestoreData);

        const activityDocRef = doc(db, 'users', userId, 'strava_activities', String(activity.id));
        await setDoc(activityDocRef, firestoreData, { merge: true }); // Use merge to update if exists, or create if new
        activitiesStoredCount++;
        console.log(`[StravaActions] Strava activity ${activity.id} (${activity.type}) stored/updated for user ${userId}.`);
      }
    }

    callCountToday++;
    const updatedStats: StravaApiCallStats = {
      ...userProfile.stravaApiCallStats,
      activities: {
        lastCalledAt: now.toISOString(),
        callCountToday: callCountToday,
      },
    };
    await updateDoc(userProfileDocRef, { stravaApiCallStats: updatedStats });
    console.log(`[StravaActions] Updated Strava activities API call stats for user ${userId}.`);

    return { 
      success: true, 
      message: `Successfully fetched and stored/updated ${activitiesStoredCount} relevant Strava activities. Total activities received: ${stravaActivities.length}.`, 
      activitiesProcessed: activitiesStoredCount 
    };

  } catch (error: any) {
    console.error(`[StravaActions] Unhandled error in fetchAndStoreStravaRecentActivities for user ${userId}:`, error);
    const errorMessage = error.message || 'An unexpected server error occurred while fetching Strava activities.';
    const errorCode = error.code || 'UNEXPECTED_SERVER_ERROR';
    return { success: false, message: errorMessage, errorCode: errorCode };
  }
}

    