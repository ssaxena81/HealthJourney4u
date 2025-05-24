
// src/lib/services/fitbitService.ts

/**
 * @fileOverview Fitbit Service Module
 * This module contains functions to interact with the Fitbit API.
 * These functions assume a valid OAuth 2.0 access token for the user has been obtained.
 */

const FITBIT_API_BASE_URL = 'https://api.fitbit.com/1.2'; // Using version 1.2 for sleep

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
  distance: number;
  caloriesOut: number;
  fairlyActiveMinutes: number;
  lightlyActiveMinutes: number;
  sedentaryMinutes: number;
  veryActiveMinutes: number;
}

export interface FitbitDailyActivityResponse {
  activities: any[];
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
  // Potentially other fields like `summary` for classic sleep.
}

export interface FitbitSleepLogsResponse {
  sleep: FitbitSleepLog[];
  pagination?: { // Fitbit uses pagination for some list endpoints
    beforeDate?: string;
    afterDate?: string;
    limit?: number;
    next?: string;
    offset?: number;
    previous?: string;
    sort?: string;
  };
  summary?: { // Overall summary if fetching a list
    totalMinutesAsleep: number;
    totalSleepRecords: number;
    totalTimeInBed: number;
  };
}


// --- Helper for making API requests ---
async function fitbitApiRequest<T>(endpoint: string, accessToken: string, method: 'GET' | 'POST' = 'GET', body?: any): Promise<T> {
  const url = `${FITBIT_API_BASE_URL}${endpoint}`;
  console.log(`[FitbitService] Making API Request: ${method} ${url}`);

  const headers: HeadersInit = {
    'Authorization': `Bearer ${accessToken}`,
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
    (errorToThrow as any).status = response.status;
    (errorToThrow as any).details = errorData;
    throw errorToThrow;
  }

  if (response.status === 204) { // No Content
    return {} as T;
  }

  return response.json() as Promise<T>;
}


export async function getFitbitUserProfile(accessToken: string): Promise<FitbitUserProfileResponse> {
  console.log(`[FitbitService] Fetching user profile...`);
  return fitbitApiRequest<FitbitUserProfileResponse>('/1/user/-/profile.json', accessToken);
}

export async function getDailyActivitySummary(accessToken: string, date: string /* YYYY-MM-DD */): Promise<FitbitDailyActivityResponse> {
  console.log(`[FitbitService] Fetching daily activity for date: ${date}...`);
  return fitbitApiRequest<FitbitDailyActivityResponse>(`/1/user/-/activities/date/${date}.json`, accessToken);
}

export async function getHeartRateTimeSeries(
  accessToken: string,
  date: string, // YYYY-MM-DD
  detailLevel: '1min' | '1sec' = '1min'
): Promise<FitbitHeartRateActivitiesResponse> {
  console.log(`[FitbitService] Fetching heart rate for date: ${date}, detail: ${detailLevel}...`);
  return fitbitApiRequest<FitbitHeartRateActivitiesResponse>(
    `/1/user/-/activities/heart/date/${date}/1d/${detailLevel}.json`,
    accessToken
  );
}

export async function getSleepLogs(accessToken: string, date: string /* YYYY-MM-DD */): Promise<FitbitSleepLogsResponse> {
  console.log(`[FitbitService] Fetching sleep logs for date: ${date}...`);
  // Fitbit API for sleep by date returns logs for that night.
  // The endpoint is /1.2/user/[user-id]/sleep/date/[date].json
  return fitbitApiRequest<FitbitSleepLogsResponse>(`/user/-/sleep/date/${date}.json`, accessToken);
}
