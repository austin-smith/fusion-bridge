// YoLink driver with test connection functionality

import { z } from 'zod';
import { calculateExpiresAt, isTokenExpiring } from '@/lib/token-utils'; // Added import

export interface YoLinkConfig {
  uaid: string;
  clientSecret: string;
  accessToken?: string; // Added for storing current access token
  refreshToken?: string; // Added for storing refresh token
  tokenExpiresAt?: number; // Added for storing expiration time (Unix ms)
  scope: string[]; // Typically ["create"] or similar
  homeId?: string; // <-- ADDED: Optional homeId
}

// --- BEGIN Add YoLinkTokenAPIResponse Interface ---
// Represents the direct response from YoLink's token endpoint
export interface YoLinkTokenAPIResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // Seconds
  refresh_token: string;
  scope: string[]; // Typically ["create"] or similar
}
// --- END Add YoLinkTokenAPIResponse Interface ---

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

// --- BEGIN Add YoLinkDeviceRaw Interface ---
// Represents the raw device structure returned by the YoLink API
interface YoLinkDeviceRaw {
  deviceId: string;
  name: string;
  type: string;
  modelName?: string;
  token?: string; // Unique device token
  parentDeviceId?: string; // For multi-outlet devices, etc.
  profile?: { 
    devType: string; // e.g., "MultiOutlet", "SpeakerHub"
  };
  online?: boolean;
  settings?: { 
    name?: string; // Sometimes name is here
    firmwareVersion?: string;
    // Other settings might exist
    [key: string]: unknown; 
  };
  state?: { 
    // State structure varies greatly, allow any known/common fields
    state?: string; // e.g., "open", "closed", "normal", "alert"
    power?: string; // e.g., "on", "off"
    brightness?: number;
    colorTemp?: number;
    online?: boolean; // Sometimes online status is here
    battery?: number;
    humidity?: number;
    temperature?: number;
    // Other states might exist
    [key: string]: unknown;
  };
  // Allow other top-level fields
  [key: string]: unknown;
}
// --- END Add YoLinkDeviceRaw Interface ---

/**
 * Generic function to call the YoLink API with proper error handling and token management.
 * @param connectorId The ID of the connector for fetching/updating its config.
 * @param initialConfig The initial YoLink configuration (uaid, clientSecret, and potentially existing token info).
 * @param requestBody The body for the YoLink API call (method, params, etc.).
 * @param operationName Name of the operation for logging purposes.
 * @returns The API response data.
 * @throws Error if API call fails after token refresh attempts.
 */
