
'use server';

import { z } from 'zod';
import { adminDb } from '@/lib/firebase/serverApp';
import admin from 'firebase-admin';
import type { UserProfile, SelectableService, WalkingRadarGoals, RunningRadarGoals, HikingRadarGoals, SwimmingRadarGoals, SleepRadarGoals, DashboardMetricIdValue } from '@/types';
import { AVAILABLE_DASHBOARD_METRICS, DashboardMetricId } from '@/types';

// --- General Update Result ---
interface UpdateResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: {
    fieldErrors?: Record<string, string[]>;
  };
}

// --- Fitness Connections ---
const selectableServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export async function updateConnectedFitnessApps(userId: string, service: SelectableService, operation: 'connect' | 'disconnect'): Promise<UpdateResult<Partial<UserProfile>>> {
  try {
    const validatedService = selectableServiceSchema.parse(service);
    const userRef = adminDb.collection('users').doc(userId);

    // This operation is now primarily handled in the individual auth callback routes to prevent duplicates.
    // The logic is kept here for potential future use, but the primary fix is in the disconnect logic.
    if (operation === 'connect') {
      const updatePayload = admin.firestore.FieldValue.arrayUnion({ ...validatedService, connectedAt: new Date().toISOString() });
      await userRef.update({
        connectedFitnessApps: updatePayload
      });
    } else { // Disconnect logic
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
          return { success: false, error: 'User profile not found.' };
      }
      const userProfile = userSnap.data() as UserProfile;
      // Filter out the service to be disconnected
      const updatedConnections = (userProfile.connectedFitnessApps || []).filter(conn => conn.id !== validatedService.id);
      
      await userRef.update({
        connectedFitnessApps: updatedConnections
      });
    }

    const updatedUserSnap = await userRef.get();
    const updatedProfile = updatedUserSnap.data() as UserProfile;

    return { success: true, data: { connectedFitnessApps: updatedProfile.connectedFitnessApps } };
  } catch (error: any) {
    console.error(`[userProfileActions] Error during ${operation} for service ${service.id}:`, error);
    return { success: false, error: `Failed to ${operation} ${service.name}.` };
  }
}

// --- Base Goal Schema ---
const optionalNonNegativeNumberWithEmptyAsUndefined = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? undefined : Number(val)),
  z.number().nonnegative("Must be a non-negative number (0 or more).").optional().nullable()
);

const minMaxRefine = (data: any, ctx: z.RefinementCtx, fieldNamePrefix: string, minKey: string, maxKey: string) => {
  const minVal = data[minKey];
  const maxVal = data[maxKey];
  if (minVal !== undefined && minVal !== null && maxVal !== undefined && maxVal !== null && minVal > maxVal) {
    const msg = `Min ${fieldNamePrefix.toLowerCase()} cannot be greater than Max ${fieldNamePrefix.toLowerCase()}.`;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: [minKey] });
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: [maxKey] });
  }
};

// --- Walking Goals ---
const walkingGoalsFormSchema = z.object({
  maxDailySteps: optionalNonNegativeNumberWithEmptyAsUndefined,
  maxDailyDistanceMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
  maxDailyDurationMinutes: optionalNonNegativeNumberWithEmptyAsUndefined, 
  maxDailySessions: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailySteps: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailyDistanceMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailyDurationMinutes: optionalNonNegativeNumberWithEmptyAsUndefined, 
  minDailySessions: optionalNonNegativeNumberWithEmptyAsUndefined,
}).superRefine((data, ctx) => {
    minMaxRefine(data, ctx, 'Daily Steps', 'minDailySteps', 'maxDailySteps');
    minMaxRefine(data, ctx, 'Daily Distance', 'minDailyDistanceMeters', 'maxDailyDistanceMeters');
    minMaxRefine(data, ctx, 'Daily Duration', 'minDailyDurationMinutes', 'maxDailyDurationMinutes');
    minMaxRefine(data, ctx, 'Daily Sessions', 'minDailySessions', 'maxDailySessions');
});

