
'use server';

import { z } from 'zod';
import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import { doc, updateDoc } from 'firebase/firestore';
import type { WalkingRadarGoals } from '@/types';

const WalkingRadarGoalsSchema = z.object({
  maxDailySteps: z.number().positive("Max daily steps must be a positive number.").optional().nullable(),
  maxDailyDistanceMeters: z.number().positive("Max daily distance must be a positive number.").optional().nullable(),
  maxDailyDurationSec: z.number().positive("Max daily duration must be a positive number.").optional().nullable(),
  maxDailySessions: z.number().positive("Max daily sessions must be a positive number.").optional().nullable(),
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
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) {
    return { success: false, error: 'User not authenticated.' };
  }
  const userId = currentUser.uid;

  console.log('[USER_PROFILE_ACTIONS] Attempting to update walking radar goals for UID:', userId, 'with values:', values);

  try {
    const validatedValues = WalkingRadarGoalsSchema.parse(values);
    
    // Filter out null values before sending to Firestore, as Firestore doesn't like explicit nulls for missing fields (use deleteField if needed, or just omit)
    const goalsToUpdate: Partial<WalkingRadarGoals> = {};
    if (validatedValues.maxDailySteps != null) goalsToUpdate.maxDailySteps = validatedValues.maxDailySteps;
    if (validatedValues.maxDailyDistanceMeters != null) goalsToUpdate.maxDailyDistanceMeters = validatedValues.maxDailyDistanceMeters;
    if (validatedValues.maxDailyDurationSec != null) goalsToUpdate.maxDailyDurationSec = validatedValues.maxDailyDurationSec;
    if (validatedValues.maxDailySessions != null) goalsToUpdate.maxDailySessions = validatedValues.maxDailySessions;


    if (!db || !db.app) {
      console.error('[USER_PROFILE_ACTIONS] Firestore not initialized.');
      return { success: false, error: 'Database service unavailable.' };
    }

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

    