
'use server';

import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import type { UserProfile, SubscriptionTier, NormalizedActivityFirestore, GoogleFitApiCallStats } from '@/types';
import { NormalizedActivityType } from '@/types';
import * as googleFitService from '@/lib/services/googleFitService';
import { getValidGoogleFitAccessToken, clearGoogleFitTokens } from '@/lib/google-fit-auth-utils';
import { isSameDay, startOfDay, format, parseISO } from 'date-fns';

interface FetchGoogleFitDataResult {
  success: boolean;
  message?: string;
  activitiesProcessed?: number;
  errorCode?: string;
}

type GoogleFitCallType = 'sessions' | 'aggregateData';

function getRateLimitConfigGoogleFit(
  tier: SubscriptionTier,
  callType: GoogleFitCallType
): { limit: number; periodHours: number } {
  switch (tier) {
    case 'platinum':
      // Platinum users might get more frequent calls or higher limits for aggregation
      return callType === 'sessions' ? { limit: 3, periodHours: 24 } : { limit: 20, periodHours: 24 }; // More aggregate calls
    case 'gold':
       return callType === 'sessions' ? { limit: 1, periodHours: 24 } : { limit: 10, periodHours: 24 };
    case 'silver':
    case 'free':
    default:
      return callType === 'sessions' ? { limit: 1, periodHours: 24 } : { limit: 5, periodHours: 24 }; // Fewer aggregate calls for free/silver
  }
}

// Helper to map Google Fit activity types to NormalizedActivityType
function mapGoogleFitActivityTypeToNormalizedType(activityType: number): NormalizedActivityType {
  // Reference: https://developers.google.com/fit/rest/v1/reference/activity-types
  switch (activityType) {
    case 7: // Walking
    case 107: // Walking.fitness
    case 108: // Walking.stroller
    case 116: // Walking.treadmill
      return NormalizedActivityType.Walking;
    case 8: // Running
    case 94: // Running.jogging
    case 95: // Running.sand
    case 96: // Running.treadmill
      return NormalizedActivityType.Running;
    case 25: // Hiking (sometimes Trail Running is used for hiking too)
    case 113: // Hiking (Light)
    case 114: // Hiking (Moderate)
    case 115: // Hiking (Vigorous/Mountain)
      return NormalizedActivityType.Hiking;
    case 57: // Swimming
    case 101: // Swimming.open_water
    case 102: // Swimming.pool
      return NormalizedActivityType.Swimming;
    case 1: // Biking
    case 9: // Cycling.bmx
    case 10: // Cycling.hand
    case 11: // Cycling.mountain
    case 12: // Cycling.road
    case 13: // Cycling.spinning
    case 14: // Cycling.stationary
    case 15: // Cycling.utility
      return NormalizedActivityType.Cycling;
    default:
      return NormalizedActivityType.Other;
  }
}


