
'use server';

import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import type { UserProfile, SubscriptionTier, FitbitActivitySummaryFirestore, FitbitHeartRateFirestore, FitbitSleepLogFirestore, NormalizedActivityFirestore, FitbitApiCallStats } from '@/types';
import { NormalizedActivityType } from '@/types';
import { getDailyActivitySummary, getHeartRateTimeSeries, getSleepLogs, getSwimmingActivities, type FitbitActivityLog } from '@/lib/services/fitbitService';
import { getValidFitbitAccessToken, clearFitbitTokens } from '@/lib/fitbit-auth-utils';
import { isSameDay, startOfDay, format, parseISO } from 'date-fns';

interface FetchFitbitDataResult {
  success: boolean;
  message?: string;
  data?: any;
  errorCode?: string;
}

type FitbitCallType = 'dailyActivitySummary' | 'heartRateTimeSeries' | 'sleepData' | 'swimmingData' | 'loggedActivities';


function getRateLimitConfig(
  tier: SubscriptionTier,
  callType: FitbitCallType
): { limit: number; periodHours: number } {
  // For now, all Fitbit calls have the same rate limits per tier
  // This function can be expanded if different call types need different limits
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
  // Add more specific mappings if needed
  return NormalizedActivityType.Other;
}

// Helper to convert distances to meters
function mapFitbitUnitToMeters(distance?: number, unit?: string): number | undefined {
  if (distance === undefined || distance === null || isNaN(distance)) return undefined;
  if (!unit) {
    console.warn(`[FitbitActions] mapFitbitUnitToMeters: Distance ${distance} present but unit is missing. Cannot convert to meters reliably.`);
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
      console.warn(`[FitbitActions] mapFitbitUnitToMeters: Unknown distance unit: ${unit}. Cannot convert to meters.`);
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

    const callType: FitbitCallType = 'dailyActivitySummary';
    const rateLimitConfig = getRateLimitConfig(userProfile.subscriptionTier, callType);
    const stats = userProfile.fitbitApiCallStats?.[callType];
    const now = new Date();
    const todayStart = startOfDay(now);
    let callCountToday = stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) ? stats.callCountToday || 0 : 0;

    if (stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart)) {
      if (callCountToday >= rateLimitConfig.limit) {
        console.warn(`[FitbitActions] ${callType} rate limit exceeded for user ${userId}. Tier: ${userProfile.subscriptionTier}, Count: ${callCountToday}, Limit: ${rateLimitConfig.limit}`);
        return { success: false, message: `API call limit for ${callType} reached for your tier (${rateLimitConfig.limit} per ${rateLimitConfig.periodHours} hours). Try again later.`, errorCode: 'RATE_LIMIT_EXCEEDED' };
      }
    } else {
      callCountToday = 0; // Reset for new day
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
        if (error.status === 401) { // Unauthorized, likely token expired/revoked
            await clearFitbitTokens(); // Clear potentially invalid tokens
            return { success: false, message: 'Fitbit authentication error. Your Fitbit session may have expired. Please reconnect Fitbit in your profile settings.', errorCode: 'FITBIT_AUTH_EXPIRED_POST_REFRESH' };
        }
        return { success: false, message: `Failed to fetch daily activity from Fitbit: ${String(error.message || 'Unknown API error')}`, errorCode: 'FITBIT_API_ERROR' };
    }

    const summary = fitbitData.summary;
    const firestoreData: FitbitActivitySummaryFirestore = {
      date: targetDate,
      steps: summary.steps,
      distance: summary.distance, 
      caloriesOut: summary.caloriesOut,
      activeMinutes: (summary.fairlyActiveMinutes || 0) + (summary.veryActiveMinutes || 0),
      lastFetched: new Date().toISOString(),
      dataSource: 'fitbit',
    };

    const activityDocRef = doc(db, 'users', userId, 'fitbit_activity_summaries', targetDate);
    await setDoc(activityDocRef, firestoreData, { merge: true });
    console.log(`[FitbitActions] Fitbit daily activity summary stored in Firestore for user ${userId}, date ${targetDate}.`);

    callCountToday++;
    const updatedStats: FitbitApiCallStats = {
      ...(userProfile.fitbitApiCallStats || {}),
      [callType]: {
        lastCalledAt: now.toISOString(),
        callCountToday: callCountToday,
      },
    };
    await updateDoc(userProfileDocRef, { fitbitApiCallStats: updatedStats });
    console.log(`[FitbitActions] Updated ${callType} API call stats for user ${userId}.`);

    return { success: true, message: 'Successfully fetched and stored Fitbit daily activity.', data: firestoreData };

  } catch (error: any) {
    console.error(`[FitbitActions] Unhandled error in fetchAndStoreFitbitDailyActivity for user ${userId}:`, error);
    return { success: false, message: `An unexpected server error occurred: ${String(error.message || 'Unknown server error')}`, errorCode: 'UNEXPECTED_SERVER_ERROR' };
  }
}

