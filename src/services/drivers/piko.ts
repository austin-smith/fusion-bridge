// Piko driver with test connection functionality

// Base URL for Piko Cloud API
const PIKO_CLOUD_URL = 'https://cloud.pikovms.com';

// Configuration interface for Piko accounts
export interface PikoConfig {
  type: 'cloud'; // For now, only supporting cloud connections
  username: string;
  password: string;
  selectedSystem?: string; // ID of the selected Piko system
  token?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
  };
}

// Interface for simplified Piko system information
export interface PikoSystem {
  id: string;
  name: string;
  version?: string;
  health?: string;
  role?: string;
}

// Interface for token response from authentication
export interface PikoTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  expiresIn: string;
  tokenType: string;
  scope: string;
}

// Interface for raw server data from API
interface PikoServerRaw {
  id: string;
  name: string;
  osInfo?: { platform?: string; variant?: string; variantVersion?: string };
  parameters?: { 
    physicalMemory?: number; 
    systemRuntime?: string; 
    timeZoneInformation?: { timeZoneId?: string; timeZoneOffsetMs?: string };
  };
  status?: string;
  storages?: unknown[]; // Changed any[] to unknown[]
  url?: string;
  version?: string;
  accessRole?: string;
}

// Interface for raw device data from API
export interface PikoDeviceRaw {
  id: string;
  deviceType?: string;
  mac?: string;
  model?: string;
  name: string;
  serverId?: string;
  status?: string;
  url?: string;
  vendor?: string;
  mediaStreams?: {
    codec?: number;
    encoderIndex?: number;
    resolution?: string; // e.g., "1920x1080", "*"
    transcodingRequired?: boolean;
    transports?: string; // e.g., "rtsp|hls|webrtc"
  }[];
}

// Interface for raw system data from API
interface PikoSystemRaw {
  id: string;
  name: string;
  version?: string;
  stateOfHealth?: string;
  accessRole?: string;
}

/**
 * Enum defining the standard Piko API error codes based on documentation.
 */
export enum PikoErrorCode {
  MissingParameter = 'missingParameter',
  InvalidParameter = 'invalidParameter',
  CantProcessRequest = 'cantProcessRequest',
  Forbidden = 'forbidden',
  BadRequest = 'badRequest',
  InternalServerError = 'internalServerError',
  Conflict = 'conflict',
  NotImplemented = 'notImplemented',
  NotFound = 'notFound',
  UnsupportedMediaType = 'unsupportedMediaType',
  ServiceUnavailable = 'serviceUnavailable',
  Unauthorized = 'unauthorized',
  SessionExpired = 'sessionExpired',
  SessionRequired = 'sessionRequired',
  NotAllowed = 'notAllowed',
}

/**
 * Custom error class for Piko API specific errors.
 */
export class PikoApiError extends Error {
  public readonly statusCode?: number;
  // errorId will store the string received, but we can compare it against PikoErrorCode
  public readonly errorId?: string; 
  public readonly errorString?: string;
  public readonly rawError?: unknown; // Store the original error body if needed

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      errorId?: string;
      errorString?: string;
      cause?: unknown; // Pass the original error cause if available
      rawError?: unknown;
    }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'PikoApiError';
    this.statusCode = options?.statusCode;
    this.errorId = options?.errorId;
    this.errorString = options?.errorString || message; // Fallback to generic message
    this.rawError = options?.rawError;

    // Ensure stack trace is captured correctly
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PikoApiError);
    }
  }
}

/**
 * Authenticates with Piko Cloud API and obtains a general bearer token
 * @param username Piko account username
 * @param password Piko account password
 * @returns Promise resolving to token response object
 * @throws Error with a user-friendly message if authentication fails
 */
export async function getAccessToken(username: string, password: string): Promise<PikoTokenResponse> {
  // Call the helper without a scope for general token
  return _fetchPikoToken(username, password);
}

/**
* Fetches the list of Piko systems available to the authenticated user
* @param accessToken Bearer token from successful authentication
* @returns Promise resolving to array of PikoSystem objects
* @throws Error with a user-friendly message if fetching fails
*/
export async function getSystems(accessToken: string): Promise<PikoSystem[]> {
  console.log('Piko getSystems called with token present:', !!accessToken);

  if (!accessToken) {
    throw new Error('Access token is required to fetch Piko systems');
  }

  try {
    console.log('Preparing to fetch Piko systems from Cloud API');
    
    const response = await fetch(`${PIKO_CLOUD_URL}/cdb/systems`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    console.log('Piko systems fetch response status:', response.status);
    
    if (!response.ok) {
      let errorInfo = 'Failed to fetch systems';
      
      try {
        const errorData = await response.json();
        errorInfo = errorData.error_description || errorData.error || errorInfo;
      } catch (parseError) {
        console.error('Error parsing Piko systems fetch error response:', parseError);
      }
      
      console.error(`Failed to fetch Piko systems: ${errorInfo}`);
      throw new Error(`Failed to fetch Piko systems: ${errorInfo}`);
    }

    const data = await response.json();
    
    if (!data.systems || !Array.isArray(data.systems)) {
      throw new Error('Piko systems response did not contain a valid systems array');
    }

    console.log(`Successfully retrieved ${data.systems.length} Piko systems`);
    
    // Map and return simplified system data
    return data.systems.map((system: PikoSystemRaw) => ({
      id: system.id,
      name: system.name,
      version: system.version,
      health: system.stateOfHealth,
      role: system.accessRole
    }));
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error in Piko getSystems:', error.message);
      throw error; // Re-throw known errors
    }
    
    // Handle network or unexpected errors
    console.error('Unexpected error fetching Piko systems:', error);
    throw new Error('Network error or unexpected issue fetching Piko systems');
  }
}

