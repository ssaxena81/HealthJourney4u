
'use server';

import { db } from '@/lib/firebase/serverApp';
import { doc, getDoc, setDoc, collection, writeBatch, query, where, getDocs } from 'firebase/firestore';
import { getValidFitbitAccessToken } from '@/lib/fitbit-auth-utils';
import { getSleepLogs, type FitbitSleepLog } from '@/lib/services/fitbitService';
import type { UserProfile, FitbitSleepLogFirestore } from '@/types';
import { format, subDays, parseISO } from 'date-fns';

interface SyncResult {
  success: boolean;
  message: string;
  syncedCount?: number;
  error?: string;
}

/**
 * Normalizes a Fitbit sleep log and prepares it for storage in Firestore.
 */
function normalizeFitbitSleepLog(log: FitbitSleepLog, userId: string): FitbitSleepLogFirestore {
  return {
    ...log,
    dataSource: 'fitbit',
    lastFetched: new Date().toISOString(),
  };
}

/**
 * Fetches sleep logs from Fitbit for a given date range and stores them in Firestore.
 */
export async function syncFitbitSleepData(userId: string, startDate: string, endDate: string): Promise<SyncResult> {
  if (!userId) {
    return { success: false, message: 'User not authenticated.' };
  }
  
  console.log(`[FitbitActions] Starting sleep data sync for user ${userId} from ${startDate} to ${endDate}`);

  const accessToken = await getValidFitbitAccessToken(userId);
  if (!accessToken) {
    return { success: false, message: 'Could not retrieve a valid Fitbit access token. Please reconnect.' };
  }

  try {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    let current = start;
    let allSleepLogs: FitbitSleepLog[] = [];

    // Fetch data for each day in the range
    while (current <= end) {
      const dateString = format(current, 'yyyy-MM-dd');
      try {
        const dailyLogs = await getSleepLogs(accessToken, dateString);
        if (dailyLogs.sleep && dailyLogs.sleep.length > 0) {
          allSleepLogs.push(...dailyLogs.sleep);
        }
      } catch (error: any) {
        // If a single day fails (e.g., rate limit), log it but try to continue
        console.error(`[FitbitActions] Failed to fetch sleep data for ${dateString}:`, error.message);
      }
      current = subDays(current, -1); // Move to the next day
    }

    if (allSleepLogs.length === 0) {
      return { success: true, message: 'No new sleep logs found in the selected date range.', syncedCount: 0 };
    }

    // Use a batch write to save all logs to Firestore atomically
    const batch = writeBatch(db);
    const sleepCollectionRef = collection(db, 'users', userId, 'fitbit_sleep');

    allSleepLogs.forEach(log => {
      const normalizedLog = normalizeFitbitSleepLog(log, userId);
      // Use a composite key of date and logId to ensure uniqueness
      const docRef = doc(sleepCollectionRef, `${normalizedLog.dateOfSleep}_${normalizedLog.logId}`);
      batch.set(docRef, normalizedLog, { merge: true });
    });

    await batch.commit();

    // Update the last successful sync timestamp on the user's profile
    const userProfileRef = doc(db, 'users', userId);
    await setDoc(userProfileRef, { fitbitLastSuccessfulSync: new Date().toISOString() }, { merge: true });

    const message = `Successfully synced ${allSleepLogs.length} sleep log(s).`;
    console.log(`[FitbitActions] ${message}`);
    return { success: true, message, syncedCount: allSleepLogs.length };

  } catch (error: any) {
    console.error(`[FitbitActions] An error occurred during the Fitbit sleep sync process for user ${userId}:`, error);
    return { success: false, message: 'An unexpected error occurred during sync.', error: error.message };
  }
}

interface GetSleepLogsResponse {
  success: boolean;
  data?: FitbitSleepLogFirestore[];
  error?: string;
}

export async function getFitbitSleepLogsForDateRange(
    userId: string,
    dateRange: { from: string; to: string }
): Promise<GetSleepLogsResponse> {
    if (!userId) {
        return { success: false, error: 'User not authenticated.' };
    }
    
    try {
        const sleepLogsRef = collection(db, 'users', userId, 'fitbit_sleep');
        const q = query(
            sleepLogsRef,
            where('dateOfSleep', '>=', dateRange.from),
            where('dateOfSleep', '<=', dateRange.to),
            orderBy('dateOfSleep', 'desc')
        );

        const querySnapshot = await getDocs(q);
        const sleepLogs: FitbitSleepLogFirestore[] = [];
        querySnapshot.forEach((docSnap) => {
            sleepLogs.push(docSnap.data() as FitbitSleepLogFirestore);
        });

        return { success: true, data: sleepLogs };

    } catch (error: any) {
        console.error(`[FitbitActions] Error fetching sleep logs from Firestore for user ${userId}:`, error);
        return { success: false, error: `Failed to fetch sleep logs: ${String(error.message || 'Unknown Firestore error')}` };
    }
}
