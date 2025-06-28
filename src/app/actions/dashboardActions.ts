
'use server';

import { adminDb } from '@/lib/firebase/serverApp';
import admin from 'firebase-admin';
import type { 
  UserProfile, 
  DashboardMetricIdValue, 
  RadarDataPoint,
  FitbitSleepLogFirestore,
  NormalizedActivityFirestore,
  FitbitActivitySummaryFirestore,
  FitbitHeartRateFirestore
} from '@/types';
import { AVAILABLE_DASHBOARD_METRICS, DashboardMetricId, NormalizedActivityType } from '@/types';
import { differenceInDays, format, parseISO, startOfDay, endOfDay } from 'date-fns';

interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

async function calculateAvgDailySteps(userId: string, dateRange: DateRange, numberOfDays: number): Promise<number | undefined> {
  if (numberOfDays <= 0) return 0;
  try {
    const activitiesRef = adminDb.collection('users').doc(userId).collection('activities');
    const q = activitiesRef 
      .where('date', '>=', dateRange.from)
      .where('date', '<=', dateRange.to)
      .where('type', 'in', [NormalizedActivityType.Walking, NormalizedActivityType.Running, NormalizedActivityType.Hiking]);
    
    const querySnapshot = await q.get();
    let totalSteps = 0;
    querySnapshot.forEach(doc => {
      const activity = doc.data() as NormalizedActivityFirestore;
      totalSteps += activity.steps || 0;
    });
    return totalSteps / numberOfDays;
  } catch (error) {
    console.error(`[DashboardActions] Error calculating avg daily steps for user ${userId}:`, error);
    return undefined;
  }
}

async function calculateAvgSleepDuration(userId: string, dateRange: DateRange, numberOfDays: number): Promise<number | undefined> {
  if (numberOfDays <= 0) return 0;
  try {
    const sleepLogsRef = adminDb.collection('users').doc(userId).collection('fitbit_sleep');
    const q = sleepLogsRef
      .where('dateOfSleep', '>=', dateRange.from)
      .where('dateOfSleep', '<=', dateRange.to);
      // .where('isMainSleep', '==', true) // Consider only main sleep if available and desired
    
    const querySnapshot = await q.get();
    let totalSleepMinutes = 0;
    let sleepLogCount = 0;
    querySnapshot.forEach(doc => {
      const sleepLog = doc.data() as FitbitSleepLogFirestore;
      // Fitbit duration is in ms, convert to minutes
      totalSleepMinutes += (sleepLog.duration || 0) / (1000 * 60); 
      sleepLogCount++;
    });
    if (sleepLogCount === 0) return 0; // Or undefined if you prefer to distinguish no data from zero
    return (totalSleepMinutes / sleepLogCount) / 60; // Average duration in hours
  } catch (error) {
    console.error(`[DashboardActions] Error calculating avg sleep duration for user ${userId}:`, error);
    return undefined;
  }
}

async function calculateAvgActiveMinutes(userId: string, dateRange: DateRange, numberOfDays: number): Promise<number | undefined> {
  if (numberOfDays <= 0) return 0;
  try {
    // Option 1: Use Fitbit Daily Summaries (if consistently synced and preferred)
    const summariesRef = adminDb.collection('users').doc(userId).collection('fitbit_activity_summaries');
    const qSummaries = summariesRef 
      .where(admin.firestore.FieldPath.documentId(), '>=', dateRange.from) // documentId() refers to the document name which is the date
      .where(admin.firestore.FieldPath.documentId(), '<=', dateRange.to);

    const summarySnapshot = await qSummaries.get();
    let totalActiveMinutesFromSummaries = 0;
    let summaryDaysCount = 0;
    summarySnapshot.forEach(doc => {
      const summary = doc.data() as FitbitActivitySummaryFirestore;
      totalActiveMinutesFromSummaries += summary.activeMinutes || 0;
      summaryDaysCount++;
    });
    if (summaryDaysCount > 0) {
      return totalActiveMinutesFromSummaries / summaryDaysCount;
    }

    // Option 2: Fallback or primary: Calculate from normalized activities
    const activitiesRef = adminDb.collection('users').doc(userId).collection('activities');
    const qActivities = activitiesRef 
      .where('date', '>=', dateRange.from)
      .where('date', '<=', dateRange.to);

    const activitySnapshot = await qActivities.get();
    let totalMovingDurationSec = 0;
    activitySnapshot.forEach(doc => {
      const activity = doc.data() as NormalizedActivityFirestore;
      totalMovingDurationSec += activity.durationMovingSec || 0;
    });
    return (totalMovingDurationSec / numberOfDays) / 60; // Avg daily active minutes
  } catch (error) {
    console.error(`[DashboardActions] Error calculating avg active minutes for user ${userId}:`, error);
    return undefined;
  }
}

