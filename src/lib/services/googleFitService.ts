
// src/lib/services/googleFitService.ts
/**
 * @fileOverview Google Fit Service Module
 * This module contains functions to interact with the Google Fit REST API.
 * These functions assume a valid OAuth 2.0 access token for the user has been obtained.
 *
 * Google Fit API Documentation: https://developers.google.com/fit/rest
 */

const GOOGLE_FIT_API_BASE_URL = 'https://www.googleapis.com/fitness/v1/users/me';

// --- Interface Definitions for Google Fit API Responses ---

// Data Source
export interface GoogleFitDevice {
  manufacturer: string;
  model: string;
  type: 'phone' | 'watch' | 'scale' | 'chestStrap' | 'tablet' | 'unknown';
  uid: string;
  platformType?: 'android' | 'ios' | 'web';
}

export interface GoogleFitApplication {
  detailsUrl?: string;
  name?: string;
  packageName?: string;
  version?: string;
}

export interface GoogleFitDataTypeField {
  name: string; // e.g., "steps", "x", "y", "z", "rpm"
  format: 'integer' | 'floatPoint' | 'string' | 'map' | 'integerList' | 'floatList' | 'blob';
  optional?: boolean;
}

export interface GoogleFitDataType {
  name: string; // e.g., "com.google.step_count.delta", "com.google.heart_rate.bpm"
  field: GoogleFitDataTypeField[];
}

export interface GoogleFitDataSource {
  dataStreamId: string;
  dataStreamName?: string;
  name?: string;
  type: 'raw' | 'derived';
  dataType: GoogleFitDataType;
  device?: GoogleFitDevice;
  application?: GoogleFitApplication;
  dataQualityStandard?: string[];
}

// Data Point (for datasets)
export interface GoogleFitMapVal {
  key: string;
  value: {
    fpVal?: number;
    intVal?: number;
    stringVal?: string;
  };
}
export interface GoogleFitDataPointValue {
  intVal?: number;
  fpVal?: number;
  stringVal?: string;
  mapVal?: GoogleFitMapVal[];
  // Add other potential value types as needed based on the data types you query
}

export interface GoogleFitDataPointOriginDataSource {
  dataSourceId?: string;
  streamId?: string; // Deprecated, use dataSourceId
  device?: GoogleFitDevice;
  application?: GoogleFitApplication;
}

export interface GoogleFitDataPoint {
  startTimeNanos: string; // Nanoseconds since epoch
  endTimeNanos: string; // Nanoseconds since epoch
  dataTypeName: string;
  originDataSourceId?: string; // ID of the data source that created the data point
  value: GoogleFitDataPointValue[];
  modifiedTimeMillis?: string; // Milliseconds since epoch
  rawTimestampNanos?: string;
}

// Aggregated Data
export interface GoogleFitAggregateDataset {
    dataSourceId: string;
    point: GoogleFitDataPoint[];
}
export interface GoogleFitAggregateBucket {
  startTimeMillis: string; // Milliseconds since epoch
  endTimeMillis: string; // Milliseconds since epoch
  dataset: GoogleFitAggregateDataset[];
}

export interface GoogleFitAggregateResponse {
  bucket: GoogleFitAggregateBucket[];
}

// Session
export interface GoogleFitSession {
  id: string;
  name?: string;
  description?: string;
  startTimeMillis: string; // Milliseconds since epoch
  endTimeMillis: string; // Milliseconds since epoch
  modifiedTimeMillis?: string;
  version?: string;
  application: GoogleFitApplication;
  activityType: number; // See https://developers.google.com/fit/rest/v1/reference/activity-types
  activeTimeMillis?: string;
}

export interface GoogleFitListSessionsResponse {
  session: GoogleFitSession[];
  deletedSession?: GoogleFitSession[];
  nextPageToken?: string;
  hasMoreData?: boolean;
}


