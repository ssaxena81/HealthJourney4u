
'use server';

import { z } from 'zod';
import { auth, db } from '@/lib/firebase/serverApp';
import { doc, updateDoc } from 'firebase/firestore';
import type { WalkingRadarGoals, RunningRadarGoals, HikingRadarGoals, SwimmingRadarGoals, SleepRadarGoals, DashboardMetricIdValue } from '@/types';
import { DashboardMetricId, AVAILABLE_DASHBOARD_METRICS } from '@/types';

const optionalPositiveNumber = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? undefined : Number(val)),
  z.number().nonnegative("Must be a non-negative number (0 or more).").optional().nullable()
);

// --- Walking Goals ---
const WalkingRadarGoalsSchema = z.object({
  maxDailySteps: optionalPositiveNumber,
  maxDailyDistanceMeters: optionalPositiveNumber,
  maxDailyDurationSec: optionalPositiveNumber, 
  maxDailySessions: optionalPositiveNumber,
  minDailySteps: optionalPositiveNumber,
  minDailyDistanceMeters: optionalPositiveNumber,
  minDailyDurationSec: optionalPositiveNumber, 
  minDailySessions: optionalPositiveNumber,
}).superRefine((data, ctx) => {
  const checkMinMax = (minVal?: number | null, maxVal?: number | null, fieldNamePrefix?: string, minPath?: keyof typeof data, maxPath?: keyof typeof data) => {
    if (minVal !== undefined && minVal !== null && maxVal !== undefined && maxVal !== null && minVal > maxVal) {
      const msg = `Min ${fieldNamePrefix ? fieldNamePrefix.toLowerCase() : ''} cannot be greater than Max ${fieldNamePrefix ? fieldNamePrefix.toLowerCase() : ''}.`;
      if (minPath) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: [minPath] });
      if (maxPath) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: [maxPath] });
    }
  };
  checkMinMax(data.minDailySteps, data.maxDailySteps, "DailySteps", "minDailySteps", "maxDailySteps");
  checkMinMax(data.minDailyDistanceMeters, data.maxDailyDistanceMeters, "DailyDistanceMeters", "minDailyDistanceMeters", "maxDailyDistanceMeters");
  checkMinMax(data.minDailyDurationSec, data.maxDailyDurationSec, "DailyDurationSec", "minDailyDurationSec", "maxDailyDurationSec");
  checkMinMax(data.minDailySessions, data.maxDailySessions, "DailySessions", "minDailySessions", "maxDailySessions");
});

interface UpdateWalkingRadarGoalsResult {
  success: boolean;
  error?: string;
  details?: z.inferFlattenedErrors<typeof WalkingRadarGoalsSchema>;
  data?: WalkingRadarGoals;
}

export async function updateWalkingRadarGoals(
  values: WalkingRadarGoals 
): Promise<UpdateWalkingRadarGoalsResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return { success: false, error: 'User not authenticated.' };
  }
  const userId = currentUser.uid;

  console.log('[USER_PROFILE_ACTIONS] Attempting to update walking radar goals for UID:', userId, 'with values:', values);

  try {
    const validatedValues = WalkingRadarGoalsSchema.parse(values);
    
    const goalsToUpdate: WalkingRadarGoals = {};
    goalsToUpdate.maxDailySteps = validatedValues.maxDailySteps === null ? undefined : validatedValues.maxDailySteps;
    goalsToUpdate.maxDailyDistanceMeters = validatedValues.maxDailyDistanceMeters === null ? undefined : validatedValues.maxDailyDistanceMeters;
    goalsToUpdate.maxDailyDurationSec = validatedValues.maxDailyDurationSec === null ? undefined : validatedValues.maxDailyDurationSec;
    goalsToUpdate.maxDailySessions = validatedValues.maxDailySessions === null ? undefined : validatedValues.maxDailySessions;
    goalsToUpdate.minDailySteps = validatedValues.minDailySteps === null ? undefined : validatedValues.minDailySteps;
    goalsToUpdate.minDailyDistanceMeters = validatedValues.minDailyDistanceMeters === null ? undefined : validatedValues.minDailyDistanceMeters;
    goalsToUpdate.minDailyDurationSec = validatedValues.minDailyDurationSec === null ? undefined : validatedValues.minDailyDurationSec;
    goalsToUpdate.minDailySessions = validatedValues.minDailySessions === null ? undefined : validatedValues.minDailySessions;

    const userProfileDocRef = doc(db, 'users', userId);
    await updateDoc(userProfileDocRef, {
      walkingRadarGoals: goalsToUpdate, 
    });

    console.log('[USER_PROFILE_ACTIONS] Walking radar goals updated successfully for UID:', userId);
    return { success: true, data: goalsToUpdate };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('[USER_PROFILE_ACTIONS] Zod validation error updating walking radar goals:', error.flatten());
      return { success: false, error: 'Invalid input data.', details: error.flatten() };
    }
    console.error('[USER_PROFILE_ACTIONS] Error updating walking radar goals for UID:', userId, error);
    return { success: false, error: String(error.message) || 'Failed to update walking goals.' };
  }
}

