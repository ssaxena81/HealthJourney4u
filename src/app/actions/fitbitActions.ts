
'use server';

import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
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
  activitiesProcessed?: number; // For actions processing multiple activities
}

type FitbitCallType = 'dailyActivitySummary' | 'heartRateTimeSeries' | 'sleepData' | 'swimmingData' | 'loggedActivities';


function getRateLimitConfig(
  tier: SubscriptionTier,
  callType: FitbitCallType
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
  if (lowerName.includes('bike') || lowerName.includes('cycle') || lowerName.includes('cycling')) return NormalizedActivityType.Cycling;
  if (lowerName.includes('workout') || lowerName.includes('sport') || lowerName.includes('exercise') || lowerName.includes('weights') || lowerName.includes('circuit training') || lowerName.includes('elliptical') || lowerName.includes('stairclimber')) return NormalizedActivityType.Workout;
  return NormalizedActivityType.Other;
}

// Helper to convert distances to meters
function mapFitbitUnitToMeters(distance?: number, unit?: string): number | undefined {
  if (distance === undefined || distance === null || isNaN(distance)) return undefined;
  
  // If unit is not provided and distance is likely in km (e.g. a small number like 5 for 5km), we might infer.
  // However, Fitbit's API is inconsistent with providing distanceUnit for all activities.
  // For daily summary distance, it's often in the user's preferred unit (km or miles).
  // For logged activities, it *should* have distanceUnit, but let's be defensive.
  
  if (!unit) {
    // Heuristic: if distance is > 1000, assume it's already meters (e.g., from some specific activity types)
    // If distance is < 100 (common for km/miles), assume it's NOT meters unless explicitly stated.
    // This is imperfect. The ideal scenario is Fitbit always providing the unit.
    if (distance > 1000) return distance; // Likely already meters
    console.warn(`[FitbitActions] mapFitbitUnitToMeters: Distance ${distance} present but unit is missing. Cannot convert to meters reliably. Assuming it's not meters unless very large.`);
    return undefined; // Or handle as per application's policy for missing units
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
    // Attempt to infer distance unit if summary.distance is an array (Fitbit sometimes returns distance for different activity types within summary)
    // For daily summary, distance is usually total distance in user's preferred unit.
    // Let's assume for summary.distance, if it's a number, it's in KM for simplicity or what the user has set.
    // This part needs careful handling based on actual API responses.
    const distanceKm = Array.isArray(summary.distance) ? summary.distance.find(d => d.activity === 'total')?.distance : summary.distance;

    const firestoreData: FitbitActivitySummaryFirestore = {
      date: targetDate,
      steps: summary.steps,
      distance: typeof distanceKm === 'number' ? distanceKm : undefined, // Store as km
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
      where('__name__', '>=', dateRange.from), 
      where('__name__', '<=', dateRange.to),
      orderBy('__name__', 'desc') 
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
              dateOfSleep: log.dateOfSleep, 
              logId: log.logId,
              startTime: log.startTime, 
              endTime: log.endTime, 
              duration: log.duration, 
              isMainSleep: log.isMainSleep,
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
            
            const sleepDocRef = doc(db, 'users', userId, 'fitbit_sleep', String(log.logId));
            await setDoc(sleepDocRef, firestoreData, { merge: true });
            console.log(`[FitbitActions] Stored Fitbit sleep log ${log.logId} for user ${userId}, date ${log.dateOfSleep}.`);

        } catch (transformError: any) {
            console.error(`[FitbitActions] Error transforming Fitbit sleep log ${log.logId}: ${transformError.message}. Skipping this record.`);
        }
    }
    
    return { success: true, message: `Successfully fetched and stored ${processedSleepLogs.length} Fitbit sleep log(s).`, data: processedSleepLogs, activitiesProcessed: processedSleepLogs.length };

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
      swimmingActivities = await getSwimmingActivities(accessToken, targetDate); 
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
      return { success: true, message: `No swimming data found from Fitbit for ${targetDate}.`, activitiesProcessed: 0 };
    }

    const processedSwims: NormalizedActivityFirestore[] = [];
    for (const swim of swimmingActivities) {
      try {
        const activityDate = swim.startDate; 
        let fullStartTimeISO = `${activityDate}T${swim.startTime}`; 
        try {
            fullStartTimeISO = parseISO(fullStartTimeISO).toISOString();
        } catch (parseErr) {
            console.warn(`[FitbitActions] Could not parse combined datetime ${activityDate}T${swim.startTime} for swim log ${swim.logId}. Using as is. Error: ${parseErr}`);
        }

        const distanceMeters = mapFitbitUnitToMeters(swim.distance, swim.distanceUnit);

        const normalizedSwim: NormalizedActivityFirestore = {
          id: `fitbit-${swim.logId}`, 
          userId: userId,
          originalId: String(swim.logId),
          dataSource: 'fitbit',
          type: NormalizedActivityType.Swimming, 
          name: swim.name || swim.activityName || `Swim on ${format(parseISO(activityDate), 'PP')}`,
          startTimeUtc: fullStartTimeISO, 
          startTimeLocal: `${activityDate}T${swim.startTime}`, 
          durationMovingSec: swim.duration ? swim.duration / 1000 : undefined, 
          durationElapsedSec: swim.duration ? swim.duration / 1000 : undefined, 
          distanceMeters: distanceMeters,
          calories: swim.calories,
          averageHeartRateBpm: swim.averageHeartRate,
          date: activityDate, 
          lastFetched: new Date().toISOString(),
        };
        processedSwims.push(normalizedSwim);

        const activityDocRef = doc(db, 'users', userId, 'activities', normalizedSwim.id);
        await setDoc(activityDocRef, normalizedSwim, { merge: true });
        console.log(`[FitbitActions] Stored normalized Fitbit swim activity ${swim.logId} to common activities collection for user ${userId}.`);

      } catch (transformError: any) {
        console.error(`[FitbitActions] Error transforming Fitbit swim log ${swim.logId}: ${transformError.message}. Skipping this record.`);
      }
    }

    return { success: true, message: `Successfully fetched and stored ${processedSwims.length} Fitbit swimming activities.`, data: processedSwims, activitiesProcessed: processedSwims.length };

  } catch (error: any) {
    console.error(`[FitbitActions] Unhandled error in fetchAndStoreFitbitSwimmingData for user ${userId}:`, error);
    return { success: false, message: `An unexpected server error occurred: ${String(error.message)}`, errorCode: 'UNEXPECTED_SERVER_ERROR' };
  }
}