/**
* Tests the connection to Piko Cloud by authenticating and fetching systems
* @param config The Piko configuration with username and password
* @returns Promise resolving to an object with connection status and optional data
*/
export async function testConnection(config: PikoConfig): Promise<{
  connected: boolean;
  message?: string;
  systems?: PikoSystem[];
  token?: PikoTokenResponse;
}> {
  console.log('Piko testConnection called with username:', config.username);
  
  try {
    // Validate required configuration
    if (!config.username || !config.password) {
      return {
        connected: false,
        message: 'Missing username or password'
      };
    }

    // Step 1: Authenticate and get token
    const tokenResponse = await getAccessToken(config.username, config.password);
    
    // Step 2: Fetch systems to verify token works
    const systems = await getSystems(tokenResponse.accessToken);
    
    return {
      connected: true,
      message: `Successfully connected to Piko Cloud. Found ${systems.length} systems.`,
      systems,
      token: tokenResponse
    };
  } catch (error) {
    console.error('Piko connection test failed:', error);
    
    return {
      connected: false,
      message: error instanceof Error ? error.message : 'Failed to connect to Piko Cloud'
    };
  }
}

/**
* Get a system-scoped access token for Piko Cloud API
* @param username Piko account username
* @param password Piko account password
* @param systemId The ID of the target Piko system
* @returns Promise resolving to system-scoped token response object
* @throws Error with a user-friendly message if authentication fails
*/
export async function getSystemScopedAccessToken(
  username: string, 
  password: string, 
  systemId: string
): Promise<PikoTokenResponse> {
  // Call the helper with the system-specific scope
  const scope = `cloudSystemId=${systemId}`;
  return _fetchPikoToken(username, password, scope);
}

/**
 * Internal helper to construct the base URL for Piko Relay API requests.
 * @param systemId The ID of the Piko system.
 * @returns The base URL string for the relay proxy.
 */
function _getPikoRelayBaseUrl(systemId: string): string {
    if (!systemId) {
        // Add basic check although callers should also validate
        console.warn("Attempted to get Piko relay base URL without systemId");
        throw new Error("System ID is required to construct Piko Relay base URL.");
    }
    return `https://${systemId}.relay.vmsproxy.com`;
}

/**
 * Internal helper to construct the basic RequestInit object for Piko Relay API requests.
 * Includes method and Authorization header.
 * @param systemScopedToken The system-scoped bearer token.
 * @param method The HTTP method.
 * @returns A RequestInit object with method and Authorization header.
 */
function _getPikoRelayRequestOptions(
    systemScopedToken: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET'
): RequestInit {
    if (!systemScopedToken) {
        // Basic check, though callers should ensure token validity
        console.warn("Attempted to get Piko relay request options without token");
        throw new Error("System-scoped token is required for Piko Relay request options.");
    }
    return {
        method: method,
        headers: {
            'Authorization': `Bearer ${systemScopedToken}`,
        },
    };
}

/**
 * Internal helper to validate that required string parameters are provided.
 * Throws an error if any parameter value is falsy (null, undefined, empty string).
 * @param params An object where keys are parameter names and values are the parameter values.
 * @param context A string describing the context (e.g., function name) for the error message.
 * @throws Error if any parameter value is missing.
 */
function _validateRequiredStrings(params: Record<string, string | undefined | null>, context: string) {
    const missing = Object.entries(params)
                         .filter(([, value]) => !value) // Check for falsy values
                         .map(([key]) => key);
    if (missing.length > 0) {
        throw new Error(`Missing required string parameters (${missing.join(', ')}) for ${context}.`);
    }
}

