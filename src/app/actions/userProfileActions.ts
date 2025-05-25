
'use server';

import { z } from 'zod';
import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import { doc, updateDoc } from 'firebase/firestore';
import type { WalkingRadarGoals } from '@/types';

// Schema for validating individual goal values
const optionalPositiveNumber = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? undefined : Number(val)),
  z.number().nonnegative("Must be a non-negative number (0 or more).").optional().nullable()
);

const WalkingRadarGoalsSchema = z.object({
  maxDailySteps: optionalPositiveNumber,
  maxDailyDistanceMeters: optionalPositiveNumber,
  maxDailyDurationSec: optionalPositiveNumber, // Already in seconds from form
  maxDailySessions: optionalPositiveNumber,
  minDailySteps: optionalPositiveNumber,
  minDailyDistanceMeters: optionalPositiveNumber,
  minDailyDurationSec: optionalPositiveNumber, // Already in seconds from form
  minDailySessions: optionalPositiveNumber,
}).refine(data => { // Ensure max is greater than or equal to min if both are set
  if (data.minDailySteps !== undefined && data.maxDailySteps !== undefined && data.minDailySteps > data.maxDailySteps) return false;
  if (data.minDailyDistanceMeters !== undefined && data.maxDailyDistanceMeters !== undefined && data.minDailyDistanceMeters > data.maxDailyDistanceMeters) return false;
  if (data.minDailyDurationSec !== undefined && data.maxDailyDurationSec !== undefined && data.minDailyDurationSec > data.maxDailyDurationSec) return false;
  if (data.minDailySessions !== undefined && data.maxDailySessions !== undefined && data.minDailySessions > data.maxDailySessions) return false;
  return true;
}, {
  message: "Minimum value cannot be greater than its corresponding maximum value.",
  // Path can be more specific if needed, but a general error might be fine here
  path: ["minDailySteps"], // Example path, specific errors for each pair would be more UX friendly
});


interface UpdateWalkingRadarGoalsResult {
  success: boolean;
  error?: string;
  details?: z.inferFlattenedErrors<typeof WalkingRadarGoalsSchema>;
  data?: WalkingRadarGoals;
}

export async function updateWalkingRadarGoals(
  values: WalkingRadarGoals // Expects values already processed (e.g., duration in seconds)
): Promise<UpdateWalkingRadarGoalsResult> {
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) {
    return { success: false, error: 'User not authenticated.' };
  }
  const userId = currentUser.uid;

  console.log('[USER_PROFILE_ACTIONS] Attempting to update walking radar goals for UID:', userId, 'with values:', values);

  try {
    const validatedValues = WalkingRadarGoalsSchema.parse(values);
    
    const goalsToUpdate: WalkingRadarGoals = {};
    // Max values
    if (validatedValues.maxDailySteps !== undefined) goalsToUpdate.maxDailySteps = validatedValues.maxDailySteps === null ? undefined : validatedValues.maxDailySteps;
    if (validatedValues.maxDailyDistanceMeters !== undefined) goalsToUpdate.maxDailyDistanceMeters = validatedValues.maxDailyDistanceMeters === null ? undefined : validatedValues.maxDailyDistanceMeters;
    if (validatedValues.maxDailyDurationSec !== undefined) goalsToUpdate.maxDailyDurationSec = validatedValues.maxDailyDurationSec === null ? undefined : validatedValues.maxDailyDurationSec;
    if (validatedValues.maxDailySessions !== undefined) goalsToUpdate.maxDailySessions = validatedValues.maxDailySessions === null ? undefined : validatedValues.maxDailySessions;
    // Min values
    if (validatedValues.minDailySteps !== undefined) goalsToUpdate.minDailySteps = validatedValues.minDailySteps === null ? undefined : validatedValues.minDailySteps;
    if (validatedValues.minDailyDistanceMeters !== undefined) goalsToUpdate.minDailyDistanceMeters = validatedValues.minDailyDistanceMeters === null ? undefined : validatedValues.minDailyDistanceMeters;
    if (validatedValues.minDailyDurationSec !== undefined) goalsToUpdate.minDailyDurationSec = validatedValues.minDailyDurationSec === null ? undefined : validatedValues.minDailyDurationSec;
    if (validatedValues.minDailySessions !== undefined) goalsToUpdate.minDailySessions = validatedValues.minDailySessions === null ? undefined : validatedValues.minDailySessions;


    if (!db || !db.app) {
      console.error('[USER_PROFILE_ACTIONS] Firestore not initialized.');
      return { success: false, error: 'Database service unavailable.' };
    }

    const userProfileDocRef = doc(db, 'users', userId);
    await updateDoc(userProfileDocRef, {
      walkingRadarGoals: goalsToUpdate, // This will overwrite the existing walkingRadarGoals object
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
```