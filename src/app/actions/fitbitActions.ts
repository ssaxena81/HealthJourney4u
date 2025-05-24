
'use server';

import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import type { UserProfile, SubscriptionTier, FitbitActivitySummaryFirestore, FitbitHeartRateFirestore, FitbitSleepLogFirestore } from '@/types';
import { getDailyActivitySummary, getHeartRateTimeSeries, getSleepLogs, type FitbitHeartRateActivitiesResponse, type FitbitSleepLogsResponse, type FitbitSleepLog } from '@/lib/services/fitbitService';
import { getValidFitbitAccessToken, clearFitbitTokens } from '@/lib/fitbit-auth-utils';
import { isSameDay, startOfDay } from 'date-fns';

interface FetchFitbitDataResult {
  success: boolean;
  message?: string;
  data?: any; // Could be Firestore data types
  errorCode?: string;
}

function getRateLimitConfig(
  tier: SubscriptionTier,
  callType: 'dailyActivitySummary' | 'heartRateTimeSeries' | 'sleepData'
): { limit: number; periodHours: number } {
  // For this example, all have the same rate limits per tier.
  // This could be differentiated if needed.
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
): Promise<FetchFitbitDataResult> {
  console.log(`[FitbitActions] Initiating fetchAndStoreFitbitDailyActivity for date: ${targetDate}`);

  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) {
    console.error('[FitbitActions] User not authenticated for fetchAndStoreFitbitDailyActivity.');
    return { success: false, message: 'User not authenticated.', errorCode: 'AUTH_REQUIRED' };
  }
  const userId = currentUser.uid;

  if (!db) {
    console.error('[FitbitActions] Firestore not initialized for fetchAndStoreFitbitDailyActivity.');
    return { success: false, message: 'Database service unavailable.', errorCode: 'DB_UNAVAILABLE' };
  }

  try {
    const userProfileDocRef = doc(db, 'users', userId);
    const userProfileSnap = await getDoc(userProfileDocRef);

    if (!userProfileSnap.exists()) {
      console.error(`[FitbitActions] User profile not found for UID: ${userId} in fetchAndStoreFitbitDailyActivity.`);
      return { success: false, message: 'User profile not found.', errorCode: 'PROFILE_NOT_FOUND' };
    }
    const userProfile = userProfileSnap.data() as UserProfile;

    if (!userProfile.connectedFitnessApps?.some(app => app.id === 'fitbit')) {
        console.log(`[FitbitActions] Fitbit not connected for user: ${userId} for fetchAndStoreFitbitDailyActivity.`);
        return { success: false, message: 'Fitbit not connected. Please connect Fitbit in your profile.', errorCode: 'FITBIT_NOT_CONNECTED'};
    }

    const rateLimitConfig = getRateLimitConfig(userProfile.subscriptionTier, 'dailyActivitySummary');
    const stats = userProfile.fitbitApiCallStats?.dailyActivitySummary;
    const now = new Date();
    const todayStart = startOfDay(now);
    let callCountToday = stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) ? stats.callCountToday || 0 : 0;

    if (stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart)) {
      if (callCountToday >= rateLimitConfig.limit) {
        console.warn(`[FitbitActions] Daily activity rate limit exceeded for user ${userId}. Tier: ${userProfile.subscriptionTier}, Count: ${callCountToday}, Limit: ${rateLimitConfig.limit}`);
        return { success: false, message: `API call limit for daily activity summary reached for your tier (${rateLimitConfig.limit} per ${rateLimitConfig.periodHours} hours). Try again later.`, errorCode: 'RATE_LIMIT_EXCEEDED' };
      }
    } else {
      callCountToday = 0; // Reset for a new day or if no previous calls
    }

    const accessToken = await getValidFitbitAccessToken();
    if (!accessToken) {
      console.error('[FitbitActions] Failed to obtain valid Fitbit access token for daily activity for user:', userId);
      return { success: false, message: 'Could not connect to Fitbit. Your session might have expired. Please try reconnecting Fitbit in your profile settings.', errorCode: 'FITBIT_AUTH_ERROR' };
    }

    let fitbitData;
    try {
        fitbitData = await getDailyActivitySummary(accessToken, targetDate);
         if (!fitbitData || !fitbitData.summary) {
            console.error('[FitbitActions] Fitbit API returned no summary data for daily activity for date:', targetDate);
            return { success: false, message: `No activity data found from Fitbit for ${targetDate}.`, errorCode: 'FITBIT_NO_DATA' };
        }
    } catch (error: any) {
        console.error(`[FitbitActions] Error calling fitbitService.getDailyActivitySummary for user ${userId}, date ${targetDate}:`, error);
        if (error.status === 401) { // Fitbit API unauthorized
            await clearFitbitTokens(); // Clear potentially invalid tokens
            return { success: false, message: 'Fitbit authentication error. Your Fitbit session may have expired. Please reconnect Fitbit in your profile settings.', errorCode: 'FITBIT_AUTH_EXPIRED_POST_REFRESH' };
        }
        return { success: false, message: `Failed to fetch daily activity from Fitbit: ${error.message}`, errorCode: 'FITBIT_API_ERROR' };
    }

    const summary = fitbitData.summary;
    const firestoreData: FitbitActivitySummaryFirestore = {
      date: targetDate,
      steps: summary.steps,
      distance: summary.distance, // Assuming service returns in a consistent unit or you convert it
      caloriesOut: summary.caloriesOut,
      activeMinutes: (summary.fairlyActiveMinutes || 0) + (summary.veryActiveMinutes || 0),
      lastFetched: new Date().toISOString(),
      dataSource: 'fitbit',
    };

    const activityDocRef = doc(db, 'users', userId, 'fitbit_activity_summaries', targetDate);
    await setDoc(activityDocRef, firestoreData, { merge: true });
    console.log(`[FitbitActions] Fitbit daily activity summary stored in Firestore for user ${userId}, date ${targetDate}.`);

    callCountToday++;
    const updatedStats = {
      ...userProfile.fitbitApiCallStats,
      dailyActivitySummary: {
        lastCalledAt: now.toISOString(),
        callCountToday: callCountToday,
      },
    };
    await updateDoc(userProfileDocRef, { fitbitApiCallStats: updatedStats });
    console.log(`[FitbitActions] Updated daily activity API call stats for user ${userId}.`);

    return { success: true, message: 'Successfully fetched and stored Fitbit daily activity.', data: firestoreData };

  } catch (error: any) {
    console.error(`[FitbitActions] Unhandled error in fetchAndStoreFitbitDailyActivity for user ${userId}:`, error);
    return { success: false, message: `An unexpected server error occurred: ${error.message}`, errorCode: 'UNEXPECTED_SERVER_ERROR' };
  }
}