// --- Running Goals ---
const RunningRadarGoalsSchema = z.object({
  maxDailyDistanceMeters: optionalPositiveNumber,
  maxDailyDurationSec: optionalPositiveNumber,
  maxDailySessions: optionalPositiveNumber,
  minDailyDistanceMeters: optionalPositiveNumber,
  minDailyDurationSec: optionalPositiveNumber,
  minDailySessions: optionalPositiveNumber,
}).superRefine((data, ctx) => {
  const checkMinMax = (minVal?: number | null, maxVal?: number | null, fieldNamePrefix?: string, minPath?: keyof typeof data, maxPath?: keyof typeof data) => {
    if (minVal !== undefined && minVal !== null && maxVal !== undefined && maxVal !== null && minVal > maxVal) {
      const msg = `Min ${fieldNamePrefix ? fieldNamePrefix.toLowerCase() : ''} cannot be greater than Max ${fieldNamePrefix ? fieldNamePrefix.toLowerCase() : ''}.`;
      if (minPath) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: [minPath] });
      if (maxPath) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: [maxPath] });
    }
  };
  checkMinMax(data.minDailyDistanceMeters, data.maxDailyDistanceMeters, "RunningDailyDistanceMeters", "minDailyDistanceMeters", "maxDailyDistanceMeters");
  checkMinMax(data.minDailyDurationSec, data.maxDailyDurationSec, "RunningDailyDurationSec", "minDailyDurationSec", "maxDailyDurationSec");
  checkMinMax(data.minDailySessions, data.maxDailySessions, "RunningDailySessions", "minDailySessions", "maxDailySessions");
});

interface UpdateRunningRadarGoalsResult {
  success: boolean;
  error?: string;
  details?: z.inferFlattenedErrors<typeof RunningRadarGoalsSchema>;
  data?: RunningRadarGoals;
}

export async function updateRunningRadarGoals(
  values: RunningRadarGoals
): Promise<UpdateRunningRadarGoalsResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return { success: false, error: 'User not authenticated.' };
  }
  const userId = currentUser.uid;

  console.log('[USER_PROFILE_ACTIONS] Attempting to update running radar goals for UID:', userId, 'with values:', values);

  try {
    const validatedValues = RunningRadarGoalsSchema.parse(values);
    
    const goalsToUpdate: RunningRadarGoals = {};
    goalsToUpdate.maxDailyDistanceMeters = validatedValues.maxDailyDistanceMeters === null ? undefined : validatedValues.maxDailyDistanceMeters;
    goalsToUpdate.maxDailyDurationSec = validatedValues.maxDailyDurationSec === null ? undefined : validatedValues.maxDailyDurationSec;
    goalsToUpdate.maxDailySessions = validatedValues.maxDailySessions === null ? undefined : validatedValues.maxDailySessions;
    goalsToUpdate.minDailyDistanceMeters = validatedValues.minDailyDistanceMeters === null ? undefined : validatedValues.minDailyDistanceMeters;
    goalsToUpdate.minDailyDurationSec = validatedValues.minDailyDurationSec === null ? undefined : validatedValues.minDailyDurationSec;
    goalsToUpdate.minDailySessions = validatedValues.minDailySessions === null ? undefined : validatedValues.minDailySessions;

    const userProfileDocRef = doc(db, 'users', userId);
    await updateDoc(userProfileDocRef, {
      runningRadarGoals: goalsToUpdate,
    });

    console.log('[USER_PROFILE_ACTIONS] Running radar goals updated successfully for UID:', userId);
    return { success: true, data: goalsToUpdate };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('[USER_PROFILE_ACTIONS] Zod validation error updating running radar goals:', error.flatten());
      return { success: false, error: 'Invalid input data.', details: error.flatten() };
    }
    console.error('[USER_PROFILE_ACTIONS] Error updating running radar goals for UID:', userId, error);
    return { success: false, error: String(error.message) || 'Failed to update running goals.' };
  }
}