/**
* Fetches data from the Piko Relay URL for a specific system.
* @param systemId The ID of the Piko system.
* @param systemScopedToken The system-scoped bearer token.
* @param path The API path (e.g., '/rest/v3/servers').
* @param queryParams Optional query parameters object.
* @param method Optional HTTP method (default: 'GET').
* @param body Optional request body for POST/PUT requests.
* @returns Promise resolving to the parsed JSON response data.
* @throws Error if the request fails.
*/
async function fetchPikoRelayData(
  systemId: string, 
  systemScopedToken: string,
  path: string,
  queryParams?: Record<string, string>,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: object | null | undefined
): Promise<unknown> {
  // Restore simple combined check for required string params
  if (!systemId || !systemScopedToken || !path) {
     throw new Error('Missing required parameters (System ID, Token, or Path) for fetchPikoRelayData.');
  }

  const baseUrl = _getPikoRelayBaseUrl(systemId);
  const url = new URL(path, baseUrl);
  
  if (queryParams) {
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  console.log(`Preparing Piko Relay JSON request: ${method} ${url.toString()}`);

  try {
    // USE HELPER for base options
    const requestOptions = _getPikoRelayRequestOptions(systemScopedToken, method); 

    // Add JSON specific headers/body if needed
    if (body && (method === 'POST' || method === 'PUT')) { 
      requestOptions.headers = { ...requestOptions.headers, 'Content-Type': 'application/json' };
      requestOptions.body = JSON.stringify(body);
    }

    // console.log(`>>> Making fetch request to: ${url.toString()}`); // <<< REVERTED LOG
    const response = await fetch(url.toString(), requestOptions); 

    console.log(`Piko Relay fetch response status (${path}):`, response.status);

    if (!response.ok) {
      const errorInfo: { message: string, errorId?: string, errorString?: string, raw?: unknown } = {
          message: `Failed ${method} request to ${path} (Status: ${response.status})`
      };
      try {
        const errorData = await response.json();
        // Attempt to extract Piko-specific error details
        errorInfo.errorId = errorData.errorId; // e.g., "missingParameter"
        errorInfo.errorString = errorData.errorString; // e.g., "Missing required parameter: ..."
        errorInfo.message = errorData.errorString || errorData.message || errorInfo.message; // Prefer specific errorString
        errorInfo.raw = errorData;
      } catch (parseError) {
        console.warn(`Could not parse JSON error response from Piko Relay (${path}):`, parseError);
        // Try reading as text for non-JSON errors
        try {
            const errorText = await response.text();
            if (errorText && errorText.length < 200) {
                errorInfo.message += `: ${errorText.substring(0, 100)}`;
            }
        } catch (textError) {
            console.warn(`Could not read text error response either for ${path}:`, textError);
        }
      }
      // Throw the custom error
      throw new PikoApiError(errorInfo.message, {
          statusCode: response.status,
          errorId: errorInfo.errorId,
          errorString: errorInfo.errorString,
          rawError: errorInfo.raw
      });
    }

    if (response.status === 204) {
      console.log(`Successfully executed Piko Relay request (${method} ${path}) - No Content`);
      return null;
    }

    const data = await response.json();
    console.log(`Successfully executed Piko Relay request (${method} ${path})`);
    return data;

  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error in fetchPikoRelayData (${path}):`, error.message);
      throw error; // Re-throw known errors (like PikoApiError or network errors)
    }
    console.error(`Unexpected error during Piko Relay fetch (${path}):`, error);
    throw new Error(`Network error or unexpected issue connecting to Piko Relay (${path})`); // Keep generic for true network issues
  }
}

/**
* Fetches the list of Servers for a specific Piko system.
* @param systemId The ID of the Piko system.
* @param systemScopedToken The system-scoped bearer token.
* @returns Promise resolving to array of PikoServerRaw objects.
*/
export async function getSystemServers(
  systemId: string, 
  systemScopedToken: string
): Promise<PikoServerRaw[]> {
  const data = await fetchPikoRelayData(systemId, systemScopedToken, '/rest/v3/servers', {
    '_with': 'id,name,osInfo,parameters.systemRuntime,parameters.physicalMemory,parameters.timeZoneInformation,status,storages,url,version'
  });
  
  if (!Array.isArray(data)) {
     throw new Error('Piko servers response was not a valid array');
  }
  return data as PikoServerRaw[];
}

/**
* Fetches the list of Devices for a specific Piko system.
* @param systemId The ID of the Piko system.
* @param systemScopedToken The system-scoped bearer token.
* @returns Promise resolving to array of PikoDeviceRaw objects.
*/
export async function getSystemDevices(
  systemId: string, 
  systemScopedToken: string
): Promise<PikoDeviceRaw[]> {
  const data = await fetchPikoRelayData(systemId, systemScopedToken, '/rest/v3/devices/', {
    '_with': 'id,deviceType,mac,model,name,serverId,status,url,vendor'
  });
  
  if (!Array.isArray(data)) {
     throw new Error('Piko devices response was not a valid array');
  }
  return data as PikoDeviceRaw[];
}

/**
* Fetches details for a specific Device in a Piko system, including media streams.
* @param systemId The ID of the Piko system.
* @param systemScopedToken The system-scoped bearer token.
* @param deviceId The GUID of the specific device.
* @returns Promise resolving to a PikoDeviceRaw object or null if not found.
* @throws Error if the request fails or the response is invalid.
*/
export async function getSystemDeviceById(
  systemId: string,
  systemScopedToken: string,
  deviceId: string
): Promise<PikoDeviceRaw | null> {
  if (!deviceId) {
    throw new Error("Device ID is required to fetch specific device details.");
  }

  const path = `/rest/v3/devices/${deviceId}`;
  try {
    const data = await fetchPikoRelayData(systemId, systemScopedToken, path, {
      '_with': 'id,deviceType,mac,model,name,serverId,status,url,vendor,mediaStreams'
    });

    // Check if the response is an object (expected for single device)
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      return data as PikoDeviceRaw;
    } else {
      // Unexpected response format (e.g., array or non-object)
      console.warn(`Unexpected response format fetching device ${deviceId}. Expected object, got:`, data);
      // If Piko returns a 404, fetchPikoRelayData should throw PikoApiError
      // If it's another unexpected format, return null or throw
      // Returning null is perhaps safer if the API contract isn't perfectly known
      return null;
    }
  } catch (error) {
    // Specifically handle 404 Not Found errors from the API
    if (error instanceof PikoApiError && error.statusCode === 404) {
      console.log(`Device with ID ${deviceId} not found in system ${systemId}.`);
      return null; // Return null if the device specifically wasn't found
    }
    // Re-throw other errors (network, auth, unexpected API errors)
    console.error(`Error fetching device ${deviceId}:`, error);
    throw error;
  }
}

/**
 * Interface for the Piko Login Ticket response.
 */
interface PikoLoginTicketResponse {
  id: string;
  username: string;
  token: string;
  ageS: number;
  expiresInS: number;
}

/**
 * Creates a short-lived login ticket for authenticating a single request via query parameter.
 * Requires the serverId associated with the camera.
 * @param systemId The ID of the Piko system.
 * @param systemScopedToken The system-scoped bearer token for authentication.
 * @param serverId The ID of the Piko server hosting the camera.
 * @returns Promise resolving to the ticket token string.
 * @throws PikoApiError if the request fails.
 * @see {@link https://meta.nxvms.com/doc/developers/api-tool/rest-v3-login-tickets-post}
 */
export async function createPikoLoginTicket(
  systemId: string,
  systemScopedToken: string,
  serverId: string
): Promise<string> {
  if (!systemId || !systemScopedToken || !serverId) {
    throw new Error('Missing required parameters (System ID, Token, or Server ID) for createPikoLoginTicket.');
  }

  const path = '/rest/v3/login/tickets';
  const baseUrl = _getPikoRelayBaseUrl(systemId);
  const url = new URL(path, baseUrl);
  const method = 'POST';

  try {
    // Base options include Authorization
    const requestOptions = _getPikoRelayRequestOptions(systemScopedToken, method);
    // Add specific headers for this request
    requestOptions.headers = {
      ...requestOptions.headers,
      'X-Server-Guid': serverId,
      'Content-Type': 'application/json', // Sending empty body, but API might expect header
      'Accept': 'application/json'
    };
    // No body needed for this POST request
    requestOptions.body = undefined; 

    const response = await fetch(url.toString(), requestOptions);

    const data = await response.json() as PikoLoginTicketResponse;

    if (!data || !data.token) {
        console.error('Piko Create Ticket response missing token.', data);
        throw new Error('Piko Create Ticket response did not contain a token.');
    }

    return data.token;

  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error during createPikoLoginTicket (${path}):`, error.message);
      throw error; // Re-throw known errors
    }
    console.error(`Unexpected error during createPikoLoginTicket (${path}):`, error);
    throw new Error(`Unexpected error occurred while creating Piko login ticket`);
  }
}

