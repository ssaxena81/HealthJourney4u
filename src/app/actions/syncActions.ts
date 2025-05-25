
'use server';

import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import { doc, getDoc } from 'firebase/firestore';
import type { UserProfile } from '@/types';
import { 
    fetchAndStoreFitbitDailyActivity, 
    fetchAndStoreFitbitHeartRate, 
    fetchAndStoreFitbitSleep,
    fetchAndStoreFitbitSwimmingData
} from './fitbitActions';
import { fetchAndStoreStravaRecentActivities } from './stravaActions';
import { fetchAndStoreGoogleFitActivities } from './googleFitActions';
import { format } from 'date-fns';

interface SyncResult {
  service: string;
  success: boolean;
  message?: string;
  errorCode?: string;
  activitiesProcessed?: number;
}

interface SyncAllResults {
  success: boolean; // Overall success, maybe true if at least one attempt was made
  results: SyncResult[];
  error?: string; // For general errors orchestrating the sync
}

export async function syncAllConnectedData(): Promise<SyncAllResults> {
  console.log('[SyncActions] Starting syncAllConnectedData...');
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) {
    console.error('[SyncActions] User not authenticated for syncAllConnectedData.');
    return { success: false, results: [], error: 'User not authenticated.' };
  }
  const userId = currentUser.uid;

  let userProfile: UserProfile | null = null;
  try {
    const userProfileDocRef = doc(db, 'users', userId);
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
    // Should have been caught above, but as a safeguard
    return { success: false, results: [], error: 'User profile is null.' };
  }

  const syncResults: SyncResult[] = [];
  const todayDateString = format(new Date(), 'yyyy-MM-dd');
  
  // For Strava and Google Fit, fetch data for the last 48 hours as an example
  const now = new Date();
  const startTimeIso48hAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const endTimeIsoNow = now.toISOString();


  // Fitbit Sync
  if (userProfile.connectedFitnessApps?.some(app => app.id === 'fitbit')) {
    console.log('[SyncActions] Attempting to sync Fitbit data...');
    try {
      const activityRes = await fetchAndStoreFitbitDailyActivity(todayDateString);
      syncResults.push({ service: 'Fitbit Daily Activity', ...activityRes, activitiesProcessed: activityRes.data ? 1 : 0 });

      const heartRes = await fetchAndStoreFitbitHeartRate(todayDateString);
      syncResults.push({ service: 'Fitbit Heart Rate', ...heartRes, activitiesProcessed: heartRes.data ? 1 : 0 });
      
      const sleepRes = await fetchAndStoreFitbitSleep(todayDateString);
      syncResults.push({ service: 'Fitbit Sleep', ...sleepRes, activitiesProcessed: sleepRes.data?.length });

      const swimmingRes = await fetchAndStoreFitbitSwimmingData(todayDateString);
      syncResults.push({ service: 'Fitbit Swimming', ...swimmingRes, activitiesProcessed: swimmingRes.activitiesProcessed });
      
      // TODO: Add calls for other individual Fitbit activity types if actions are created
      // e.g., fetchAndStoreFitbitLoggedActivities(todayDateString) for walks, runs, hikes...

    } catch (error: any) {
      console.error('[SyncActions] Error during Fitbit sync:', error);
      syncResults.push({ service: 'Fitbit', success: false, message: `Fitbit sync failed: ${error.message}` });
    }
  }

  // Strava Sync
  if (userProfile.connectedFitnessApps?.some(app => app.id === 'strava')) {
    console.log('[SyncActions] Attempting to sync Strava data...');
    try {
      // Fetch activities for the last 48 hours.
      const afterTimestamp = Math.floor(new Date(startTimeIso48hAgo).getTime() / 1000);
      const stravaRes = await fetchAndStoreStravaRecentActivities({ after: afterTimestamp });
      syncResults.push({ service: 'Strava Activities', ...stravaRes });
    } catch (error: any) {
      console.error('[SyncActions] Error during Strava sync:', error);
      syncResults.push({ service: 'Strava', success: false, message: `Strava sync failed: ${error.message}` });
    }
  }
  
  // Google Fit Sync
  if (userProfile.connectedFitnessApps?.some(app => app.id === 'google-fit')) {
    console.log('[SyncActions] Attempting to sync Google Fit data...');
    try {
      const googleFitRes = await fetchAndStoreGoogleFitActivities({ startTimeIso: startTimeIso48hAgo, endTimeIso: endTimeIsoNow });
      syncResults.push({ service: 'Google Fit Activities', ...googleFitRes });
    } catch (error: any) {
      console.error('[SyncActions] Error during Google Fit sync:', error);
      syncResults.push({ service: 'Google Fit', success: false, message: `Google Fit sync failed: ${error.message}` });
    }
  }

  // TODO: Add sync for Diagnostics and Insurance if/when those integrations are built

  console.log('[SyncActions] Completed syncAllConnectedData. Results:', syncResults);
  return { success: true, results: syncResults };
}