// --- Hiking Goals ---
const HikingRadarGoalsSchema = z.object({
  maxDailyDistanceMeters: optionalPositiveNumber,
  maxDailyDurationSec: optionalPositiveNumber,
  maxDailySessions: optionalPositiveNumber,
  maxDailyElevationGainMeters: optionalPositiveNumber,
  minDailyDistanceMeters: optionalPositiveNumber,
  minDailyDurationSec: optionalPositiveNumber,
  minDailySessions: optionalPositiveNumber,
  minDailyElevationGainMeters: optionalPositiveNumber,
}).superRefine((data, ctx) => {
  const checkMinMax = (minVal?: number | null, maxVal?: number | null, fieldNamePrefix?: string, minPath?: keyof typeof data, maxPath?: keyof typeof data) => {
    if (minVal !== undefined && minVal !== null && maxVal !== undefined && maxVal !== null && minVal > maxVal) {
      const msg = `Min ${fieldNamePrefix ? fieldNamePrefix.toLowerCase() : ''} cannot be greater than Max ${fieldNamePrefix ? fieldNamePrefix.toLowerCase() : ''}.`;
      if (minPath) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: [minPath] });
      if (maxPath) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: [maxPath] });
    }
  };
  checkMinMax(data.minDailyDistanceMeters, data.maxDailyDistanceMeters, "HikingDailyDistanceMeters", "minDailyDistanceMeters", "maxDailyDistanceMeters");
  checkMinMax(data.minDailyDurationSec, data.maxDailyDurationSec, "HikingDailyDurationSec", "minDailyDurationSec", "maxDailyDurationSec");
  checkMinMax(data.minDailySessions, data.maxDailySessions, "HikingDailySessions", "minDailySessions", "maxDailySessions");
  checkMinMax(data.minDailyElevationGainMeters, data.maxDailyElevationGainMeters, "HikingDailyElevationGainMeters", "minDailyElevationGainMeters", "maxDailyElevationGainMeters");
});

interface UpdateHikingRadarGoalsResult {
  success: boolean;
  error?: string;
  details?: z.inferFlattenedErrors<typeof HikingRadarGoalsSchema>;
  data?: HikingRadarGoals;
}

export async function updateHikingRadarGoals(
  values: HikingRadarGoals
): Promise<UpdateHikingRadarGoalsResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return { success: false, error: 'User not authenticated.' };
  }
  const userId = currentUser.uid;

  console.log('[USER_PROFILE_ACTIONS] Attempting to update hiking radar goals for UID:', userId, 'with values:', values);

  try {
    const validatedValues = HikingRadarGoalsSchema.parse(values);
    
    const goalsToUpdate: HikingRadarGoals = {};
    goalsToUpdate.maxDailyDistanceMeters = validatedValues.maxDailyDistanceMeters === null ? undefined : validatedValues.maxDailyDistanceMeters;
    goalsToUpdate.maxDailyDurationSec = validatedValues.maxDailyDurationSec === null ? undefined : validatedValues.maxDailyDurationSec;
    goalsToUpdate.maxDailySessions = validatedValues.maxDailySessions === null ? undefined : validatedValues.maxDailySessions;
    goalsToUpdate.maxDailyElevationGainMeters = validatedValues.maxDailyElevationGainMeters === null ? undefined : validatedValues.maxDailyElevationGainMeters;
    goalsToUpdate.minDailyDistanceMeters = validatedValues.minDailyDistanceMeters === null ? undefined : validatedValues.minDailyDistanceMeters;
    goalsToUpdate.minDailyDurationSec = validatedValues.minDailyDurationSec === null ? undefined : validatedValues.minDailyDurationSec;
    goalsToUpdate.minDailySessions = validatedValues.minDailySessions === null ? undefined : validatedValues.minDailySessions;
    goalsToUpdate.minDailyElevationGainMeters = validatedValues.minDailyElevationGainMeters === null ? undefined : validatedValues.minDailyElevationGainMeters;

    const userProfileDocRef = doc(db, 'users', userId);
    await updateDoc(userProfileDocRef, {
      hikingRadarGoals: goalsToUpdate,
    });

    console.log('[USER_PROFILE_ACTIONS] Hiking radar goals updated successfully for UID:', userId);
    return { success: true, data: goalsToUpdate };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('[USER_PROFILE_ACTIONS] Zod validation error updating hiking radar goals:', error.flatten());
      return { success: false, error: 'Invalid input data.', details: error.flatten() };
    }
    console.error('[USER_PROFILE_ACTIONS] Error updating hiking radar goals for UID:', userId, error);
    return { success: false, error: String(error.message) || 'Failed to update hiking goals.' };
  }
}