export async function updateWalkingRadarGoals(userId: string, goals: WalkingRadarGoals): Promise<UpdateResult<WalkingRadarGoals>> {
  const validation = walkingGoalsFormSchema.safeParse({
      ...goals,
      maxDailyDurationMinutes: goals.maxDailyDurationSec !== undefined ? goals.maxDailyDurationSec / 60 : undefined,
      minDailyDurationMinutes: goals.minDailyDurationSec !== undefined ? goals.minDailyDurationSec / 60 : undefined,
  });

  if (!validation.success) {
    return { success: false, error: 'Invalid goal data.', details: { fieldErrors: validation.error.flatten().fieldErrors } };
  }
  
  try {
    const userRef = adminDb.collection('users').doc(userId);
    await userRef.set({ walkingRadarGoals: goals }, { merge: true });
    return { success: true, data: goals };
  } catch (error: any) {
    return { success: false, error: 'Failed to save walking goals to database.' };
  }
}

// --- Running Goals ---
const runningGoalsFormSchema = z.object({
  maxDailyDistanceMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
  maxDailyDurationMinutes: optionalNonNegativeNumberWithEmptyAsUndefined,
  maxDailySessions: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailyDistanceMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailyDurationMinutes: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailySessions: optionalNonNegativeNumberWithEmptyAsUndefined,
}).superRefine((data, ctx) => {
    minMaxRefine(data, ctx, 'Daily Distance', 'minDailyDistanceMeters', 'maxDailyDistanceMeters');
    minMaxRefine(data, ctx, 'Daily Duration', 'minDailyDurationMinutes', 'maxDailyDurationMinutes');
    minMaxRefine(data, ctx, 'Daily Sessions', 'minDailySessions', 'maxDailySessions');
});

export async function updateRunningRadarGoals(userId: string, goals: RunningRadarGoals): Promise<UpdateResult<RunningRadarGoals>> {
  const validation = runningGoalsFormSchema.safeParse({
      ...goals,
      maxDailyDurationMinutes: goals.maxDailyDurationSec !== undefined ? goals.maxDailyDurationSec / 60 : undefined,
      minDailyDurationMinutes: goals.minDailyDurationSec !== undefined ? goals.minDailyDurationSec / 60 : undefined,
  });

  if (!validation.success) {
    return { success: false, error: 'Invalid goal data.', details: { fieldErrors: validation.error.flatten().fieldErrors } };
  }
  
  try {
    const userRef = adminDb.collection('users').doc(userId);
    await userRef.set({ runningRadarGoals: goals }, { merge: true });
    return { success: true, data: goals };
  } catch (error: any) {
    return { success: false, error: 'Failed to save running goals to database.' };
  }
}

// --- Hiking Goals ---
const hikingGoalsFormSchema = z.object({
  maxDailyDistanceMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
  maxDailyDurationMinutes: optionalNonNegativeNumberWithEmptyAsUndefined,
  maxDailySessions: optionalNonNegativeNumberWithEmptyAsUndefined,
  maxDailyElevationGainMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailyDistanceMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailyDurationMinutes: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailySessions: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailyElevationGainMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
}).superRefine((data, ctx) => {
    minMaxRefine(data, ctx, 'Daily Distance', 'minDailyDistanceMeters', 'maxDailyDistanceMeters');
    minMaxRefine(data, ctx, 'Daily Duration', 'minDailyDurationMinutes', 'maxDailyDurationMinutes');
    minMaxRefine(data, ctx, 'Daily Sessions', 'minDailySessions', 'maxDailySessions');
    minMaxRefine(data, ctx, 'Elevation Gain', 'minDailyElevationGainMeters', 'maxDailyElevationGainMeters');
});

export async function updateHikingRadarGoals(userId: string, goals: HikingRadarGoals): Promise<UpdateResult<HikingRadarGoals>> {
    const validation = hikingGoalsFormSchema.safeParse({
      ...goals,
      maxDailyDurationMinutes: goals.maxDailyDurationSec !== undefined ? goals.maxDailyDurationSec / 60 : undefined,
      minDailyDurationMinutes: goals.minDailyDurationSec !== undefined ? goals.minDailyDurationSec / 60 : undefined,
  });

  if (!validation.success) {
    return { success: false, error: 'Invalid goal data.', details: { fieldErrors: validation.error.flatten().fieldErrors } };
  }

  try {
    const userRef = adminDb.collection('users').doc(userId);
    await userRef.set({ hikingRadarGoals: goals }, { merge: true });
    return { success: true, data: goals };
  } catch (error: any) {
    return { success: false, error: 'Failed to save hiking goals to database.' };
  }
}

