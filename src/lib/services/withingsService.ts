// [2025-06-29] COMMENT: This file contains functions to interact with the Withings API.
// [2025-06-29] COMMENT: These functions assume a valid OAuth 2.0 access token for the user has been obtained.

// [2025-06-29] COMMENT: Define the base URL for the Withings API.
const WITHINGS_API_BASE_URL = 'https://wbsapi.withings.net';

// [2025-06-29] COMMENT: This is a generic helper function to make requests to the Withings API.
// [2025-06-29] COMMENT: It handles adding the Authorization header and parsing the response.
async function withingsApiRequest<T>(
  endpoint: string,
  accessToken: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any
): Promise<T> {
  const url = `${WITHINGS_API_BASE_URL}${endpoint}`;
  console.log(`[WithingsService] Making API Request: ${method} ${url}`);

  const headers: HeadersInit = {
    'Authorization': `Bearer ${accessToken}`,
  };
  
  const requestOptions: RequestInit = {
    method: method,
    headers: headers,
  };

  // [2025-06-29] COMMENT: Withings API uses POST for many GET-like actions, with params in the body.
  if (method === 'POST' && body) {
    // [2025-06-29] COMMENT: Withings API expects form-urlencoded data for POST requests.
    const formData = new URLSearchParams();
    for (const key in body) {
        formData.append(key, body[key]);
    }
    requestOptions.body = formData;
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const response = await fetch(url, requestOptions);

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { message: response.statusText };
    }
    console.error('[WithingsService] API Error Response Status:', response.status);
    console.error('[WithingsService] API Error Response Body:', errorData);
    // [2025-06-29] COMMENT: Withings returns a 'status' field in the JSON body for errors.
    const errorMessage = (errorData as any).error || (errorData as any).message || `Withings API request failed with status ${response.status}`;
    const errorToThrow = new Error(errorMessage);
    (errorToThrow as any).status = response.status;
    (errorToThrow as any).details = errorData;
    throw errorToThrow;
  }
  
  const responseData = await response.json();
  // [2025-06-29] COMMENT: Check for Withings' specific error status code in the response body.
  if (responseData.status !== 0) {
      console.error('[WithingsService] Withings API returned a non-zero status:', responseData);
      const errorMessage = responseData.error || 'Withings API returned an error.';
      const errorToThrow = new Error(errorMessage);
      (errorToThrow as any).status = responseData.status;
      (errorToThrow as any).details = responseData;
      throw errorToThrow;
  }

  // [2025-06-29] COMMENT: Successful responses contain the data within a 'body' property.
  return responseData.body as T;
}

// [2025-06-29] COMMENT: Interface for Withings measurement data will be added here in the future.
// export interface WithingsMeasureResponse { ... }

// [2025-06-29] COMMENT: A function to get measurements will be added here in the future.
// export async function getWithingsMeasurements(...) { ... }
