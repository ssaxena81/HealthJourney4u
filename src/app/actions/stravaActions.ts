
// [2025-06-29] COMMENT: This is a new file to house server actions related to Strava.
'use server';

import { adminDb } from '@/lib/firebase/serverApp';
import { getValidStravaAccessToken } from '@/lib/strava-auth-utils';
import { getStravaActivities, type StravaActivity } from '@/lib/services/stravaService';
import { NormalizedActivityType, type NormalizedActivityFirestore } from '@/types';
import { format, parseISO, subDays } from 'date-fns';

interface SyncResult {
  success: boolean;
  message: string;
  syncedCount?: number;
  error?: string;
}

// [2025-06-29] COMMENT: This helper function maps Strava's activity type strings to our app's NormalizedActivityType enum.
function mapStravaTypeToNormalizedType(stravaType: string): NormalizedActivityType {
  const typeLower = stravaType.toLowerCase();
  switch (typeLower) {
    case 'run':
      return NormalizedActivityType.Running;
    case 'walk':
      return NormalizedActivityType.Walking;
    case 'hike':
      return NormalizedActivityType.Hiking;
    case 'swim':
      return NormalizedActivityType.Swimming;
    case 'ride':
    case 'virtualride':
      return NormalizedActivityType.Cycling;
    case 'workout':
    case 'weighttraining':
    case 'crosstraining':
    case 'hiit':
    case 'yoga':
      return NormalizedActivityType.Workout;
    default:
      return NormalizedActivityType.Other;
  }
}

// [2025-06-29] COMMENT: This function normalizes a single Strava activity into our standard Firestore format.
function normalizeStravaActivity(activity: StravaActivity, userId: string): NormalizedActivityFirestore {
  return {
    id: `strava-${activity.id}`,
    userId: userId,
    originalId: String(activity.id),
    dataSource: 'strava',
    type: mapStravaTypeToNormalizedType(activity.type),
    name: activity.name,
    startTimeUtc: activity.start_date, // Strava start_date is already in UTC
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
    date: format(parseISO(activity.start_date), 'yyyy-MM-dd'),
    lastFetched: new Date().toISOString(),
  };
}

// [2025-06-29] COMMENT: The main server action to fetch, normalize, and save Strava activities.
export async function syncStravaActivities(userId: string): Promise<SyncResult> {
  if (!userId) {
    return { success: false, message: 'User not authenticated.' };
  }

  console.log(`[StravaActions] Starting activity sync for user ${userId}`);

  const accessToken = await getValidStravaAccessToken(userId);
  if (!accessToken) {
    return { success: false, message: 'Could not retrieve a valid Strava access token. Please reconnect.' };
  }

  try {
    // [2025-06-29] COMMENT: Fetch activities from the last 7 days. The 'after' param requires a Unix timestamp in seconds.
    const sevenDaysAgo = subDays(new Date(), 7);
    const afterTimestamp = Math.floor(sevenDaysAgo.getTime() / 1000);

    const stravaActivities = await getStravaActivities(accessToken, { after: afterTimestamp, per_page: 100 });

    if (stravaActivities.length === 0) {
      return { success: true, message: 'No new activities found on Strava in the last 7 days.', syncedCount: 0 };
    }

    const normalizedActivities = stravaActivities.map(act => normalizeStravaActivity(act, userId));

    // [2025-06-29] COMMENT: Use a batch write to save all normalized activities to Firestore atomically.
    const batch = adminDb.batch();
    const activitiesCollectionRef = adminDb.collection('users').doc(userId).collection('activities');

    normalizedActivities.forEach(activity => {
      const docRef = activitiesCollectionRef.doc(activity.id);
      batch.set(docRef, activity, { merge: true });
    });

    await batch.commit();

    // [2025-06-29] COMMENT: Update the last successful sync timestamp on the user's profile.
    const userProfileRef = adminDb.collection('users').doc(userId);
    await userProfileRef.set({ stravaLastSyncTimestamp: Date.now() }, { merge: true });

    const message = `Successfully synced ${normalizedActivities.length} activity/activities from Strava.`;
    console.log(`[StravaActions] ${message}`);
    return { success: true, message, syncedCount: normalizedActivities.length };

  } catch (error: any) {
    console.error(`[StravaActions] An error occurred during the Strava sync process for user ${userId}:`, error);
    return { success: false, message: 'An unexpected error occurred during sync.', error: error.message };
  }
}