// --- Swimming Goals ---
const swimmingGoalsFormSchema = z.object({
  maxDailyDistanceMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
  maxDailyDurationMinutes: optionalNonNegativeNumberWithEmptyAsUndefined,
  maxDailySessions: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailyDistanceMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailyDurationMinutes: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailySessions: optionalNonNegativeNumberWithEmptyAsUndefined,
}).superRefine((data, ctx) => {
    minMaxRefine(data, ctx, 'Daily Distance', 'minDailyDistanceMeters', 'maxDailyDistanceMeters');
    minMaxRefine(data, ctx, 'Daily Duration', 'minDailyDurationMinutes', 'maxDailyDurationMinutes');
    minMaxRefine(data, ctx, 'Daily Sessions', 'minDailySessions', 'maxDailySessions');
});

export async function updateSwimmingRadarGoals(userId: string, goals: SwimmingRadarGoals): Promise<UpdateResult<SwimmingRadarGoals>> {
   const validation = swimmingGoalsFormSchema.safeParse({
      ...goals,
      maxDailyDurationMinutes: goals.maxDailyDurationSec !== undefined ? goals.maxDailyDurationSec / 60 : undefined,
      minDailyDurationMinutes: goals.minDailyDurationSec !== undefined ? goals.minDailyDurationSec / 60 : undefined,
  });

  if (!validation.success) {
    return { success: false, error: 'Invalid goal data.', details: { fieldErrors: validation.error.flatten().fieldErrors } };
  }
  
  try {
    const userRef = adminDb.collection('users').doc(userId);
    await userRef.set({ swimmingRadarGoals: goals }, { merge: true });
    return { success: true, data: goals };
  } catch (error: any) {
    return { success: false, error: 'Failed to save swimming goals to database.' };
  }
}

// --- Sleep Goals ---
const sleepGoalsFormSchema = z.object({
  targetSleepDurationHours: optionalNonNegativeNumberWithEmptyAsUndefined,
  minSleepEfficiencyPercent: optionalNonNegativeNumberWithEmptyAsUndefined.refine(val => val === undefined || val === null || (val >= 0 && val <= 100), {
    message: "Efficiency must be between 0 and 100.",
  }),
  minTimeInDeepSleepMinutes: optionalNonNegativeNumberWithEmptyAsUndefined,
  minTimeInRemSleepMinutes: optionalNonNegativeNumberWithEmptyAsUndefined,
});

export async function updateSleepRadarGoals(userId: string, goals: SleepRadarGoals): Promise<UpdateResult<SleepRadarGoals>> {
  const validation = sleepGoalsFormSchema.safeParse(goals);
  if (!validation.success) {
    return { success: false, error: 'Invalid goal data.', details: { fieldErrors: validation.error.flatten().fieldErrors } };
  }
  try {
    const userRef = adminDb.collection('users').doc(userId);
    await userRef.set({ sleepRadarGoals: goals }, { merge: true });
    return { success: true, data: goals };
  } catch (error: any) {
    return { success: false, error: 'Failed to save sleep goals to database.' };
  }
}

// --- Dashboard Metrics ---
const allMetricIds = AVAILABLE_DASHBOARD_METRICS.map(m => m.id) as [DashboardMetricIdValue, ...DashboardMetricIdValue[]];
const dashboardMetricsSchema = z.array(z.enum(allMetricIds))
    .min(3, "Please select at least 3 metrics.")
    .max(5, "Please select no more than 5 metrics.");

export async function updateDashboardRadarMetrics(userId: string, selectedMetricIds: DashboardMetricIdValue[]): Promise<UpdateResult<DashboardMetricIdValue[]>> {
  const validation = dashboardMetricsSchema.safeParse(selectedMetricIds);
  if (!validation.success) {
    return { success: false, error: 'Invalid selection.', details: { fieldErrors: { selectedMetricIds: validation.error.flatten().formErrors } }};
  }

  try {
    const userRef = adminDb.collection('users').doc(userId);
    await userRef.set({ dashboardRadarMetrics: selectedMetricIds }, { merge: true });
    return { success: true, data: selectedMetricIds };
  } catch (error: any) {
    return { success: false, error: 'Failed to save dashboard preferences.' };
  }
}
