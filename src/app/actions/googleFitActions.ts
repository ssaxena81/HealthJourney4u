
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
  // For now, all Google Fit calls might share a general limit or we can differentiate
  switch (tier) {
    case 'platinum':
      return { limit: 3, periodHours: 24 }; // Example: Platinum gets more calls
    case 'free':
    case 'silver':
    case 'gold':
    default:
      return { limit: 1, periodHours: 24 };
  }
}

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
    // Add more mappings as needed
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

  try {
    const userProfileDocRef = doc(db, 'users', userId);
    const userProfileSnap = await getDoc(userProfileDocRef);

    if (!userProfileSnap.exists()) {
      console.error(`[GoogleFitActions] User profile not found for UID: ${userId}.`);
      return { success: false, message: 'User profile not found.', errorCode: 'PROFILE_NOT_FOUND' };
    }
    const userProfile = userProfileSnap.data() as UserProfile;

    if (!userProfile.connectedFitnessApps?.some(app => app.id === 'google-fit')) {
      console.log(`[GoogleFitActions] Google Fit not connected for user: ${userId}.`);
      return { success: false, message: 'Google Fit not connected. Please connect Google Fit in your profile.', errorCode: 'GOOGLE_FIT_NOT_CONNECTED' };
    }

    const callType: GoogleFitCallType = 'sessions'; // Primary call type for this action
    const rateLimitConfig = getRateLimitConfigGoogleFit(userProfile.subscriptionTier, callType);
    const stats = userProfile.googleFitApiCallStats?.[callType];
    const now = new Date();
    const todayStart = startOfDay(now);
    let callCountToday = stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) ? stats.callCountToday || 0 : 0;

    if (stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) && callCountToday >= rateLimitConfig.limit) {
      console.warn(`[GoogleFitActions] Google Fit ${callType} rate limit exceeded for user ${userId}.`);
      return { success: false, message: `API call limit for Google Fit ${callType} reached.`, errorCode: 'RATE_LIMIT_EXCEEDED' };
    } else if (!stats?.lastCalledAt || !isSameDay(new Date(stats.lastCalledAt), todayStart)) {
      callCountToday = 0;
    }

    const accessToken = await getValidGoogleFitAccessToken();
    if (!accessToken) {
      console.error('[GoogleFitActions] Failed to obtain valid Google Fit access token for user:', userId);
      return { success: false, message: 'Could not connect to Google Fit. Session might have expired.', errorCode: 'GOOGLE_FIT_AUTH_ERROR' };
    }

    let sessions: googleFitService.GoogleFitSession[];
    try {
      sessions = await googleFitService.getGoogleFitActivitySessions(accessToken, params.startTimeIso, params.endTimeIso);
    } catch (error: any) {
      console.error(`[GoogleFitActions] Error calling googleFitService.getGoogleFitActivitySessions for user ${userId}:`, error);
      if (error.status === 401 || error.status === 403) { // Unauthorized or Forbidden
        await clearGoogleFitTokens();
        return { success: false, message: 'Google Fit authentication error. Please reconnect Google Fit.', errorCode: 'GOOGLE_FIT_AUTH_EXPIRED_POST_REFRESH' };
      }
      return { success: false, message: `Failed to fetch sessions from Google Fit: ${String(error.message)}`, errorCode: 'GOOGLE_FIT_API_ERROR_SESSIONS' };
    }
    
    callCountToday++; // Increment here as the sessions API call was made
    
    if (!sessions || sessions.length === 0) {
      console.log(`[GoogleFitActions] No relevant activity sessions found from Google Fit for user ${userId} in the given range.`);
       // Update API call stats even if no sessions found, as the API call was made
        const updatedApiCallStats: GoogleFitApiCallStats = {
            ...(userProfile.googleFitApiCallStats || {}),
            [callType]: { lastCalledAt: now.toISOString(), callCountToday },
        };
        await updateDoc(userProfileDocRef, { googleFitApiCallStats: updatedApiCallStats });
      return { success: true, message: 'No relevant activity sessions found from Google Fit.', activitiesProcessed: 0 };
    }
    
    let activitiesStoredCount = 0;
    const aggregateCallType: GoogleFitCallType = 'aggregateData'; // For fetching metrics
    let aggregateCallCountToday = userProfile.googleFitApiCallStats?.[aggregateCallType]?.lastCalledAt && isSameDay(new Date(userProfile.googleFitApiCallStats[aggregateCallType]!.lastCalledAt!), todayStart) 
                                  ? userProfile.googleFitApiCallStats[aggregateCallType]!.callCountToday || 0 
                                  : 0;

    for (const session of sessions) {
      const normalizedType = mapGoogleFitActivityTypeToNormalizedType(session.activityType);
      if (normalizedType === NormalizedActivityType.Other) continue; // Skip if not one of our target types

      const startTimeMillis = parseInt(session.startTimeMillis, 10);
      const endTimeMillis = parseInt(session.endTimeMillis, 10);

      let distanceMeters: number | undefined;
      let calories: number | undefined;
      let steps: number | undefined;
      let avgHeartRate: number | undefined;

      // Check aggregate rate limit before fetching metrics for each session
      const aggregateRateLimitConfig = getRateLimitConfigGoogleFit(userProfile.subscriptionTier, aggregateCallType);
      if (aggregateCallCountToday >= aggregateRateLimitConfig.limit) {
        console.warn(`[GoogleFitActions] Google Fit ${aggregateCallType} rate limit exceeded for user ${userId} while fetching session metrics. Skipping further metric fetches.`);
        // Break or decide if we store session without all metrics
        break; 
      }

      try {
        // Fetch distance
        const distanceData = await googleFitService.getAggregatedData(accessToken, {
          aggregateBy: [{ dataTypeName: "com.google.distance.delta", dataSourceId: "derived:com.google.distance.delta:com.google.android.gms:aggregated" }],
          startTimeMillis: startTimeMillis,
          endTimeMillis: endTimeMillis,
          bucketByTime: { durationMillis: endTimeMillis - startTimeMillis } 
        });
        distanceMeters = distanceData.bucket?.[0]?.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal;
        aggregateCallCountToday++;

        // Fetch calories
        const caloriesData = await googleFitService.getAggregatedData(accessToken, {
          aggregateBy: [{ dataTypeName: "com.google.calories.expended", dataSourceId: "derived:com.google.calories.expended:com.google.android.gms:aggregated" }],
          startTimeMillis: startTimeMillis,
          endTimeMillis: endTimeMillis,
          bucketByTime: { durationMillis: endTimeMillis - startTimeMillis }
        });
        calories = caloriesData.bucket?.[0]?.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal;
        aggregateCallCountToday++;
        
        if (normalizedType === NormalizedActivityType.Walking || normalizedType === NormalizedActivityType.Running || normalizedType === NormalizedActivityType.Hiking) {
            const stepsData = await googleFitService.getAggregatedData(accessToken, {
                aggregateBy: [{ dataTypeName: "com.google.step_count.delta", dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:aggregated" }],
                startTimeMillis: startTimeMillis,
                endTimeMillis: endTimeMillis,
                bucketByTime: { durationMillis: endTimeMillis - startTimeMillis }
            });
            steps = stepsData.bucket?.[0]?.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal;
            aggregateCallCountToday++;
        }

        const heartRateData = await googleFitService.getAggregatedData(accessToken, {
            aggregateBy: [{ dataTypeName: "com.google.heart_rate.bpm", dataSourceId: "derived:com.google.heart_rate.bpm:com.google.android.gms:aggregated" }],
            startTimeMillis: startTimeMillis,
            endTimeMillis: endTimeMillis,
            bucketByTime: { durationMillis: endTimeMillis - startTimeMillis }
        });
        // Google Fit often returns avg, min, max for heart rate. We want average.
        // The structure of point.value for heart_rate.bpm might be an array of mapVal with keys 'average', 'max', 'min'.
        // Or it could be fpVal if aggregated to a single point. Check Google Fit API response structure.
        // Assuming for now fpVal is average if directly available, or needs parsing from mapVal.
        // This part needs to be verified with actual API responses for heart_rate.bpm aggregation.
        const hrPoint = heartRateData.bucket?.[0]?.dataset?.[0]?.point?.[0];
        if (hrPoint?.value?.[0]?.fpVal) {
            avgHeartRate = hrPoint.value[0].fpVal;
        } else if (hrPoint?.value?.[0]?.mapVal) {
            const avgEntry = hrPoint.value[0].mapVal.find(m => m.key === 'average');
            avgHeartRate = avgEntry?.value?.fpVal;
        }
        aggregateCallCountToday++;

      } catch (metricError: any) {
        console.error(`[GoogleFitActions] Error fetching metrics for session ${session.id}, user ${userId}:`, metricError);
        // Continue to save session even if some metrics fail, but log it
        if (metricError.status === 401 || metricError.status === 403) {
             await clearGoogleFitTokens(); // Clear tokens if auth error during metric fetch
             return { success: false, message: 'Google Fit authentication error while fetching session details. Please reconnect.', errorCode: 'GOOGLE_FIT_AUTH_EXPIRED_METRICS' };
        }
      }

      const firestoreData: NormalizedActivityFirestore = {
        id: `google-fit-${session.id}`,
        userId: userId,
        originalId: session.id,
        dataSource: 'google-fit',
        type: normalizedType,
        name: session.name || `${NormalizedActivityType[normalizedType]} Session`,
        startTimeUtc: new Date(startTimeMillis).toISOString(),
        // startTimeLocal & timezone: Google Fit sessions don't always provide explicit local time or full timezone string easily.
        // For now, deriving date from UTC start time.
        date: new Date(startTimeMillis).toISOString().substring(0, 10),
        durationMovingSec: session.activeTimeMillis ? parseInt(session.activeTimeMillis, 10) / 1000 : undefined,
        durationElapsedSec: (endTimeMillis - startTimeMillis) / 1000,
        distanceMeters: distanceMeters,
        calories: calories,
        steps: steps,
        averageHeartRateBpm: avgHeartRate,
        lastFetched: new Date().toISOString(),
      };

      const activityDocRef = doc(db, 'users', userId, 'activities', firestoreData.id);
      await setDoc(activityDocRef, firestoreData, { merge: true });
      activitiesStoredCount++;
    }
    
    // Update API call stats after all processing
    const finalApiCallStats: GoogleFitApiCallStats = {
      ...(userProfile.googleFitApiCallStats || {}),
      [callType]: { lastCalledAt: now.toISOString(), callCountToday },
      [aggregateCallType]: { 
        lastCalledAt: userProfile.googleFitApiCallStats?.[aggregateCallType]?.lastCalledAt && isSameDay(new Date(userProfile.googleFitApiCallStats[aggregateCallType]!.lastCalledAt!), todayStart) ? now.toISOString() : now.toISOString(), // update if used today
        callCountToday: aggregateCallCountToday 
      },
    };
    await updateDoc(userProfileDocRef, { googleFitApiCallStats: finalApiCallStats });
    console.log(`[GoogleFitActions] Updated Google Fit API call stats for user ${userId}. Sessions calls: ${callCountToday}, Aggregate calls: ${aggregateCallCountToday}`);

    return { 
      success: true, 
      message: `Successfully fetched and stored ${activitiesStoredCount} Google Fit activities. Total sessions found: ${sessions.length}.`, 
      activitiesProcessed: activitiesStoredCount 
    };

  } catch (error: any) {
    console.error(`[GoogleFitActions] Unhandled error in fetchAndStoreGoogleFitActivities for user ${userId}:`, error);
    const errorMessage = String(error.message || 'An unexpected server error occurred.');
    const errorCode = String(error.code || 'UNEXPECTED_SERVER_ERROR');
    // Check if it's a rate limit error from Google (e.g., 429)
    if (error.status === 429) {
        return { success: false, message: "Google Fit API rate limit hit. Please try again later.", errorCode: "GOOGLE_FIT_RATE_LIMIT" };
    }
    return { success: false, message: errorMessage, errorCode: errorCode };
  }
}
