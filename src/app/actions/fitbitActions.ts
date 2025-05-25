
'use server';

import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import type { UserProfile, SubscriptionTier, FitbitActivitySummaryFirestore, FitbitHeartRateFirestore, FitbitSleepLogFirestore, NormalizedActivityFirestore, FitbitApiCallStats } from '@/types';
import { NormalizedActivityType } from '@/types';
import { getDailyActivitySummary, getHeartRateTimeSeries, getSleepLogs, getSwimmingActivities, getLoggedActivitiesForDate, type FitbitActivityLog } from '@/lib/services/fitbitService';
import { getValidFitbitAccessToken, clearFitbitTokens } from '@/lib/fitbit-auth-utils';
import { isSameDay, startOfDay, format, parseISO } from 'date-fns';

interface FetchFitbitDataResult {
  success: boolean;
  message?: string;
  data?: any;
  errorCode?: string;
}

function getRateLimitConfig(
  tier: SubscriptionTier,
  callType: 'dailyActivitySummary' | 'heartRateTimeSeries' | 'sleepData' | 'swimmingData' | 'loggedActivities'
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

// Helper to map Fitbit activity names to NormalizedActivityType
function mapFitbitActivityNameToNormalizedType(activityName?: string): NormalizedActivityType {
  if (!activityName) return NormalizedActivityType.Other;
  const lowerName = activityName.toLowerCase();
  if (lowerName.includes('walk')) return NormalizedActivityType.Walking;
  if (lowerName.includes('run')) return NormalizedActivityType.Running;
  if (lowerName.includes('hike')) return NormalizedActivityType.Hiking;
  if (lowerName.includes('swim')) return NormalizedActivityType.Swimming;
  if (lowerName.includes('bike') || lowerName.includes('cycle')) return NormalizedActivityType.Cycling;
  if (lowerName.includes('workout') || lowerName.includes('sport') || lowerName.includes('exercise')) return NormalizedActivityType.Workout;
  return NormalizedActivityType.Other;
}

// Helper to convert distances to meters
function mapFitbitUnitToMeters(distance?: number, unit?: string): number | undefined {
  if (distance === undefined || distance === null) return undefined;
  if (!unit) { // If unit is not provided by Fitbit, we might assume a default or log warning.
    // Fitbit's API often implies units based on Accept-Language or user settings.
    // For user-logged activities without explicit units, this can be tricky.
    // If distance is present but unit is unknown, it's hard to convert.
    // Let's assume if unit is missing and distance is present, it might be in user's preferred system (e.g., km or miles)
    // This part needs robust handling based on how Fitbit API behaves for specific activities.
    // For now, if no unit, we cannot reliably convert.
    console.warn(`[FitbitActions] Distance ${distance} present but unit is missing. Cannot convert to meters.`);
    return undefined; 
  }

  const lowerUnit = unit.toLowerCase();
  switch (lowerUnit) {
    case 'meter':
    case 'meters':
      return distance;
    case 'kilometer':
    case 'kilometers':
    case 'km':
      return distance * 1000;
    case 'mile':
    case 'miles':
      return distance * 1609.34;
    case 'yard':
    case 'yards':
      return distance * 0.9144;
    default:
      console.warn(`[FitbitActions] Unknown distance unit: ${unit}. Cannot convert to meters.`);
      return undefined;
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
      callCountToday = 0;
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
        if (error.status === 401) {
            await clearFitbitTokens();
            return { success: false, message: 'Fitbit authentication error. Your Fitbit session may have expired. Please reconnect Fitbit in your profile settings.', errorCode: 'FITBIT_AUTH_EXPIRED_POST_REFRESH' };
        }
        return { success: false, message: `Failed to fetch daily activity from Fitbit: ${String(error.message || 'Unknown API error')}`, errorCode: 'FITBIT_API_ERROR' };
    }

    const summary = fitbitData.summary;
    // Fitbit API `summary.distance` is a number, unit depends on request locale or user settings.
    // 'Accept-Locale': 'en_US' typically returns miles.
    // For storing in Firestore, convert to a consistent unit (e.g., km or meters).
    // Assuming getDailyActivitySummary already provides distance in a known unit (e.g. km if Accept-Locale=en_CA, or miles if en_US).
    // For this example, let's assume it's returned in km for `fitbit_activity_summaries`.
    // If it can vary, the `fitbitService` should normalize it or provide the unit.
    // For now, we store it as is, assuming the service provides it in a consistent unit (e.g. km).
    const firestoreData: FitbitActivitySummaryFirestore = {
      date: targetDate,
      steps: summary.steps,
      distance: summary.distance, // Assuming this is in KM from the service
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
  dateRange: { from: string; to: string }
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
    const firestoreQuery = query(
        collection(db, 'users', userId, 'fitbit_activity_summaries'),
        where( '__name__', '>=', dateRange.from),
        where( '__name__', '<=', dateRange.to),
        orderBy('__name__', 'desc')
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
  targetDate: string,
  detailLevel: '1min' | '1sec' = '1min'
): Promise<FetchFitbitDataResult> {
  console.log(`[FitbitActions] Initiating fetchAndStoreFitbitHeartRate for date: ${targetDate}, detail: ${detailLevel}`);
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) return { success: false, message: 'User not authenticated.', errorCode: 'AUTH_REQUIRED' };
  const userId = currentUser.uid;

  if (!db || !db.app) return { success: false, message: 'Database service unavailable.', errorCode: 'DB_UNAVAILABLE' };

  try {
    const userProfileDocRef = doc(db, 'users', userId);
    const userProfileSnap = await getDoc(userProfileDocRef);
    if (!userProfileSnap.exists()) return { success: false, message: 'User profile not found.', errorCode: 'PROFILE_NOT_FOUND' };
    const userProfile = userProfileSnap.data() as UserProfile;

    if (!userProfile.connectedFitnessApps?.some(app => app.id === 'fitbit')) {
        return { success: false, message: 'Fitbit not connected.', errorCode: 'FITBIT_NOT_CONNECTED'};
    }

    const rateLimitConfig = getRateLimitConfig(userProfile.subscriptionTier, 'heartRateTimeSeries');
    const stats = userProfile.fitbitApiCallStats?.heartRateTimeSeries;
    const now = new Date();
    const todayStart = startOfDay(now);
    let callCountToday = stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) ? stats.callCountToday || 0 : 0;

    if (stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) && callCountToday >= rateLimitConfig.limit) {
      return { success: false, message: `API call limit for heart rate data reached for your tier.`, errorCode: 'RATE_LIMIT_EXCEEDED' };
    } else if (!stats?.lastCalledAt || !isSameDay(new Date(stats.lastCalledAt), todayStart)) {
      callCountToday = 0;
    }

    const accessToken = await getValidFitbitAccessToken();
    if (!accessToken) return { success: false, message: 'Could not connect to Fitbit. Session might have expired.', errorCode: 'FITBIT_AUTH_ERROR' };

    let fitbitData;
    try {
        fitbitData = await getHeartRateTimeSeries(accessToken, targetDate, detailLevel);
         if (!fitbitData || !fitbitData['activities-heart']) {
            return { success: false, message: `No heart rate data found from Fitbit for ${targetDate}.`, errorCode: 'FITBIT_NO_DATA' };
        }
    } catch (error: any) {
        if (error.status === 401) {
            await clearFitbitTokens();
            return { success: false, message: 'Fitbit authentication error. Please reconnect Fitbit.', errorCode: 'FITBIT_AUTH_EXPIRED_POST_REFRESH' };
        }
        return { success: false, message: `Failed to fetch heart rate data from Fitbit: ${String(error.message || 'Unknown API error')}`, errorCode: 'FITBIT_API_ERROR' };
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

    callCountToday++;
    const updatedStats = {
      ...(userProfile.fitbitApiCallStats || {}),
      heartRateTimeSeries: { lastCalledAt: now.toISOString(), callCountToday },
    };
    await updateDoc(userProfileDocRef, { fitbitApiCallStats: updatedStats });

    return { success: true, message: 'Successfully fetched and stored Fitbit heart rate data.', data: firestoreData };

  } catch (error: any) {
    console.error(`[FitbitActions] Unhandled error in fetchAndStoreFitbitHeartRate for user ${userId}:`, error);
    return { success: false, message: `An unexpected server error occurred: ${String(error.message || 'Unknown server error')}`, errorCode: 'UNEXPECTED_SERVER_ERROR' };
  }
}

export async function fetchAndStoreFitbitSleep(
  targetDate: string
): Promise<FetchFitbitDataResult> {
  console.log(`[FitbitActions] Initiating fetchAndStoreFitbitSleep for date: ${targetDate}`);
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) return { success: false, message: 'User not authenticated.', errorCode: 'AUTH_REQUIRED' };
  const userId = currentUser.uid;

  if (!db || !db.app) return { success: false, message: 'Database service unavailable.', errorCode: 'DB_UNAVAILABLE' };
  
  try {
    const userProfileDocRef = doc(db, 'users', userId);
    const userProfileSnap = await getDoc(userProfileDocRef);
    if (!userProfileSnap.exists()) return { success: false, message: 'User profile not found.', errorCode: 'PROFILE_NOT_FOUND' };
    const userProfile = userProfileSnap.data() as UserProfile;

    if (!userProfile.connectedFitnessApps?.some(app => app.id === 'fitbit')) {
        return { success: false, message: 'Fitbit not connected.', errorCode: 'FITBIT_NOT_CONNECTED'};
    }

    const rateLimitConfig = getRateLimitConfig(userProfile.subscriptionTier, 'sleepData');
    const stats = userProfile.fitbitApiCallStats?.sleepData;
    const now = new Date();
    const todayStart = startOfDay(now);
    let callCountToday = stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) ? stats.callCountToday || 0 : 0;

    if (stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) && callCountToday >= rateLimitConfig.limit) {
      return { success: false, message: `API call limit for sleep data reached.`, errorCode: 'RATE_LIMIT_EXCEEDED' };
    } else if (!stats?.lastCalledAt || !isSameDay(new Date(stats.lastCalledAt), todayStart)) {
      callCountToday = 0;
    }

    const accessToken = await getValidFitbitAccessToken();
    if (!accessToken) return { success: false, message: 'Could not connect to Fitbit.', errorCode: 'FITBIT_AUTH_ERROR' };

    let fitbitResponse;
    try {
        fitbitResponse = await getSleepLogs(accessToken, targetDate);
    } catch (error: any) {
        if (error.status === 401) {
            await clearFitbitTokens();
            return { success: false, message: 'Fitbit authentication error. Please reconnect Fitbit.', errorCode: 'FITBIT_AUTH_EXPIRED_POST_REFRESH' };
        }
        return { success: false, message: `Failed to fetch sleep data: ${String(error.message)}`, errorCode: 'FITBIT_API_ERROR' };
    }
    
    callCountToday++; // Increment here as API call was made
    const updatedStats = {
      ...(userProfile.fitbitApiCallStats || {}),
      sleepData: { lastCalledAt: now.toISOString(), callCountToday },
    };
    await updateDoc(userProfileDocRef, { fitbitApiCallStats: updatedStats });

    if (!fitbitResponse || !fitbitResponse.sleep || fitbitResponse.sleep.length === 0) {
        return { success: true, message: `No sleep data found from Fitbit for ${targetDate}.`, data: [] };
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
        // Store each sleep log using its logId for uniqueness in a subcollection for that date
        const sleepDocRef = doc(db, 'users', userId, 'fitbit_sleep', String(log.logId));
        await setDoc(sleepDocRef, firestoreData, { merge: true });
    }
    
    return { success: true, message: `Successfully fetched and stored ${processedSleepLogs.length} Fitbit sleep log(s).`, data: processedSleepLogs };

  } catch (error: any) {
    console.error(`[FitbitActions] Unhandled error in fetchAndStoreFitbitSleep for user ${userId}:`, error);
    return { success: false, message: `An unexpected server error occurred: ${String(error.message)}`, errorCode: 'UNEXPECTED_SERVER_ERROR' };
  }
}