export async function fetchAndStoreFitbitLoggedActivities(
  targetDate: string // YYYY-MM-DD format
): Promise<FetchFitbitDataResult> {
  console.log(`[FitbitActions] Initiating fetchAndStoreFitbitLoggedActivities for date: ${targetDate}`);
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
    
    const callType: FitbitCallType = 'loggedActivities';
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

    let fitbitActivities: FitbitActivityLog[];
    try {
      fitbitActivities = await getLoggedActivitiesForDate(accessToken, targetDate); 
    } catch (error: any) {
      console.error(`[FitbitActions] Error calling fitbitService.getLoggedActivitiesForDate for user ${userId}, date ${targetDate}:`, error);
      if (error.status === 401) {
        await clearFitbitTokens();
        return { success: false, message: 'Fitbit authentication error. Please reconnect Fitbit.', errorCode: 'FITBIT_AUTH_EXPIRED_POST_REFRESH' };
      }
      return { success: false, message: `Failed to fetch logged activities from Fitbit: ${String(error.message)}`, errorCode: 'FITBIT_API_ERROR' };
    }

    callCountToday++; 
    const updatedApiCallStats: FitbitApiCallStats = {
      ...(userProfile.fitbitApiCallStats || {}),
      [callType]: { lastCalledAt: now.toISOString(), callCountToday },
    };
    await updateDoc(userProfileDocRef, { fitbitApiCallStats: updatedApiCallStats });
    console.log(`[FitbitActions] Updated ${callType} API call stats for user ${userId}.`);

    if (!fitbitActivities || fitbitActivities.length === 0) {
      console.log(`[FitbitActions] No logged activities found from Fitbit for user ${userId}, date ${targetDate}.`);
      return { success: true, message: `No logged activities found from Fitbit for ${targetDate}.`, activitiesProcessed: 0 };
    }

    const processedActivities: NormalizedActivityFirestore[] = [];
    const relevantLogTypes = ['manual', 'auto_detected', 'mobile_run', 'tracker'];

    for (const activity of fitbitActivities) {
      try {
        // Filter out summary-like entries or non-workout activities
        if (!activity.logType || !relevantLogTypes.includes(activity.logType.toLowerCase())) {
            console.log(`[FitbitActions] Skipping activity ${activity.logId} with logType: ${activity.logType} and name: ${activity.name}`);
            continue;
        }
        
        const normalizedType = mapFitbitActivityNameToNormalizedType(activity.activityName || activity.name);
        if (normalizedType === NormalizedActivityType.Other && !(activity.activityName || activity.name)?.toLowerCase().includes('workout')) { // Be more selective for 'Other'
             console.log(`[FitbitActions] Skipping activity ${activity.logId} with unmapped name: ${activity.activityName || activity.name}`);
            continue;
        }
        // Avoid re-processing swims if they are already handled by fetchAndStoreFitbitSwimmingData (though this might lead to duplicates if not careful)
        if (normalizedType === NormalizedActivityType.Swimming) {
            console.log(`[FitbitActions] Skipping swim activity ${activity.logId} in general logged activities fetch, as it should be handled by swimming-specific sync.`);
            continue;
        }


        const activityDate = activity.startDate; 
        let fullStartTimeISO = `${activityDate}T${activity.startTime}`; 
        try {
            fullStartTimeISO = parseISO(fullStartTimeISO).toISOString();
        } catch (parseErr) {
            console.warn(`[FitbitActions] Could not parse combined datetime ${activityDate}T${activity.startTime} for activity log ${activity.logId}. Using as is. Error: ${parseErr}`);
        }

        const distanceMeters = mapFitbitUnitToMeters(activity.distance, activity.distanceUnit);

        const normalizedActivity: NormalizedActivityFirestore = {
          id: `fitbit-${activity.logId}`, 
          userId: userId,
          originalId: String(activity.logId),
          dataSource: 'fitbit',
          type: normalizedType, 
          name: activity.name || activity.activityName,
          startTimeUtc: fullStartTimeISO, 
          startTimeLocal: `${activityDate}T${activity.startTime}`, 
          durationMovingSec: activity.duration ? activity.duration / 1000 : undefined, // Active time often is the main duration
          durationElapsedSec: activity.duration ? activity.duration / 1000 : undefined, // Fitbit might not always distinguish well for logged activities
          distanceMeters: distanceMeters,
          calories: activity.calories,
          steps: activity.steps,
          averageHeartRateBpm: activity.averageHeartRate,
          elevationGainMeters: undefined, // Fitbit activity list doesn't usually provide elevation gain directly here.
          mapPolyline: undefined, // Not typically in list view.
          date: activityDate, 
          lastFetched: new Date().toISOString(),
        };
        processedActivities.push(normalizedActivity);

        const activityDocRef = doc(db, 'users', userId, 'activities', normalizedActivity.id);
        await setDoc(activityDocRef, normalizedActivity, { merge: true });
        console.log(`[FitbitActions] Stored normalized Fitbit activity ${activity.logId} (${normalizedActivity.type}) to common activities collection for user ${userId}.`);

      } catch (transformError: any) {
        console.error(`[FitbitActions] Error transforming Fitbit logged activity ${activity.logId}: ${transformError.message}. Skipping this record.`);
      }
    }

    return { success: true, message: `Successfully fetched and stored ${processedActivities.length} relevant Fitbit logged activities.`, data: processedActivities, activitiesProcessed: processedActivities.length };

  } catch (error: any) {
    console.error(`[FitbitActions] Unhandled error in fetchAndStoreFitbitLoggedActivities for user ${userId}:`, error);
    return { success: false, message: `An unexpected server error occurred: ${String(error.message)}`, errorCode: 'UNEXPECTED_SERVER_ERROR' };
  }
}



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
    const firestoreQuery = query(
      sleepCollectionRef,
      where('dateOfSleep', '>=', dateRange.from),
      where('dateOfSleep', '<=', dateRange.to),
      orderBy('dateOfSleep', 'desc'),
      orderBy('startTime', 'desc') 
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


    