/**
 * Internal helper to fetch Piko access token (either general or system-scoped)
 * @param username Piko account username
 * @param password Piko account password
 * @param scope Optional scope string (e.g., 'cloudSystemId=...')
 * @returns Promise resolving to token response object
 * @throws Error if authentication fails
 */
async function _fetchPikoToken(
  username: string, 
  password: string, 
  scope?: string
): Promise<PikoTokenResponse> { // Can return either general or scoped type
  console.log(`_fetchPikoToken called for username: ${username}, with scope: ${scope || 'general'}`);

  if (!username || !password) {
    throw new Error('Username and password are required');
  }

  const requestBody: Record<string, string | undefined> = {
    grant_type: 'password',
    response_type: 'token',
    client_id: '3rdParty',
    username,
    password,
  };

  if (scope) {
    requestBody.scope = scope;
  }

  try {
    const response = await fetch(`${PIKO_CLOUD_URL}/cdb/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
 
    if (!response.ok) {
      const errorInfo: { message: string, errorId?: string, errorString?: string, raw?: unknown } = {
          message: `Authentication failed (Status: ${response.status})`
      };
      try {
        const errorData = await response.json();
        // Auth errors might use 'error' and 'error_description'
        errorInfo.errorId = errorData.errorId || errorData.error; // Use errorId if present, fallback to error
        errorInfo.errorString = errorData.errorString || errorData.error_description;
        errorInfo.message = errorInfo.errorString || errorInfo.message;
        errorInfo.raw = errorData;
      } catch (parseError) {
        console.error(`Error parsing Piko auth error response (scope: ${scope || 'general'}):`, parseError);
        // Try reading as text for non-JSON errors
        try {
            const errorText = await response.text();
             if (errorText && errorText.length < 200) {
                errorInfo.message += `: ${errorText.substring(0, 100)}`;
            }
        } catch (textError) {
             console.warn(`Could not read text error response either for auth:`, textError);
        }
      }
      // Throw the custom error
      throw new PikoApiError(errorInfo.message, {
          statusCode: response.status,
          errorId: errorInfo.errorId,
          errorString: errorInfo.errorString,
          rawError: errorInfo.raw
      });
    }

    const data = await response.json();
    
    if (!data.access_token) {
      // This case indicates a successful status code but missing token - unusual.
      console.error('Piko auth response OK but missing access_token');
      throw new PikoApiError('Authentication response missing access token despite OK status.', { statusCode: response.status });
    }

    console.log(`Successfully authenticated with Piko (scope: ${scope || 'general'}). Token received.`);
    
    // Return token data in camelCase format
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope || '' // Ensure scope is always present
    };
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error in Piko _fetchPikoToken (scope: ${scope || 'general'}):`, error.message);
      throw error; // Re-throw known errors (PikoApiError, network errors)
    }
    
    // Handle network or unexpected errors
    console.error(`Unexpected error during Piko authentication (scope: ${scope || 'general'}):`, error);
    throw new Error('Network error or unexpected issue connecting to Piko Cloud for token'); // Keep generic for true network issues
  }
}