async function calculateAvgRestingHeartRate(userId: string, dateRange: DateRange, numberOfDays: number): Promise<number | undefined> {
  if (numberOfDays <= 0) return 0;
  try {
    const heartRateRef = adminDb.collection('users').doc(userId).collection('fitbit_heart_rate');
    // Query by document ID which is the date 'YYYY-MM-DD'
    const q = heartRateRef 
      .where(admin.firestore.FieldPath.documentId(), '>=', dateRange.from)
      .where(admin.firestore.FieldPath.documentId(), '<=', dateRange.to);
    
    const querySnapshot = await q.get();
    let totalRestingHeartRate = 0;
    let daysWithData = 0;
    querySnapshot.forEach(doc => {
      const hrData = doc.data() as FitbitHeartRateFirestore;
      if (hrData.restingHeartRate !== undefined) {
        totalRestingHeartRate += hrData.restingHeartRate;
        daysWithData++;
      }
    });
    if (daysWithData === 0) return undefined; // No data or no RHR in data
    return totalRestingHeartRate / daysWithData;
  } catch (error) {
    console.error(`[DashboardActions] Error calculating avg resting heart rate for user ${userId}:`, error);
    return undefined;
  }
}

async function calculateAvgWorkoutDuration(userId: string, dateRange: DateRange, numberOfDays: number): Promise<number | undefined> {
    if (numberOfDays <= 0) return 0;
    try {
        const activitiesRef = adminDb.collection('users').doc(userId).collection('activities');
        const workoutTypes: NormalizedActivityType[] = [
            NormalizedActivityType.Running, 
            NormalizedActivityType.Hiking, 
            NormalizedActivityType.Swimming, 
            NormalizedActivityType.Cycling, 
            NormalizedActivityType.Workout
        ];
        const q = activitiesRef
            .where('date', '>=', dateRange.from)
            .where('date', '<=', dateRange.to)
            .where('type', 'in', workoutTypes);

        const querySnapshot = await q.get();
        let totalWorkoutDurationSec = 0;
        let workoutCount = 0;
        querySnapshot.forEach(doc => {
            const activity = doc.data() as NormalizedActivityFirestore;
            totalWorkoutDurationSec += activity.durationMovingSec || 0;
            workoutCount++;
        });
        if (workoutCount === 0) return 0;
        return (totalWorkoutDurationSec / workoutCount) / 60; // Average duration per workout session in minutes
    } catch (error) {
        console.error(`[DashboardActions] Error calculating avg workout duration for user ${userId}:`, error);
        return undefined;
    }
}

async function calculateTotalWorkouts(userId: string, dateRange: DateRange, numberOfDays: number): Promise<number | undefined> {
    try {
        const activitiesRef = adminDb.collection('users').doc(userId).collection('activities');
        const workoutTypes: NormalizedActivityType[] = [
            NormalizedActivityType.Running, 
            NormalizedActivityType.Hiking, 
            NormalizedActivityType.Swimming, 
            NormalizedActivityType.Cycling, 
            NormalizedActivityType.Workout
        ];
        const q = activitiesRef
            .where('date', '>=', dateRange.from)
            .where('date', '<=', dateRange.to)
            .where('type', 'in', workoutTypes);

        const querySnapshot = await q.get();
        return querySnapshot.size; // Total number of workout sessions
    } catch (error) {
        console.error(`[DashboardActions] Error calculating total workouts for user ${userId}:`, error);
        return undefined;
    }
}