export async function getFitbitActivitySummariesForDateRange(
  dateRange: { from: string; to: string } // Dates in 'yyyy-MM-dd' format
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
    console.log(`[FitbitActions] Fetching fitbit_activity_summaries for user ${userId} from ${dateRange.from} to ${dateRange.to}`);
    
    const summariesCollectionRef = collection(db, 'users', userId, 'fitbit_activity_summaries');
    const firestoreQuery = query(
      summariesCollectionRef,
      where('__name__', '>=', dateRange.from), // Query by document ID (which is the date)
      where('__name__', '<=', dateRange.to),
      orderBy('__name__', 'desc') // Order by document ID (date)
    );

    const querySnapshot = await getDocs(firestoreQuery);
    const summaries: FitbitActivitySummaryFirestore[] = [];
    querySnapshot.forEach((docSnap) => {
      summaries.push(docSnap.data() as FitbitActivitySummaryFirestore);
    });

    console.log(`[FitbitActions] Fetched ${summaries.length} fitbit_activity_summaries from Firestore for user ${userId}.`);
    return { success: true, data: summaries };
  } catch (error: any) {
    console.error(`[FitbitActions] Error fetching fitbit_activity_summaries from Firestore for user ${userId}:`, error);
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
    
    const callType: FitbitCallType = 'heartRateTimeSeries';
    const rateLimitConfig = getRateLimitConfig(userProfile.subscriptionTier, callType);
    const stats = userProfile.fitbitApiCallStats?.[callType];
    const now = new Date();
    const todayStart = startOfDay(now);
    let callCountToday = stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) ? stats.callCountToday || 0 : 0;

    if (stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) && callCountToday >= rateLimitConfig.limit) {
      return { success: false, message: `API call limit for ${callType} reached for your tier.`, errorCode: 'RATE_LIMIT_EXCEEDED' };
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
        console.error(`[FitbitActions] Error calling fitbitService.getHeartRateTimeSeries for user ${userId}, date ${targetDate}:`, error);
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
    const updatedStats: FitbitApiCallStats = {
      ...(userProfile.fitbitApiCallStats || {}),
      [callType]: { lastCalledAt: now.toISOString(), callCountToday },
    };
    await updateDoc(userProfileDocRef, { fitbitApiCallStats: updatedStats });

    return { success: true, message: 'Successfully fetched and stored Fitbit heart rate data.', data: firestoreData };

  } catch (error: any) {
    console.error(`[FitbitActions] Unhandled error in fetchAndStoreFitbitHeartRate for user ${userId}:`, error);
    return { success: false, message: `An unexpected server error occurred: ${String(error.message || 'Unknown server error')}`, errorCode: 'UNEXPECTED_SERVER_ERROR' };
  }
}