export async function fetchAndStoreGoogleFitActivities(
  params: { startTimeIso: string; endTimeIso: string }
): Promise<FetchGoogleFitDataResult> {
  console.log('[GoogleFitActions] Initiating fetchAndStoreGoogleFitActivities with params:', params);

  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) {
    console.error('[GoogleFitActions] User not authenticated.');
    return { success: false, message: 'User not authenticated.', errorCode: 'AUTH_REQUIRED' };
  }
  const userId = currentUser.uid;

  if (!db || !db.app) {
    console.error('[GoogleFitActions] Firestore not initialized. DB App:', db?.app);
    return { success: false, message: 'Database service unavailable.', errorCode: 'DB_UNAVAILABLE' };
  }

  let userProfile: UserProfile;
  try {
    const userProfileDocRef = doc(db, 'users', userId);
    const userProfileSnap = await getDoc(userProfileDocRef);
    if (!userProfileSnap.exists()) {
      console.error(`[GoogleFitActions] User profile not found for UID: ${userId}.`);
      return { success: false, message: 'User profile not found.', errorCode: 'PROFILE_NOT_FOUND' };
    }
    userProfile = userProfileSnap.data() as UserProfile;
  } catch (error: any) {
    console.error(`[GoogleFitActions] Error fetching user profile for UID ${userId}:`, error);
    return { success: false, message: `Failed to fetch user profile: ${String(error.message)}`, errorCode: 'PROFILE_FETCH_ERROR' };
  }

  if (!userProfile.connectedFitnessApps?.some(app => app.id === 'google-fit')) {
    console.log(`[GoogleFitActions] Google Fit not connected for user: ${userId}.`);
    return { success: false, message: 'Google Fit not connected. Please connect Google Fit in your profile.', errorCode: 'GOOGLE_FIT_NOT_CONNECTED' };
  }

  const now = new Date();
  const todayStart = startOfDay(now);
  let apiCallStats = userProfile.googleFitApiCallStats || { sessions: { callCountToday: 0 }, aggregateData: { callCountToday: 0 } };
  
  // Rate limit for fetching sessions
  const sessionsCallType: GoogleFitCallType = 'sessions';
  const sessionsRateLimitConfig = getRateLimitConfigGoogleFit(userProfile.subscriptionTier, sessionsCallType);
  let sessionsCallCountToday = apiCallStats.sessions?.lastCalledAt && isSameDay(new Date(apiCallStats.sessions.lastCalledAt), todayStart) 
                             ? apiCallStats.sessions.callCountToday || 0 : 0;

  if (sessionsCallCountToday >= sessionsRateLimitConfig.limit) {
    console.warn(`[GoogleFitActions] Google Fit ${sessionsCallType} rate limit exceeded for user ${userId}.`);
    return { success: false, message: `API call limit for Google Fit ${sessionsCallType} reached.`, errorCode: 'RATE_LIMIT_EXCEEDED_SESSIONS' };
  }

  const accessToken = await getValidGoogleFitAccessToken();
  if (!accessToken) {
    console.error('[GoogleFitActions] Failed to obtain valid Google Fit access token for user:', userId);
    return { success: false, message: 'Could not connect to Google Fit. Session might have expired.', errorCode: 'GOOGLE_FIT_AUTH_ERROR' };
  }

  let sessions: googleFitService.GoogleFitSession[];
  try {
    sessions = await googleFitService.getGoogleFitActivitySessions(accessToken, params.startTimeIso, params.endTimeIso);
    sessionsCallCountToday++;
    apiCallStats.sessions = { lastCalledAt: now.toISOString(), callCountToday: sessionsCallCountToday };
  } catch (error: any) {
    console.error(`[GoogleFitActions] Error calling googleFitService.getGoogleFitActivitySessions for user ${userId}:`, error);
    if (error.status === 401 || error.status === 403) {
      await clearGoogleFitTokens();
      return { success: false, message: 'Google Fit authentication error. Please reconnect Google Fit.', errorCode: 'GOOGLE_FIT_AUTH_EXPIRED_SESSIONS' };
    }
    return { success: false, message: `Failed to fetch sessions from Google Fit: ${String(error.message)}`, errorCode: 'GOOGLE_FIT_API_ERROR_SESSIONS' };
  }
  
  if (!sessions || sessions.length === 0) {
    console.log(`[GoogleFitActions] No relevant activity sessions found from Google Fit for user ${userId} in the given range.`);
    await updateDoc(doc(db, 'users', userId), { googleFitApiCallStats: apiCallStats }); // Update stats even if no sessions
    return { success: true, message: 'No relevant activity sessions found from Google Fit.', activitiesProcessed: 0 };
  }
  
  let activitiesStoredCount = 0;
  const aggregateCallType: GoogleFitCallType = 'aggregateData';
  const aggregateRateLimitConfig = getRateLimitConfigGoogleFit(userProfile.subscriptionTier, aggregateCallType);
  let aggregateCallCountToday = apiCallStats.aggregateData?.lastCalledAt && isSameDay(new Date(apiCallStats.aggregateData.lastCalledAt), todayStart) 
                               ? apiCallStats.aggregateData.callCountToday || 0 : 0;

  const relevantActivityTypesToNormalize = [
    NormalizedActivityType.Walking, 
    NormalizedActivityType.Running, 
    NormalizedActivityType.Hiking, 
    NormalizedActivityType.Swimming,
  ];

  for (const session of sessions) {
    const normalizedType = mapGoogleFitActivityTypeToNormalizedType(session.activityType);
    if (!relevantActivityTypesToNormalize.includes(normalizedType)) {
        console.log(`[GoogleFitActions] Skipping session ${session.id} of type ${session.activityType} as it's not targeted for normalization.`);
        continue;
    }

    const startTimeMillis = parseInt(session.startTimeMillis, 10);
    const endTimeMillis = parseInt(session.endTimeMillis, 10);

    let distanceMeters: number | undefined;
    let calories: number | undefined;
    let steps: number | undefined;
    let avgHeartRate: number | undefined;

    try {
      // Fetch distance
      if (aggregateCallCountToday < aggregateRateLimitConfig.limit) {
        const distanceData = await googleFitService.getAggregatedData(accessToken, {
          aggregateBy: [{ dataTypeName: "com.google.distance.delta" }],
          startTimeMillis: startTimeMillis, endTimeMillis: endTimeMillis,
          bucketByTime: { durationMillis: endTimeMillis - startTimeMillis } 
        });
        distanceMeters = distanceData.bucket?.[0]?.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal;
        aggregateCallCountToday++;
        apiCallStats.aggregateData = { lastCalledAt: new Date().toISOString(), callCountToday: aggregateCallCountToday };
      } else { console.warn(`[GoogleFitActions] Aggregate data rate limit reached for user ${userId}. Skipping distance fetch for session ${session.id}.`);}

      // Fetch calories
      if (aggregateCallCountToday < aggregateRateLimitConfig.limit) {
        const caloriesData = await googleFitService.getAggregatedData(accessToken, {
          aggregateBy: [{ dataTypeName: "com.google.calories.expended" }],
          startTimeMillis: startTimeMillis, endTimeMillis: endTimeMillis,
          bucketByTime: { durationMillis: endTimeMillis - startTimeMillis }
        });
        calories = caloriesData.bucket?.[0]?.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal;
        aggregateCallCountToday++;
        apiCallStats.aggregateData = { lastCalledAt: new Date().toISOString(), callCountToday: aggregateCallCountToday };
      } else { console.warn(`[GoogleFitActions] Aggregate data rate limit reached for user ${userId}. Skipping calorie fetch for session ${session.id}.`);}
      
      // Fetch steps if applicable
      if ((normalizedType === NormalizedActivityType.Walking || normalizedType === NormalizedActivityType.Running || normalizedType === NormalizedActivityType.Hiking) && aggregateCallCountToday < aggregateRateLimitConfig.limit) {
          const stepsData = await googleFitService.getAggregatedData(accessToken, {
              aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
              startTimeMillis: startTimeMillis, endTimeMillis: endTimeMillis,
              bucketByTime: { durationMillis: endTimeMillis - startTimeMillis }
          });
          steps = stepsData.bucket?.[0]?.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal;
          aggregateCallCountToday++;
          apiCallStats.aggregateData = { lastCalledAt: new Date().toISOString(), callCountToday: aggregateCallCountToday };
      } else if (normalizedType === NormalizedActivityType.Walking || normalizedType === NormalizedActivityType.Running || normalizedType === NormalizedActivityType.Hiking) { console.warn(`[GoogleFitActions] Aggregate data rate limit reached for user ${userId}. Skipping step fetch for session ${session.id}.`);}

      // Fetch heart rate if applicable
       if (aggregateCallCountToday < aggregateRateLimitConfig.limit) {
            const heartRateData = await googleFitService.getAggregatedData(accessToken, {
                aggregateBy: [{ dataTypeName: "com.google.heart_rate.bpm" }], // Fetches average, min, max
                startTimeMillis: startTimeMillis, endTimeMillis: endTimeMillis,
                bucketByTime: { durationMillis: endTimeMillis - startTimeMillis }
            });
            const hrPoint = heartRateData.bucket?.[0]?.dataset?.[0]?.point?.[0];
            if (hrPoint?.value?.[0]?.fpVal) { // Check if fpVal holds the average directly
                avgHeartRate = hrPoint.value[0].fpVal;
            } else if (hrPoint?.value?.[0]?.mapVal) { // Check if values are in mapVal
                const avgEntry = hrPoint.value[0].mapVal.find(m => m.key === 'average');
                avgHeartRate = avgEntry?.value?.fpVal;
            }
            aggregateCallCountToday++;
            apiCallStats.aggregateData = { lastCalledAt: new Date().toISOString(), callCountToday: aggregateCallCountToday };
        } else { console.warn(`[GoogleFitActions] Aggregate data rate limit reached for user ${userId}. Skipping heart rate fetch for session ${session.id}.`);}


    } catch (metricError: any) {
      console.error(`[GoogleFitActions] Error fetching metrics for session ${session.id}, user ${userId}: ${String(metricError.message)}`);
      if (metricError.status === 401 || metricError.status === 403) {
           await clearGoogleFitTokens();
           await updateDoc(doc(db, 'users', userId), { googleFitApiCallStats: apiCallStats });
           return { success: false, message: 'Google Fit authentication error while fetching session details. Please reconnect.', errorCode: 'GOOGLE_FIT_AUTH_EXPIRED_METRICS' };
      }
      // Continue to save session even if some metrics fail, but log it
    }

    const firestoreData: NormalizedActivityFirestore = {
      id: `google-fit-${session.id}`,
      userId: userId,
      originalId: session.id,
      dataSource: 'google-fit',
      type: normalizedType,
      name: session.name || `${NormalizedActivityType[normalizedType]} Session`,
      startTimeUtc: new Date(startTimeMillis).toISOString(),
      date: new Date(startTimeMillis).toISOString().substring(0, 10), // YYYY-MM-DD
      durationMovingSec: session.activeTimeMillis ? parseInt(session.activeTimeMillis, 10) / 1000 : undefined,
      durationElapsedSec: (endTimeMillis - startTimeMillis) / 1000,
      distanceMeters: distanceMeters,
      calories: calories,
      steps: steps,
      averageHeartRateBpm: avgHeartRate,
      lastFetched: new Date().toISOString(),
      // elevationGainMeters and mapPolyline are harder to get from Google Fit easily and are omitted for now
    };

    const activityDocRef = doc(db, 'users', userId, 'activities', firestoreData.id);
    await setDoc(activityDocRef, firestoreData, { merge: true });
    activitiesStoredCount++;
  }
  
  try {
    await updateDoc(doc(db, 'users', userId), { googleFitApiCallStats: apiCallStats });
    console.log(`[GoogleFitActions] Updated Google Fit API call stats for user ${userId}. Sessions calls: ${sessionsCallCountToday}, Aggregate calls: ${aggregateCallCountToday}`);
  } catch (statUpdateError: any) {
    console.error(`[GoogleFitActions] Failed to update API call stats for user ${userId}: ${String(statUpdateError.message)}`);
  }

  return { 
    success: true, 
    message: `Successfully processed ${activitiesStoredCount} Google Fit activities. Total sessions found: ${sessions.length}.`, 
    activitiesProcessed: activitiesStoredCount 
  };

}

```