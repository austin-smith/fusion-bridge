// YoLink driver with test connection functionality

import { z } from 'zod';

export interface YoLinkConfig {
  uaid: string;
  clientSecret: string;
}

const YOLINK_API_URL = 'https://api.yosmart.com/open/yolink/v2/api';
const YOLINK_TOKEN_URL = 'https://api.yosmart.com/open/yolink/token';

// Schema for potential YoLink API error responses
const YoLinkErrorSchema = z.object({
  code: z.string().optional(),
  msg: z.string().optional(),
  desc: z.string().optional(), // Some errors might use desc
}).passthrough(); // Allow other fields

/**
 * Parses a YoLink API error response and returns a user-friendly message.
 * @param errorData Parsed JSON data from the error response.
 * @param responseStatus The original HTTP status code.
 * @returns A user-friendly error message string.
 */
function getYoLinkErrorMessage(errorData: unknown, responseStatus: number): string {
  // Ensure errorData is treated as a potential object for parsing
  const dataToParse = typeof errorData === 'object' && errorData !== null ? errorData : {};
  const parsedError = YoLinkErrorSchema.safeParse(dataToParse);
  let code: string | undefined;
  let msg: string | undefined;

  if (parsedError.success) {
    code = parsedError.data.code;
    msg = parsedError.data.msg || parsedError.data.desc;
  }

  switch (code) {
    // Authentication/Authorization Errors
    case '000103': return 'API token is invalid.'; // Token is invalid
    case '000106': return 'Invalid UAID.'; // client_id is invalid
    case '010101': return 'Invalid CSID (Authentication Error).'; // CSID is invalid!
    case '010102': return 'Invalid SecKey (Authentication Error).'; // SecKey is invalid!
    case '010103': return 'Invalid Client Secret.'; // Authorization is invalid! (Likely client_secret)
    case '010104': return 'API token has expired.'; // The token is expired

    // Device/Hub Communication Errors
    case '000101': return 'Cannot connect to Hub.'; // Can't connect to Hub
    case '000201': return 'Cannot connect to the device (Offline?).'; // Cannot connect to the device
    case '000203': return 'Cannot connect to the device (Offline?).'; // Cannot connect to the device (Duplicate?)
    case '020104': return 'Device is busy, please try again later.'; // Device is busy

    // Service/Rate Limit Errors
    case '010000': return 'YoLink service is temporarily unavailable.'; // Service is not available
    case '010001': return 'YoLink internal connection unavailable.'; // Internal connection is not available
    case '010301': return 'API rate limit reached. Please try again later.'; // Access denied due to limits reached

    // Request/Data Errors
    case '010200': return 'Invalid request parameters sent to YoLink.'; // Invalid data packet: params is not valid
    case '010204': return 'Invalid data packet sent to YoLink.'; // Invalid data packet
    case '020101': return 'Device does not exist or is not associated with this account.'; // The device does not exist

    // Default / Fallback
    default:
      if (msg) {
        return `YoLink API Error: ${msg}${code ? ` (Code: ${code})` : ''}`;
      }
      if (code) {
        return `YoLink API Error Code: ${code}`;
      }
      return `YoLink API request failed (Status: ${responseStatus})`;
  }
}

/**
 * Generic function to call the YoLink API with proper error handling
 * @param accessToken YoLink access token
 * @param method The YoLink API method name
 * @param params Optional parameters for the API call
 * @param operationName Name of the operation for logging purposes
 * @returns The API response data
 */
async function callYoLinkApi<T>(
  accessToken: string, 
  method: string, 
  params: Record<string, any> = {}, 
  operationName: string
): Promise<T> {
  console.log(`YoLink ${operationName} called with token present:`, !!accessToken);

  if (!accessToken) {
    console.error(`YoLink Access Token is required for ${operationName}.`);
    throw new Error(`YoLink Access Token is required for ${operationName}.`);
  }

  try {
    console.log(`Preparing to execute YoLink ${operationName} with URL:`, YOLINK_API_URL);
    
    const response = await fetch(YOLINK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        method,
        params
      })
    });

    console.log(`YoLink ${operationName} response status:`, response.status);
    const data = await response.json();
    
    // Check BUDP success code ('000000') and HTTP status
    if (!response.ok || data.code !== '000000') {
      const errorMessage = data.desc || `API returned status ${data.code || 'unknown'}`;
      console.error(`Failed to execute YoLink ${operationName}: ${errorMessage}`, data);
      throw new Error(`Failed to execute YoLink ${operationName}: ${errorMessage}`);
    }

    console.log(`Successfully executed YoLink ${operationName}`);
    return data.data as T;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error in YoLink ${operationName}:`, error.message);
      throw error; // Re-throw known errors
    }
    // Handle network or unexpected errors
    console.error(`Unexpected error in YoLink ${operationName}:`, error);
    throw new Error(`Network error or unexpected issue during YoLink ${operationName}.`);
  }
}

/**
 * Fetches a YoLink API access token.
 * @param cfg The YoLink configuration containing uaid and clientSecret.
 * @returns Promise resolving to the access token string.
 * @throws Error with a user-friendly message if fetching fails.
 */
export async function getAccessToken(cfg: YoLinkConfig): Promise<string> {
  console.log('getAccessToken called with config:', {
    uaid: cfg.uaid ? `${cfg.uaid.substring(0, 3)}...` : 'missing',
    clientSecret: cfg.clientSecret ? '[present]' : 'missing',
  });

  if (!cfg.uaid || !cfg.clientSecret) {
    console.error('Missing YoLink UAID or Client Secret.');
    throw new Error('Missing YoLink UAID or Client Secret.');
  }

  const body = new URLSearchParams();
  body.append('grant_type', 'client_credentials');
  body.append('client_id', cfg.uaid);
  body.append('client_secret', cfg.clientSecret);

  console.log('Preparing to fetch YoLink token with URL:', YOLINK_TOKEN_URL);

  try {
    const response = await fetch(YOLINK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    console.log('YoLink token fetch response status:', response.status);
    const data = await response.json();

    if (!response.ok) {
      const errorMessage = getYoLinkErrorMessage(data, response.status);
      console.error(`Failed to get YoLink token: ${errorMessage}`, data);
      throw new Error(`Failed to get YoLink token: ${errorMessage}`);
    }

    if (data.access_token && typeof data.access_token === 'string') {
      console.log('Successfully retrieved YoLink access token');
      return data.access_token;
    } else {
      // Handle case where response is OK but token is missing/invalid
      const errorMessage = getYoLinkErrorMessage(data, response.status);
      console.error(`Failed to get YoLink token: ${errorMessage || 'Token not found in response'}`, data);
      throw new Error(`Failed to get YoLink token: ${errorMessage || 'Token not found in response'}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error in getAccessToken:", error.message);
      throw error; // Re-throw known errors
    }
    // Handle network or unexpected errors
    console.error("Unexpected error fetching YoLink token:", error);
    throw new Error('Network error or unexpected issue connecting to YoLink for token.');
  }
}

