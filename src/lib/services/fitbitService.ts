
// src/lib/services/fitbitService.ts

/**
 * @fileOverview Fitbit Service Module
 * This module contains functions to interact with the Fitbit API.
 * These functions assume a valid OAuth 2.0 access token for the user has been obtained.
 */

const FITBIT_API_BASE_URL = 'https://api.fitbit.com/1';

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
      // If response is not JSON, use statusText
      errorData = { message: response.statusText, status: response.status };
    }
    console.error('[FitbitService] API Error Response Status:', response.status);
    console.error('[FitbitService] API Error Response Body:', errorData);
    
    const errorMessage = errorData.errors?.[0]?.message || errorData.message || `Fitbit API request failed: ${response.statusText}`;
    const errorToThrow = new Error(errorMessage);
    // Attach status to error for better handling upstream
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

    