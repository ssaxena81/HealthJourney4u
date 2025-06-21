
'use server';

import { auth, db } from '@/lib/firebase/serverApp';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import type { UserProfile } from '@/types';
import {
    fetchAndStoreFitbitDailyActivity,
    fetchAndStoreFitbitHeartRate,
    fetchAndStoreFitbitSleep,
    fetchAndStoreFitbitSwimmingData,
    fetchAndStoreFitbitLoggedActivities
} from './fitbitActions';
import { fetchAndStoreStravaRecentActivities } from './stravaActions';
import { fetchAndStoreGoogleFitActivities } from './googleFitActions';
import { format, subDays, eachDayOfInterval, parseISO, isBefore } from 'date-fns';

export interface SyncResult {
  service: string;
  success: boolean;
  message?: string;
  errorCode?: string;
  activitiesProcessed?: number;
}

export interface SyncAllResults {
  success: boolean;
  results: SyncResult[];
  error?: string;
}

export async function syncAllConnectedData(): Promise<SyncAllResults> {
  console.log('[SyncActions] Starting syncAllConnectedData...');

  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.error('[SyncActions] User not authenticated for syncAllConnectedData.');
    return { success: false, results: [], error: 'User not authenticated.' };
  }
  const userId = currentUser.uid;

  let userProfile: UserProfile | null = null;
  const userProfileDocRef = doc(db, 'users', userId);
  try {
    const userProfileSnap = await getDoc(userProfileDocRef);
    if (userProfileSnap.exists()) {
      userProfile = userProfileSnap.data() as UserProfile;
    } else {
      console.error(`[SyncActions] User profile not found for UID: ${userId}.`);
      return { success: false, results: [], error: 'User profile not found.' };
    }
  } catch (e: any) {
    console.error(`[SyncActions] Error fetching user profile for UID: ${userId}:`, e);
    return { success: false, results: [], error: `Failed to fetch user profile: ${e.message}` };
  }

  if (!userProfile) {
    return { success: false, results: [], error: 'User profile is null.' };
  }

  const syncResults: SyncResult[] = [];
  const today = new Date();
  const todayDateString = format(today, 'yyyy-MM-dd');
  let overallSyncSuccess = true;

  // Fitbit Sync
  if (userProfile.connectedFitnessApps?.some(app => app.id === 'fitbit')) {
    console.log('[SyncActions] Attempting to sync Fitbit data...');
    let fitbitSyncSuccess = true;
    let totalFitbitActivitiesProcessed = 0;

    const lastSyncFitbit = userProfile.fitbitLastSuccessfulSync ? parseISO(userProfile.fitbitLastSuccessfulSync) : subDays(today, 7);
    const fitbitStartDate = isBefore(lastSyncFitbit, subDays(today, 7)) ? subDays(today, 7) : lastSyncFitbit;

    const datesToSyncFitbit = eachDayOfInterval({
      start: fitbitStartDate,
      end: today,
    }).map(date => format(date, 'yyyy-MM-dd'));

    console.log(`[SyncActions] Fitbit: Syncing for dates: ${datesToSyncFitbit.join(', ')}`);

    for (const dateStr of datesToSyncFitbit) {
      try {
        const activityRes = await fetchAndStoreFitbitDailyActivity(dateStr);
        if (!activityRes.success) {
            fitbitSyncSuccess = false;
            syncResults.push({ service: `Fitbit Daily Activity (${dateStr})`, ...activityRes });
            if (activityRes.errorCode === 'FITBIT_AUTH_ERROR' || activityRes.errorCode === 'FITBIT_AUTH_EXPIRED_POST_REFRESH') throw new Error('Fitbit Auth Error');
        } else { totalFitbitActivitiesProcessed += activityRes.data ? 1 : 0; }

        const heartRes = await fetchAndStoreFitbitHeartRate(dateStr);
        if (!heartRes.success) {
            fitbitSyncSuccess = false;
            syncResults.push({ service: `Fitbit Heart Rate (${dateStr})`, ...heartRes });
             if (heartRes.errorCode === 'FITBIT_AUTH_ERROR' || heartRes.errorCode === 'FITBIT_AUTH_EXPIRED_POST_REFRESH') throw new Error('Fitbit Auth Error');
        } else { totalFitbitActivitiesProcessed += heartRes.data ? 1 : 0; }

        const sleepRes = await fetchAndStoreFitbitSleep(dateStr);
        if (!sleepRes.success) {
            fitbitSyncSuccess = false;
            syncResults.push({ service: `Fitbit Sleep (${dateStr})`, ...sleepRes });
             if (sleepRes.errorCode === 'FITBIT_AUTH_ERROR' || sleepRes.errorCode === 'FITBIT_AUTH_EXPIRED_POST_REFRESH') throw new Error('Fitbit Auth Error');
        } else { totalFitbitActivitiesProcessed += sleepRes.activitiesProcessed || 0; }

        const swimmingRes = await fetchAndStoreFitbitSwimmingData(dateStr);
        if (!swimmingRes.success) {
            fitbitSyncSuccess = false;
            syncResults.push({ service: `Fitbit Swimming (${dateStr})`, ...swimmingRes });
             if (swimmingRes.errorCode === 'FITBIT_AUTH_ERROR' || swimmingRes.errorCode === 'FITBIT_AUTH_EXPIRED_POST_REFRESH') throw new Error('Fitbit Auth Error');
        } else { totalFitbitActivitiesProcessed += swimmingRes.activitiesProcessed || 0; }

        const loggedActivitiesRes = await fetchAndStoreFitbitLoggedActivities(dateStr);
        if (!loggedActivitiesRes.success) {
            fitbitSyncSuccess = false;
            syncResults.push({ service: `Fitbit Logged Activities (${dateStr})`, ...loggedActivitiesRes });
             if (loggedActivitiesRes.errorCode === 'FITBIT_AUTH_ERROR' || loggedActivitiesRes.errorCode === 'FITBIT_AUTH_EXPIRED_POST_REFRESH') throw new Error('Fitbit Auth Error');
        } else { totalFitbitActivitiesProcessed += loggedActivitiesRes.activitiesProcessed || 0; }

      } catch (error: any) {
        console.error(`[SyncActions] Error during Fitbit sync for date ${dateStr}:`, error);
        fitbitSyncSuccess = false;
        syncResults.push({ service: `Fitbit General (${dateStr})`, success: false, message: `Fitbit sync failed for ${dateStr}: ${error.message}`, errorCode: error.message === 'Fitbit Auth Error' ? 'FITBIT_AUTH_ERROR' : 'SYNC_LOOP_ERROR' });
        if (error.message === 'Fitbit Auth Error') break;
      }
    }

    if (fitbitSyncSuccess && datesToSyncFitbit.length > 0) {
        await updateDoc(userProfileDocRef, { fitbitLastSuccessfulSync: todayDateString });
        console.log(`[SyncActions] Fitbit: Updated fitbitLastSuccessfulSync to ${todayDateString}.`);
        syncResults.push({ service: 'Fitbit (Overall)', success: true, message: `Successfully synced Fitbit data up to ${todayDateString}.`, activitiesProcessed: totalFitbitActivitiesProcessed });
    } else if (!fitbitSyncSuccess) {
        overallSyncSuccess = false;
        const fitbitAuthErrorOverallExists = syncResults.some(r => r.service === 'Fitbit (Overall)' && r.errorCode?.includes('AUTH_ERROR'));
        if (!fitbitAuthErrorOverallExists) {
            syncResults.push({ service: 'Fitbit (Overall)', success: false, message: 'Fitbit sync encountered errors.', activitiesProcessed: totalFitbitActivitiesProcessed });
        }
    }
  }

  // Strava Sync
  if (userProfile.connectedFitnessApps?.some(app => app.id === 'strava')) {
    console.log('[SyncActions] Attempting to sync Strava data...');
    try {
      const afterTimestamp = userProfile.stravaLastSyncTimestamp
                             ? userProfile.stravaLastSyncTimestamp + 1
                             : Math.floor(subDays(today, 7).getTime() / 1000);

      console.log(`[SyncActions] Strava: Fetching activities after timestamp: ${afterTimestamp}`);

      const stravaRes = await fetchAndStoreStravaRecentActivities({
          after: afterTimestamp,
          per_page: 50
      });
      syncResults.push({ service: 'Strava Activities', ...stravaRes });

      if (stravaRes.success) {
        const currentEpochTimeSeconds = Math.floor(today.getTime() / 1000);
        await updateDoc(userProfileDocRef, { stravaLastSyncTimestamp: currentEpochTimeSeconds });
        console.log(`[SyncActions] Strava: Updated stravaLastSyncTimestamp to ${currentEpochTimeSeconds}.`);
      } else {
        overallSyncSuccess = false;
         if (stravaRes.errorCode === 'STRAVA_AUTH_ERROR' || stravaRes.errorCode === 'STRAVA_AUTH_EXPIRED_POST_REFRESH'){
            console.warn('[SyncActions] Strava auth error detected, not overriding overall sync result based on this.');
         }
      }
    } catch (error: any) {
      console.error('[SyncActions] Error during Strava sync:', error);
      syncResults.push({ service: 'Strava (Overall)', success: false, message: `Strava sync failed: ${error.message}`, errorCode: 'STRAVA_SYNC_FAILED' });
      overallSyncSuccess = false;
    }
  }

  // Google Fit Sync
  if (userProfile.connectedFitnessApps?.some(app => app.id === 'google-fit')) {
    console.log('[SyncActions] Attempting to sync Google Fit data...');
    try {
      const startTimeIso = userProfile.googleFitLastSuccessfulSync ? userProfile.googleFitLastSuccessfulSync : subDays(today, 7).toISOString();
      const endTimeIso = today.toISOString();
      const googleFitRes = await fetchAndStoreGoogleFitActivities({ startTimeIso, endTimeIso });
      syncResults.push({ service: 'Google Fit Activities', ...googleFitRes });
      if (googleFitRes.success) {
        await updateDoc(userProfileDocRef, { googleFitLastSuccessfulSync: endTimeIso });
        console.log(`[SyncActions] Google Fit: Updated googleFitLastSuccessfulSync.`);
      } else {
        overallSyncSuccess = false;
        if (googleFitRes.errorCode === 'GOOGLE_FIT_AUTH_ERROR' || googleFitRes.errorCode === 'GOOGLE_FIT_AUTH_EXPIRED_SESSIONS' || googleFitRes.errorCode === 'GOOGLE_FIT_AUTH_EXPIRED_METRICS'){
            console.warn('[SyncActions] Google Fit auth error detected.');
        }
      }
    } catch (error: any) {
      console.error('[SyncActions] Error during Google Fit sync:', error);
      syncResults.push({ service: 'Google Fit (Overall)', success: false, message: `Google Fit sync failed: ${error.message}`, errorCode: 'GOOGLE_FIT_SYNC_FAILED' });
      overallSyncSuccess = false;
    }
  }

  console.log('[SyncActions] Completed syncAllConnectedData. Results:', JSON.stringify(syncResults, null, 2));
  return { success: overallSyncSuccess, results: syncResults };
}