async function callYoLinkApi<T>(
  connectorId: string, // Added connectorId
  initialConfig: YoLinkConfig, // Added initialConfig
  requestBody: Record<string, unknown>,
  operationName: string,
  isRetry: boolean = false // Added to prevent infinite retry loops
): Promise<T> {
  console.log(`YoLink ${operationName} called for connector ${connectorId}. Retry: ${isRetry}`);

  let tokenDetails: Awaited<ReturnType<typeof getRefreshedYoLinkToken>>;
  try {
    tokenDetails = await getRefreshedYoLinkToken(initialConfig);
  } catch (tokenError) {
    console.error(`[callYoLinkApi][${connectorId}] Failed to get/refresh token for ${operationName}:`, tokenError);
    throw tokenError; // Propagate error if token cannot be obtained
  }

  const { newAccessToken, updatedConfig } = tokenDetails;

  // TODO (Phase 4): Persist updatedConfig to DB if it changed.
  // For now, we compare initialConfig's token fields with updatedConfig's token fields.
  if (
    initialConfig.accessToken !== updatedConfig.accessToken ||
    initialConfig.refreshToken !== updatedConfig.refreshToken ||
    initialConfig.tokenExpiresAt !== updatedConfig.tokenExpiresAt
  ) {
    console.warn(`[callYoLinkApi][${connectorId}] Token updated for ${operationName}. DB UPDATE NEEDED for cfg_enc with:`, JSON.stringify(updatedConfig));
    // In a real scenario, you'd call something like: 
    // await updateConnectorConfig(connectorId, updatedConfig);
    // And the 'initialConfig' for subsequent calls within the same high-level operation 
    // should ideally use this 'updatedConfig'. For now, each callYoLinkApi starts with its passed 'initialConfig'.
  }

  console.log(`YoLink ${operationName} using token (present: ${!!newAccessToken})`);

  if (!newAccessToken) {
    // This case should ideally be caught by getRefreshedYoLinkToken throwing an error.
    console.error(`[callYoLinkApi][${connectorId}] YoLink Access Token is unexpectedly missing after refresh logic for ${operationName}.`);
    throw new Error(`YoLink Access Token is required for ${operationName} but was not obtained.`);
  }

  try {
    console.log(`Preparing to execute YoLink ${operationName} with URL:`, YOLINK_API_URL, 'Body:', requestBody);
    
    const response = await fetch(YOLINK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${newAccessToken}` // Use the obtained/refreshed token
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`YoLink ${operationName} response status:`, response.status);
    const data = await response.json();
    
    // Check BUDP success code ('000000') and HTTP status
    if (!response.ok || data.code !== '000000') {
      const errorCode = data.code as string | undefined;
      const errorMessage = data.desc || data.msg || `API returned status ${errorCode || 'unknown'}`;
      console.error(`[callYoLinkApi][${connectorId}] Failed to execute YoLink ${operationName}: ${errorMessage}`, data);

      // Reactive Refresh for specific token errors, if not already a retry
      if (!isRetry && (errorCode === '000103' /* invalid token */ || errorCode === '010104' /* expired token */)) {
        console.warn(`[callYoLinkApi][${connectorId}] Token error (${errorCode}) detected for ${operationName}. Attempting reactive refresh and retry...`);
        // Force re-evaluation by making getRefreshedYoLinkToken think the token is bad
        const configForRetry: YoLinkConfig = {
          ...updatedConfig, // Use the latest config from the first attempt
          accessToken: undefined, // Force refresh/new fetch
          tokenExpiresAt: 0      // Force refresh/new fetch
        };
        // Recursive call, now marked as a retry.
        // Pass the modified config (updatedConfig from previous token fetch attempt) to ensure it has latest refresh token etc.
        return callYoLinkApi<T>(connectorId, configForRetry, requestBody, operationName, true);
      }
      throw new Error(`Failed to execute YoLink ${operationName}: ${errorMessage}`);
    }

    console.log(`Successfully executed YoLink ${operationName}`);
    return data.data as T;
  } catch (error) {
    // This will catch errors from the fetch itself, or the re-thrown error from non-OK responses, or error from reactive refresh attempt.
    if (error instanceof Error) {
      console.error(`[callYoLinkApi][${connectorId}] Error in YoLink ${operationName}:`, error.message);
      throw error; // Re-throw known errors
    }
    // Handle network or unexpected errors
    console.error(`[callYoLinkApi][${connectorId}] Unexpected error in YoLink ${operationName}:`, error);
    throw new Error(`Network error or unexpected issue during YoLink ${operationName}.`);
  }
}

/**
 * Fetches a NEW YoLink API access token using client credentials.
 * @param cfg The YoLink configuration containing uaid and clientSecret.
 * @returns Promise resolving to the raw YoLinkTokenAPIResponse object.
 * @throws Error with a user-friendly message if fetching fails.
 */
async function _fetchNewYoLinkToken(cfg: YoLinkConfig): Promise<YoLinkTokenAPIResponse> {
  console.log('_fetchNewYoLinkToken called with config:', {
    uaid: cfg.uaid ? `${cfg.uaid.substring(0, 3)}...` : 'missing',
    clientSecret: cfg.clientSecret ? '[present]' : 'missing',
  });

  if (!cfg.uaid || !cfg.clientSecret) {
    console.error('Missing YoLink UAID or Client Secret for _fetchNewYoLinkToken.');
    throw new Error('Missing YoLink UAID or Client Secret for new token.');
  }

  const body = new URLSearchParams();
  body.append('grant_type', 'client_credentials');
  body.append('client_id', cfg.uaid);
  body.append('client_secret', cfg.clientSecret);

  console.log('Preparing to fetch NEW YoLink token with URL:', YOLINK_TOKEN_URL);

  try {
    const response = await fetch(YOLINK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    console.log('YoLink NEW token fetch response status:', response.status);
    const data = await response.json(); // This will be YoLinkTokenAPIResponse or an error structure

    if (!response.ok) {
      const errorMessage = getYoLinkErrorMessage(data, response.status);
      console.error(`Failed to get NEW YoLink token: ${errorMessage}`, data);
      throw new Error(`Failed to get NEW YoLink token: ${errorMessage}`);
    }

    // Validate the structure of a successful response to match YoLinkTokenAPIResponse
    if (data.access_token && typeof data.access_token === 'string' && 
        data.refresh_token && typeof data.refresh_token === 'string' &&
        typeof data.expires_in === 'number') {
      console.log('Successfully retrieved NEW YoLink token and refresh token');
      return data as YoLinkTokenAPIResponse;
    } else {
      const errorMessage = getYoLinkErrorMessage(data, response.status);
      console.error(`Failed to get NEW YoLink token: ${errorMessage || 'Token data missing/invalid in response'}`, data);
      throw new Error(`Failed to get NEW YoLink token: ${errorMessage || 'Token data missing/invalid in response'}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error in _fetchNewYoLinkToken:", error.message);
      throw error; // Re-throw known errors
    }
    console.error("Unexpected error fetching NEW YoLink token:", error);
    throw new Error('Network error or unexpected issue connecting to YoLink for a new token.');
  }
}

