
// src/lib/services/stravaService.ts
/**
 * @fileOverview Strava Service Module
 * This module will contain functions to interact with the Strava API.
 * These functions assume a valid OAuth 2.0 access token for the user has been obtained.
 */

const STRAVA_API_BASE_URL = 'https://www.strava.com/api/v3';

// --- Request Helper ---
async function stravaApiRequest<T>(
  endpoint: string,
  accessToken: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any
): Promise<T> {
  const url = `${STRAVA_API_BASE_URL}${endpoint}`;
  console.log(`[StravaService] Making API Request: ${method} ${url}`);

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
      errorData = { message: response.statusText };
    }
    console.error('[StravaService] API Error Response:', errorData);
    const errorToThrow = new Error((errorData as any).message || `Strava API request failed: ${response.statusText}`);
    (errorToThrow as any).status = response.status;
    (errorToThrow as any).details = errorData;
    throw errorToThrow;
  }
  return response.json() as Promise<T>;
}

// --- Interface Examples (to be refined based on Strava API docs) ---
export interface StravaAthleteProfile {
  id: number;
  username: string | null;
  firstname: string;
  lastname: string;
  city: string | null;
  state: string | null;
  country: string | null;
  sex: 'M' | 'F' | null;
  profile: string; // URL to medium-sized profile picture
  profile_medium: string; // URL to medium-sized profile picture
  // ... and more fields
}

export interface StravaActivity {
  id: number;
  name: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  total_elevation_gain: number; // meters
  type: string; // e.g., "Run", "Ride", "Swim"
  start_date: string; // ISO8601
  start_date_local: string; // ISO8601
  // ... and many more fields
}

// --- Service Functions (Placeholders) ---

/**
 * Fetches the authenticated user's Strava profile.
 * @param accessToken The user's Strava access token.
 * @returns Promise<StravaAthleteProfile>
 */
export async function getStravaUserProfile(accessToken: string): Promise<StravaAthleteProfile> {
  console.log('[StravaService] Fetching user profile...');
  // TODO: Implement actual API call to /athlete endpoint
  // return stravaApiRequest<StravaAthleteProfile>('/athlete', accessToken);
  
  // Placeholder implementation
  await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
  return {
    id: 12345,
    username: 'strava_user',
    firstname: 'Strava',
    lastname: 'User',
    city: 'San Francisco',
    state: 'CA',
    country: 'USA',
    sex: 'M',
    profile: 'https://via.placeholder.com/124',
    profile_medium: 'https://via.placeholder.com/124',
  } as StravaAthleteProfile;
}

/**
 * Fetches the authenticated user's activities from Strava.
 * @param accessToken The user's Strava access token.
 * @param before Timestamp (seconds since epoch) for pagination (activities before this time)
 * @param after Timestamp (seconds since epoch) for pagination (activities after this time)
 * @param page Page number for pagination
 * @param per_page Number of items per page
 * @returns Promise<StravaActivity[]>
 */
export async function getStravaActivities(
  accessToken: string,
  params?: { before?: number; after?: number; page?: number; per_page?: number }
): Promise<StravaActivity[]> {
  console.log('[StravaService] Fetching activities with params:', params);
  let endpoint = '/athlete/activities';
  const queryParams = new URLSearchParams();
  if (params?.before) queryParams.append('before', params.before.toString());
  if (params?.after) queryParams.append('after', params.after.toString());
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.per_page) queryParams.append('per_page', params.per_page.toString());
  
  if (queryParams.toString()) {
    endpoint += `?${queryParams.toString()}`;
  }
  
  // TODO: Implement actual API call
  // return stravaApiRequest<StravaActivity[]>(endpoint, accessToken);

  // Placeholder implementation
  await new Promise(resolve => setTimeout(resolve, 1000));
  return [
    // Add mock Strava activity data if needed for testing
  ] as StravaActivity[];
}