/**
 * Interface for the Piko createEvent API request body.
 */
export interface PikoCreateEventPayload {
  source: string;
  caption: string;
  description: string;
  timestamp: string; // ISO 8601 format: "YYYY-MM-DDTHH:mm:ss"
  metadata?: {
    cameraRefs?: string[]; // Array of camera GUIDs (usually just one)
    [key: string]: unknown; // Changed any to unknown
  };
}

/**
 * Interface for the expected success response from Piko createEvent API.
 */
export interface PikoCreateEventResponse {
  error?: string | number; // Should be "0" or 0 on success
  errorId?: string;
  errorString?: string;
  // The API might return other fields, but we only care about error status
}

/**
 * Creates an event in a specific Piko system using the Relay API.
 * @param systemId The ID of the Piko system.
 * @param systemScopedToken The system-scoped bearer token.
 * @param payload The event data to send.
 * @returns Promise resolving to the parsed JSON response from the Piko API.
 * @throws Error if the request fails or the API returns an error.
 */
export async function createPikoEvent(
  systemId: string,
  systemScopedToken: string,
  payload: PikoCreateEventPayload
): Promise<PikoCreateEventResponse> {
  console.log(`createPikoEvent called for system: ${systemId}, source: ${payload.source}`);

  const responseData = await fetchPikoRelayData(
    systemId,
    systemScopedToken,
    '/api/createEvent', // The specific API path
    undefined, // No query parameters
    'POST', // HTTP method
    payload // The request body
  );

  // Basic validation of the response structure for success
  const result = responseData as PikoCreateEventResponse;
  if (result?.error && String(result.error) !== '0') {
    // This endpoint returns errors in a different structure within the JSON body even on 200 OK
    const errorMessage = `Piko createEvent API returned error: ${result.errorString || 'Unknown error'} (Code: ${result.error})`;
    console.error(errorMessage, result);
    // Throw PikoApiError using the details from the success response body
    throw new PikoApiError(errorMessage, {
        errorId: result.errorId,
        errorString: result.errorString,
        rawError: result // Keep the whole response as raw error info
        // statusCode is likely 200 here, so maybe don't set it? Or set it to indicate the source.
    });
  }

  console.log(`Successfully created Piko event for system: ${systemId}, source: ${payload.source}`);
  return result;
}

/**
 * Interface for the Piko createBookmark API request body.
 */
export interface PikoCreateBookmarkPayload {
  name: string;
  description?: string; // Description is optional according to some API examples
  startTimeMs: number; // Epoch timestamp in milliseconds
  durationMs: number;
  tags?: string[]; // Array of tags
}

// No specific response interface defined for createBookmark as success is usually 200 OK with no body or a simple confirmation.
// We'll rely on fetchPikoRelayData to throw errors on non-ok statuses.

/**
 * Creates a bookmark for a specific camera in a Piko system using the Relay API.
 * @param systemId The ID of the Piko system.
 * @param systemScopedToken The system-scoped bearer token.
 * @param pikoCameraDeviceId The external Device ID (GUID) of the Piko camera.
 * @param payload The bookmark data to send.
 * @returns Promise resolving when the bookmark is successfully created.
 * @throws Error if the request fails.
 */
export async function createPikoBookmark(
  systemId: string,
  systemScopedToken: string,
  pikoCameraDeviceId: string,
  payload: PikoCreateBookmarkPayload
): Promise<void> { // Returns void on success
  console.log(`createPikoBookmark called for system: ${systemId}, camera: ${pikoCameraDeviceId}, name: ${payload.name}`);

  if (!pikoCameraDeviceId) {
      throw new Error('Piko Camera Device ID is required to create a bookmark.');
  }

  const apiPath = `/rest/v3/devices/${pikoCameraDeviceId}/bookmarks`;

  // fetchPikoRelayData will handle JSON parsing and error throwing for non-OK responses
  await fetchPikoRelayData(
    systemId,
    systemScopedToken,
    apiPath,
    undefined, // No query parameters
    'POST',    // HTTP method
    payload    // The request body
  );

  // If fetchPikoRelayData does not throw, the request was successful (e.g., 200 OK, 201 Created, or 204 No Content)
  console.log(`Successfully created Piko bookmark for camera: ${pikoCameraDeviceId} in system: ${systemId}`);
}