// --- BEGIN Add _refreshYoLinkToken Function ---
/**
 * Refreshes a YoLink API access token using a refresh token.
 * @param refreshToken The YoLink refresh token.
 * @param uaid The YoLink UAID (client_id).
 * @returns Promise resolving to the raw YoLinkTokenAPIResponse object.
 * @throws Error with a user-friendly message if refreshing fails.
 */
async function _refreshYoLinkToken(refreshToken: string, uaid: string): Promise<YoLinkTokenAPIResponse> {
  console.log('_refreshYoLinkToken called with uaid:', uaid ? `${uaid.substring(0, 3)}...` : 'missing');

  if (!refreshToken || !uaid) {
    console.error('Missing YoLink refreshToken or UAID for _refreshYoLinkToken.');
    throw new Error('Missing YoLink refreshToken or UAID for token refresh.');
  }

  const body = new URLSearchParams();
  body.append('grant_type', 'refresh_token');
  body.append('client_id', uaid);
  body.append('refresh_token', refreshToken);

  console.log('Preparing to REFRESH YoLink token with URL:', YOLINK_TOKEN_URL);

  try {
    const response = await fetch(YOLINK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    console.log('YoLink REFRESH token fetch response status:', response.status);
    const data = await response.json(); // This will be YoLinkTokenAPIResponse or an error structure

    if (!response.ok) {
      const errorMessage = getYoLinkErrorMessage(data, response.status);
      console.error(`Failed to REFRESH YoLink token: ${errorMessage}`, data);
      // Specific check for expired/invalid refresh token based on typical OAuth behavior or YoLink docs if available
      // For now, we assume any non-OK response means refresh failed (e.g., refresh token itself expired)
      throw new Error(`Failed to REFRESH YoLink token: ${errorMessage}`);
    }

    // Validate the structure of a successful refresh response
    if (data.access_token && typeof data.access_token === 'string' && 
        data.refresh_token && typeof data.refresh_token === 'string' && // YoLink refresh usually returns a new refresh token
        typeof data.expires_in === 'number') {
      console.log('Successfully REFRESHED YoLink token and got new refresh token');
      return data as YoLinkTokenAPIResponse;
    } else {
      const errorMessage = getYoLinkErrorMessage(data, response.status);
      console.error(`Failed to REFRESH YoLink token: ${errorMessage || 'Token data missing/invalid in refresh response'}`, data);
      throw new Error(`Failed to REFRESH YoLink token: ${errorMessage || 'Token data missing/invalid in refresh response'}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error in _refreshYoLinkToken:", error.message);
      throw error; // Re-throw known errors
    }
    console.error("Unexpected error REFRESHING YoLink token:", error);
    throw new Error('Network error or unexpected issue connecting to YoLink for token refresh.');
  }
}
// --- END Add _refreshYoLinkToken Function ---

// --- BEGIN Add getRefreshedYoLinkToken Function ---
/**
 * Ensures a valid YoLink access token is available, refreshing or fetching a new one if necessary.
 * It directly uses and returns properties from the YoLinkConfig for token details.
 *
 * @param currentConfig The current YoLink configuration, potentially including existing token info.
 * @returns Promise resolving to an object containing the access token, refresh token (if any),
 *          its expiration timestamp (ms), and the potentially updated YoLinkConfig.
 * @throws Error if all attempts to get a valid token fail.
 */
export async function getRefreshedYoLinkToken(currentConfig: YoLinkConfig): Promise<{
  newAccessToken: string;
  newRefreshToken?: string; // YoLink refresh tokens are typically returned and might change
  newExpiresAt: number; // Unix timestamp in ms
  updatedConfig: YoLinkConfig; // The config object with updated token fields
}> {
  console.log('[getRefreshedYoLinkToken] Checking token status...');

  // 1. Check if current token is still valid and not expiring soon
  if (currentConfig.accessToken && currentConfig.tokenExpiresAt && 
      !isTokenExpiring(currentConfig.tokenExpiresAt)) {
    console.log('[getRefreshedYoLinkToken] Current token is valid.');
    return {
      newAccessToken: currentConfig.accessToken,
      newRefreshToken: currentConfig.refreshToken,
      newExpiresAt: currentConfig.tokenExpiresAt,
      updatedConfig: currentConfig, // No changes to config
    };
  }

  // 2. Try to refresh if a refresh token exists
  if (currentConfig.refreshToken && currentConfig.uaid) {
    console.log('[getRefreshedYoLinkToken] Current token expired or missing. Attempting refresh...');
    try {
      const refreshApiResponse = await _refreshYoLinkToken(currentConfig.refreshToken, currentConfig.uaid);
      const newExpiresAt = calculateExpiresAt(refreshApiResponse.expires_in);
      
      const updatedConfig: YoLinkConfig = {
        ...currentConfig,
        accessToken: refreshApiResponse.access_token,
        refreshToken: refreshApiResponse.refresh_token, // YoLink refresh usually returns a new refresh token
        tokenExpiresAt: newExpiresAt,
      };
      console.log('[getRefreshedYoLinkToken] Token refreshed successfully.');
      return {
        newAccessToken: updatedConfig.accessToken!,
        newRefreshToken: updatedConfig.refreshToken,
        newExpiresAt: updatedConfig.tokenExpiresAt!,
        updatedConfig: updatedConfig,
      };
    } catch (refreshError) {
      console.warn('[getRefreshedYoLinkToken] Refresh token failed:', refreshError instanceof Error ? refreshError.message : refreshError);
      // Proceed to fetch a new token if refresh fails
    }
  }

  // 3. Fetch a new token if no refresh token or if refresh failed
  console.log('[getRefreshedYoLinkToken] Attempting to fetch a new token...');
  try {
    const newCredentialsConfig: YoLinkConfig = { uaid: currentConfig.uaid, clientSecret: currentConfig.clientSecret, scope: [] }; // Provide base config for new token
    const newApiTokenResponse = await _fetchNewYoLinkToken(newCredentialsConfig);
    const newExpiresAt = calculateExpiresAt(newApiTokenResponse.expires_in);

    const updatedConfig: YoLinkConfig = {
      ...currentConfig, // Carry over any other potentially useful fields from currentConfig if needed
      uaid: currentConfig.uaid, // Ensure uaid is present
      clientSecret: currentConfig.clientSecret, // Ensure clientSecret is present
      accessToken: newApiTokenResponse.access_token,
      refreshToken: newApiTokenResponse.refresh_token,
      tokenExpiresAt: newExpiresAt,
    };
    console.log('[getRefreshedYoLinkToken] New token fetched successfully.');
    return {
      newAccessToken: updatedConfig.accessToken!,
      newRefreshToken: updatedConfig.refreshToken,
      newExpiresAt: updatedConfig.tokenExpiresAt!,
      updatedConfig: updatedConfig,
    };
  } catch (fetchError) {
    console.error('[getRefreshedYoLinkToken] Failed to fetch a new token:', fetchError instanceof Error ? fetchError.message : fetchError);
    throw new Error(`Failed to obtain a valid YoLink token after all attempts: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
  }
}
// --- END Add getRefreshedYoLinkToken Function ---

/**
 * Fetches the YoLink Home General Info using an access token.
 * @param connectorId The ID of the connector for fetching/updating its config.
 * @param config The YoLink configuration containing uaid and clientSecret.
 * @returns Promise resolving to the home ID string.
 * @throws Error with a user-friendly message if fetching fails.
 */
export async function getHomeInfo(connectorId: string, config: YoLinkConfig): Promise<string> {
  try {
    const data = await callYoLinkApi<{ id: string }>(
      connectorId, // Pass connectorId
      config,      // Pass config
      { method: "Home.getGeneralInfo", params: {} },
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
 * @param connectorId The ID of the connector for fetching/updating its config.
 * @param config The YoLink configuration containing uaid and clientSecret.
 * @returns Array of YoLink devices
 * @throws Error with a user-friendly message if fetching fails
 */
export async function getDeviceList(connectorId: string, config: YoLinkConfig): Promise<YoLinkDeviceRaw[]> {
  try {
    const data = await callYoLinkApi<{ devices: YoLinkDeviceRaw[] }>(
      connectorId, // Pass connectorId
      config,      // Pass config
      { method: "Home.getDeviceList", params: {} },
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
 * @param connectorId The ID of the connector for fetching/updating its config.
 * @param cfg The YoLink configuration containing uaid and clientSecret.
 * @returns Promise that resolves to a boolean indicating if the connection was successful.
 */
export async function testConnection(connectorId: string, cfg: YoLinkConfig): Promise<boolean> {
  console.log(`YoLink testConnection called for connector ${connectorId} with config:`, {
    uaid: cfg.uaid ? '****' + cfg.uaid.substring(Math.max(0, cfg.uaid.length - 4)) : 'missing',
    clientSecret: cfg.clientSecret ? '[REDACTED]' : 'missing'
  });
  
  try {
    // Validate input
    if (!cfg.uaid || !cfg.clientSecret) {
      console.error('[testConnection] YoLink connection test failed: Missing UAID or Client Secret.');
      return false;
    }

    // Attempt to fetch home info. This will go through the new callYoLinkApi
    // which handles token acquisition and refresh.
    // We use the passed 'cfg' as the initialConfig. If it contains valid token info,
    // getRefreshedYoLinkToken will use it; otherwise, it will fetch/refresh.
    console.log(`[testConnection][${connectorId}] Attempting to get home info to verify connection...`);
    await getHomeInfo(connectorId, cfg); 
    // If getHomeInfo doesn't throw, the connection and token handling are considered successful.
    
    console.log(`[testConnection][${connectorId}] YoLink connection test successful.`);
    return true;

  } catch (error) {
    // Errors from getHomeInfo (which includes callYoLinkApi and getRefreshedYoLinkToken) will be caught here.
    console.error(`[testConnection][${connectorId}] YoLink connection test failed:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

// --- BEGIN Add setDeviceState Function ---
/**
 * Sets the state of a YoLink device (Switch or Outlet).
 * @param connectorId The ID of the connector for fetching/updating its config.
 * @param config YoLink configuration (uaid, clientSecret)
 * @param deviceId The target device's YoLink ID (deviceId from API)
 * @param deviceToken The target device's specific token (token from API)
 * @param rawDeviceType The raw type string of the device (e.g., 'Switch', 'Outlet')
 * @param targetState The desired state ('open' or 'close')
 * @returns Promise resolving to the API response data on success.
 * @throws Error if the operation fails or device type is unsupported.
 */
export async function setDeviceState(
  connectorId: string, // Added connectorId
  config: YoLinkConfig,
  deviceId: string,
  deviceToken: string,
  rawDeviceType: string,
  targetState: 'open' | 'close'
): Promise<any> { // Can be typed more specifically if needed
  console.log(`setDeviceState called for connector ${connectorId}, device ${deviceId}, type: ${rawDeviceType}, target: ${targetState}`);

  if (!config.uaid || !config.clientSecret) {
    console.error('Missing YoLink UAID or Client Secret for setDeviceState.');
    throw new Error('Missing YoLink UAID or Client Secret.');
  }
  if (!deviceId || !deviceToken) {
    console.error(`Missing deviceId (${deviceId}) or deviceToken (${!!deviceToken}) for setDeviceState.`);
    throw new Error('Missing YoLink deviceId or deviceToken for state change.');
  }

  let method: string;
  switch (rawDeviceType) {
    case 'Switch':
      method = 'Switch.setState';
      break;
    case 'Outlet':
    case 'MultiOutlet': // MultiOutlet uses the Outlet API endpoint
      method = 'Outlet.setState';
      break;
    default:
      console.error(`Unsupported device type for setDeviceState: ${rawDeviceType}`);
      throw new Error(`Cannot set state for unsupported device type: ${rawDeviceType}`);
  }

  try {
    // The call to get access token is now handled by callYoLinkApi
    // const tokenResponse = await _fetchNewYoLinkToken(config); // OLD
    // const accessToken = tokenResponse.access_token; // OLD

    const requestBody = {
      method: method,
      targetDevice: deviceId,
      token: deviceToken,
      params: {
        state: targetState
      }
    };

    const operationName = `setDeviceState (${method})`;
    console.log(`Calling callYoLinkApi for ${operationName}`);
    const result = await callYoLinkApi<any>(
      connectorId, // Pass connectorId
      config,      // Pass initial config
      requestBody,
      operationName
    );

    console.log(`Successfully executed ${operationName} for device ${deviceId}. Result:`, result);
    return result; // Return the data part of the response

  } catch (error) {
    console.error(`[setDeviceState][${connectorId}] Error during ${method} for device ${deviceId}:`, error);
    if (error instanceof Error) {
      throw new Error(`Failed to set YoLink device state for ${connectorId}: ${error.message}`);
    } else {
      throw new Error(`Failed to set YoLink device state for ${connectorId} due to an unknown error.`);
    }
  }
}
// --- END Add setDeviceState Function --- 

// --- BEGIN Add getDeviceState Function ---
/**
 * Gets the current state of a YoLink device (Switch or Outlet).
 * @param connectorId The ID of the connector for fetching/updating its config.
 * @param config YoLink configuration (uaid, clientSecret, and potentially existing token info)
 * @param deviceId The target device's YoLink ID (deviceId from API)
 * @param deviceToken The target device's specific token (token from API)
 * @param rawDeviceType The raw type string of the device (e.g., 'Switch', 'Outlet')
 * @returns Promise resolving to the state data (e.g., { state: 'open' }) from the API response.
 * @throws Error if the operation fails or device type is unsupported.
 */
export async function getDeviceState(
  connectorId: string, // Added connectorId
  config: YoLinkConfig,
  deviceId: string,
  deviceToken: string,
  rawDeviceType: string
): Promise<any> { // Can be typed more specifically later
  console.log(`getDeviceState called for connector ${connectorId}, device ${deviceId}, type: ${rawDeviceType}`);

  if (!config.uaid || !config.clientSecret) {
    console.error('Missing YoLink UAID or Client Secret for getDeviceState.');
    throw new Error('Missing YoLink UAID or Client Secret.');
  }
  if (!deviceId || !deviceToken) {
    console.error(`Missing deviceId (${deviceId}) or deviceToken (${!!deviceToken}) for getDeviceState.`);
    throw new Error('Missing YoLink deviceId or deviceToken for getting state.');
  }

  let method: string;
  switch (rawDeviceType) {
    case 'Switch':
      method = 'Switch.getState';
      break;
    case 'Outlet':
    case 'MultiOutlet': // MultiOutlet uses the Outlet API endpoint for state
      method = 'Outlet.getState';
      break;
    default:
      console.error(`Unsupported device type for getDeviceState: ${rawDeviceType}`);
      throw new Error(`Cannot get state for unsupported device type: ${rawDeviceType}`);
  }

  try {
    // The call to get access token is now handled by callYoLinkApi
    // const tokenResponse = await _fetchNewYoLinkToken(config); // OLD
    // const accessToken = tokenResponse.access_token; // OLD

    const requestBody = {
      method: method,
      targetDevice: deviceId,
      token: deviceToken,
      // params: {} // No params for getState generally, but if some device types need it, it can be added here
    };

    const operationName = `getDeviceState (${method})`;
    console.log(`Calling callYoLinkApi for ${operationName}`);
    const resultData = await callYoLinkApi<any>(
      connectorId, // Pass connectorId
      config,      // Pass initial config
      requestBody,
      operationName
    );

    console.log(`Successfully executed ${operationName} for device ${deviceId}. Result data:`, resultData);
    return resultData; // Return the data part of the response

  } catch (error) {
    console.error(`[getDeviceState][${connectorId}] Error during ${method} for device ${deviceId}:`, error);
    if (error instanceof Error) {
      throw new Error(`Failed to get YoLink device state for ${connectorId}: ${error.message}`);
    } else {
      throw new Error(`Failed to get YoLink device state for ${connectorId} due to an unknown error.`);
    }
  }
}
// --- END Add getDeviceState Function --- 