/**
 * Fetches the YoLink Home General Info using an access token.
 * @param accessToken The YoLink API access token.
 * @returns Promise resolving to the home ID string.
 * @throws Error with a user-friendly message if fetching fails.
 */
export async function getHomeInfo(accessToken: string): Promise<string> {
  try {
    const data = await callYoLinkApi<{ id: string }>(
      accessToken,
      "Home.getGeneralInfo",
      {},
      "getHomeInfo"
    );
    
    if (data?.id && typeof data.id === 'string') {
      return data.id;
    } else {
      console.error('YoLink home info response did not contain a valid home ID', data);
      throw new Error('YoLink home info response did not contain a valid home ID.');
    }
  } catch (error) {
    // Re-throw error from callYoLinkApi
    throw error;
  }
}

/**
 * Fetches the list of devices from YoLink API
 * @param accessToken The YoLink API access token
 * @returns Array of YoLink devices
 * @throws Error with a user-friendly message if fetching fails
 */
export async function getDeviceList(accessToken: string): Promise<any[]> {
  try {
    const data = await callYoLinkApi<{ devices: any[] }>(
      accessToken,
      "Home.getDeviceList",
      {},
      "getDeviceList"
    );
    
    if (!data?.devices || !Array.isArray(data.devices)) {
      console.log('No devices returned from YoLink API');
      return [];
    }
    
    console.log(`Successfully retrieved ${data.devices.length} YoLink devices`);
    return data.devices;
  } catch (error) {
    // Re-throw error from callYoLinkApi
    throw error;
  }
}

/**
 * Test the connection to YoLink by attempting to fetch an access token.
 * @param cfg The YoLink configuration containing uaid and clientSecret.
 * @returns Promise that resolves to a boolean indicating if the connection was successful.
 */
export async function testConnection(cfg: YoLinkConfig): Promise<boolean> {
  console.log('YoLink testConnection called with config:', {
    uaid: cfg.uaid ? '****' + cfg.uaid.substring(Math.max(0, cfg.uaid.length - 4)) : 'missing',
    clientSecret: cfg.clientSecret ? '[REDACTED]' : 'missing'
  });
  
  try {
    // Validate input
    if (!cfg.uaid || !cfg.clientSecret) {
      console.error('YoLink connection test failed: Missing UAID or Client Secret.');
      return false;
    }

    // Construct the request body
    const body = new URLSearchParams();
    body.append('grant_type', 'client_credentials');
    body.append('client_id', cfg.uaid);
    body.append('client_secret', cfg.clientSecret);

    console.log('YoLink testConnection making API request to:', YOLINK_TOKEN_URL);
    
    // Make the API request
    const response = await fetch(YOLINK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    console.log('YoLink testConnection response status:', response.status);
    
    // Check if the request was successful
    if (!response.ok) {
      let errorData: unknown = null;
      try {
        errorData = await response.json();
      } catch (parseError) {
        // Ignore parsing error, handled by getYoLinkErrorMessage fallback
        console.error('Failed to parse YoLink error response:', parseError);
      }
      const errorMessage = getYoLinkErrorMessage(errorData, response.status);
      console.error(`YoLink connection test failed: ${errorMessage}`);
      return false;
    }

    // Check for access_token in successful response
    const data = await response.json();
    const success = !!data.access_token;

    if (success) {
      console.log('YoLink connection test successful.');
    } else {
      // This case might occur if the API returns 200 OK but no token
      const errorMessage = getYoLinkErrorMessage(data, response.status);
      console.error(`YoLink connection test failed: ${errorMessage}`);
      return false; // Treat as failure if no token
    }

    return success;
  } catch (error) {
    // Network errors or other unexpected issues
    console.error("YoLink connection test failed with unexpected error:", error);
    return false;
  }
} 