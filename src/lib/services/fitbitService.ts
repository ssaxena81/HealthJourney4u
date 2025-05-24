// src/lib/services/fitbitService.ts

/**
 * @fileOverview Fitbit Service Module
 * This module contains functions to interact with the Fitbit API.
 * These functions assume a valid OAuth 2.0 access token for the user has been obtained.
 */

const FITBIT_API_BASE_URL = 'https://api.fitbit.com/1.2'; // Using version 1.2 for sleep, /1/ for others

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
    // ... many other fields available
  };
}

export interface FitbitActivitySummary {
  steps: number;
  distance: number; // This is typically a sum of distances from all activities for the day
  caloriesOut: number;
  fairlyActiveMinutes: number;
  lightlyActiveMinutes: number;
  sedentaryMinutes: number;
  veryActiveMinutes: number;
}

export interface FitbitDailyActivityResponse {
  activities: any[]; // Detailed list of activities for the day (can include swims)
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
  datasetType: string; // e.g., "minute"
}

export interface FitbitHeartRateActivitiesResponse {
  'activities-heart': Array<{
    dateTime: string; // Date of the summary
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
  'activities-heart-intraday'?: FitbitHeartRateIntradaySeries; // Make intraday optional
}

// --- Sleep Log Types from Fitbit API ---
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
  // For classic sleep
  asleep?: FitbitSleepStageSummary;
  awake?: FitbitSleepStageSummary;
  restless?: FitbitSleepStageSummary;
}

export interface FitbitSleepLevelData {
  dateTime: string; // ISO 8601 timestamp
  level: 'deep' | 'light' | 'rem' | 'wake' | 'asleep' | 'awake' | 'restless';
  seconds: number;
}

export interface FitbitSleepLog {
  logId: number;
  dateOfSleep: string; // YYYY-MM-DD
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  duration: number; // milliseconds
  isMainSleep: boolean;
  efficiency: number;
  minutesToFallAsleep: number;
  minutesAsleep: number;
  minutesAwake: number;
  minutesAfterWakeup?: number; // Often 0 for main sleep
  timeInBed: number;
  type: 'stages' | 'classic';
  infoCode?: number; // Optional: https://dev.fitbit.com/build/reference/web-api/sleep/get-sleep-log-by-date/#InfoCode-Values
  levels?: {
    summary: FitbitSleepLevelsSummary;
    data: FitbitSleepLevelData[];
    shortData?: FitbitSleepLevelData[]; // Usually for naps or very short sleep
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

// --- Activity Log Types from Fitbit API ---
export interface FitbitActivityLog {
  activityId: number;
  activityParentId?: number;
  activityParentName?: string; // e.g., "Running", "Swimming"
  calories: number;
  description?: string;
  distance?: number; // Unit depends on user settings, might need conversion
  distanceUnit?: string; // e.g., "Meter", "Kilometer", "Mile", "Yard"
  duration: number; // milliseconds
  hasGps?: boolean;
  isFavorite?: boolean;
  lastModified: string; // ISO 8601
  logId: number;
  name: string; // e.g., "Swim", "Walk"
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  steps?: number; // Present for walking, running, etc.
  // Swim-specific, may or may not be present
  poolLength?: number;
  poolLengthUnit?: string;
  pace?: number; // seconds per 100m or 100yd for swimming
  // ... other fields like averageHeartRate, source, etc.
}

export interface FitbitActivityListResponse {
  activities: FitbitActivityLog[];
  pagination?: {
    beforeDate?: string;
    afterDate?: string;
    limit?: number;
    next?: string;
    offset?: number;
    previous?: string;
    sort?: string;
  };
}

// --- Helper for making API requests ---
async function fitbitApiRequest<T>(endpoint: string, accessToken: string, method: 'GET' | 'POST' = 'GET', body?: any): Promise<T> {
  // Use FITBIT_API_BASE_URL (1.2) for sleep, /1/ for others.
  // A more robust solution might pass the base URL or version.
  const base = endpoint.includes('/sleep/') ? FITBIT_API_BASE_URL : 'https://api.fitbit.com/1';
  const url = `${base}${endpoint}`;
  console.log(`[FitbitService] Making API Request: ${method} ${url}`);

  const headers: HeadersInit = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept-Locale': 'en_US', // Optional: specify locale for distance units, etc.
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
      errorData = { message: response.statusText, status: response.status };
    }
    console.error('[FitbitService] API Error Response Status:', response.status);
    console.error('[FitbitService] API Error Response Body:', errorData);

    const errorMessage = (errorData as any).errors?.[0]?.message || (errorData as any).message || `Fitbit API request failed: ${response.statusText}`;
    const errorToThrow = new Error(errorMessage);
    (errorToThrow as any).status = response.status; // Attach status to error
    (errorToThrow as any).details = errorData; // Attach full error details
    throw errorToThrow;
  }

