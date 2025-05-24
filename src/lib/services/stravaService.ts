
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
    console.error('[StravaService] API Error Response Status:', response.status);
    console.error('[StravaService] API Error Response Body:', errorData);
    const errorToThrow = new Error((errorData as any).message || `Strava API request failed: ${response.statusText}`);
    (errorToThrow as any).status = response.status;
    (errorToThrow as any).details = errorData;
    throw errorToThrow;
  }
  if (response.status === 204) { // No Content
    return {} as T;
  }
  return response.json() as Promise<T>;
}

// --- Interface Definitions for Strava API Responses ---
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

export interface StravaMap {
  id: string;
  summary_polyline: string | null;
  resource_state: number;
}

export interface StravaActivity {
  id: number;
  resource_state: number;
  external_id: string | null;
  upload_id: number | null;
  athlete: { id: number, resource_state: number };
  name: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  total_elevation_gain: number; // meters
  type: 'Walk' | 'Run' | 'Hike' | 'Swim' | 'Ride' | 'Workout' | string; // Common types, but can be others
  sport_type: string;
  start_date: string; // ISO8601 (UTC)
  start_date_local: string; // ISO8601 (local time of activity)
  timezone: string; // e.g. "(GMT-08:00) America/Los_Angeles"
  utc_offset: number;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  achievement_count: number;
  kudos_count: number;
  comment_count: number;
  athlete_count: number;
  photo_count: number;
  map: StravaMap;
  trainer: boolean;
  commute: boolean;
  manual: boolean;
  private: boolean;
  visibility: string;
  flagged: boolean;
  gear_id: string | null;
  start_latlng: [number, number] | null;
  end_latlng: [number, number] | null;
  average_speed?: number; // m/s
  max_speed?: number; // m/s
  average_cadence?: number;
  average_temp?: number;
  average_watts?: number; // For rides with power meter
  kilojoules?: number; // For rides with power meter
  device_watts?: boolean;
  has_heartrate: boolean;
  average_heartrate?: number; // bpm
  max_heartrate?: number; // bpm
  heartrate_opt_out: boolean;
  display_hide_heartrate_option: boolean;
  elev_high?: number; // meters
  elev_low?: number; // meters
  upload_id_str?: string;
  calories?: number; // Estimated calories
  // ... and potentially more fields depending on activity type and recording device
}

// --- Service Functions ---

/**
 * Fetches the authenticated user's Strava profile.
 * @param accessToken The user's Strava access token.
 * @returns Promise<StravaAthleteProfile>
 */
export async function getStravaUserProfile(accessToken: string): Promise<StravaAthleteProfile> {
  console.log('[StravaService] Fetching user profile...');
  return stravaApiRequest<StravaAthleteProfile>('/athlete', accessToken);
}

/**
 * Fetches the authenticated user's activities from Strava.
 * @param accessToken The user's Strava access token.
 * @param params Optional parameters for pagination and date filtering.
 *               `before`: Timestamp (seconds since epoch) for activities before this time.
 *               `after`: Timestamp (seconds since epoch) for activities after this time.
 *               `page`: Page number.
 *               `per_page`: Number of items per page (max 200).
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
  else queryParams.append('per_page', '50'); // Default to fetching 50 activities if not specified

  if (queryParams.toString()) {
    endpoint += `?${queryParams.toString()}`;
  }
  
  return stravaApiRequest<StravaActivity[]>(endpoint, accessToken);
}


    