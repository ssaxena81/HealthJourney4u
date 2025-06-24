
'use server';

import { db } from '@/lib/firebase/serverApp';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import type { UserProfile, SubscriptionTier, StravaApiCallStats, NormalizedActivityFirestore } from '@/types';
import { NormalizedActivityType } from '@/types';
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

function mapStravaTypeToNormalizedType(stravaType: string): NormalizedActivityType {
  const lowerType = stravaType.toLowerCase();
  switch (lowerType) {
    case 'walk':
      return NormalizedActivityType.Walking;
    case 'run':
      return NormalizedActivityType.Running;
    case 'hike':
      return NormalizedActivityType.Hiking;
    case 'swim':
      return NormalizedActivityType.Swimming;
    case 'ride':
    case 'virtualride':
    case 'ebikeride':
      return NormalizedActivityType.Cycling;
    case 'workout':
    case 'weighttraining':
    case 'crosstraining':
    case 'hiit':
    case 'yoga':
    case 'pilates':
      return NormalizedActivityType.Workout;
    default:
      return NormalizedActivityType.Other;
  }
}


export async function fetchAndStoreStravaRecentActivities(
  userId: string,
  params?: { before?: number; after?: number; page?: number; per_page?: number }
): Promise<FetchStravaDataResult> {
  console.log('[StravaActions] Initiating fetchAndStoreStravaRecentActivities with params:', params);

  if (!userId) {
    console.error('[StravaActions] User not authenticated.');
    return { success: false, message: 'User not authenticated.', errorCode: 'AUTH_REQUIRED' };
  }

  try {
    const userProfileDocRef = doc(db, 'users', userId);
    const userProfileSnap = await getDoc(userProfileDocRef);

    if (!userProfileSnap.exists()) {
      console.error(`[StravaActions] User profile not found for UID: ${userId}.`);
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

    if (stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) && callCountToday >= rateLimitConfig.limit) {
      console.warn(`[StravaActions] Strava activities rate limit exceeded for user ${userId}.`);
      return { success: false, message: `API call limit for Strava activities reached.`, errorCode: 'RATE_LIMIT_EXCEEDED' };
    } else if (!stats?.lastCalledAt || !isSameDay(new Date(stats.lastCalledAt), todayStart)) {
      callCountToday = 0;
    }

    const accessToken = await getValidStravaAccessToken();
    if (!accessToken) {
      console.error('[StravaActions] Failed to obtain valid Strava access token for user:', userId);
      return { success: false, message: 'Could not connect to Strava. Session might have expired.', errorCode: 'STRAVA_AUTH_ERROR' };
    }

    let stravaActivities: StravaActivity[];
    try {
      stravaActivities = await getStravaActivities(accessToken, params);
    } catch (error: any) {
      console.error(`[StravaActions] Error calling stravaService.getStravaActivities for user ${userId}:`, error);
      if (error.status === 401) {
        await clearStravaTokens();
        return { success: false, message: 'Strava authentication error. Please reconnect Strava.', errorCode: 'STRAVA_AUTH_EXPIRED_POST_REFRESH' };
      }
      return { success: false, message: `Failed to fetch activities from Strava: ${String(error.message)}`, errorCode: 'STRAVA_API_ERROR' };
    }
    
    callCountToday++;
    const updatedApiCallStats: StravaApiCallStats = {
      ...(userProfile.stravaApiCallStats || {}),
      activities: { lastCalledAt: now.toISOString(), callCountToday },
    };
    await updateDoc(userProfileDocRef, { stravaApiCallStats: updatedApiCallStats });
    console.log(`[StravaActions] Updated Strava activities API call stats for user ${userId}.`);

    if (!stravaActivities || stravaActivities.length === 0) {
      console.log(`[StravaActions] No new activities found from Strava for user ${userId}.`);
      return { success: true, message: 'Successfully connected to Strava. No new activities found.', activitiesProcessed: 0 };
    }
    
    const relevantActivityTypesToNormalize = [
        NormalizedActivityType.Walking, 
        NormalizedActivityType.Running, 
        NormalizedActivityType.Hiking, 
        NormalizedActivityType.Swimming,
        NormalizedActivityType.Cycling,
        NormalizedActivityType.Workout,
    ];
    
    const processedActivities: NormalizedActivityFirestore[] = [];
    let activitiesStoredCount = 0;

    for (const activity of stravaActivities) {
      try {
        const normalizedType = mapStravaTypeToNormalizedType(activity.type);

        if (relevantActivityTypesToNormalize.includes(normalizedType)) {
          const firestoreData: NormalizedActivityFirestore = {
            id: `strava-${activity.id}`,
            userId: userId,
            originalId: String(activity.id),
            dataSource: 'strava',
            type: normalizedType,
            name: activity.name,
            startTimeUtc: activity.start_date,
            startTimeLocal: activity.start_date_local,
            timezone: activity.timezone,
            durationMovingSec: activity.moving_time,
            durationElapsedSec: activity.elapsed_time,
            distanceMeters: activity.distance,
            calories: activity.calories,
            averageHeartRateBpm: activity.average_heartrate,
            maxHeartRateBpm: activity.max_heartrate,
            elevationGainMeters: activity.total_elevation_gain,
            mapPolyline: activity.map?.summary_polyline || undefined,
            date: activity.start_date_local.substring(0, 10),
            lastFetched: new Date().toISOString(),
          };
          processedActivities.push(firestoreData);

          const activityDocRef = doc(db, 'users', userId, 'activities', firestoreData.id);
          await setDoc(activityDocRef, firestoreData, { merge: true });
          activitiesStoredCount++;
        }
      } catch (transformError: any) {
          console.error(`[StravaActions] Error transforming Strava activity ${activity.id} (${activity.type}): ${transformError.message}. Skipping this record.`);
      }
    }
    
    console.log(`[StravaActions] Processed ${processedActivities.length} activities, stored ${activitiesStoredCount} relevant Strava activities for user ${userId}.`);
    return { 
      success: true, 
      message: `Successfully fetched and stored/updated ${activitiesStoredCount} relevant Strava activities. Total activities received from API: ${stravaActivities.length}.`, 
      activitiesProcessed: activitiesStoredCount 
    };

  } catch (error: any) {
    console.error(`[StravaActions] Unhandled error in fetchAndStoreStravaRecentActivities for user ${userId}:`, error);
    const errorMessage = String(error.message || 'An unexpected server error occurred.');
    const errorCode = String(error.code || 'UNEXPECTED_SERVER_ERROR');
    return { success: false, message: errorMessage, errorCode: errorCode };
  }
}