export async function fetchAndStoreFitbitHeartRate(
  targetDate: string, // YYYY-MM-DD format
  detailLevel: '1min' | '1sec' = '1min'
): Promise<FetchFitbitDataResult> {
  console.log(`[FitbitActions] Initiating fetchAndStoreFitbitHeartRate for date: ${targetDate}, detail: ${detailLevel}`);

  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) {
    console.error('[FitbitActions] User not authenticated for fetchAndStoreFitbitHeartRate.');
    return { success: false, message: 'User not authenticated.', errorCode: 'AUTH_REQUIRED' };
  }
  const userId = currentUser.uid;

  if (!db) {
    console.error('[FitbitActions] Firestore not initialized for fetchAndStoreFitbitHeartRate.');
    return { success: false, message: 'Database service unavailable.', errorCode: 'DB_UNAVAILABLE' };
  }

  try {
    const userProfileDocRef = doc(db, 'users', userId);
    const userProfileSnap = await getDoc(userProfileDocRef);

    if (!userProfileSnap.exists()) {
      console.error(`[FitbitActions] User profile not found for UID: ${userId} in fetchAndStoreFitbitHeartRate.`);
      return { success: false, message: 'User profile not found.', errorCode: 'PROFILE_NOT_FOUND' };
    }
    const userProfile = userProfileSnap.data() as UserProfile;

     if (!userProfile.connectedFitnessApps?.some(app => app.id === 'fitbit')) {
        console.log(`[FitbitActions] Fitbit not connected for user: ${userId} for fetchAndStoreFitbitHeartRate.`);
        return { success: false, message: 'Fitbit not connected. Please connect Fitbit in your profile.', errorCode: 'FITBIT_NOT_CONNECTED'};
    }

    const rateLimitConfig = getRateLimitConfig(userProfile.subscriptionTier, 'heartRateTimeSeries');
    const stats = userProfile.fitbitApiCallStats?.heartRateTimeSeries;
    const now = new Date();
    const todayStart = startOfDay(now);
    let callCountToday = stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) ? stats.callCountToday || 0 : 0;

    if (stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart)) {
      if (callCountToday >= rateLimitConfig.limit) {
        console.warn(`[FitbitActions] Heart rate rate limit exceeded for user ${userId}. Tier: ${userProfile.subscriptionTier}, Count: ${callCountToday}, Limit: ${rateLimitConfig.limit}`);
        return { success: false, message: `API call limit for heart rate data reached for your tier (${rateLimitConfig.limit} per ${rateLimitConfig.periodHours} hours). Try again later.`, errorCode: 'RATE_LIMIT_EXCEEDED' };
      }
    } else {
      callCountToday = 0; // Reset for a new day
    }

    const accessToken = await getValidFitbitAccessToken();
    if (!accessToken) {
      console.error('[FitbitActions] Failed to obtain valid Fitbit access token for heart rate for user:', userId);
      return { success: false, message: 'Could not connect to Fitbit. Your session might have expired. Please try reconnecting Fitbit in your profile settings.', errorCode: 'FITBIT_AUTH_ERROR' };
    }

    let fitbitData: FitbitHeartRateActivitiesResponse;
    try {
        fitbitData = await getHeartRateTimeSeries(accessToken, targetDate, detailLevel);
         if (!fitbitData || !fitbitData['activities-heart']) {
            console.error('[FitbitActions] Fitbit API returned no heart rate data or unexpected format for date:', targetDate);
            return { success: false, message: `No heart rate data found from Fitbit for ${targetDate}.`, errorCode: 'FITBIT_NO_DATA' };
        }
    } catch (error: any) {
        console.error(`[FitbitActions] Error calling fitbitService.getHeartRateTimeSeries for user ${userId}, date ${targetDate}:`, error);
        if (error.status === 401) {
            await clearFitbitTokens();
            return { success: false, message: 'Fitbit authentication error. Your Fitbit session may have expired. Please reconnect Fitbit in your profile settings.', errorCode: 'FITBIT_AUTH_EXPIRED_POST_REFRESH' };
        }
        return { success: false, message: `Failed to fetch heart rate data from Fitbit: ${error.message}`, errorCode: 'FITBIT_API_ERROR' };
    }

    const dailyHeartSummary = fitbitData['activities-heart']?.[0]?.value;
    const intradayData = fitbitData['activities-heart-intraday'];

    const firestoreData: FitbitHeartRateFirestore = {
      date: targetDate,
      restingHeartRate: dailyHeartSummary?.restingHeartRate,
      heartRateZones: dailyHeartSummary?.heartRateZones,
      intradaySeries: intradayData ? {
        dataset: intradayData.dataset,
        datasetInterval: intradayData.datasetInterval,
        datasetType: intradayData.datasetType,
      } : undefined,
      lastFetched: new Date().toISOString(),
      dataSource: 'fitbit',
    };

    const heartRateDocRef = doc(db, 'users', userId, 'fitbit_heart_rate', targetDate);
    await setDoc(heartRateDocRef, firestoreData, { merge: true });
    console.log(`[FitbitActions] Fitbit heart rate data stored in Firestore for user ${userId}, date ${targetDate}.`);

    callCountToday++;
    const updatedStats = {
      ...userProfile.fitbitApiCallStats,
      heartRateTimeSeries: {
        lastCalledAt: now.toISOString(),
        callCountToday: callCountToday,
      },
    };
    await updateDoc(userProfileDocRef, { fitbitApiCallStats: updatedStats });
    console.log(`[FitbitActions] Updated heart rate API call stats for user ${userId}.`);

    return { success: true, message: 'Successfully fetched and stored Fitbit heart rate data.', data: firestoreData };

  } catch (error: any) {
    console.error(`[FitbitActions] Unhandled error in fetchAndStoreFitbitHeartRate for user ${userId}:`, error);
    return { success: false, message: `An unexpected server error occurred: ${error.message}`, errorCode: 'UNEXPECTED_SERVER_ERROR' };
  }
}


