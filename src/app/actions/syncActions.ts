
'use server';

import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import { doc, getDoc } from 'firebase/firestore';
import type { UserProfile } from '@/types';
import { 
    fetchAndStoreFitbitDailyActivity, 
    fetchAndStoreFitbitHeartRate, 
    fetchAndStoreFitbitSleep,
    fetchAndStoreFitbitSwimmingData,
    fetchAndStoreFitbitLoggedActivities // Import the new action
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
    return { success: false, results: [], error: 'User profile is null.' };
  }

  const syncResults: SyncResult[] = [];
  const todayDateString = format(new Date(), 'yyyy-MM-dd');
  
  const now = new Date();
  const startTimeIso48hAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const endTimeIsoNow = now.toISOString();


  // Fitbit Sync
  if (userProfile.connectedFitnessApps?.some(app => app.id === 'fitbit')) {
    console.log('[SyncActions] Attempting to sync Fitbit data...');
    try {
      const activityRes = await fetchAndStoreFitbitDailyActivity(todayDateString);
      syncResults.push({ service: 'Fitbit Daily Activity Summary', ...activityRes, activitiesProcessed: activityRes.data ? 1 : 0 });

      const heartRes = await fetchAndStoreFitbitHeartRate(todayDateString);
      syncResults.push({ service: 'Fitbit Heart Rate', ...heartRes, activitiesProcessed: heartRes.data ? 1 : 0 });
      
      const sleepRes = await fetchAndStoreFitbitSleep(todayDateString);
      syncResults.push({ service: 'Fitbit Sleep', ...sleepRes, activitiesProcessed: sleepRes.activitiesProcessed });

      const swimmingRes = await fetchAndStoreFitbitSwimmingData(todayDateString);
      syncResults.push({ service: 'Fitbit Swimming Activities', ...swimmingRes, activitiesProcessed: swimmingRes.activitiesProcessed });
      
      // Add call for other individual Fitbit logged activities
      const loggedActivitiesRes = await fetchAndStoreFitbitLoggedActivities(todayDateString);
      syncResults.push({ service: 'Fitbit Logged Activities (Walk, Run, Hike etc.)', ...loggedActivitiesRes, activitiesProcessed: loggedActivitiesRes.activitiesProcessed });


    } catch (error: any) {
      console.error('[SyncActions] Error during Fitbit sync portion:', error);
      syncResults.push({ service: 'Fitbit (Overall)', success: false, message: `Fitbit sync portion failed: ${error.message}` });
    }
  }

  // Strava Sync
  if (userProfile.connectedFitnessApps?.some(app => app.id === 'strava')) {
    console.log('[SyncActions] Attempting to sync Strava data...');
    try {
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

  console.log('[SyncActions] Completed syncAllConnectedData. Results:', syncResults);
  return { success: true, results: syncResults };
}


    