// YoLink driver with test connection functionality

import { z } from 'zod';
import { calculateExpiresAt, isTokenExpiring } from '@/lib/token-utils';
import { updateConnectorConfig } from '@/data/repositories/connectors';
// --- BEGIN ADD IMPORTS FOR HELPER ---
import type { TypedDeviceInfo } from '@/lib/mappings/definitions';
import { DeviceType } from '@/lib/mappings/definitions';
// --- END ADD IMPORTS FOR HELPER ---

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
    // If this is a retry due to a token error, force a refresh by clearing existing token details from initialConfig.
    // Otherwise, use initialConfig as is, which might contain a valid token.
    const configForTokenFetch = isRetry 
        ? { ...initialConfig, accessToken: undefined, tokenExpiresAt: 0 } 
        : initialConfig;
    tokenDetails = await getRefreshedYoLinkToken(configForTokenFetch);
  } catch (tokenError) {
    console.error(`[callYoLinkApi][${connectorId}] Failed to get/refresh token for ${operationName}:`, tokenError);
    throw tokenError; // Propagate error if token cannot be obtained
  }

  const { newAccessToken, updatedConfig } = tokenDetails;

  // Persist updatedConfig to DB if it changed (Placeholder for actual DB update logic)
  if (
    initialConfig.accessToken !== updatedConfig.accessToken ||
    initialConfig.refreshToken !== updatedConfig.refreshToken ||
    initialConfig.tokenExpiresAt !== updatedConfig.tokenExpiresAt
  ) {
    console.warn(`[callYoLinkApi][${connectorId}] Token updated for ${operationName}. DB UPDATE NEEDED for cfg_enc with:`, JSON.stringify(updatedConfig));
    await updateConnectorConfig(connectorId, updatedConfig);
  }

  if (!newAccessToken) {
    console.error(`[callYoLinkApi][${connectorId}] YoLink Access Token is unexpectedly missing after refresh logic for ${operationName}.`);
    throw new Error(`YoLink Access Token is required for ${operationName} but was not obtained.`);
  }

  try {
    // Delegate the actual API call to _executeYoLinkRequest
    const result = await _executeYoLinkRequest<T>(
      newAccessToken,
      requestBody,
      operationName,
      connectorId // Use connectorId as logContext
    );
    console.log(`[callYoLinkApi][${connectorId}] Successfully executed YoLink ${operationName}`);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[callYoLinkApi][${connectorId}] Error during attempt for ${operationName}: ${errorMessage}`);

    // Reactive Refresh for specific token errors, if not already a retry
    // We need to parse the error message to see if it's a known token error code from getYoLinkErrorMessage
    // This is a bit fragile. A more robust way would be for _executeYoLinkRequest to throw a custom error with a code.
    const isTokenInvalidError = errorMessage.includes("000103") || errorMessage.includes("API token is invalid");
    const isTokenExpiredError = errorMessage.includes("010104") || errorMessage.includes("API token has expired");

    if (!isRetry && (isTokenInvalidError || isTokenExpiredError)) {
      console.warn(`[callYoLinkApi][${connectorId}] Token error detected for ${operationName} ('${errorMessage}'). Attempting reactive refresh and retry...`);
      // For the retry, we pass the updatedConfig which should contain the latest refresh token (if any)
      // The getRefreshedYoLinkToken call at the start of the retried callYoLinkApi will be forced to refresh
      // because we set isRetry=true, which modifies its input config to clear accessToken.
      return callYoLinkApi<T>(connectorId, updatedConfig, requestBody, operationName, true); 
    }
    // If not a recognized token error, or if it's already a retry, re-throw the error.
    // If error came from _executeYoLinkRequest, it should already be a well-formed Error object.
    throw error; 
  }
}

// --- BEGIN Add _executeYoLinkRequest Function ---
/**
 * Executes a YoLink API request using a pre-obtained access token.
 * This function centralizes the actual fetch call and YoLink-specific response handling.
 * @param accessToken The YoLink access token.
 * @param requestBody The body for the YoLink API call.
 * @param operationName A descriptive name for the operation (for logging).
 * @param logContext A string identifying the calling context (e.g., connectorId or "direct_call") for logging.
 * @returns Promise resolving to the data.data part of the YoLink API response.
 * @throws Error if the API call fails or returns a YoLink error code.
 */
async function _executeYoLinkRequest<T>(
  accessToken: string,
  requestBody: Record<string, unknown>,
  operationName: string,
  logContext: string // e.g., connectorId or a string like "direct_call"
): Promise<T> {
  console.log(`_executeYoLinkRequest [${logContext}] for operation '${operationName}'`);

  if (!accessToken) {
    // This should ideally not happen if callers manage tokens correctly.
    console.error(`[executeYoLinkRequest][${logContext}] Access token is missing for operation '${operationName}'.`);
    throw new Error(`Access token is required for YoLink operation '${operationName}'.`);
  }

  try {
    const response = await fetch(YOLINK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    // console.log(`[executeYoLinkRequest][${logContext}] '${operationName}' response status: ${response.status}, YoLink code: ${data.code}`);

    if (!response.ok || data.code !== '000000') {
      const errorMessage = getYoLinkErrorMessage(data, response.status);
      console.error(`[executeYoLinkRequest][${logContext}] Failed '${operationName}': ${errorMessage}`, data);
      // Throw the specific error message, which might include the YoLink error code.
      // This allows callers (like callYoLinkApi) to inspect the error code for reactive refresh.
      throw new Error(errorMessage); 
    }

    // console.log(`[executeYoLinkRequest][${logContext}] Successfully executed '${operationName}'.`);
    return data.data as T;
  } catch (error) {
    if (error instanceof Error) {
      // If the error is already one we threw (from getYoLinkErrorMessage), or a network error, rethrow.
      console.error(`[executeYoLinkRequest][${logContext}] Error during '${operationName}':`, error.message);
      throw error; 
    }
    // Fallback for non-Error objects thrown
    console.error(`[executeYoLinkRequest][${logContext}] Unexpected non-Error type during '${operationName}':`, error);
    throw new Error(`Network error or unexpected issue during YoLink operation '${operationName}'.`);
  }
}
// --- END Add _executeYoLinkRequest Function ---

/**
 * Fetches a NEW YoLink API access token using client credentials.
 * This version is for pre-connector creation scenarios and does not use YoLinkConfig.
 * It serves as a thin wrapper around _fetchNewYoLinkToken.
 * @param uaid The YoLink UAID (client_id).
 * @param clientSecret The YoLink Client Secret.
 * @returns Promise resolving to the raw YoLinkTokenAPIResponse object.
 * @throws Error with a user-friendly message if fetching fails.
 */
async function _fetchNewYoLinkTokenDirect(uaid: string, clientSecret: string): Promise<YoLinkTokenAPIResponse> {
  console.log(`_fetchNewYoLinkTokenDirect called for uaid: ${uaid ? uaid.substring(0,3) + '...' : 'missing'}`);
  // Construct a minimal config for the sole purpose of calling _fetchNewYoLinkToken
  const tempCfg: YoLinkConfig = {
    uaid: uaid,
    clientSecret: clientSecret,
    scope: [], // Default scope, actual scope is determined by YoLink server for client_credentials
    // Other YoLinkConfig fields (accessToken, refreshToken, tokenExpiresAt, homeId) are not relevant here.
  };

  try {
    // Delegate the actual token fetching logic to the existing function
    return await _fetchNewYoLinkToken(tempCfg);
  } catch (error) {
    // Add context to the error if it originated from _fetchNewYoLinkToken via this direct path
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[fetchNewYoLinkTokenDirect] Error during call to _fetchNewYoLinkToken: ${errorMessage}`);
    // Re-throw a new error with more specific context, or re-throw the original if it's already well-formed.
    // For now, let's assume _fetchNewYoLinkToken throws a sufficiently descriptive error.
    // If _fetchNewYoLinkToken's errors are too generic, we might wrap it: 
    // throw new Error(`Failed to obtain YoLink token directly via wrapper: ${errorMessage}`);
    throw error; // Re-throw the original error for now
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