/**
 * Fetches the "best shot" thumbnail image for a given analytics object track as a Blob.
 * Leverages common setup logic but handles image-specific response.
 * 
 * @param systemId The ID of the Piko system.
 * @param systemScopedToken The system-scoped bearer token.
 * @param objectTrackId The ID of the analytics object track.
 * @param cameraId The GUID of the camera associated with the event.
 * @returns Promise resolving to the image Blob.
 * @throws Error if the request fails, the response is not an image, or data cannot be read.
 */
export async function getPikoBestShotImageBlob(
  systemId: string,
  systemScopedToken: string,
  objectTrackId: string,
  cameraId: string
): Promise<Blob> {
  // Restore simple combined check for required string params
  if (!systemId || !systemScopedToken || !objectTrackId || !cameraId) {
    throw new Error('Missing required parameters (System ID, Token, Object Track ID, or Camera ID) for getPikoBestShotImageBlob.');
  }

  // --- Common Setup Start --- 
  const path = '/ec2/analyticsTrackBestShot'; 
  const baseUrl = _getPikoRelayBaseUrl(systemId); // USE HELPER
  const url = new URL(path, baseUrl); // Construct URL object
  
  // Add specific query params for this endpoint
  url.searchParams.append('objectTrackId', objectTrackId);
  url.searchParams.append('cameraId', cameraId);
  
  const method = 'GET'; // Specific method

  console.log(`Preparing Piko Best Shot request: ${method} ${url.toString()}`);

  try {
    // USE HELPER for base options (method is 'GET' here)
    const requestOptions = _getPikoRelayRequestOptions(systemScopedToken, method); 
    // No extra headers/body needed for this GET request

    const response = await fetch(url.toString(), requestOptions); 

    console.log(`Piko Best Shot response status: ${response.status}`); // Log specific type

    // --- Image Specific Error/Response Handling ---
    if (!response.ok) {
      const errorInfo: { message: string, errorId?: string, errorString?: string, raw?: unknown } = {
        message: `Failed ${method} request to ${path} (Status: ${response.status})`
      };
      try {
        // Attempt to get text, might not be JSON for image endpoint errors
        const errorText = await response.text();
        // Check if it looks like a Piko JSON error structure despite content-type
        try {
            const errorData = JSON.parse(errorText);
             errorInfo.errorId = errorData.errorId;
             errorInfo.errorString = errorData.errorString;
             errorInfo.message = errorData.errorString || errorData.message || errorInfo.message;
             errorInfo.raw = errorData;
        } catch(jsonParseError) {
             // If not JSON, use the text directly
             if (errorText && errorText.length < 200) { 
                errorInfo.message += `: ${errorText.substring(0,100)}`;
             }
             errorInfo.raw = errorText; // Store raw text
        }
      } catch (readError) {
        console.warn(`Could not read error response body for ${method} ${path}:`, readError);
      }
      // Throw custom error
       throw new PikoApiError(errorInfo.message, {
          statusCode: response.status,
          errorId: errorInfo.errorId,
          errorString: errorInfo.errorString,
          rawError: errorInfo.raw
      });
    }

    // Validate Content Type specifically for image
    const contentType = response.headers.get('Content-Type');
    if (!contentType || !contentType.startsWith('image/')) {
      console.error(`Piko Best Shot response was not an image. Content-Type: ${contentType}`);
      let responseText = '';
      try { responseText = await response.text(); } catch {} // Try reading text if not image
      throw new Error(`Expected an image response from Best Shot API, but received ${contentType || 'unknown content type'}. ${responseText ? 'Response Text: ' + responseText.substring(0, 100) : ''}`);
    }

    // Process and return Blob
    try {
      const blob = await response.blob();
      console.log(`Successfully retrieved Piko Best Shot image blob (Type: ${blob.type}, Size: ${blob.size}) for track ${objectTrackId}`);
      return blob;
    } catch (e) {
      console.error(`Failed to read blob data from Piko Best Shot response for track ${objectTrackId}:`, e);
      throw new Error(`Failed to read image data from Piko Best Shot API response`);
    }

  } catch (error) { // Common catch block pattern
    if (error instanceof Error) {
      console.error(`Error during getPikoBestShotImageBlob (${path}):`, error.message);
      throw error; 
    }
    console.error(`Unexpected error during getPikoBestShotImageBlob (${path}):`, error);
    throw new Error(`Unexpected error occurred while fetching Piko Best Shot image`); // Generic for network/unexpected
  }
}

// --- WebSocket Event Subscription Interfaces ---

/**
 * Parameters for the JSON-RPC event subscription request.
 */
export interface PikoJsonRpcSubscribeParams {
    startTimeMs: number; // Typically Date.now()
    eventType: ("analyticsSdkEvent" | "analyticsSdkObjectDetected")[]; // Only allow array of known event types
    eventsOnly: boolean; // Set to true
    _with: "eventParams"; // Include detailed event parameters
    // Potential future params: serverId, deviceId, etc.
}

/**
 * JSON-RPC request format for subscribing to events.
 */
export interface PikoJsonRpcSubscribeRequest {
    jsonrpc: "2.0";
    id: string; // Unique connection/request ID (e.g., crypto.randomUUID())
    method: "rest.v3.servers.events.subscribe";
    params: PikoJsonRpcSubscribeParams;
}