// --- Swimming Goals ---
const SwimmingRadarGoalsSchema = z.object({
  maxDailyDistanceMeters: optionalPositiveNumber,
  maxDailyDurationSec: optionalPositiveNumber,
  maxDailySessions: optionalPositiveNumber,
  minDailyDistanceMeters: optionalPositiveNumber,
  minDailyDurationSec: optionalPositiveNumber,
  minDailySessions: optionalPositiveNumber,
}).superRefine((data, ctx) => {
  const checkMinMax = (minVal?: number | null, maxVal?: number | null, fieldNamePrefix?: string, minPath?: keyof typeof data, maxPath?: keyof typeof data) => {
    if (minVal !== undefined && minVal !== null && maxVal !== undefined && maxVal !== null && minVal > maxVal) {
      const msg = `Min ${fieldNamePrefix ? fieldNamePrefix.toLowerCase() : ''} cannot be greater than Max ${fieldNamePrefix ? fieldNamePrefix.toLowerCase() : ''}.`;
      if (minPath) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: [minPath] });
      if (maxPath) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: [maxPath] });
    }
  };
  checkMinMax(data.minDailyDistanceMeters, data.maxDailyDistanceMeters, "SwimmingDailyDistanceMeters", "minDailyDistanceMeters", "maxDailyDistanceMeters");
  checkMinMax(data.minDailyDurationSec, data.maxDailyDurationSec, "SwimmingDailyDurationSec", "minDailyDurationSec", "maxDailyDurationSec");
  checkMinMax(data.minDailySessions, data.maxDailySessions, "SwimmingDailySessions", "minDailySessions", "maxDailySessions");
});

interface UpdateSwimmingRadarGoalsResult {
  success: boolean;
  error?: string;
  details?: z.inferFlattenedErrors<typeof SwimmingRadarGoalsSchema>;
  data?: SwimmingRadarGoals;
}

export async function updateSwimmingRadarGoals(
  values: SwimmingRadarGoals
): Promise<UpdateSwimmingRadarGoalsResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return { success: false, error: 'User not authenticated.' };
  }
  const userId = currentUser.uid;

  console.log('[USER_PROFILE_ACTIONS] Attempting to update swimming radar goals for UID:', userId, 'with values:', values);

  try {
    const validatedValues = SwimmingRadarGoalsSchema.parse(values);
    
    const goalsToUpdate: SwimmingRadarGoals = {};
    goalsToUpdate.maxDailyDistanceMeters = validatedValues.maxDailyDistanceMeters === null ? undefined : validatedValues.maxDailyDistanceMeters;
    goalsToUpdate.maxDailyDurationSec = validatedValues.maxDailyDurationSec === null ? undefined : validatedValues.maxDailyDurationSec;
    goalsToUpdate.maxDailySessions = validatedValues.maxDailySessions === null ? undefined : validatedValues.maxDailySessions;
    goalsToUpdate.minDailyDistanceMeters = validatedValues.minDailyDistanceMeters === null ? undefined : validatedValues.minDailyDistanceMeters;
    goalsToUpdate.minDailyDurationSec = validatedValues.minDailyDurationSec === null ? undefined : validatedValues.minDailyDurationSec;
    goalsToUpdate.minDailySessions = validatedValues.minDailySessions === null ? undefined : validatedValues.minDailySessions;

    const userProfileDocRef = doc(db, 'users', userId);
    await updateDoc(userProfileDocRef, {
      swimmingRadarGoals: goalsToUpdate,
    });

    console.log('[USER_PROFILE_ACTIONS] Swimming radar goals updated successfully for UID:', userId);
    return { success: true, data: goalsToUpdate };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('[USER_PROFILE_ACTIONS] Zod validation error updating swimming radar goals:', error.flatten());
      return { success: false, error: 'Invalid input data.', details: error.flatten() };
    }
    console.error('[USER_PROFILE_ACTIONS] Error updating swimming radar goals for UID:', userId, error);
    return { success: false, error: String(error.message) || 'Failed to update swimming goals.' };
  }
}

// --- Sleep Goals ---
const SleepRadarGoalsSchema = z.object({
  targetSleepDurationHours: optionalPositiveNumber,
  minSleepEfficiencyPercent: optionalPositiveNumber.refine(val => val === undefined || val === null || (val >= 0 && val <= 100), {
    message: "Efficiency must be between 0 and 100.",
  }),
  minTimeInDeepSleepMinutes: optionalPositiveNumber,
  minTimeInRemSleepMinutes: optionalPositiveNumber,
});

interface UpdateSleepRadarGoalsResult {
  success: boolean;
  error?: string;
  details?: z.inferFlattenedErrors<typeof SleepRadarGoalsSchema>;
  data?: SleepRadarGoals;
}

