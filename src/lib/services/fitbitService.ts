
// src/lib/services/fitbitService.ts

/**
 * @fileOverview Fitbit Service Module
 * This module contains functions to interact with the Fitbit API.
 * These functions assume a valid OAuth 2.0 access token for the user has been obtained.
 */

const FITBIT_API_BASE_URL_V1 = 'https://api.fitbit.com/1';
const FITBIT_API_BASE_URL_V1_2 = 'https://api.fitbit.com/1.2'; // For sleep and some newer endpoints

// --- Response Interfaces ---
export interface FitbitUserProfileResponse {
  user: {
    avatar: string;
    avatar150: string;
    avatar640: string;
    dateOfBirth: string;
    displayName: string;
    encodedId: string;
    firstName: string;
    lastName: string;
    gender: string;
    height: number;
    weight: number;
    strideLengthWalking: number;
    strideLengthRunning: number;
  };
}

export interface FitbitActivitySummary {
  steps: number;
  distance: number; // This represents a sum of distances. The unit can vary.
  caloriesOut: number;
  fairlyActiveMinutes: number;
  lightlyActiveMinutes: number;
  sedentaryMinutes: number;
  veryActiveMinutes: number;
}

export interface FitbitDailyActivityResponse {
  activities: FitbitActivityLog[]; // Detailed list of activities for the day
  goals: any;
  summary: FitbitActivitySummary;
}

export interface FitbitHeartRateDataPoint {
  time: string; // HH:MM:SS
  value: number; // bpm
}

export interface FitbitHeartRateIntradaySeries {
  dataset: FitbitHeartRateDataPoint[];
  datasetInterval: number;
  datasetType: string;
}

export interface FitbitHeartRateActivitiesResponse {
  'activities-heart': Array<{
    dateTime: string;
    value: {
      restingHeartRate?: number;
      heartRateZones: Array<{
        name: string;
        min: number;
        max: number;
        minutes: number;
        caloriesOut?: number;
      }>;
    };
  }>;
  'activities-heart-intraday'?: FitbitHeartRateIntradaySeries;
}

export interface FitbitSleepStageSummary {
  count: number;
  minutes: number;
  thirtyDayAvgMinutes?: number;
}

export interface FitbitSleepLevelsSummary {
  deep?: FitbitSleepStageSummary;
  light?: FitbitSleepStageSummary;
  rem?: FitbitSleepStageSummary;
  wake?: FitbitSleepStageSummary;
  asleep?: FitbitSleepStageSummary;
  awake?: FitbitSleepStageSummary;
  restless?: FitbitSleepStageSummary;
}

export interface FitbitSleepLevelData {
  dateTime: string;
  level: 'deep' | 'light' | 'rem' | 'wake' | 'asleep' | 'awake' | 'restless';
  seconds: number;
}

export interface FitbitSleepLog {
  logId: number;
  dateOfSleep: string;
  startTime: string;
  endTime: string;
  duration: number; // milliseconds
  isMainSleep: boolean;
  efficiency: number;
  minutesToFallAsleep: number;
  minutesAsleep: number;
  minutesAwake: number;
  minutesAfterWakeup?: number;
  timeInBed: number;
  type: 'stages' | 'classic';
  infoCode?: number;
  levels?: {
    summary: FitbitSleepLevelsSummary;
    data: FitbitSleepLevelData[];
    shortData?: FitbitSleepLevelData[];
  };
}

export interface FitbitSleepLogsResponse {
  sleep: FitbitSleepLog[];
  pagination?: {
    beforeDate?: string;
    afterDate?: string;
    limit?: number;
    next?: string;
    offset?: number;
    previous?: string;
    sort?: string;
  };
  summary?: {
    totalMinutesAsleep: number;
    totalSleepRecords: number;
    totalTimeInBed: number;
  };
}

export interface FitbitActivityLog {
  activityId: number; // ID of the activity type (e.g., 90013 for Walk)
  activityParentId?: number;
  activityParentName?: string;
  calories: number;
  description?: string;
  distance?: number; // Distance of the activity. Unit depends on Accept-Language header or user's unit system.
  distanceUnit?: string; // Often NOT explicitly provided in this log; inferred from user settings or Accept-Language.
  duration: number; // milliseconds
  hasGps?: boolean;
  isFavorite?: boolean;
  lastModified: string; // ISO 8601
  logId: number; // Unique ID for this specific log entry
  name: string; // e.g., "Walk", "Run", "Swim"
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM (local time)
  steps?: number;
  logType?: 'manual' | 'auto_detected' | 'mobile_run';
  // Swim specific if available
  pace?: number; // seconds per 100m or 100yd
  speed?: number; // This is often redundant if pace is given, or one derives the other
  // Heart rate during activity
  averageHeartRate?: number;
  heartRateLink?: string; // Link to get heart rate time series for the activity
  // Other fields
  source?: {
    id: string;
    name: string;
    type: string;
    url: string;
  };
  [key: string]: any; // For any other fields
}