export async function getDashboardRadarData(
  userId: string,
  dateRange: DateRange
): Promise<{ success: boolean; data?: RadarDataPoint[]; error?: string }> {
  if (!userId) {
    return { success: false, error: 'User not authenticated.' };
  }

  try {
    const userProfileDocRef = adminDb.collection('users').doc(userId);
    const userProfileSnap = await userProfileDocRef.get();

    if (!userProfileSnap.exists) {
      return { success: false, error: 'User profile not found.' };
    }
    const userProfile = userProfileSnap.data() as UserProfile;
    const selectedMetricIds = userProfile.dashboardRadarMetrics || [];

    if (selectedMetricIds.length === 0) {
      return { success: true, data: [], error: 'No dashboard metrics selected by the user.' };
    }

    const radarDataPoints: RadarDataPoint[] = [];
    const fromDate = startOfDay(parseISO(dateRange.from));
    const toDate = endOfDay(parseISO(dateRange.to));
    const numberOfDays = differenceInDays(toDate, fromDate) + 1;
    
    if (numberOfDays <= 0) {
      return { success: false, error: 'Invalid date range, number of days is zero or negative.' };
    }

    for (const metricId of selectedMetricIds) {
      const metricConfig = AVAILABLE_DASHBOARD_METRICS.find(m => m.id === metricId);
      if (!metricConfig) {
        console.warn(`[DashboardActions] Metric config not found for ID: ${metricId}`);
        continue;
      }

      let actualValue: number | undefined;
      switch (metricId) {
        case DashboardMetricId.AVG_DAILY_STEPS:
          actualValue = await calculateAvgDailySteps(userId, dateRange, numberOfDays);
          break;
        case DashboardMetricId.AVG_SLEEP_DURATION:
          actualValue = await calculateAvgSleepDuration(userId, dateRange, numberOfDays);
          break;
        case DashboardMetricId.AVG_ACTIVE_MINUTES:
          actualValue = await calculateAvgActiveMinutes(userId, dateRange, numberOfDays);
          break;
        case DashboardMetricId.RESTING_HEART_RATE:
          actualValue = await calculateAvgRestingHeartRate(userId, dateRange, numberOfDays);
          break;
        case DashboardMetricId.AVG_WORKOUT_DURATION:
          actualValue = await calculateAvgWorkoutDuration(userId, dateRange, numberOfDays);
          break;
        case DashboardMetricId.TOTAL_WORKOUTS:
          actualValue = await calculateTotalWorkouts(userId, dateRange, numberOfDays);
          break;
        // Add cases for other metrics
        default:
          console.warn(`[DashboardActions] Calculation logic not implemented for metric ID: ${metricId}`);
          actualValue = undefined;
      }

      const valueToNormalize = actualValue !== undefined ? actualValue : 0;
      const normalizedValue = metricConfig.defaultMaxValue > 0 
                               ? Math.min(100, (valueToNormalize / metricConfig.defaultMaxValue) * 100) 
                               : 0;
      
      let actualFormattedValue = `${valueToNormalize.toFixed(metricConfig.unit === 'hours' || metricConfig.unit === 'bpm' ? 1 : 0)}`;
      if (metricConfig.unit) {
        actualFormattedValue += ` ${metricConfig.unit}`;
      }
      if (actualValue === undefined) {
        actualFormattedValue = "N/A";
      }

      radarDataPoints.push({
        metric: metricConfig.label,
        value: normalizedValue,
        actualFormattedValue: actualFormattedValue,
        fullMark: 100, // Radar axis will be 0-100
      });
    }

    return { success: true, data: radarDataPoints };

  } catch (error: any) {
    console.error(`[DashboardActions] Error fetching dashboard radar data for user ${userId}:`, error);
    return { success: false, error: `Failed to fetch dashboard data: ${error.message}` };
  }
}
