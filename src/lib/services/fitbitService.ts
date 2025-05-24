// src/lib/services/fitbitService.ts

/**
 * @fileOverview Fitbit Service Module
 * This module contains functions to interact with the Fitbit API.
 * These functions assume a valid OAuth 2.0 access token for the user has been obtained.
 */

const FITBIT_API_BASE_URL = 'https://api.fitbit.com/1';

// --- Response Interfaces (could be expanded based on actual Fitbit API responses) ---
export interface FitbitUserProfile {
  user: {
    avatar: string;
    avatar150: string;
    avatar640: string;
    dateOfBirth: string;
    displayName: string;
    encodedId: string; // This is often the user ID used in API calls
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
  distance: number; // in kilometers or miles based on user's Fitbit settings
  caloriesOut: number;
  fairlyActiveMinutes: number;
  lightlyActiveMinutes: number;
  sedentaryMinutes: number;
  veryActiveMinutes: number;
}

export interface FitbitDailyActivityResponse {
  activities: any[]; // Placeholder for detailed activities if needed
  goals: any; // Placeholder
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
        name: string; // e.g., "Fat Burn", "Cardio", "Peak"
        min: number;
        max: number;
        minutes: number;
        caloriesOut?: number;
      }>;
    };
  }>;
  'activities-heart-intraday': FitbitHeartRateIntradaySeries;
}

// --- Helper for making API requests ---
async function fitbitApiRequest<T>(endpoint: string, accessToken: string, method: 'GET' | 'POST' = 'GET', body?: any): Promise<T> {
  const url = `${FITBIT_API_BASE_URL}${endpoint}`;
  console.log(`[FitbitService] Making API Request: ${method} ${url}`);

  const headers: HeadersInit = {
    'Authorization': `Bearer ${accessToken}`,
  };
  if (method === 'POST' && body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'; // Fitbit often uses this for token refresh etc. Adjust if JSON.
  }

  const response = await fetch(url, {
    method: method,
    headers: headers,
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { message: response.statusText };
    }
    console.error('[FitbitService] API Error Response Status:', response.status);
    console.error('[FitbitService] API Error Response Body:', errorData);
    // Fitbit errors often come in an 'errors' array
    const errorMessage = errorData.errors?.[0]?.message || errorData.message || `Fitbit API request failed: ${response.statusText}`;
    throw new Error(errorMessage);
  }

  // Handle cases where response might be empty (e.g., 204 No Content for some POSTs)
  if (response.status === 204) {
    return {} as T; // Or handle as appropriate for the specific endpoint
  }
  
  return response.json() as Promise<T>;
}


/**
 * Fetches the user's Fitbit profile information.
 * The user's encoded ID is generally used for subsequent API calls.
 *
 * @param accessToken - The user's Fitbit access token.
 * @returns A Promise resolving to the user's Fitbit profile data.
 * @throws Will throw an error if the API call fails.
 */
export async function getFitbitUserProfile(accessToken: string): Promise<FitbitUserProfile> {
  console.log(`[FitbitService] Fetching user profile...`);
  // The '-' in the URL means "the currently authenticated user".
  return fitbitApiRequest<FitbitUserProfile>('/user/-/profile.json', accessToken);
}

/**
 * Fetches the daily activity summary for a specific date.
 *
 * @param accessToken - The user's Fitbit access token.
 * @param date - The date for which to fetch the summary (YYYY-MM-DD format).
 * @returns A Promise resolving to the daily activity summary.
 * @throws Will throw an error if the API call fails.
 */
export async function getDailyActivitySummary(accessToken: string, date: string): Promise<FitbitDailyActivityResponse> {
  console.log(`[FitbitService] Fetching daily activity for date: ${date}...`);
  return fitbitApiRequest<FitbitDailyActivityResponse>(`/user/-/activities/date/${date}.json`, accessToken);
}

/**
 * Fetches heart rate time series data for a specific date.
 * This example fetches both daily summary (resting heart rate, zones) and intraday data (minute by minute).
 *
 * @param accessToken - The user's Fitbit access token.
 * @param date - The date for which to fetch data (YYYY-MM-DD).
 * @param detailLevel - For intraday series, e.g., '1min' or '1sec'. Defaults to '1min'.
 * @returns A Promise resolving to the heart rate series data.
 * @throws Will throw an error if the API call fails.
 */
export async function getHeartRateTimeSeries(
  accessToken: string,
  date: string, // YYYY-MM-DD
  detailLevel: '1min' | '1sec' = '1min' // For intraday series
): Promise<FitbitHeartRateActivitiesResponse> {
  console.log(`[FitbitService] Fetching heart rate for date: ${date}, detail: ${detailLevel}...`);
  // Fitbit API for heart rate can be fetched for a date range or a single day.
  // For intraday data (minute by minute), the endpoint is specific.
  // This endpoint gets both daily summary and intraday data for the specified date.
  // GET /1/user/[user-id]/activities/heart/date/[date]/1d/[detail-level].json
  // Example: /1/user/-/activities/heart/date/today/1d/1min.json
  // Or for a specific date: /1/user/-/activities/heart/date/2024-01-15/1d/1min.json
  return fitbitApiRequest<FitbitHeartRateActivitiesResponse>(
    `/user/-/activities/heart/date/${date}/1d/${detailLevel}.json`,
    accessToken
  );
}

// TODO: Add more functions as needed:
// - getSleepLog(accessToken: string, date: string): Promise<FitbitSleepLogResponse>
// - getWeightLog(accessToken: string, date: string): Promise<FitbitWeightLogResponse>
// - Functions for specific activities if available through detailed activity logs.

// Note on OAuth 2.0 Token Refresh:
// Fitbit access tokens expire (usually after 8 hours). You'll need a mechanism
// to use the refresh token to get a new access token. This typically involves
// a POST request to https://api.fitbit.com/oauth2/token with:
// - grant_type: 'refresh_token'
// - refresh_token: <user's_refresh_token>
// And an Authorization header: Basic <base64_encoded_client_id:client_secret>
// This logic should be in a secure server-side environment (e.g., a Server Action or API route).
// The new access token and potentially new refresh token would then be securely stored.
// The functions in this service file would then use the new access token.
// For example:
/*
export interface FitbitTokenRefreshResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
  user_id: string;
}

export async function refreshFitbitAccessToken(refreshToken: string): Promise<FitbitTokenRefreshResponse> {
  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Fitbit client ID or secret is not configured.");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams();
  body.append('grant_type', 'refresh_token');
  body.append('refresh_token', refreshToken);

  const response = await fetch('https://api.fitbit.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('[FitbitService] Token Refresh Error:', errorData);
    throw new Error(errorData.errors?.[0]?.message || 'Failed to refresh Fitbit access token');
  }
  return response.json();
}
*/
// The above refreshFitbitAccessToken would be called by your auth management logic,
// not directly by UI components. The new token would then be used for subsequent calls
// to getFitbitUserProfile, getDailyActivitySummary, etc.