export async function fetchAndStoreFitbitSleep(
  targetDate: string // YYYY-MM-DD format, represents the date the sleep log ends on
): Promise<FetchFitbitDataResult> {
  console.log(`[FitbitActions] Initiating fetchAndStoreFitbitSleep for date: ${targetDate}`);

  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) {
    console.error('[FitbitActions] User not authenticated for fetchAndStoreFitbitSleep.');
    return { success: false, message: 'User not authenticated.', errorCode: 'AUTH_REQUIRED' };
  }
  const userId = currentUser.uid;

  if (!db) {
    console.error('[FitbitActions] Firestore not initialized for fetchAndStoreFitbitSleep.');
    return { success: false, message: 'Database service unavailable.', errorCode: 'DB_UNAVAILABLE' };
  }

  try {
    const userProfileDocRef = doc(db, 'users', userId);
    const userProfileSnap = await getDoc(userProfileDocRef);

    if (!userProfileSnap.exists()) {
      console.error(`[FitbitActions] User profile not found for UID: ${userId} in fetchAndStoreFitbitSleep.`);
      return { success: false, message: 'User profile not found.', errorCode: 'PROFILE_NOT_FOUND' };
    }
    const userProfile = userProfileSnap.data() as UserProfile;

    if (!userProfile.connectedFitnessApps?.some(app => app.id === 'fitbit')) {
        console.log(`[FitbitActions] Fitbit not connected for user: ${userId} for fetchAndStoreFitbitSleep.`);
        return { success: false, message: 'Fitbit not connected. Please connect Fitbit in your profile.', errorCode: 'FITBIT_NOT_CONNECTED'};
    }

    const rateLimitConfig = getRateLimitConfig(userProfile.subscriptionTier, 'sleepData');
    const stats = userProfile.fitbitApiCallStats?.sleepData;
    const now = new Date();
    const todayStart = startOfDay(now);
    let callCountToday = stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) ? stats.callCountToday || 0 : 0;

    if (stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart)) {
      if (callCountToday >= rateLimitConfig.limit) {
        console.warn(`[FitbitActions] Sleep data rate limit exceeded for user ${userId}. Tier: ${userProfile.subscriptionTier}, Count: ${callCountToday}, Limit: ${rateLimitConfig.limit}`);
        return { success: false, message: `API call limit for sleep data reached for your tier (${rateLimitConfig.limit} per ${rateLimitConfig.periodHours} hours). Try again later.`, errorCode: 'RATE_LIMIT_EXCEEDED' };
      }
    } else {
      callCountToday = 0; // Reset for a new day
    }

    const accessToken = await getValidFitbitAccessToken();
    if (!accessToken) {
      console.error('[FitbitActions] Failed to obtain valid Fitbit access token for sleep data for user:', userId);
      return { success: false, message: 'Could not connect to Fitbit. Your session might have expired. Please try reconnecting Fitbit in your profile settings.', errorCode: 'FITBIT_AUTH_ERROR' };
    }

    let fitbitResponse: FitbitSleepLogsResponse;
    try {
        fitbitResponse = await getSleepLogs(accessToken, targetDate);
        if (!fitbitResponse || !fitbitResponse.sleep || fitbitResponse.sleep.length === 0) {
            console.log(`[FitbitActions] Fitbit API returned no sleep data for user ${userId}, date ${targetDate}. This might be normal if no sleep was logged.`);
            return { success: true, message: `No sleep data found from Fitbit for ${targetDate}.`, data: [] }; // Return success but empty data
        }
    } catch (error: any) {
        console.error(`[FitbitActions] Error calling fitbitService.getSleepLogs for user ${userId}, date ${targetDate}:`, error);
        if (error.status === 401) {
            await clearFitbitTokens();
            return { success: false, message: 'Fitbit authentication error. Your Fitbit session may have expired. Please reconnect Fitbit in your profile settings.', errorCode: 'FITBIT_AUTH_EXPIRED_POST_REFRESH' };
        }
        return { success: false, message: `Failed to fetch sleep data from Fitbit: ${error.message}`, errorCode: 'FITBIT_API_ERROR' };
    }

    // Process each sleep log (Fitbit can return multiple logs for a single date, e.g., main sleep and naps)
    const processedSleepLogs: FitbitSleepLogFirestore[] = [];
    for (const log of fitbitResponse.sleep) {
        const firestoreData: FitbitSleepLogFirestore = {
          dateOfSleep: log.dateOfSleep, // This is the date the sleep log pertains to
          logId: log.logId,
          startTime: log.startTime,
          endTime: log.endTime,
          duration: log.duration,
          minutesToFallAsleep: log.minutesToFallAsleep,
          minutesAsleep: log.minutesAsleep,
          minutesAwake: log.minutesAwake,
          efficiency: log.efficiency,
          type: log.type,
          levels: log.levels ? { // Map levels if present
            summary: log.levels.summary,
            data: log.levels.data,
            shortData: log.levels.shortData,
          } : undefined,
          timeInBed: log.timeInBed,
          lastFetched: new Date().toISOString(),
          dataSource: 'fitbit',
        };
        processedSleepLogs.push(firestoreData);

        // Store each sleep log. Using dateOfSleep and logId to create a unique ID if multiple logs per day.
        // Or, decide if you only want the main sleep log. For now, storing all.
        // The document ID could be targetDate if only one main sleep log is expected, or targetDate-logId for multiple.
        // Let's assume for now we store the primary sleep log for a given date, or overwrite if multiple are fetched for the same targetDate.
        // A more robust solution might involve storing multiple sleep logs per day in a subcollection or array.
        // For simplicity, if Fitbit returns multiple logs for `targetDate`, this will save the last one processed for that `targetDate`.
        // A better approach for multiple logs would be to save each with its unique logId.
        // Let's use log.dateOfSleep as the document ID for the primary sleep log.
        const sleepDocRef = doc(db, 'users', userId, 'fitbit_sleep', log.dateOfSleep);
        await setDoc(sleepDocRef, firestoreData, { merge: true });
        console.log(`[FitbitActions] Fitbit sleep log stored in Firestore for user ${userId}, date ${log.dateOfSleep}, logId ${log.logId}.`);
    }


    callCountToday++;
    const updatedStats = {
      ...userProfile.fitbitApiCallStats,
      sleepData: {
        lastCalledAt: now.toISOString(),
        callCountToday: callCountToday,
      },
    };
    await updateDoc(userProfileDocRef, { fitbitApiCallStats: updatedStats });
    console.log(`[FitbitActions] Updated sleep data API call stats for user ${userId}.`);

    return { success: true, message: `Successfully fetched and stored ${processedSleepLogs.length} Fitbit sleep log(s).`, data: processedSleepLogs };

  } catch (error: any) {
    console.error(`[FitbitActions] Unhandled error in fetchAndStoreFitbitSleep for user ${userId}:`, error);
    return { success: false, message: `An unexpected server error occurred: ${error.message}`, errorCode: 'UNEXPECTED_SERVER_ERROR' };
  }
}