export async function fetchAndStoreFitbitSleep(
  targetDate: string // YYYY-MM-DD
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
    
    const callType: FitbitCallType = 'sleepData';
    const rateLimitConfig = getRateLimitConfig(userProfile.subscriptionTier, callType);
    const stats = userProfile.fitbitApiCallStats?.[callType];
    const now = new Date();
    const todayStart = startOfDay(now);
    let callCountToday = stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) ? stats.callCountToday || 0 : 0;

    if (stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) && callCountToday >= rateLimitConfig.limit) {
      return { success: false, message: `API call limit for ${callType} reached.`, errorCode: 'RATE_LIMIT_EXCEEDED' };
    } else if (!stats?.lastCalledAt || !isSameDay(new Date(stats.lastCalledAt), todayStart)) {
      callCountToday = 0;
    }

    const accessToken = await getValidFitbitAccessToken();
    if (!accessToken) return { success: false, message: 'Could not connect to Fitbit.', errorCode: 'FITBIT_AUTH_ERROR' };

    let fitbitResponse;
    try {
        fitbitResponse = await getSleepLogs(accessToken, targetDate);
    } catch (error: any) {
        console.error(`[FitbitActions] Error calling fitbitService.getSleepLogs for user ${userId}, date ${targetDate}:`, error);
        if (error.status === 401) {
            await clearFitbitTokens();
            return { success: false, message: 'Fitbit authentication error. Please reconnect Fitbit.', errorCode: 'FITBIT_AUTH_EXPIRED_POST_REFRESH' };
        }
        return { success: false, message: `Failed to fetch sleep data from Fitbit: ${String(error.message)}`, errorCode: 'FITBIT_API_ERROR' };
    }
    
    // Increment API call stats regardless of whether data was found, as the API call was made
    callCountToday++; 
    const updatedStats: FitbitApiCallStats = {
      ...(userProfile.fitbitApiCallStats || {}),
      [callType]: { lastCalledAt: now.toISOString(), callCountToday },
    };
    await updateDoc(userProfileDocRef, { fitbitApiCallStats: updatedStats });
    console.log(`[FitbitActions] Updated ${callType} API call stats for user ${userId}.`);


    if (!fitbitResponse || !fitbitResponse.sleep || fitbitResponse.sleep.length === 0) {
        console.log(`[FitbitActions] No sleep data found from Fitbit for user ${userId}, date ${targetDate}.`);
        return { success: true, message: `No sleep data found from Fitbit for ${targetDate}.`, data: [] };
    }

    const processedSleepLogs: FitbitSleepLogFirestore[] = [];
    for (const log of fitbitResponse.sleep) {
        try {
            const firestoreData: FitbitSleepLogFirestore = {
              dateOfSleep: log.dateOfSleep, // This is YYYY-MM-DD, use as document ID
              logId: log.logId,
              startTime: log.startTime, // ISO8601
              endTime: log.endTime, // ISO8601
              duration: log.duration, // milliseconds
              isMainSleep: log.isMainSleep,
              minutesToFallAsleep: log.minutesToFallAsleep,
              minutesAsleep: log.minutesAsleep,
              minutesAwake: log.minutesAwake,
              timeInBed: log.timeInBed, // minutes
              efficiency: log.efficiency, // percentage
              type: log.type,
              levels: log.levels ? { // Ensure levels exist before trying to access its properties
                summary: log.levels.summary,
                data: log.levels.data,
                shortData: log.levels.shortData,
              } : undefined,
              lastFetched: new Date().toISOString(),
              dataSource: 'fitbit',
            };
            processedSleepLogs.push(firestoreData);
            
            // Store each sleep log using its dateOfSleep as document ID
            // If multiple logs exist for one date (e.g. nap), this will overwrite.
            // Consider storing in a sub-collection users/{userId}/fitbit_sleep_logs/{logId} instead
            // or storing an array of logs under users/{userId}/fitbit_sleep/{dateOfSleep}
            // For now, using dateOfSleep as ID means only the last processed log for that date is stored.
            // Let's change to store by logId to preserve all logs.
            const sleepDocRef = doc(db, 'users', userId, 'fitbit_sleep', String(log.logId));
            await setDoc(sleepDocRef, firestoreData, { merge: true });
            console.log(`[FitbitActions] Stored Fitbit sleep log ${log.logId} for user ${userId}, date ${log.dateOfSleep}.`);

        } catch (transformError: any) {
            console.error(`[FitbitActions] Error transforming Fitbit sleep log ${log.logId}: ${transformError.message}. Skipping this record.`);
        }
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
    
    const callType: FitbitCallType = 'swimmingData';
    const rateLimitConfig = getRateLimitConfig(userProfile.subscriptionTier, callType);
    const stats = userProfile.fitbitApiCallStats?.[callType];
    const now = new Date();
    const todayStart = startOfDay(now);
    let callCountToday = stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) ? stats.callCountToday || 0 : 0;

    if (stats?.lastCalledAt && isSameDay(new Date(stats.lastCalledAt), todayStart) && callCountToday >= rateLimitConfig.limit) {
      return { success: false, message: `API call limit for ${callType} reached.`, errorCode: 'RATE_LIMIT_EXCEEDED' };
    } else if (!stats?.lastCalledAt || !isSameDay(new Date(stats.lastCalledAt), todayStart)) {
      callCountToday = 0;
    }

    const accessToken = await getValidFitbitAccessToken();
    if (!accessToken) return { success: false, message: 'Could not connect to Fitbit.', errorCode: 'FITBIT_AUTH_ERROR' };

    let swimmingActivities: FitbitActivityLog[];
    try {
      swimmingActivities = await getSwimmingActivities(accessToken, targetDate); // Uses fitbitService
    } catch (error: any) {
      console.error(`[FitbitActions] Error calling fitbitService.getSwimmingActivities for user ${userId}, date ${targetDate}:`, error);
      if (error.status === 401) {
        await clearFitbitTokens();
        return { success: false, message: 'Fitbit authentication error. Please reconnect Fitbit.', errorCode: 'FITBIT_AUTH_EXPIRED_POST_REFRESH' };
      }
      return { success: false, message: `Failed to fetch swimming activities from Fitbit: ${String(error.message)}`, errorCode: 'FITBIT_API_ERROR' };
    }

    callCountToday++; 
    const updatedApiCallStats: FitbitApiCallStats = {
      ...(userProfile.fitbitApiCallStats || {}),
      [callType]: { lastCalledAt: now.toISOString(), callCountToday },
    };
    await updateDoc(userProfileDocRef, { fitbitApiCallStats: updatedApiCallStats });
    console.log(`[FitbitActions] Updated ${callType} API call stats for user ${userId}.`);

    if (!swimmingActivities || swimmingActivities.length === 0) {
      console.log(`[FitbitActions] No swimming activities found from Fitbit for user ${userId}, date ${targetDate}.`);
      return { success: true, message: `No swimming data found from Fitbit for ${targetDate}.`, data: [] };
    }

    const processedSwims: NormalizedActivityFirestore[] = [];
    for (const swim of swimmingActivities) {
      try {
        const activityDate = swim.startDate; // YYYY-MM-DD from Fitbit activity log
        let fullStartTimeISO = `${activityDate}T${swim.startTime}`; // Combine date and time
        // Fitbit startTime is local. For UTC, timezone info would be needed from user profile or activity.
        // For now, parseISO attempts to infer, or we store as local+offset if Fitbit provided offset.
        // A more robust solution would involve user's timezone from profile.
        try {
            fullStartTimeISO = parseISO(fullStartTimeISO).toISOString();
        } catch (parseErr) {
            console.warn(`[FitbitActions] Could not parse combined datetime ${activityDate}T${swim.startTime} for swim log ${swim.logId}. Using as is. Error: ${parseErr}`);
        }

        const distanceMeters = mapFitbitUnitToMeters(swim.distance, swim.distanceUnit);

        const normalizedSwim: NormalizedActivityFirestore = {
          id: `fitbit-${swim.logId}`, // Using composite ID for our DB
          userId: userId,
          originalId: String(swim.logId),
          dataSource: 'fitbit',
          type: NormalizedActivityType.Swimming, // Already filtered for swims
          name: swim.name || `Swim on ${format(parseISO(activityDate), 'PP')}`,
          startTimeUtc: fullStartTimeISO, 
          startTimeLocal: `${activityDate}T${swim.startTime}`, 
          // timezone: userProfile.timezone, // If available and reliable
          durationMovingSec: swim.duration ? swim.duration / 1000 : undefined, // Convert ms to s
          durationElapsedSec: swim.duration ? swim.duration / 1000 : undefined, // Fitbit often provides one duration for logged activities
          distanceMeters: distanceMeters,
          calories: swim.calories,
          averageHeartRateBpm: swim.averageHeartRate,
          // Steps not typically relevant for swimming
          date: activityDate, 
          lastFetched: new Date().toISOString(),
        };
        processedSwims.push(normalizedSwim);

        // Store in the common 'activities' collection
        const activityDocRef = doc(db, 'users', userId, 'activities', normalizedSwim.id);
        await setDoc(activityDocRef, normalizedSwim, { merge: true });
        console.log(`[FitbitActions] Stored normalized Fitbit swim activity ${swim.logId} to common activities collection for user ${userId}.`);

      } catch (transformError: any) {
        console.error(`[FitbitActions] Error transforming Fitbit swim log ${swim.logId}: ${transformError.message}. Skipping this record.`);
      }
    }

    return { success: true, message: `Successfully fetched and stored ${processedSwims.length} Fitbit swimming activities.`, data: processedSwims };

  } catch (error: any) {
    console.error(`[FitbitActions] Unhandled error in fetchAndStoreFitbitSwimmingData for user ${userId}:`, error);
    return { success: false, message: `An unexpected server error occurred: ${String(error.message)}`, errorCode: 'UNEXPECTED_SERVER_ERROR' };
  }
}