export interface FitbitActivityListResponse {
  activities: FitbitActivityLog[];
  pagination?: {
    beforeDate?: string;
    afterDate?: string;
    limit?: number;
    next?: string;
    offset?: string;
    previous?: string;
    sort?: string;
  };
}


async function fitbitApiRequest<T>(endpoint: string, accessToken: string, apiVersion: 'v1' | 'v1.2' = 'v1', method: 'GET' | 'POST' = 'GET', body?: any): Promise<T> {
  const base = apiVersion === 'v1.2' ? FITBIT_API_BASE_URL_V1_2 : FITBIT_API_BASE_URL_V1;
  const url = `${base}${endpoint}`;
  console.log(`[FitbitService] Making API Request: ${method} ${url}`);

  const headers: HeadersInit = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept-Locale': 'en_US', // Requesting units in a common format if possible (e.g., meters, km)
    // Consider 'Accept-Language': 'en_US' as well if API supports it for units/names
  };
  if (method === 'POST' && body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method: method,
    headers: headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { message: response.statusText };
    }
    console.error('[FitbitService] API Error Response Status:', response.status, 'URL:', url);
    console.error('[FitbitService] API Error Response Body:', errorData);
    const errorMessage = (errorData as any).errors?.[0]?.message || (errorData as any).message || `Fitbit API request failed with status ${response.status}`;
    const errorToThrow = new Error(errorMessage);
    (errorToThrow as any).status = response.status;
    (errorToThrow as any).details = errorData;
    throw errorToThrow;
  }

  if (response.status === 204) {
    return {} as T;
  }
  return response.json() as Promise<T>;
}

export async function getFitbitUserProfile(accessToken: string): Promise<FitbitUserProfileResponse> {
  console.log(`[FitbitService] Fetching user profile...`);
  return fitbitApiRequest<FitbitUserProfileResponse>('/user/-/profile.json', accessToken, 'v1');
}

export async function getDailyActivitySummary(accessToken: string, date: string /* YYYY-MM-DD */): Promise<FitbitDailyActivityResponse> {
  console.log(`[FitbitService] Fetching daily activity for date: ${date}...`);
  return fitbitApiRequest<FitbitDailyActivityResponse>(`/user/-/activities/date/${date}.json`, accessToken, 'v1');
}

export async function getHeartRateTimeSeries(
  accessToken: string,
  date: string, // YYYY-MM-DD
  detailLevel: '1min' | '1sec' = '1min'
): Promise<FitbitHeartRateActivitiesResponse> {
  console.log(`[FitbitService] Fetching heart rate for date: ${date}, detail: ${detailLevel}...`);
  return fitbitApiRequest<FitbitHeartRateActivitiesResponse>(
    `/user/-/activities/heart/date/${date}/1d/${detailLevel}.json`,
    accessToken,
    'v1'
  );
}

export async function getSleepLogs(accessToken: string, date: string /* YYYY-MM-DD */): Promise<FitbitSleepLogsResponse> {
  console.log(`[FitbitService] Fetching sleep logs for date: ${date}...`);
  return fitbitApiRequest<FitbitSleepLogsResponse>(`/user/-/sleep/date/${date}.json`, accessToken, 'v1.2');
}

// Fetches all logged activities for a specific date
export async function getLoggedActivitiesForDate(accessToken: string, date: string /* YYYY-MM-DD */): Promise<FitbitActivityLog[]> {
  console.log(`[FitbitService] Fetching logged activities for date: ${date}...`);
  // The activities list endpoint might require beforeDate & afterDate, or sort & limit.
  // Let's try with a specific date format first.
  // A robust way is to use /activities/list.json with afterDate={date}T00:00:00&beforeDate={date}T23:59:59&sort=asc&limit=50&offset=0
  // For simplicity, assuming the daily activity endpoint also returns a comprehensive list in its `activities` array.
  const dailyData = await fitbitApiRequest<FitbitDailyActivityResponse>(`/user/-/activities/date/${date}.json`, accessToken, 'v1');
  return dailyData.activities || [];
}


// This function is now more generic and will be called by specific data type server actions
// It's kept here in case we need to fetch all types of activities for a date.
// For specific types like "Swim", the server action will filter.
export async function getSwimmingActivities(accessToken: string, date: string /* YYYY-MM-DD */): Promise<FitbitActivityLog[]> {
  console.log(`[FitbitService] Fetching activities for date: ${date} to find swims...`);
  const dailyData = await fitbitApiRequest<FitbitDailyActivityResponse>(`/user/-/activities/date/${date}.json`, accessToken, 'v1');
  if (dailyData && dailyData.activities) {
    const swims = dailyData.activities.filter(activity => 
        activity.name?.toLowerCase() === 'swim' || 
        activity.activityName?.toLowerCase() === 'swim' ||
        activity.activityTypeId === 20022 // Common Fitbit activityTypeId for Swim
    );
    console.log(`[FitbitService] Found ${swims.length} swimming activities for date ${date}.`);
    return swims;
  }
  return [];
}