export async function fetchAndStoreFitbitSwimmingData(
  targetDate: string // YYYY-MM-DD format
): Promise<FetchFitbitDataResult> {
  console.log(`[FitbitActions] Initiating fetchAndStoreFitbitSwimmingData for date: ${targetDate}`);
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) return { success: false, message: 'User not authenticated.', errorCode: 'AUTH_REQUIRED' };
  const userId = currentUser.uid;

  if (!db || !db.app) return { success: false, message: 'Database service unavailable.', errorCode: 'DB_UNAVAILABLE' };

  try {
    const userProfileDocRef = doc(db, 'users', userId);
    const userProfileSnap = await getDoc(userProfileDocRef);
    if (!userProfileSnap.exists()) return { success: false, message: 'User profile not found.', errorCode: 'PROFILE_NOT_FOUND' };
    const userProfile = userProfileSnap.data() as UserProfile;

    if (!userProfile.connectedFitnessApps?.some(app => app.id === 'fitbit')) {
      return { success: false, message: 'Fitbit not connected.', errorCode: 'FITBIT_NOT_CONNECTED' };
    }

    const rateLimitConfig = getRateLimitConfig(userProfile.subscriptionTier, 'swimmingData');
    const stats = userProfile.fitbitApiCallStats?.swimmingData;
    const now = new Date();
    const todayStart = startOfDay(now);
    let callCountToday = stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) ? stats.callCountToday || 0 : 0;

    if (stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) && callCountToday >= rateLimitConfig.limit) {
      return { success: false, message: `API call limit for swimming data reached.`, errorCode: 'RATE_LIMIT_EXCEEDED' };
    } else if (!stats?.lastCalledAt || !isSameDay(new Date(stats.lastCalledAt), todayStart)) {
      callCountToday = 0;
    }

    const accessToken = await getValidFitbitAccessToken();
    if (!accessToken) return { success: false, message: 'Could not connect to Fitbit.', errorCode: 'FITBIT_AUTH_ERROR' };

    let swimmingActivities: FitbitActivityLog[];
    try {
      swimmingActivities = await getSwimmingActivities(accessToken, targetDate); // Uses fitbitService
    } catch (error: any) {
      if (error.status === 401) {
        await clearFitbitTokens();
        return { success: false, message: 'Fitbit authentication error. Please reconnect Fitbit.', errorCode: 'FITBIT_AUTH_EXPIRED_POST_REFRESH' };
      }
      return { success: false, message: `Failed to fetch swimming activities: ${String(error.message)}`, errorCode: 'FITBIT_API_ERROR' };
    }

    callCountToday++; // Increment here as API call was made
    const updatedStats = {
      ...(userProfile.fitbitApiCallStats || {}),
      swimmingData: { lastCalledAt: now.toISOString(), callCountToday },
    };
    await updateDoc(userProfileDocRef, { fitbitApiCallStats: updatedStats });

    if (!swimmingActivities || swimmingActivities.length === 0) {
      return { success: true, message: `No swimming data found from Fitbit for ${targetDate}.`, data: [] };
    }

    const processedSwims: NormalizedActivityFirestore[] = [];
    for (const swim of swimmingActivities) {
      try {
        const activityDate = swim.startDate; // YYYY-MM-DD
        let fullStartTimeISO = `${activityDate}T${swim.startTime}`; // Combine date and time
        try {
            // Attempt to parse and reformat to ensure it's a valid ISO string, ideally UTC
            // Fitbit startTime is local. For UTC, timezone info would be needed from user profile or activity.
            // For now, assuming parseISO can handle it or we store as local+offset if available.
            fullStartTimeISO = parseISO(fullStartTimeISO).toISOString();
        } catch (parseErr) {
            console.warn(`[FitbitActions] Could not parse combined datetime ${activityDate}T${swim.startTime} for swim log ${swim.logId}. Using as is. Error: ${parseErr}`);
            // Fallback to using the combined string if parsing fails, might not be ideal for DB queries
        }

        const distanceMeters = mapFitbitUnitToMeters(swim.distance, swim.distanceUnit); // Use the helper

        const normalizedSwim: NormalizedActivityFirestore = {
          id: `fitbit-${swim.logId}`,
          userId: userId,
          originalId: String(swim.logId),
          dataSource: 'fitbit',
          type: NormalizedActivityType.Swimming,
          name: swim.name || 'Swim',
          startTimeUtc: fullStartTimeISO, // This assumes the parsed time is UTC or close enough. Proper timezone handling is complex.
          startTimeLocal: `${activityDate}T${swim.startTime}`, // Store original local time
          // timezone: userProfile.timezone, // If available from user profile
          durationMovingSec: swim.duration ? swim.duration / 1000 : undefined, // Convert ms to s
          durationElapsedSec: swim.duration ? swim.duration / 1000 : undefined, // Fitbit usually provides one duration for logged activities
          distanceMeters: distanceMeters,
          calories: swim.calories,
          averageHeartRateBpm: swim.averageHeartRate,
          date: activityDate,
          lastFetched: new Date().toISOString(),
        };
        processedSwims.push(normalizedSwim);

        const activityDocRef = doc(db, 'users', userId, 'activities', normalizedSwim.id);
        await setDoc(activityDocRef, normalizedSwim, { merge: true });
      } catch (transformError: any) {
        console.error(`[FitbitActions] Error transforming Fitbit swim log ${swim.logId}: ${transformError.message}. Skipping this record.`);
        // Optionally, store erroneous records in a separate "error" collection for review
      }
    }

    return { success: true, message: `Successfully fetched and stored ${processedSwims.length} Fitbit swimming activities.`, data: processedSwims };

  } catch (error: any) {
    console.error(`[FitbitActions] Unhandled error in fetchAndStoreFitbitSwimmingData for user ${userId}:`, error);
    return { success: false, message: `An unexpected server error occurred: ${String(error.message)}`, errorCode: 'UNEXPECTED_SERVER_ERROR' };
  }
}