// New action to get sleep logs for a date range
export async function getFitbitSleepLogsForDateRange(
  dateRange: { from: string; to: string } // Dates in 'yyyy-MM-dd' format
): Promise<{ success: boolean; data?: FitbitSleepLogFirestore[]; error?: string }> {
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) {
    return { success: false, error: 'User not authenticated.' };
  }
  const userId = currentUser.uid;

  if (!db || !db.app) {
    console.error('[FitbitActions] Firestore not initialized for getFitbitSleepLogsForDateRange. DB App:', db?.app);
    return { success: false, error: 'Database service unavailable.' };
  }

  try {
    console.log(`[FitbitActions] Fetching fitbit_sleep logs for user ${userId} from ${dateRange.from} to ${dateRange.to}`);
    
    const sleepCollectionRef = collection(db, 'users', userId, 'fitbit_sleep');
    // Querying based on the 'dateOfSleep' field within the documents.
    // Document IDs are now logId, so we can't use __name__ for date range directly.
    const firestoreQuery = query(
      sleepCollectionRef,
      where('dateOfSleep', '>=', dateRange.from),
      where('dateOfSleep', '<=', dateRange.to),
      orderBy('dateOfSleep', 'desc'),
      orderBy('startTime', 'desc') // Secondary sort by start time if multiple logs on same date
    );

    const querySnapshot = await getDocs(firestoreQuery);
    const sleepLogs: FitbitSleepLogFirestore[] = [];
    querySnapshot.forEach((docSnap) => {
      sleepLogs.push(docSnap.data() as FitbitSleepLogFirestore);
    });

    console.log(`[FitbitActions] Fetched ${sleepLogs.length} fitbit_sleep logs from Firestore for user ${userId}.`);
    return { success: true, data: sleepLogs };
  } catch (error: any) {
    console.error(`[FitbitActions] Error fetching fitbit_sleep logs from Firestore for user ${userId}:`, error);
    return { success: false, error: `Failed to fetch sleep logs: ${String(error.message || 'Unknown Firestore error')}` };
  }
}