// --- Request Helper ---
async function googleFitApiRequest<T>(
  endpoint: string,
  accessToken: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any,
  queryParams?: Record<string, string>
): Promise<T> {
  let url = `${GOOGLE_FIT_API_BASE_URL}${endpoint}`;

  if (queryParams) {
    const params = new URLSearchParams(queryParams);
    url += `?${params.toString()}`;
  }

  console.log(`[GoogleFitService] Making API Request: ${method} ${url}`);

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
    console.error('[GoogleFitService] API Error Response Status:', response.status, 'URL:', url);
    console.error('[GoogleFitService] API Error Response Body:', errorData);
    const errorToThrow = new Error((errorData as any).error?.message || (errorData as any).message || `Google Fit API request failed: ${response.statusText}`);
    (errorToThrow as any).status = response.status;
    (errorToThrow as any).details = errorData;
    throw errorToThrow;
  }

  if (response.status === 204) { // No Content
    return {} as T;
  }
  return response.json() as Promise<T>;
}

// --- Service Functions ---

/**
 * Lists all data sources that are visible to this app.
 * The data sources will be obtained from all Google Fit platforms (e.g. Android, Wear OS).
 * @param accessToken The user's Google Fit access token.
 */
export async function listDataSources(accessToken: string): Promise<{ dataSource: GoogleFitDataSource[] }> {
  console.log(`[GoogleFitService] Fetching user's data sources...`);
  return googleFitApiRequest<{ dataSource: GoogleFitDataSource[] }>(`/dataSources`, accessToken);
}

/**
 * Fetches aggregated data for the user.
 * The request body must specify the data types, aggregation buckets, and time range.
 * @param accessToken The user's Google Fit access token.
 * @param requestBody The request body for the dataset:aggregate call.
 *                    See: https://developers.google.com/fit/rest/v1/reference/users/dataset/aggregate
 */
export async function getAggregatedData(
  accessToken: string,
  requestBody: {
    aggregateBy: Array<{ dataTypeName: string; dataSourceId?: string }>;
    bucketByTime?: { durationMillis: number; period?: { type: string; value: number; timeZoneId: string } };
    startTimeMillis: number;
    endTimeMillis: number;
    // ... other aggregation parameters
  }
): Promise<GoogleFitAggregateResponse> {
  console.log(`[GoogleFitService] Fetching aggregated data with body:`, JSON.stringify(requestBody));
  return googleFitApiRequest<GoogleFitAggregateResponse>(
    `/dataset:aggregate`,
    accessToken,
    'POST',
    requestBody
  );
}


/**
 * Fetches sessions for the user within a specified time range.
 * @param accessToken The user's Google Fit access token.
 * @param startTimeIso ISO 8601 start time (e.g., "2023-10-01T00:00:00.000Z")
 * @param endTimeIso ISO 8601 end time (e.g., "2023-10-08T00:00:00.000Z")
 * @param activityType (Optional) Specific activity type number to filter sessions by.
 * @param includeDeleted (Optional) If true, deleted sessions will be returned.
 * @param pageToken (Optional) Token for fetching the next page of results.
 */
export async function getSessions(
  accessToken: string,
  startTimeIso: string,
  endTimeIso: string,
  activityType?: number,
  includeDeleted: boolean = false,
  pageToken?: string
): Promise<GoogleFitListSessionsResponse> {
  console.log(`[GoogleFitService] Fetching sessions from ${startTimeIso} to ${endTimeIso}...`);
  const queryParams: Record<string, string> = {
    startTime: startTimeIso,
    endTime: endTimeIso,
  };
  if (activityType !== undefined) {
    queryParams.activityType = String(activityType);
  }
  if (includeDeleted) {
    queryParams.includeDeleted = "true";
  }
  if (pageToken) {
    queryParams.pageToken = pageToken;
  }
  
  return googleFitApiRequest<GoogleFitListSessionsResponse>(
    `/sessions`,
    accessToken,
    'GET',
    undefined,
    queryParams
  );
}

// Specific function to get activity sessions for normalization
export async function getGoogleFitActivitySessions(
  accessToken: string,
  startTimeIso: string,
  endTimeIso: string
): Promise<GoogleFitSession[]> {
  console.log(`[GoogleFitService] Fetching activity sessions (all types initially) from ${startTimeIso} to ${endTimeIso}...`);
  
  // Fetch all sessions in the time range, filtering will happen in the server action
  // as Google Fit API doesn't support filtering by a list of activityTypes in one go.
  const response = await getSessions(accessToken, startTimeIso, endTimeIso);
  
  return response.session || [];
}

```