// --- BEGIN Add _callYoLinkApiDirect Function ---
/**
 * Generic function to call the YoLink API directly using uaid and clientSecret.
 * This is for pre-connector creation scenarios and does not involve YoLinkConfig or token persistence.
 * @param uaid The YoLink UAID (client_id).
 * @param clientSecret The YoLink Client Secret.
 * @param requestBody The body for the YoLink API call (method, params, etc.).
 * @param operationName Name of the operation for logging purposes.
 * @returns The API response data (data.data part).
 * @throws Error if API call fails.
 */
async function _callYoLinkApiDirect<T>(
  uaid: string,
  clientSecret: string,
  requestBody: Record<string, unknown>,
  operationName: string
): Promise<T> {
  console.log(`_callYoLinkApiDirect for operation '${operationName}' (uaid: ${uaid ? uaid.substring(0,3) + '...':'missing'})`);

  let tokenResponse: YoLinkTokenAPIResponse;
  try {
    tokenResponse = await _fetchNewYoLinkTokenDirect(uaid, clientSecret);
  } catch (tokenError) {
    console.error(`[_callYoLinkApiDirect] Failed to get token for '${operationName}':`, tokenError);
    throw tokenError; // Re-throw error from _fetchNewYoLinkTokenDirect
  }

  const accessToken = tokenResponse.access_token;
  // No need to check if accessToken is null here as _fetchNewYoLinkTokenDirect would have thrown

  // Now call the centralized request execution function
  try {
    return await _executeYoLinkRequest<T>(
      accessToken,
      requestBody,
      operationName,
      "_callYoLinkApiDirect" // Log context
    );
  } catch (executionError) {
    // Errors from _executeYoLinkRequest should already be descriptive
    // and include context from getYoLinkErrorMessage if it was a YoLink API error.
    console.error(`[_callYoLinkApiDirect] Error during execution of '${operationName}':`, executionError);
    throw executionError;
  }
}
// --- END Add _callYoLinkApiDirect Function ---