/**
 * Detailed parameters received within an event update message.
 * Based on the 'analyticsSdkEvent' example.
 */
export interface PikoJsonRpcEventParams {
    analyticsEngineId?: string; // GUID "{...}"
    caption?: string; // e.g., "Loitering - Person - Area 1"
    description?: string; // e.g., "Start", "Stop"
    eventResourceId?: string; // GUID "{...}" - Often the Camera ID
    eventTimestampUsec?: string; // Timestamp as string "..."
    eventType?: string; // e.g., "analyticsSdkEvent"
    inputPortId?: string; // e.g., "cvedia.rt.loitering"
    key?: string; // Unique event instance key, e.g., "loitering-..."
    metadata?: {
        allUsers?: boolean;
        level?: string;
        [key: string]: unknown; // Allow other metadata fields
    };
    objectTrackId?: string; // GUID "{...}"
    omitDbLogging?: boolean;
    progress?: number;
    reasonCode?: string;
    sourceServerId?: string; // GUID "{...}"
    // Other potential fields based on event type
    [key: string]: unknown;
}

/**
 * JSON-RPC message format for incoming event updates via WebSocket.
 */
export interface PikoJsonRpcEventUpdateMessage {
    jsonrpc: "2.0";
    method: "rest.v3.servers.events.update";
    params?: {
        eventParams?: PikoJsonRpcEventParams; // The core event data
        // Potentially other params fields exist
        [key: string]: unknown;
    };
    // No 'id' field expected for notifications
}

/**
 * Initiates a media stream request for a specific camera and timestamp.
 * IMPORTANT: This function returns the raw Response object. The caller is responsible
 * for handling the media stream (e.g., reading the body as a ReadableStream).
 *
 * @param systemId The ID of the Piko system.
 * @param systemScopedToken The system-scoped bearer token.
 * @param cameraId The GUID of the camera device.
 * @param positionMs The starting position for the media stream in epoch milliseconds.
 * @param format Optional container format (e.g., 'webm'). If provided, appends '.<format>' to the path.
 * @param ticket Optional login ticket for query parameter authentication.
 * @param serverId Optional server ID, required if using ticket authentication.
 * @returns Promise resolving to the raw Fetch Response object containing the media stream.
 * @throws Error if the request fails or required parameters are missing.
 */
export async function getPikoMediaStream(
  systemId: string,
  systemScopedToken: string | undefined, // Can be undefined if ticket is used
  cameraId: string,
  positionMs: number, // Using number for timestamp
  format?: string, // Optional format parameter
  ticket?: string, // Optional ticket parameter
  serverId?: string // Optional serverId, needed for ticket auth request header
): Promise<Response> { // Returns the raw Response object
  // Validate required parameters - allow systemScopedToken to be undefined IF ticket is present
  // If ticket is present, serverId MUST also be present for the header
  if (
    !systemId ||
    (!systemScopedToken && !ticket) || 
    (ticket && !serverId) || // Added check: if ticket, need serverId
    !cameraId || 
    positionMs === undefined || positionMs === null
  ) {
    throw new Error('Missing required parameters (System ID, (Token OR Ticket+ServerID), Camera ID, or Position) for getPikoMediaStream.');
  }
  if (systemScopedToken && ticket) {
    // Log warning but proceed (using ticket)
    console.warn('getPikoMediaStream received both token and ticket, preferring ticket authentication.');
  }

  // Construct path, conditionally appending format
  let path = `/rest/v3/devices/${cameraId}/media`;
  if (format && format.trim() !== '') {
    path += `.${format.trim()}`; // Append .webm, .mkv etc.
  }

  // Construct URL using helpers
  const baseUrl = _getPikoRelayBaseUrl(systemId);
  const url = new URL(path, baseUrl);
  url.searchParams.append('positionMs', String(positionMs)); // Convert number to string for query param

  // --- Conditional Authentication --- 
  let requestOptions: RequestInit;
  if (ticket) {
    if (!serverId) { 
        // This check is technically redundant due to the initial validation, but belts and suspenders
        throw new Error('Server ID is required when using ticket authentication for getPikoMediaStream.');
    }
    url.searchParams.append('_ticket', ticket);
    requestOptions = {
        method: 'GET',
        headers: {
            'X-Server-Guid': serverId
        }
    };
  } else {
    // Use Bearer token authentication
    requestOptions = _getPikoRelayRequestOptions(systemScopedToken!, 'GET'); // Non-null assertion ok due to initial check
  }
  // --- End Conditional Authentication --- 

  try {
    // Make the fetch request using the prepared options
    const response = await fetch(url.toString(), requestOptions);

    if (!response.ok) {
      const errorInfo: { message: string, errorId?: string, errorString?: string, raw?: unknown } = {
        message: `Failed GET request to ${path} (Status: ${response.status})`
      };
      try {
        const errorText = await response.text();
         try {
            const errorData = JSON.parse(errorText);
             errorInfo.errorId = errorData.errorId;
             errorInfo.errorString = errorData.errorString;
             errorInfo.message = errorData.errorString || errorData.message || errorInfo.message;
             errorInfo.raw = errorData;
        } catch(jsonParseError) {
             if (errorText && errorText.length < 200) {
                errorInfo.message += `: ${errorText.substring(0,100)}`;
             }
             errorInfo.raw = errorText; 
        }
      } catch (readError) {
        console.warn(`Could not read error response body for GET ${path}:`, readError);
      }
      // Throw the custom error
       throw new PikoApiError(errorInfo.message, {
          statusCode: response.status,
          errorId: errorInfo.errorId,
          errorString: errorInfo.errorString,
          rawError: errorInfo.raw
      });
    }

    // Return the raw response object on success
    console.log(`Successfully initiated Piko Media Stream request for camera ${cameraId} at timestamp ${positionMs}`);
    return response;

  } catch (error) {
    // Handle fetch errors or errors thrown above
    if (error instanceof Error) {
      console.error(`Error during getPikoMediaStream (${path}):`, error.message);
      throw error;
    }
    console.error(`Unexpected error during getPikoMediaStream (${path}):`, error);
    throw new Error(`Unexpected error occurred while initiating Piko Media Stream`); // Generic for network/unexpected
  }
}