  if (response.status === 204) { // No Content
    return {} as T; // Or handle as appropriate (e.g., return null or an empty array)
  }

  return response.json() as Promise<T>;
}


export async function getFitbitUserProfile(accessToken: string): Promise<FitbitUserProfileResponse> {
  console.log(`[FitbitService] Fetching user profile...`);
  return fitbitApiRequest<FitbitUserProfileResponse>('/user/-/profile.json', accessToken);
}

export async function getDailyActivitySummary(accessToken: string, date: string /* YYYY-MM-DD */): Promise<FitbitDailyActivityResponse> {
  console.log(`[FitbitService] Fetching daily activity for date: ${date}...`);
  return fitbitApiRequest<FitbitDailyActivityResponse>(`/user/-/activities/date/${date}.json`, accessToken);
}

export async function getHeartRateTimeSeries(
  accessToken: string,
  date: string, // YYYY-MM-DD
  detailLevel: '1min' | '1sec' = '1min'
): Promise<FitbitHeartRateActivitiesResponse> {
  console.log(`[FitbitService] Fetching heart rate for date: ${date}, detail: ${detailLevel}...`);
  return fitbitApiRequest<FitbitHeartRateActivitiesResponse>(
    `/user/-/activities/heart/date/${date}/1d/${detailLevel}.json`,
    accessToken
  );
}

export async function getSleepLogs(accessToken: string, date: string /* YYYY-MM-DD */): Promise<FitbitSleepLogsResponse> {
  console.log(`[FitbitService] Fetching sleep logs for date: ${date}...`);
  return fitbitApiRequest<FitbitSleepLogsResponse>(`/user/-/sleep/date/${date}.json`, accessToken);
}

export async function getSwimmingActivities(accessToken: string, date: string /* YYYY-MM-DD */): Promise<FitbitActivityLog[]> {
  console.log(`[FitbitService] Fetching activities for date: ${date} to find swims...`);
  // The activities list endpoint is typically /1/user/-/activities/list.json
  // It requires a `beforeDate`, `afterDate`, `sort`, and `limit`.
  // To get activities for a specific date, we set beforeDate to the target date, and afterDate to the day after, limit to a reasonable number.
  // Or, more simply, we can filter by `date` but the API docs are a bit unclear on direct date filter for list.
  // Let's assume we fetch for a specific date and filter client-side, or adjust if API allows direct filtering.
  // For now, a simpler approach for a single date. The Fitbit API usually provides activities for a single date if `/date/${date}.json` is used with `activities` endpoint.
  // However, the most common way is to get a list and filter.
  // For a specific date: /1/user/-/activities/date/{date}.json already gives activities in `activities` array.
  // Let's use the daily activity endpoint which includes an 'activities' array.

  const dailyData = await fitbitApiRequest<FitbitDailyActivityResponse>(`/user/-/activities/date/${date}.json`, accessToken);
  if (dailyData && dailyData.activities) {
    const swims = dailyData.activities.filter(activity => activity.name === 'Swim' || activity.activityName === 'Swim' || activity.activityTypeId === 20022); // activityTypeId for Swim is 20022
    console.log(`[FitbitService] Found ${swims.length} swimming activities for date ${date}.`);
    return swims as FitbitActivityLog[]; // Cast, assuming structure aligns
  }
  return [];
}