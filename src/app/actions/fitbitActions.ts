
'use server';

import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import type { UserProfile, SubscriptionTier, FitbitActivitySummaryFirestore, FitbitHeartRateFirestore, FitbitSleepLogFirestore, FitbitSwimmingActivityFirestore } from '@/types';
import { getDailyActivitySummary, getHeartRateTimeSeries, getSleepLogs, getSwimmingActivities, type FitbitHeartRateActivitiesResponse, type FitbitSleepLogsResponse, type FitbitSleepLog, type FitbitActivityLog } from '@/lib/services/fitbitService';
import { getValidFitbitAccessToken, clearFitbitTokens } from '@/lib/fitbit-auth-utils';
import { isSameDay, startOfDay, format, parseISO } from 'date-fns';

interface FetchFitbitDataResult {
  success: boolean;
  message?: string;
  data?: any; // Could be Firestore data types or count of items processed
  errorCode?: string;
}

function getRateLimitConfig(
  tier: SubscriptionTier,
  callType: 'dailyActivitySummary' | 'heartRateTimeSeries' | 'sleepData' | 'swimmingData'
): { limit: number; periodHours: number } {
  // For this example, all have the same rate limits per tier.
  // This could be differentiated if needed.
  switch (tier) {
    case 'platinum':
      return { limit: 3, periodHours: 24 }; // Platinum gets more calls
    case 'free':
    case 'silver':
    case 'gold':
    default:
      return { limit: 1, periodHours: 24 }; // Default limit
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

  if (!db || !db.app) {
    console.error('[FitbitActions] Firestore not initialized for fetchAndStoreFitbitDailyActivity. DB App:', db?.app);
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
        return { success: false, message: `Failed to fetch daily activity from Fitbit: ${String(error.message || 'Unknown API error')}`, errorCode: 'FITBIT_API_ERROR' };
    }

    const summary = fitbitData.summary;
    const firestoreData: FitbitActivitySummaryFirestore = {
      date: targetDate, // Storing as YYYY-MM-DD
      steps: summary.steps,
      distance: summary.distance, // This is typically a sum of distances from all activities for the day
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
      ...(userProfile.fitbitApiCallStats || {}),
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
    return { success: false, message: `An unexpected server error occurred: ${String(error.message || 'Unknown server error')}`, errorCode: 'UNEXPECTED_SERVER_ERROR' };
  }
}

export async function getFitbitActivitySummariesForDateRange(
  dateRange: { from: string; to: string } // YYYY-MM-DD format
): Promise<{ success: boolean; data?: FitbitActivitySummaryFirestore[]; error?: string }> {
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) {
    return { success: false, error: 'User not authenticated.' };
  }
  const userId = currentUser.uid;

  if (!db || !db.app) {
    console.error('[FitbitActions] Firestore not initialized for getFitbitActivitySummariesForDateRange. DB App:', db?.app);
    return { success: false, error: 'Database service unavailable.' };
  }

  try {
    const summariesRef = collection(db, 'users', userId, 'fitbit_activity_summaries');
    // Firestore queries for document IDs (which are dates here) within a range
    const q = query(summariesRef, 
                    where(doc().id, '>=', dateRange.from), 
                    where(doc().id, '<=', dateRange.to),
                    orderBy(doc().id, 'desc') // Get most recent first within the range
                  );
    
    // Firebase JS SDK v9 uses FieldPath.documentId() for querying by document ID
    // However, direct string comparison on document IDs (YYYY-MM-DD) works for lexicographical range queries
    // For more robust date range queries where IDs aren't dates, you'd store the date as a field.
    // Here, since doc ID IS the date string, this should work.
    const firestoreQuery = query(
        collection(db, 'users', userId, 'fitbit_activity_summaries'),
        where( '__name__', '>=', dateRange.from),
        where( '__name__', '<=', dateRange.to),
        orderBy('__name__', 'desc') // Sort by document ID (date) descending
    );


    const querySnapshot = await getDocs(firestoreQuery);
    const summaries: FitbitActivitySummaryFirestore[] = [];
    querySnapshot.forEach((docSnap) => {
      summaries.push(docSnap.data() as FitbitActivitySummaryFirestore);
    });
    console.log(`[FitbitActions] Fetched ${summaries.length} activity summaries from Firestore for user ${userId} range ${dateRange.from}-${dateRange.to}`);
    return { success: true, data: summaries };
  } catch (error: any) {
    console.error(`[FitbitActions] Error fetching activity summaries from Firestore for user ${userId}:`, error);
    return { success: false, error: `Failed to fetch activity summaries: ${String(error.message || 'Unknown Firestore error')}` };
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

  if (!db || !db.app) {
    console.error('[FitbitActions] Firestore not initialized for fetchAndStoreFitbitHeartRate. DB App:', db?.app);
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
        return { success: false, message: `Failed to fetch heart rate data from Fitbit: ${String(error.message || 'Unknown API error')}`, errorCode: 'FITBIT_API_ERROR' };
    }

    const dailyHeartSummary = fitbitData['activities-heart']?.[0]?.value;
    const intradayData = fitbitData['activities-heart-intraday'];

    const firestoreData: FitbitHeartRateFirestore = {
      date: targetDate, // Storing as YYYY-MM-DD
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
      ...(userProfile.fitbitApiCallStats || {}),
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
    return { success: false, message: `An unexpected server error occurred: ${String(error.message || 'Unknown server error')}`, errorCode: 'UNEXPECTED_SERVER_ERROR' };
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

  if (!db || !db.app) {
    console.error('[FitbitActions] Firestore not initialized for fetchAndStoreFitbitSleep. DB App:', db?.app);
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
            // Update API call stats even if no new data, as an API call was made.
            callCountToday++;
            const updatedStatsNoData = {
              ...(userProfile.fitbitApiCallStats || {}),
              sleepData: {
                lastCalledAt: now.toISOString(),
                callCountToday: callCountToday,
              },
            };
            await updateDoc(userProfileDocRef, { fitbitApiCallStats: updatedStatsNoData });
            return { success: true, message: `No sleep data found from Fitbit for ${targetDate}.`, data: [] };
        }
    } catch (error: any) {
        console.error(`[FitbitActions] Error calling fitbitService.getSleepLogs for user ${userId}, date ${targetDate}:`, error);
        if (error.status === 401) {
            await clearFitbitTokens();
            return { success: false, message: 'Fitbit authentication error. Your Fitbit session may have expired. Please reconnect Fitbit in your profile settings.', errorCode: 'FITBIT_AUTH_EXPIRED_POST_REFRESH' };
        }
        return { success: false, message: `Failed to fetch sleep data from Fitbit: ${String(error.message || 'Unknown API error')}`, errorCode: 'FITBIT_API_ERROR' };
    }

    const processedSleepLogs: FitbitSleepLogFirestore[] = [];
    for (const log of fitbitResponse.sleep) {
        const firestoreData: FitbitSleepLogFirestore = {
          dateOfSleep: log.dateOfSleep,
          logId: log.logId,
          startTime: log.startTime,
          endTime: log.endTime,
          duration: log.duration,
          minutesToFallAsleep: log.minutesToFallAsleep,
          minutesAsleep: log.minutesAsleep,
          minutesAwake: log.minutesAwake,
          timeInBed: log.timeInBed,
          efficiency: log.efficiency,
          type: log.type,
          levels: log.levels ? {
            summary: log.levels.summary,
            data: log.levels.data,
            shortData: log.levels.shortData,
          } : undefined,
          lastFetched: new Date().toISOString(),
          dataSource: 'fitbit',
        };
        processedSleepLogs.push(firestoreData);

        // Store each sleep log using its logId as the document ID for uniqueness
        // The subcollection is 'fitbit_sleep', documents are identified by logId
        const sleepDocRef = doc(db, 'users', userId, 'fitbit_sleep', String(log.logId));
        await setDoc(sleepDocRef, firestoreData, { merge: true });
        console.log(`[FitbitActions] Fitbit sleep log stored in Firestore for user ${userId}, logId ${log.logId}.`);
    }

    callCountToday++;
    const updatedStats = {
      ...(userProfile.fitbitApiCallStats || {}),
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
    return { success: false, message: `An unexpected server error occurred: ${String(error.message || 'Unknown server error')}`, errorCode: 'UNEXPECTED_SERVER_ERROR' };
  }
}

export async function fetchAndStoreFitbitSwimmingData(
  targetDate: string // YYYY-MM-DD format
): Promise<FetchFitbitDataResult> {
  console.log(`[FitbitActions] Initiating fetchAndStoreFitbitSwimmingData for date: ${targetDate}`);

  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) {
    console.error('[FitbitActions] User not authenticated for fetchAndStoreFitbitSwimmingData.');
    return { success: false, message: 'User not authenticated.', errorCode: 'AUTH_REQUIRED' };
  }
  const userId = currentUser.uid;

  if (!db || !db.app) {
    console.error('[FitbitActions] Firestore not initialized for fetchAndStoreFitbitSwimmingData. DB App:', db?.app);
    return { success: false, message: 'Database service unavailable.', errorCode: 'DB_UNAVAILABLE' };
  }

  try {
    const userProfileDocRef = doc(db, 'users', userId);
    const userProfileSnap = await getDoc(userProfileDocRef);

    if (!userProfileSnap.exists()) {
      console.error(`[FitbitActions] User profile not found for UID: ${userId} in fetchAndStoreFitbitSwimmingData.`);
      return { success: false, message: 'User profile not found.', errorCode: 'PROFILE_NOT_FOUND' };
    }
    const userProfile = userProfileSnap.data() as UserProfile;

    if (!userProfile.connectedFitnessApps?.some(app => app.id === 'fitbit')) {
      console.log(`[FitbitActions] Fitbit not connected for user: ${userId} for fetchAndStoreFitbitSwimmingData.`);
      return { success: false, message: 'Fitbit not connected. Please connect Fitbit in your profile.', errorCode: 'FITBIT_NOT_CONNECTED' };
    }

    const rateLimitConfig = getRateLimitConfig(userProfile.subscriptionTier, 'swimmingData');
    const stats = userProfile.fitbitApiCallStats?.swimmingData;
    const now = new Date();
    const todayStart = startOfDay(now);
    let callCountToday = stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) ? stats.callCountToday || 0 : 0;

    if (stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart)) {
      if (callCountToday >= rateLimitConfig.limit) {
        console.warn(`[FitbitActions] Swimming data rate limit exceeded for user ${userId}. Tier: ${userProfile.subscriptionTier}, Count: ${callCountToday}, Limit: ${rateLimitConfig.limit}`);
        return { success: false, message: `API call limit for swimming data reached for your tier (${rateLimitConfig.limit} per ${rateLimitConfig.periodHours} hours). Try again later.`, errorCode: 'RATE_LIMIT_EXCEEDED' };
      }
    } else {
      callCountToday = 0; // Reset for a new day
    }

    const accessToken = await getValidFitbitAccessToken();
    if (!accessToken) {
      console.error('[FitbitActions] Failed to obtain valid Fitbit access token for swimming data for user:', userId);
      return { success: false, message: 'Could not connect to Fitbit. Your session might have expired. Please try reconnecting Fitbit in your profile settings.', errorCode: 'FITBIT_AUTH_ERROR' };
    }

    let swimmingActivities: FitbitActivityLog[];
    try {
      swimmingActivities = await getSwimmingActivities(accessToken, targetDate);
      if (!swimmingActivities || swimmingActivities.length === 0) {
        console.log(`[FitbitActions] No swimming activities found from Fitbit for user ${userId}, date ${targetDate}.`);
         // Update API call stats even if no new data.
        callCountToday++;
        const updatedStatsNoData = {
          ...(userProfile.fitbitApiCallStats || {}),
          swimmingData: {
            lastCalledAt: now.toISOString(),
            callCountToday: callCountToday,
          },
        };
        await updateDoc(userProfileDocRef, { fitbitApiCallStats: updatedStatsNoData });
        return { success: true, message: `No swimming data found from Fitbit for ${targetDate}.`, data: [] };
      }
    } catch (error: any) {
      console.error(`[FitbitActions] Error calling fitbitService.getSwimmingActivities for user ${userId}, date ${targetDate}:`, error);
      if (error.status === 401) {
        await clearFitbitTokens();
        return { success: false, message: 'Fitbit authentication error. Your Fitbit session may have expired. Please reconnect Fitbit in your profile settings.', errorCode: 'FITBIT_AUTH_EXPIRED_POST_REFRESH' };
      }
      return { success: false, message: `Failed to fetch swimming data from Fitbit: ${String(error.message || 'Unknown API error')}`, errorCode: 'FITBIT_API_ERROR' };
    }

    const processedSwims: FitbitSwimmingActivityFirestore[] = [];
    for (const swim of swimmingActivities) {
      // Combine startDate (YYYY-MM-DD) and startTime (HH:MM) to create a full ISO string for startTime
      const fullStartTimeISO = parseISO(`${swim.startDate}T${swim.startTime}:00Z`).toISOString(); // Assuming UTC for now, Fitbit API might specify timezone

      const firestoreData: FitbitSwimmingActivityFirestore = {
        logId: swim.logId,
        activityName: swim.name, // Should be "Swim"
        startTime: fullStartTimeISO, 
        duration: swim.duration,
        calories: swim.calories,
        distance: swim.distance,
        distanceUnit: swim.distanceUnit as FitbitSwimmingActivityFirestore['distanceUnit'],
        pace: swim.pace,
        lastFetched: new Date().toISOString(),
        dataSource: 'fitbit',
      };
      processedSwims.push(firestoreData);

      // Store each swim log using its logId as the document ID for uniqueness
      const swimDocRef = doc(db, 'users', userId, 'fitbit_swimming_activities', String(swim.logId));
      await setDoc(swimDocRef, firestoreData, { merge: true });
      console.log(`[FitbitActions] Fitbit swimming activity stored in Firestore for user ${userId}, logId ${swim.logId}.`);
    }

    callCountToday++;
    const updatedStats = {
      ...(userProfile.fitbitApiCallStats || {}),
      swimmingData: {
        lastCalledAt: now.toISOString(),
        callCountToday: callCountToday,
      },
    };
    await updateDoc(userProfileDocRef, { fitbitApiCallStats: updatedStats });
    console.log(`[FitbitActions] Updated swimming data API call stats for user ${userId}.`);

    return { success: true, message: `Successfully fetched and stored ${processedSwims.length} Fitbit swimming activities.`, data: processedSwims };

  } catch (error: any) {
    console.error(`[FitbitActions] Unhandled error in fetchAndStoreFitbitSwimmingData for user ${userId}:`, error);
    return { success: false, message: `An unexpected server error occurred: ${String(error.message || 'Unknown server error')}`, errorCode: 'UNEXPECTED_SERVER_ERROR' };
  }
}