/**
 * Initiates an HLS media stream request for a specific camera.
 * Returns the raw Response object containing the M3U8 playlist.
 *
 *
 * @param systemId The ID of the Piko system.
 * @param systemScopedToken The system-scoped bearer token.
 * @param cameraId The GUID of the camera device.
 * @returns Promise resolving to the raw Fetch Response object containing the M3U8 playlist.
 * @throws Error if the request fails or required parameters are missing.
 * @see {@link https://meta.nxvms.com/doc/developers/api-tool/hls-deviceidm3u-get}
 */
export async function getPikoHlsStream(
  systemId: string,
  systemScopedToken: string,
  cameraId: string
): Promise<Response> { // Returns the raw Response object
  // Validate required parameters
  if (!systemId || !systemScopedToken || !cameraId) {
    throw new Error('Missing required parameters (System ID, Token, or Camera ID) for getPikoHlsStream.');
  }

  // Construct URL using helpers
  // The URL format is slightly different from other REST calls - it doesn't use /rest/vX
  const path = `/hls/${cameraId}.m3u8`; // Using .m3u8 extension is common for HLS playlists
  const baseUrl = _getPikoRelayBaseUrl(systemId);
  const url = new URL(path, baseUrl);

  const method = 'GET';

  try {
    // Get base request options
    const requestOptions = _getPikoRelayRequestOptions(systemScopedToken, method);
    // Add Accept and User-Agent headers
    requestOptions.headers = {
       ...requestOptions.headers,
       'Accept': '*/*',
       'User-Agent': 'FusionBridge/1.0' // Add a generic User-Agent
     };
    // HLS might require specific Accept headers, but let's start with */*
    // requestOptions.headers = { ...requestOptions.headers, 'Accept': 'application/vnd.apple.mpegurl, */*' };

    // Make the fetch request
    const response = await fetch(url.toString(), requestOptions);

    if (!response.ok) {
      const errorInfo: { message: string, errorId?: string, errorString?: string, raw?: unknown } = {
        message: `Failed ${method} request to ${path} (Status: ${response.status})`
      };
      try {
        // HLS errors might return text or potentially JSON (less likely for M3U8 endpoint)
        const errorText = await response.text();
         try {
            const errorData = JSON.parse(errorText);
             errorInfo.errorId = errorData.errorId;
             errorInfo.errorString = errorData.errorString;
             errorInfo.message = errorData.errorString || errorData.message || errorInfo.message;
             errorInfo.raw = errorData;
        } catch(jsonParseError) {
            // If not JSON, use the text directly
             if (errorText && errorText.length < 200) {
                errorInfo.message += `: ${errorText.substring(0,100)}`;
             }
             errorInfo.raw = errorText; // Store raw text
        }
      } catch (readError) {
        console.warn(`Could not read error response body for ${method} ${path}:`, readError);
      }
      // Throw custom error
       throw new PikoApiError(errorInfo.message, {
          statusCode: response.status,
          errorId: errorInfo.errorId,
          errorString: errorInfo.errorString,
          rawError: errorInfo.raw
      });
    }

    // Check Content-Type (should be something like 'application/vnd.apple.mpegurl' or 'audio/mpegurl')
    const contentType = response.headers.get('Content-Type');
    if (!contentType || (!contentType.includes('mpegurl') && !contentType.includes('x-mpegurl'))) {
        console.warn(`Piko HLS Stream response has unexpected Content-Type: ${contentType}. Proceeding anyway.`);
        // Don't throw error, but log warning. The browser might still handle it.
    }

    // Return the raw response object on success
    console.log(`Successfully initiated Piko HLS Stream request for camera ${cameraId}`);
    return response;

  } catch (error) {
    // Handle fetch errors or errors thrown above
    if (error instanceof Error) {
      console.error(`Error during getPikoHlsStream (${path}):`, error.message);
      throw error;
    }
    console.error(`Unexpected error during getPikoHlsStream (${path}):`, error);
    throw new Error(`Unexpected error occurred while initiating Piko HLS Stream`); // Generic for network/unexpected
  }
}