
'use client';

import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from './clientApp';
import type { UserProfile } from '@/types';

interface UpdateResult {
  success: boolean;
  error?: string;
}

export async function updateUserTermsAcceptance(userId: string, accepted: boolean, version: string): Promise<UpdateResult> {
    try {
        const userDocRef = doc(db, "users", userId);
        await updateDoc(userDocRef, {
            acceptedLatestTerms: accepted,
            termsVersionAccepted: version
        });
        console.log("[ClientFirestore] Terms acceptance updated successfully for UID:", userId);
        return { success: true };
    } catch (error: any) {
        console.error("[ClientFirestore] Error updating terms acceptance:", error);
        return { success: false, error: error.message || "An unknown error occurred while updating terms." };
    }
}

export async function updateUserDemographics(userId: string, dataToUpdate: Partial<UserProfile>): Promise<UpdateResult> {
    try {
        const userDocRef = doc(db, "users", userId);
        // Use setDoc with merge:true to create the doc if it doesn't exist, or update it if it does.
        await setDoc(userDocRef, dataToUpdate, { merge: true });
        console.log("[ClientFirestore] Demographics updated successfully for UID:", userId);
        return { success: true };
    } catch (error: any) {
        console.error("[ClientFirestore] Error updating demographics:", error);
        return { success: false, error: error.message || "An unknown error occurred while updating profile." };
    }
}