export async function updateSleepRadarGoals(
  values: SleepRadarGoals
): Promise<UpdateSleepRadarGoalsResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return { success: false, error: 'User not authenticated.' };
  }
  const userId = currentUser.uid;

  console.log('[USER_PROFILE_ACTIONS] Attempting to update sleep radar goals for UID:', userId, 'with values:', values);

  try {
    const validatedValues = SleepRadarGoalsSchema.parse(values);
    
    const goalsToUpdate: SleepRadarGoals = {
      targetSleepDurationHours: validatedValues.targetSleepDurationHours === null ? undefined : validatedValues.targetSleepDurationHours,
      minSleepEfficiencyPercent: validatedValues.minSleepEfficiencyPercent === null ? undefined : validatedValues.minSleepEfficiencyPercent,
      minTimeInDeepSleepMinutes: validatedValues.minTimeInDeepSleepMinutes === null ? undefined : validatedValues.minTimeInDeepSleepMinutes,
      minTimeInRemSleepMinutes: validatedValues.minTimeInRemSleepMinutes === null ? undefined : validatedValues.minTimeInRemSleepMinutes,
    };

    const userProfileDocRef = doc(db, 'users', userId);
    await updateDoc(userProfileDocRef, {
      sleepRadarGoals: goalsToUpdate,
    });

    console.log('[USER_PROFILE_ACTIONS] Sleep radar goals updated successfully for UID:', userId);
    return { success: true, data: goalsToUpdate };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('[USER_PROFILE_ACTIONS] Zod validation error updating sleep radar goals:', error.flatten());
      return { success: false, error: 'Invalid input data.', details: error.flatten() };
    }
    console.error('[USER_PROFILE_ACTIONS] Error updating sleep radar goals for UID:', userId, error);
    return { success: false, error: String(error.message) || 'Failed to update sleep goals.' };
  }
}


// --- Dashboard Metric Selection ---
const allMetricIds = AVAILABLE_DASHBOARD_METRICS.map(m => m.id) as [DashboardMetricIdValue, ...DashboardMetricIdValue[]];
const DashboardMetricSelectionSchema = z.object({
  selectedMetricIds: z.array(z.enum(allMetricIds))
    .min(3, "Please select at least 3 metrics for your dashboard.")
    .max(5, "You can select a maximum of 5 metrics for your dashboard."),
});

interface UpdateDashboardRadarMetricsResult {
  success: boolean;
  error?: string;
  details?: z.inferFlattenedErrors<typeof DashboardMetricSelectionSchema>;
  data?: DashboardMetricIdValue[];
}

export async function updateDashboardRadarMetrics(
  selectedMetricIds: DashboardMetricIdValue[]
): Promise<UpdateDashboardRadarMetricsResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return { success: false, error: 'User not authenticated.' };
  }
  const userId = currentUser.uid;

  console.log('[USER_PROFILE_ACTIONS] Attempting to update dashboard radar metrics for UID:', userId, 'with IDs:', selectedMetricIds);

  try {
    const validatedValues = DashboardMetricSelectionSchema.parse({ selectedMetricIds });

    const userProfileDocRef = doc(db, 'users', userId);
    await updateDoc(userProfileDocRef, {
      dashboardRadarMetrics: validatedValues.selectedMetricIds,
    });

    console.log('[USER_PROFILE_ACTIONS] Dashboard radar metrics updated successfully for UID:', userId);
    return { success: true, data: validatedValues.selectedMetricIds };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('[USER_PROFILE_ACTIONS] Zod validation error updating dashboard metrics:', error.flatten());
      return { success: false, error: 'Invalid selection.', details: error.flatten() };
    }
    console.error('[USER_PROFILE_ACTIONS] Error updating dashboard metrics for UID:', userId, error);
    return { success: false, error: String(error.message) || 'Failed to update dashboard metric selection.' };
  }
}

// --- Mark Profile Setup Complete ---
export async function markProfileSetupComplete(userId: string): Promise<{ success: boolean, error?: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== userId) {
    return { success: false, error: 'Authorization error.' };
  }

  console.log('[USER_PROFILE_ACTIONS] Marking profile setup as complete for UID:', userId);
  try {
    const userProfileDocRef = doc(db, 'users', userId);
    await updateDoc(userProfileDocRef, {
      profileSetupComplete: true,
    });
    console.log('[USER_PROFILE_ACTIONS] Profile setup marked as complete in Firestore for UID:', userId);
    return { success: true };
  } catch (error: any) {
    console.error('[USER_PROFILE_ACTIONS] Error marking profile setup complete for UID:', userId, error);
    return { success: false, error: String(error.message) || 'Failed to update profile completion status.' };
  }
}