// --- BEGIN Add _getHomeInfoDirect Function ---
/**
 * Fetches the YoLink Home General Info using only uaid and clientSecret.
 * This is for pre-connector creation scenarios.
 * @param uaid The YoLink UAID (client_id).
 * @param clientSecret The YoLink Client Secret.
 * @returns Promise resolving to the home ID string.
 * @throws Error if fetching fails.
 */
async function _getHomeInfoDirect(uaid: string, clientSecret: string): Promise<string> {
  console.log(`_getHomeInfoDirect called with uaid: ${uaid ? uaid.substring(0,3) + '...':'missing'}`);
  try {
    const data = await _callYoLinkApiDirect<{ id: string }>(
      uaid,
      clientSecret,
      { method: "Home.getGeneralInfo", params: {} },
      "_getHomeInfoDirect"
    );

    if (data?.id && typeof data.id === 'string') {
      return data.id;
    } else {
      console.error('[getHomeInfoDirect] YoLink home info response did not contain a valid home ID', data);
      throw new Error('YoLink home info response (direct) did not contain a valid home ID.');
    }
  } catch (error) {
    // Log the error and re-throw it to be handled by the caller (e.g., testYoLinkCredentials)
    console.error('[getHomeInfoDirect] Error fetching home info directly:', error);
    // Errors from _callYoLinkApiDirect should already be user-friendly
    throw error; 
  }
}
// --- END Add _getHomeInfoDirect Function ---

// --- BEGIN Add testYoLinkCredentials Function ---
/**
 * Tests YoLink credentials by attempting to fetch home information.
 * This function is intended for use BEFORE a connector is created.
 * @param uaid The YoLink User Account ID (UAID).
 * @param clientSecret The YoLink Client Secret.
 * @returns Promise resolving to an object with success status, and optionally homeId or error message.
 */
export async function testYoLinkCredentials(uaid: string, clientSecret: string): Promise<{
  success: boolean;
  homeId?: string;
  error?: string;
}> {
  console.log(`testYoLinkCredentials called with uaid: ${uaid ? uaid.substring(0,3) + '...':'missing'}`);
  try {
    // Validate inputs directly here for clarity, though _getHomeInfoDirect also checks
    if (!uaid || !clientSecret) {
      console.error('[testYoLinkCredentials] Missing UAID or Client Secret.');
      return { success: false, error: 'YoLink UAID and Client Secret are required.' };
    }

    const homeId = await _getHomeInfoDirect(uaid, clientSecret);
    // If _getHomeInfoDirect succeeds, credentials are valid
    console.log(`[testYoLinkCredentials] Successfully fetched homeId: ${homeId}`);
    return { success: true, homeId: homeId };
  } catch (error) {
    console.error('[testYoLinkCredentials] Credential test failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during credential test.';
    return { success: false, error: errorMessage };
  }
}
// --- END Add testYoLinkCredentials Function ---

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

  // --- BEGIN Dynamic Method Construction ---
  // Validate rawDeviceType to prevent constructing nonsensical method strings
  if (!rawDeviceType) {
    console.error(`Invalid rawDeviceType for getDeviceState: '${rawDeviceType}' (must be a non-empty string)`);
    throw new Error(`Invalid rawDeviceType provided for getDeviceState (must be a non-empty string).`);
  }
  // Construct the method dynamically
  // YoLink API methods for getting state are typically in the format "DeviceType.getState"
  // e.g., "Switch.getState", "DoorSensor.getState", "LeakSensor.getState"
  const method = `${rawDeviceType}.getState`;
  // --- END Dynamic Method Construction ---

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

// --- BEGIN Add playAudio Function ---
/**
 * Plays audio on a YoLink SpeakerHub device.
 * @param connectorId The ID of the connector for fetching/updating its config.
 * @param config YoLink configuration (uaid, clientSecret, and potentially existing token info)
 * @param deviceId The target device's YoLink ID (deviceId from API)
 * @param deviceToken The target device's specific token (token from API)
 * @param params Audio parameters including tone, message, volume, and repeat
 * @returns Promise resolving to the API response data on success.
 * @throws Error if the operation fails or parameters are invalid.
 */
export async function playAudio(
  connectorId: string,
  config: YoLinkConfig,
  deviceId: string,
  deviceToken: string,
  params: {
    tone?: string;
    message: string;
    volume?: number;
    repeat?: number;
  }
): Promise<any> {
  console.log(`playAudio called for connector ${connectorId}, device ${deviceId}`);

  if (!config.uaid || !config.clientSecret) {
    console.error('Missing YoLink UAID or Client Secret for playAudio.');
    throw new Error('Missing YoLink UAID or Client Secret.');
  }
  if (!deviceId || !deviceToken) {
    console.error(`Missing deviceId (${deviceId}) or deviceToken (${!!deviceToken}) for playAudio.`);
    throw new Error('Missing YoLink deviceId or deviceToken for audio playback.');
  }
  if (!params.message || typeof params.message !== 'string') {
    console.error('Missing or invalid message parameter for playAudio.');
    throw new Error('Message parameter is required for audio playback.');
  }

  // Validate tone parameter if provided
  if (params.tone && !['Emergency', 'Alert', 'Warn', 'Tip'].includes(params.tone)) {
    console.error(`Invalid tone parameter: ${params.tone}`);
    throw new Error('Tone must be one of: Emergency, Alert, Warn, Tip');
  }

  // Validate volume parameter if provided
  if (params.volume !== undefined && (typeof params.volume !== 'number' || params.volume < 1 || params.volume > 100)) {
    console.error(`Invalid volume parameter: ${params.volume}`);
    throw new Error('Volume must be a number between 1 and 100');
  }

  // Validate repeat parameter if provided
  if (params.repeat !== undefined && (typeof params.repeat !== 'number' || params.repeat < 0 || params.repeat > 10)) {
    console.error(`Invalid repeat parameter: ${params.repeat}`);
    throw new Error('Repeat must be a number between 0 and 10');
  }

  try {
    // Build the API request parameters
    const apiParams: Record<string, any> = {
      message: params.message
    };

    // Add optional parameters only if provided
    if (params.tone) {
      apiParams.tone = params.tone;
    }
    if (params.volume !== undefined) {
      apiParams.volume = params.volume;
    }
    if (params.repeat !== undefined) {
      apiParams.repeat = params.repeat;
    }

    const requestBody = {
      method: 'SpeakerHub.playAudio',
      targetDevice: deviceId,
      token: deviceToken,
      params: apiParams
    };

    const operationName = 'playAudio';
    console.log(`Calling callYoLinkApi for ${operationName} with params:`, apiParams);
    const result = await callYoLinkApi<any>(
      connectorId,
      config,
      requestBody,
      operationName
    );

    console.log(`Successfully executed ${operationName} for device ${deviceId}. Result:`, result);
    return result;

  } catch (error) {
    console.error(`[playAudio][${connectorId}] Error during playAudio for device ${deviceId}:`, error);
    if (error instanceof Error) {
      throw new Error(`Failed to play audio on YoLink device for ${connectorId}: ${error.message}`);
    } else {
      throw new Error(`Failed to play audio on YoLink device for ${connectorId} due to an unknown error.`);
    }
  }
}
// --- END Add playAudio Function --- 

// --- BEGIN PASTE AND EXPORT HELPER FUNCTION ---
/**
 * Extracts a raw state string from YoLink device data.
 * This function is designed to handle various structures of the 'state' field
 * in YoLink API responses or event data.
 *
 * @param deviceInfo Standardized device type information.
 * @param dataState The 'state' portion of the YoLink data, which can be a string or an object.
 * @returns The extracted raw state string (e.g., "open", "locked", "on"), or undefined if not found/applicable.
 */
export function getRawStateStringFromYoLinkData(
    deviceInfo: TypedDeviceInfo,
    dataState: string | { 
        lock?: string; 
        state?: string | { lock?: string; state?: string };
        power?: string;
        [key: string]: any; 
    } | undefined | null
): string | undefined {
    if (dataState === undefined || dataState === null) {
        return undefined;
    }

    // 1. Handle direct string state
    if (typeof dataState === 'string') {
        return dataState;
    }

    // 2. Handle object states more consolidated
    if (typeof dataState === 'object' && dataState !== null) { // Consolidated check
        // DeviceType specific logic for Lock
        if (deviceInfo.type === DeviceType.Lock) {
            if (typeof dataState.lock === 'string') { return dataState.lock; }
            // Assign to variable to avoid repeated access for nested state
            const nestedLockState = dataState.state;
            if (typeof nestedLockState === 'object' && nestedLockState !== null && typeof nestedLockState.lock === 'string') {
                return nestedLockState.lock;
            }
        }

        // Generic patterns
        const nestedStateProperty = dataState.state; // Reuse for generic checks
        if (typeof nestedStateProperty === 'object' && nestedStateProperty !== null && typeof nestedStateProperty.state === 'string') {
            return nestedStateProperty.state;
        }
        // Handles case where dataState.state is directly a string after the object check above failed
        if (typeof nestedStateProperty === 'string') { 
            return nestedStateProperty;
        }
        // Check for a direct "power" property
        if (typeof dataState.power === 'string') {
            return dataState.power;
        }
        // Add other common top-level properties if needed for other device types
    }

    console.warn(`[YoLink Driver Helper] Could not extract raw state string for device type ${deviceInfo.type}. Input dataState:`, dataState);
    return undefined;
}
// --- END PASTE AND EXPORT HELPER FUNCTION --- 