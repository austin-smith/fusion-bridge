import { Readable } from 'stream';

// Base URL for Piko Cloud API
const PIKO_CLOUD_URL = 'https://cloud.pikovms.com';

// Configuration interface for Piko accounts
export interface PikoConfig {
  type: 'cloud' | 'local'; // Allow local connection
  username: string;
  password: string;
  host?: string; // Add host for local
  port?: number; // Add port for local
  ignoreTlsErrors?: boolean; // Add option to ignore TLS errors for local
  selectedSystem?: string; // ID of the selected Piko system
  token?: {
    accessToken: string;
    refreshToken?: string; // Optional as local doesn't have refresh
    expiresAt?: string; // Optional as local uses expiresInS
    expiresIn?: number | string; // Allow number for local expiresInS
    sessionId?: string; // Add session ID for local
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
  accessToken: string;      // Maps to access_token (cloud) or token (local)
  refreshToken?: string;     // Only for cloud
  expiresAt?: string;        // Only for cloud (ISO string)
  expiresIn?: string | number; // Cloud (string seconds), Local (number seconds)
  tokenType?: string;        // Cloud ("Bearer")
  scope?: string;            // Cloud
  sessionId?: string;        // Local (maps to "id")
}

// Interface for local token response structure
interface PikoLocalTokenData {
  token: string;
  expiresInS: number;
  id: string; // Session ID
  username: string;
  ageS: number;
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

// Load https module conditionally
let https: typeof import('https') | undefined;
try {
    https = require('https');
} catch (e) {
    console.warn("Could not import https module. TLS verification cannot be disabled.");
}

/**
 * Authenticates with Piko Cloud API and obtains a general bearer token
 * @param username Piko account username
 * @param password Piko account password
 * @returns Promise resolving to token response object
 * @throws Error with a user-friendly message if authentication fails
 */
export async function getAccessToken(username: string, password: string): Promise<PikoTokenResponse> {
  return _fetchPikoCloudToken(username, password);
}

/**
* Fetches the list of Piko systems available to the authenticated user
* @param accessToken Bearer token from successful authentication
* @returns Promise resolving to array of PikoSystem objects
* @throws Error with a user-friendly message if fetching fails
*/
export async function getSystems(accessToken: string): Promise<PikoSystem[]> {
  // Cloud only, uses fetch internally via _makePikoRequest
  const data = await _makePikoRequest(
    { type: 'cloud', username: '', password: '', selectedSystem: 'placeholder' }, // Config only needs type=cloud
    accessToken, // Token is needed for auth header
    `/cdb/systems`, 
    'GET', 
    undefined, // queryParams
    undefined, // body
    { 'Authorization': `Bearer ${accessToken}` }, // Pass header explicitly for this non-standard endpoint
    'json'
  );

  if (!data || !data.systems || !Array.isArray(data.systems)) {
    throw new PikoApiError('Piko systems response did not contain a valid systems array', { rawError: data });
  }
  return data.systems.map((system: PikoSystemRaw) => ({
      id: system.id,
      name: system.name,
      version: system.version,
      health: system.stateOfHealth,
      role: system.accessRole
  }));
}

/**
* Tests the connection to Piko Cloud by authenticating and fetching systems
* OR tests the connection to a Piko Local system by authenticating.
* @param config The Piko configuration (cloud or local)
* @returns Promise resolving to an object with connection status and optional data
*/
export async function testConnection(config: PikoConfig): Promise<{
  connected: boolean;
  message?: string;
  systems?: PikoSystem[]; // Only populated for cloud
  token?: PikoTokenResponse; // Contains relevant token info
}> {
  console.log(`Piko testConnection called for type: ${config.type} with username: ${config.username}`);
   
  try {
    // Validate required configuration
    if (!config.username || !config.password) {
      return {
        connected: false,
        message: 'Missing username or password'
      };
    }

    if (config.type === 'cloud') {
        // --- Cloud Connection Test --- 
        // Step 1: Authenticate and get token
        const tokenResponse = await _fetchPikoCloudToken(config.username, config.password);
        
        // Step 2: Fetch systems to verify token works
        const systems = await getSystems(tokenResponse.accessToken);
        
        return {
          connected: true,
          message: `Successfully connected to Piko Cloud. Found ${systems.length} systems.`,
          systems,
          token: tokenResponse
        };
    } else {
        // --- Local Connection Test --- 
        if (!config.host || !config.port) {
            return {
                connected: false,
                message: 'Missing host or port for local connection test'
            };
        }
        // Explicit type assertion needed
        const tokenResponse = await _fetchPikoLocalToken(config as PikoConfig & { type: 'local' });

        // TODO: Optionally make a test API call to verify token works (e.g., fetch servers)

        return {
            connected: true,
            message: `Successfully authenticated with Piko at ${config.host}:${config.port}.`,
            systems: [], // No systems list for local
            token: tokenResponse
        };
    }
  } catch (error) {
    console.error('Piko connection test failed:', error);
 
    return {
      connected: false,
      message: error instanceof Error ? error.message : `Failed to connect to Piko ${config.type}`
    };
  }
}

/**
* Tests the connection to a LOCAL Piko instance and returns token info.
* (This is the function called by the API route handler)
* @param config The Piko configuration (must be type='local')
* @returns Promise resolving to connection status and token
*/
export async function testLocalPikoConnection(config: PikoConfig): Promise<{
  connected: boolean;
  message?: string;
  token?: PikoTokenResponse;
}> {
    if (config.type !== 'local') {
        throw new Error('testLocalPikoConnection called with non-local config type.');
    }
    if (!config.host || !config.port || !config.username || !config.password) {
        return {
            connected: false,
            message: 'Missing required parameters (host, port, username, or password) for local connection test.'
        };
    }

    console.log(`testLocalPikoConnection called for ${config.host}:${config.port}`);

    try {
        // Explicit type assertion (safer even with signature check)
        const tokenResponse = await _fetchPikoLocalToken(config as PikoConfig & { type: 'local' });

        // Optionally perform a lightweight API call here to further verify connection/token
        // Example: await fetchPikoApiData(config, tokenResponse.accessToken, '/rest/v3/servers', { limit: '1' });
        // If the above call fails, it will throw, caught below.

        return {
            connected: true,
            message: `Successfully authenticated with Piko at ${config.host}:${config.port}.`,
            token: tokenResponse
        };
    } catch (error) {
        console.error(`Local Piko connection test failed for ${config.host}:${config.port}:`, error);
        // Use PikoApiError details if available
        const message = (error instanceof PikoApiError && error.errorString)
                       ? error.errorString 
                       : (error instanceof Error ? error.message : 'Failed to connect to local Piko');
        return {
            connected: false,
            message: message
            // No token on failure
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
  const scope = `cloudSystemId=${systemId}`;
  return _fetchPikoCloudToken(username, password, scope);
}

/**
 * Internal helper to construct the base URL for Piko API requests (Cloud or Local).
 * @param config The Piko connector configuration.
 * @returns The base URL string.
 * @throws Error if required config fields are missing for the type.
 */
function _getPikoApiBaseUrl(config: PikoConfig): string {
    if (config.type === 'cloud') {
        if (!config.selectedSystem) {
            console.error("Attempted to get Piko cloud API base URL without selectedSystem.");
            throw new PikoApiError("System ID is required for Piko Cloud API base URL.", { errorId: PikoErrorCode.MissingParameter });
        }
        return `https://${config.selectedSystem}.relay.vmsproxy.com`;
    } else if (config.type === 'local') {
        if (!config.host || !config.port) {
            console.error("Attempted to get Piko local API base URL without host or port.");
            throw new PikoApiError("Host and Port are required for Piko Local API base URL.", { errorId: PikoErrorCode.MissingParameter });
        }
        return `https://${config.host}:${config.port}`; 
    } else {
        throw new PikoApiError(`Unsupported Piko config type: ${(config as any).type}`, { errorId: PikoErrorCode.InvalidParameter });
    }
}

/**
 * Base Request options (Authorization header)
 * @param accessToken The bearer token
 * @returns Record<string, string> containing Authorization header
 */
function _getPikoBaseHeaders(accessToken?: string): Record<string, string> {
    return accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {};
}

/**
 * Internal helper to construct the basic RequestInit object for Piko API requests.
 * Includes method and Authorization header.
 * @param accessToken The bearer token (cloud or local).
 * @param method The HTTP method.
 * @returns A RequestInit object with method and Authorization header.
 */
function _getPikoRequestOptions(
    accessToken: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET'
): RequestInit {
    if (!accessToken) {
        console.warn("Attempted to get Piko request options without access token.");
        throw new Error("Access token is required for Piko API request options.");
    }
    return {
        method: method,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
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
* Fetches data from the appropriate Piko API endpoint (Cloud Relay or Local).
* @param config The Piko connector configuration (determines endpoint).
* @param accessToken The bearer token (cloud or local).
* @param path The API path (e.g., '/rest/v3/servers').
* @param queryParams Optional query parameters object.
* @param method Optional HTTP method (default: 'GET').
* @param body Optional request body for POST/PUT requests.
* @returns Promise resolving to the parsed JSON response data.
* @throws PikoApiError if the request fails.
*/
async function fetchPikoApiData(
  config: PikoConfig,
  accessToken: string,
  path: string,
  queryParams?: Record<string, string>,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: object | null | undefined
): Promise<unknown> {
  // Restore simple combined check for required string params
  if (!config || !accessToken || !path) {
     throw new PikoApiError('Missing required parameters (Config, Token, or Path) for fetchPikoApiData.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  }

  const baseUrl = _getPikoApiBaseUrl(config);
  const url = new URL(path, baseUrl);
  
  if (queryParams) {
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }
  
  // --- Conditional Execution: Use https.request for local+ignoreTlsErrors --- 
  if (config.type === 'local' && config.ignoreTlsErrors && https && config.host && config.port) {
    console.warn(`[Piko Driver] Using https.request (TLS ignored) for: ${method} ${url.toString()}`);
    
    const agent = new https.Agent({ rejectUnauthorized: false });
    const requestBody = (body && (method === 'POST' || method === 'PUT')) ? JSON.stringify(body) : '';
    
    const options: import('https').RequestOptions = {
      hostname: config.host,
      port: config.port,
      path: url.pathname + url.search, // Combine path and query string
      method: method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json', // Assume JSON response
        // Add Content-Type and Content-Length only if there's a body
        ...(requestBody && { 
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody)
        })
      },
      agent: agent, 
    };

    return new Promise((resolve, reject) => {
      const req = https!.request(options, (res) => {
        let responseBody = '';
        const statusCode = res.statusCode ?? 0;

        res.setEncoding('utf8');
        res.on('data', (chunk) => { responseBody += chunk; });

        res.on('end', () => {
          console.log(`Piko API https.request response status (${config.type} ${path}):`, statusCode);
          
          if (statusCode < 200 || statusCode >= 300) {
             const errorInfo: { message: string, errorId?: string, errorString?: string, raw?: unknown } = {
                  message: `Failed ${method} request to ${path} (Status: ${statusCode}) via https.request`
              };
              try {
                  const errorData = JSON.parse(responseBody);
                  errorInfo.errorId = errorData.errorId; 
                  errorInfo.errorString = errorData.errorString;
                  errorInfo.message = errorData.errorString || errorData.message || errorInfo.message;
                  errorInfo.raw = errorData;
              } catch (parseError) {
                  console.warn(`Could not parse JSON error response from Piko API (${path}, https.request):`, parseError);
                  if (responseBody && responseBody.length < 200) {
                     errorInfo.message += `: ${responseBody.substring(0, 100)}`;
                  }
                   errorInfo.raw = responseBody;
              }
              reject(new PikoApiError(errorInfo.message, {
                  statusCode: statusCode,
                  errorId: errorInfo.errorId,
                  errorString: errorInfo.errorString,
                  rawError: errorInfo.raw
              }));
              return;
          }

          // Handle success
          if (statusCode === 204) {
             console.log(`Successfully executed Piko API request (${config.type} ${method} ${path}, https.request) - No Content`);
             resolve(null);
             return;
          }

          try {
             const data = JSON.parse(responseBody);
             console.log(`Successfully executed Piko API request (${config.type} ${method} ${path}, https.request)`);
             resolve(data);
          } catch (parseError) {
             console.error(`Failed to parse successful JSON response from ${path} (https.request):`, parseError);
             reject(new PikoApiError(`Failed to parse successful API response: ${parseError instanceof Error ? parseError.message : String(parseError)}`, { statusCode: 500, rawError: responseBody }));
          }
        });
      });

      req.on('error', (e) => {
         console.error(`[fetchPikoApiData] https.request error for ${method} ${url.toString()}:`, e);
         // Reuse error message generation from _fetchPikoLocalToken if possible, or create a similar logic
         let errorMessage = `Request failed: ${e.message}`;
         const errorCode = (e as any).code;
         if (errorCode) {
             // Add specific error checks if needed (e.g., ECONNREFUSED, ETIMEDOUT)
             errorMessage = `Request failed with code ${errorCode}: ${e.message}`;
         } // Note: We shouldn't get TLS errors here since rejectUnauthorized is false
         reject(new PikoApiError(errorMessage, { cause: e }));
      });

      // Write body if exists
      if (requestBody) {
         req.write(requestBody);
      }
      req.end();
    });

  } else {
     // --- Original Execution: Use fetch for cloud or local without ignoreTlsErrors --- 
     console.log(`[Piko Driver] Using fetch for: ${method} ${url.toString()}`);
     
     // Create custom agent only if ignoreTlsErrors is true and https module is available
     // THIS BLOCK IS NOW ONLY THEORETICALLY REACHED IF https MODULE IS *NOT* AVAILABLE
     // OR if ignoreTlsErrors is false. fetch should handle valid certs fine.
     let agent: import('https').Agent | undefined = undefined;
     if (config.type === 'local' && config.ignoreTlsErrors && https) {
         console.warn(`[Piko Driver] Disabling TLS certificate validation for local API request to ${config.host}:${config.port} (via fetch agent)`);
         agent = new https.Agent({ rejectUnauthorized: false });
     } else if (config.type === 'local' && config.ignoreTlsErrors && !https) {
         console.error("[Piko Driver] Cannot ignore TLS errors via fetch: https module not available.");
         // Consider throwing an error here if strict TLS ignoring is required but impossible
     }

     try {
        // USE HELPER for base options
        const requestOptions = _getPikoRequestOptions(accessToken, method);

        // Add JSON specific headers/body if needed
        if (body && (method === 'POST' || method === 'PUT')) {
          requestOptions.headers = { ...requestOptions.headers, 'Content-Type': 'application/json' };
          requestOptions.body = JSON.stringify(body);
        }

        // === CORRECTED: Conditionally add agent directly to the options object ===
        if (agent) {
            // Node.js fetch expects the agent directly on the options object
            (requestOptions as any).agent = agent; 
        }

        // console.log(`>>> Making fetch request to: ${url.toString()}`);
        // Pass the potentially modified requestOptions directly
        const response = await fetch(url.toString(), requestOptions);

        console.log(`Piko API fetch response status (${config.type} ${path}):`, response.status);

        if (!response.ok) {
          const errorInfo: { message: string, errorId?: string, errorString?: string, raw?: unknown } = {
              message: `Failed ${method} request to ${path} (Status: ${response.status}) via fetch`
          };
          try {
            const errorData = await response.json();
            // Attempt to extract Piko-specific error details
            errorInfo.errorId = errorData.errorId; // e.g., "missingParameter"
            errorInfo.errorString = errorData.errorString; // e.g., "Missing required parameter: ..."
            errorInfo.message = errorData.errorString || errorData.message || errorInfo.message; // Prefer specific errorString
            errorInfo.raw = errorData;
          } catch (parseError) {
            console.warn(`Could not parse JSON error response from Piko API (${path}, fetch):`, parseError);
            // Try reading as text for non-JSON errors
            try {
                const errorText = await response.text();
                if (errorText && errorText.length < 200) {
                    errorInfo.message += `: ${errorText.substring(0, 100)}`;
                }
                 errorInfo.raw = errorText;
            } catch (textError) {
                console.warn(`Could not read text error response either for ${path} (fetch):`, textError);
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
          console.log(`Successfully executed Piko API request (${config.type} ${method} ${path}, fetch) - No Content`);
          return null;
        }

        const data = await response.json();
        console.log(`Successfully executed Piko API request (${config.type} ${method} ${path}, fetch)`);
        return data;

      } catch (error) {
        // This catch block now primarily handles errors from fetch itself (network, DNS, etc.)
        // or errors thrown by the !response.ok block above.
        if (error instanceof PikoApiError) {
           // Re-throw PikoApiError directly
           console.error(`Error in fetchPikoApiData (${config.type} ${path}, fetch):`, error.message);
           throw error;
        } else if (error instanceof Error) {
          console.error(`Fetch-related error in fetchPikoApiData (${config.type} ${path}):`, error.message);
           // Wrap other errors (like fetch network errors) in PikoApiError for consistency?
           // Or keep them distinct? Let's wrap them for now.
           throw new PikoApiError(`Network or fetch error for ${path}: ${error.message}`, { cause: error });
        } else {
            // Unknown error type
            console.error(`Unexpected non-Error type during Piko API fetch (${config.type} ${path}):`, error);
            throw new PikoApiError(`Unexpected issue connecting to Piko ${config.type} (${path})`); 
        }
      }
  }
}

/**
* Fetches the list of Servers for a specific Piko system.
* @param config The Piko configuration.
* @param accessToken The bearer token.
* @returns Promise resolving to array of PikoServerRaw objects.
*/
export async function getSystemServers(
  config: PikoConfig, 
  accessToken: string
): Promise<PikoServerRaw[]> {
  const data = await _makePikoRequest(
      config, accessToken, '/rest/v3/servers', 'GET', 
      { '_with': 'id,name,osInfo,parameters.systemRuntime,parameters.physicalMemory,parameters.timeZoneInformation,status,storages,url,version' },
      undefined, undefined, 'json'
  );
  if (!Array.isArray(data)) throw new Error('Piko servers response was not a valid array');
  return data as PikoServerRaw[];
}

/**
* Fetches the list of Devices for a specific Piko system.
* @param config The Piko configuration.
* @param accessToken The bearer token.
* @returns Promise resolving to array of PikoDeviceRaw objects.
*/
export async function getSystemDevices(
  config: PikoConfig, 
  accessToken: string
): Promise<PikoDeviceRaw[]> {
  const data = await _makePikoRequest(
      config, accessToken, '/rest/v3/devices/', 'GET', 
      { '_with': 'id,deviceType,mac,model,name,serverId,status,url,vendor' },
      undefined, undefined, 'json'
  );
  if (!Array.isArray(data)) throw new Error('Piko devices response was not a valid array');
  return data as PikoDeviceRaw[];
}

/**
* Fetches details for a specific Device in a Piko system, including media streams.
* @param config The Piko configuration.
* @param accessToken The bearer token.
* @param deviceId The GUID of the specific device.
* @returns Promise resolving to a PikoDeviceRaw object or null if not found.
* @throws Error if the request fails or the response is invalid.
*/
export async function getSystemDeviceById(
  config: PikoConfig,
  accessToken: string,
  deviceId: string
): Promise<PikoDeviceRaw | null> {
  if (!deviceId) {
    throw new Error("Device ID is required to fetch specific device details.");
  }

  const path = `/rest/v3/devices/${deviceId}`;
  try {
    const data = await _makePikoRequest(
        config, accessToken, path, 'GET',
        { '_with': 'id,deviceType,mac,model,name,serverId,status,url,vendor,mediaStreams' },
        undefined, undefined, 'json'
    );

    // Check if the response is an object (expected for single device)
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      return data as PikoDeviceRaw;
    } else {
      // Unexpected response format (e.g., array or non-object)
      console.warn(`Unexpected response format fetching device ${deviceId} (${config.type}). Expected object, got:`, data);
      // If Piko returns a 404, fetchPikoApiData should throw PikoApiError
      // If it's another unexpected format, return null or throw
      // Returning null is perhaps safer if the API contract isn't perfectly known
      return null;
    }
  } catch (error) {
    // Specifically handle 404 Not Found errors from the API
    if (error instanceof PikoApiError && error.statusCode === 404) {
      console.log(`Device with ID ${deviceId} not found in Piko system (${config.type}).`);
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
 * @param config The Piko configuration.
 * @param accessToken The bearer token for authentication.
 * @param serverId The ID of the Piko server hosting the camera.
 * @returns Promise resolving to the ticket token string.
 * @throws PikoApiError if the request fails.
 * @see {@link https://meta.nxvms.com/doc/developers/api-tool/rest-v3-login-tickets-post}
 */
export async function createPikoLoginTicket(
  config: PikoConfig,
  accessToken: string,
  serverId: string
): Promise<string> {
  if (!config || !accessToken || !serverId) {
    throw new Error('Missing required parameters (Config, Token, or Server ID) for createPikoLoginTicket.');
  }

  const path = '/rest/v3/login/tickets';
  const headers = { 'X-Server-Guid': serverId, 'Accept': 'application/json' };
  const data = await _makePikoRequest(config, accessToken, path, 'POST', undefined, undefined, headers, 'json');
  
  const ticketResponse = data as PikoLoginTicketResponse;
  if (!ticketResponse || !ticketResponse.token) {
    console.error('Piko Create Ticket response missing token.', data);
    throw new Error('Piko Create Ticket response did not contain a token.');
  }
  return ticketResponse.token;
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
  const config: PikoConfig = { type: 'cloud', username: '', password: '', selectedSystem: systemId }; // Synthesize config
  const responseData = await _makePikoRequest(
    config,
    systemScopedToken,
    '/api/createEvent',
    'POST',
    undefined,
    payload, 
    undefined,
    'json'
  );
  const result = responseData as PikoCreateEventResponse;
  if (result?.error && String(result.error) !== '0') {
    const errorMessage = `Piko createEvent API returned error: ${result.errorString || 'Unknown error'} (Code: ${result.error})`;
    console.error(errorMessage, result);
    throw new PikoApiError(errorMessage, { errorId: result.errorId, errorString: result.errorString, rawError: result });
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
// We'll rely on fetchPikoApiData to throw errors on non-ok statuses.

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
  if (!pikoCameraDeviceId) throw new Error('Piko Camera Device ID required.');
  const apiPath = `/rest/v3/devices/${pikoCameraDeviceId}/bookmarks`;
  const config: PikoConfig = { type: 'cloud', username: '', password: '', selectedSystem: systemId }; // Synthesize config
  await _makePikoRequest(
    config,
    systemScopedToken,
    apiPath,
    'POST',
    undefined,
    payload, 
    undefined,
    'json' // Expects JSON success/error or maybe 204
  );
  console.log(`Successfully created Piko bookmark for camera: ${pikoCameraDeviceId} in system: ${systemId}`);
}

/**
 * Fetches the "best shot" thumbnail image for a given analytics object track as a Blob.
 * Leverages common setup logic but handles image-specific response.
 * 
 * MODIFIED: Now accepts full config and token to support both cloud and local.
 * 
 * @param config The Piko connector configuration (determines endpoint type).
 * @param accessToken The bearer token (cloud or local).
 * @param objectTrackId The ID of the analytics object track.
 * @param cameraId The GUID of the camera associated with the event.
 * @returns Promise resolving to the image Blob.
 * @throws Error if the request fails, the response is not an image, or data cannot be read.
 */
export async function getPikoBestShotImageBlob(
  config: PikoConfig, // MODIFIED: Accept full config
  accessToken: string, // MODIFIED: Generic token
  objectTrackId: string,
  cameraId: string
): Promise<Blob> {
  if (!config || !accessToken || !objectTrackId || !cameraId) {
    throw new PikoApiError('Missing required parameters for getPikoBestShotImageBlob.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  }
  const path = '/ec2/analyticsTrackBestShot';
  const queryParams = { objectTrackId, cameraId };
  const headers = { 'Accept': 'image/*' }; // Specify we want an image

  const blob = await _makePikoRequest(config, accessToken, path, 'GET', queryParams, undefined, headers, 'blob');
  
  if (!(blob instanceof Blob)) { // Add type check for safety
     console.error('Piko Best Shot did not return a Blob.', blob);
     throw new PikoApiError('Expected image Blob response from Best Shot API.', { rawError: blob });
  }
  console.log(`Successfully retrieved Piko Best Shot image blob (Type: ${blob.type}, Size: ${blob.size}) (${config.type})`);
  return blob;
}

/**
 * Interface for the /rest/v3/system/info response
 */
export interface PikoSystemInfo {
  name: string;
  customization: string;
  version: string;
  protoVersion: number;
  restApiVersions: {
    min: string;
    max: string;
  };
  cloudHost: string;
  localId: string; // GUID format
  cloudId: string;
  cloudOwnerId: string; // GUID format
  organizationId: string; // GUID format
  servers: string[]; // Array of server GUIDs
  edgeServerCount: number;
  devices: string[]; // Array of device GUIDs
  ldapSyncId: string;
  synchronizedTimeMs: number;
}

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
* Fetches system information for the configured Piko system.
* @param config The Piko configuration.
* @param accessToken The bearer token.
* @returns Promise resolving to the PikoSystemInfo object.
* @throws PikoApiError if the request fails or the response is invalid.
* @see {@link https://meta.nxvms.com/doc/developers/api-tool/rest-v3-system-info-get}
*/
export async function getSystemInfo(
  config: PikoConfig, 
  accessToken: string
): Promise<PikoSystemInfo> {
  const path = '/rest/v3/system/info';
  const data = await _makePikoRequest(config, accessToken, path, 'GET', undefined, undefined, undefined, 'json');
  if (typeof data !== 'object' || data === null || typeof (data as PikoSystemInfo).name !== 'string') {
     throw new PikoApiError(`Invalid response format received from ${path}`, { rawError: data });
  }
  return data as PikoSystemInfo;
}

/**
 * Internal helper to fetch Piko access token for LOCAL connections.
 * @param config The Piko configuration.
 * @returns Promise resolving to token response object
 * @throws PikoApiError if authentication fails
 */
async function _fetchPikoLocalToken(
  config: PikoConfig & { type: 'local' } // Ensure type is local
): Promise<PikoTokenResponse> {
  const { host, port, username, password, ignoreTlsErrors } = config;
  console.log(`_fetchPikoLocalToken using https.request for local host: ${host}:${port}`);
  if (!https || !host || !port || !username || !password) throw new PikoApiError('...');
  const url = `https://${host}:${port}/rest/v3/login/sessions`;
  const requestBody = JSON.stringify({ username, password });
  let agent: import('https').Agent | undefined = undefined;
  if (ignoreTlsErrors && https) {
      console.warn(`[Piko Driver] Disabling TLS certificate validation for local connection to ${host}:${port}`);
      agent = new https.Agent({ rejectUnauthorized: false });
  }
  const options: import('https').RequestOptions = {
    hostname: host, port: port, path: '/rest/v3/login/sessions', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(requestBody), 'Accept': 'application/json' },
    agent: agent, 
  };
  return new Promise((resolve, reject) => { 
    const req = https!.request(options, (res) => { /* ... response handling ... */ 
         let responseBody = '';
         const statusCode = res.statusCode ?? 0;
         res.setEncoding('utf8');
         res.on('data', (chunk) => { responseBody += chunk; });
         res.on('end', () => {
           if (statusCode < 200 || statusCode >= 300) {
               const errorInfo: any = { message: `Local auth failed (Status: ${statusCode})` };
               try { const errorData = JSON.parse(responseBody); errorInfo.raw = errorData; /* ... */ } catch { errorInfo.raw = responseBody; }
               reject(new PikoApiError(errorInfo.message, { statusCode, rawError: errorInfo.raw }));
               return;
           }
           try {
               const data: PikoLocalTokenData = JSON.parse(responseBody);
               if (!data.token) reject(new PikoApiError('Local auth response missing token.', { statusCode }));
               else resolve({ accessToken: data.token, expiresIn: data.expiresInS, sessionId: data.id, tokenType: 'Bearer' });
           } catch (parseError) {
               reject(new PikoApiError(`Failed to parse successful auth response: ${parseError instanceof Error ? parseError.message : String(parseError)}`, { statusCode: 500, rawError: responseBody }));
           }
         });
    });
    req.on('error', (e) => { reject(new PikoApiError(`Request failed: ${e.message}`, { cause: e })); });
    req.write(requestBody);
    req.end();
  });
}

/**
 * Internal helper to fetch Piko access token for CLOUD connections.
 * @param username Piko account username
 * @param password Piko account password
 * @param scope Optional scope string (e.g., 'cloudSystemId=...')
 * @returns Promise resolving to token response object
 * @throws Error if authentication fails
 */
async function _fetchPikoCloudToken(username: string, password: string, scope?: string): Promise<PikoTokenResponse> {
  // ... (Implementation remains the same) ...
  console.log(`_fetchPikoToken called for username: ${username}, with scope: ${scope || 'general'}`);
  if (!username || !password) throw new PikoApiError('Username and password are required', { /*...*/ });
  const url = `${PIKO_CLOUD_URL}/cdb/oauth2/token`;
  const requestBody: Record<string, string | undefined> = { /*...*/ grant_type: 'password', response_type: 'token', client_id: '3rdParty', username, password, scope };
  const finalRequestBody = Object.fromEntries(Object.entries(requestBody).filter(([, v]) => v !== undefined));
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(finalRequestBody) });
    if (!response.ok) {
      const errorInfo: any = { message: `Cloud auth failed (Status: ${response.status})` };
      try { const errorData = await response.json(); errorInfo.raw = errorData; /*...*/ } catch { /*...*/ }
      throw new PikoApiError(errorInfo.message, { statusCode: response.status, rawError: errorInfo.raw });
    }
    const data = await response.json();
    if (!data.access_token) throw new PikoApiError('Cloud auth response missing access_token.', { statusCode: response.status });
    console.log(`Successfully authenticated with Piko cloud (${url}). Token received.`);
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at, expiresIn: data.expires_in, tokenType: data.token_type, scope: data.scope || undefined };
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error in Piko _fetchPikoCloudToken (${PIKO_CLOUD_URL}):`, error.message);
      if (error instanceof PikoApiError) throw error;
      throw new PikoApiError(`Failed to connect or authenticate with Piko Cloud: ${error.message}`, { cause: error });
    }
    console.error(`Unexpected error during Piko cloud authentication (${PIKO_CLOUD_URL}):`, error);
    throw new PikoApiError('Unexpected error during Piko Cloud authentication');
  }
}

/**
 * Gets a Piko access token based on the configuration type (cloud or local).
 * @param config The Piko configuration.
 * @returns Promise resolving to the token response object.
 * @throws PikoApiError if authentication fails.
 */
export async function getToken(config: PikoConfig): Promise<PikoTokenResponse> {
    if (config.type === 'cloud') {
        if (!config.username || !config.password) throw new PikoApiError('...');
        return _fetchPikoCloudToken(config.username, config.password, config.selectedSystem ? `cloudSystemId=${config.selectedSystem}` : undefined);
    } else if (config.type === 'local') {
        if (!config.host || !config.port || !config.username || !config.password) throw new PikoApiError('...');
        return _fetchPikoLocalToken(config as PikoConfig & { type: 'local' });
    } else {
        throw new PikoApiError(`Unsupported Piko config type: ${(config as any).type}`, { /*...*/ });
    }
}

/**
 * Initiates a media stream request for a specific camera and timestamp.
 * IMPORTANT: This function returns the raw Response object. The caller is responsible
 * for handling the media stream (e.g., reading the body as a ReadableStream).
 *
 * MODIFIED: Accepts full config object.
 *
 * @param config The Piko connector configuration (determines endpoint type).
 * @param accessToken The bearer token (can be undefined if ticket is used).
 * @param cameraId The GUID of the camera device.
 * @param positionMs The starting position for the media stream in epoch milliseconds.
 * @param format Optional container format (e.g., 'webm'). If provided, appends '.<format>' to the path.
 * @param ticket Optional login ticket for query parameter authentication.
 * @param serverId Optional server ID, required if using ticket authentication.
 * @returns Promise resolving to the raw Fetch Response object containing the media stream.
 * @throws Error if the request fails or required parameters are missing.
 */
export async function getPikoMediaStream(
  config: PikoConfig, // MODIFIED: Accept full config
  accessToken: string | undefined, // MODIFIED: Can be undefined if ticket is used
  cameraId: string,
  positionMs: number, // Using number for timestamp
  format?: string, // Optional format parameter
  ticket?: string, // Optional ticket parameter
  serverId?: string // Optional serverId, needed for ticket auth request header
): Promise<Response> { // Returns the raw Response object
  if (!config || (!accessToken && !ticket) || (ticket && !serverId) || !cameraId || positionMs === undefined) {
    throw new PikoApiError('Missing required parameters for getPikoMediaStream.', { /*...*/ });
  }
  if (accessToken && ticket) console.warn('getPikoMediaStream prefers ticket auth.');

  let path = `/rest/v3/devices/${cameraId}/media`;
  if (format) path += `.${format.trim()}`;
  const queryParams: Record<string, string> = { positionMs: String(positionMs) };
  if (ticket) queryParams['_ticket'] = ticket;
  
  const headers = ticket ? { 'X-Server-Guid': serverId! } : undefined;
  const tokenToUse = ticket ? undefined : accessToken; // Don't pass bearer token if using ticket

  // Call the helper, expecting a stream
  const response = await _makePikoRequest(config, tokenToUse, path, 'GET', queryParams, undefined, headers, 'stream');

  if (!(response instanceof Response)) { // Type check for safety
     console.error('Piko Media Stream did not return a Response object.', response);
     throw new PikoApiError('Expected stream Response object.', { rawError: response });
  }
  console.log(`Successfully initiated Piko Media Stream request for camera ${cameraId}`);
  return response;
}

/**
 * Initiates an HLS media stream request for a specific camera.
 * Returns the raw Response object containing the M3U8 playlist.
 *
 * MODIFIED: Accepts full config object.
 *
 * @param config The Piko connector configuration (determines endpoint type).
 * @param accessToken The bearer token.
 * @param cameraId The GUID of the camera device.
 * @returns Promise resolving to the raw Fetch Response object containing the M3U8 playlist.
 * @throws Error if the request fails or required parameters are missing.
 * @see {@link https://meta.nxvms.com/doc/developers/api-tool/hls-deviceidm3u-get}
 */
export async function getPikoHlsStream(
  config: PikoConfig, // MODIFIED: Accept full config
  accessToken: string,
  cameraId: string
): Promise<Response> { // Returns the raw Response object
  if (!config || !accessToken || !cameraId) {
    throw new PikoApiError('Missing required parameters for getPikoHlsStream.', { /*...*/ });
  }
  const path = `/hls/${cameraId}.m3u8`;
  const headers = { 'Accept': '*/*', 'User-Agent': 'FusionBridge/1.0' };

  // Call the helper, expecting a stream
  const response = await _makePikoRequest(config, accessToken, path, 'GET', undefined, undefined, headers, 'stream');
  
  if (!(response instanceof Response)) { // Type check for safety
     console.error('Piko HLS Stream did not return a Response object.', response);
     throw new PikoApiError('Expected stream Response object.', { rawError: response });
  }
  console.log(`Successfully initiated Piko HLS Stream request for camera ${cameraId}`);
  return response;
}

// --- Consolidated Request Helper --- 

type ExpectedResponseType = 'json' | 'blob' | 'stream';

async function _makePikoRequest(
  config: PikoConfig,
  accessToken: string | undefined,
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  queryParams?: Record<string, string>,
  body?: object | null | undefined,
  additionalHeaders?: Record<string, string>,
  expectedResponseType: ExpectedResponseType = 'json'
): Promise<any> { 

  // Validate core inputs needed for URL construction
  if (!config || !path) {
     throw new PikoApiError('Missing required parameters (Config or Path) for _makePikoRequest.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  }

  const baseUrl = _getPikoApiBaseUrl(config);
  const url = new URL(path, baseUrl);
  if (queryParams) {
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }
  
  // --- Centralized Header Preparation --- 
  const logPrefix = `[Piko Driver _makePikoRequest (${config.type})]`;
  const requestBodyStr = (body && (method === 'POST' || method === 'PUT')) ? JSON.stringify(body) : '';

  // Start with base auth + additional headers
  const headersToUse: Record<string, string> = {
       ..._getPikoBaseHeaders(accessToken),
       ...additionalHeaders
  };
  // Add body-related headers if applicable
  if (requestBodyStr) {
      headersToUse['Content-Type'] = 'application/json';
      // Content-Length will be added specifically for https.request later
  }
  // Set default Accept header if not provided
  if (!headersToUse['Accept']) {
      headersToUse['Accept'] = expectedResponseType === 'json' ? 'application/json' : '*/*';
  }
  // --- End Header Preparation ---

  // --- Conditional Execution: Use https.request for local+ignoreTlsErrors --- 
  if (config.type === 'local' && config.ignoreTlsErrors && https && config.host && config.port) {
    console.warn(`${logPrefix} Using https.request (TLS ignored) for: ${method} ${url.toString()}`);
    
    const agent = new https.Agent({ rejectUnauthorized: false });
    
    // Prepare OutgoingHttpHeaders from headersToUse
    const outgoingHeaders: import('http').OutgoingHttpHeaders = {};
    for (const [key, value] of Object.entries(headersToUse)) {
        if (value !== undefined && value !== null) { 
             outgoingHeaders[key.toLowerCase()] = String(value); 
        }
    }
    // Add Content-Length specifically for https.request if body exists
    if (requestBodyStr) {
        outgoingHeaders['content-length'] = Buffer.byteLength(requestBodyStr);
    }
    
    const options: import('https').RequestOptions = {
      hostname: config.host,
      port: config.port,
      path: url.pathname + url.search,
      method: method,
      headers: outgoingHeaders, 
      agent: agent, 
    };

    return new Promise((resolve, reject) => {
        const req = https!.request(options, (res) => {
            const statusCode = res.statusCode ?? 0;
            const contentType = res.headers['content-type'];
            console.log(`${logPrefix} https.request response status: ${statusCode}`);
            if (statusCode < 200 || statusCode >= 300) {
                let responseBody = '';
                res.setEncoding('utf8');
                res.on('data', chunk => responseBody += chunk);
                res.on('end', () => {
                    const errorInfo = { message: `Failed ${method} ${path} (${statusCode}) via https.request`, raw: responseBody };
                    try { const errData = JSON.parse(responseBody); errorInfo.raw = errData; /* extract details */ } catch {} 
                    reject(new PikoApiError(errorInfo.message, { statusCode, rawError: errorInfo.raw }));
                });
                return; 
            }
            try {
                if (expectedResponseType === 'json') {
                    let responseBody = '';
                    res.setEncoding('utf8');
                    res.on('data', chunk => responseBody += chunk);
                    res.on('end', () => {
                        if (statusCode === 204) {
                            console.log(`${logPrefix} Success (204 No Content)`);
                            resolve(null);
                            return;
                        }
                        try {
                            const data = JSON.parse(responseBody);
                            console.log(`${logPrefix} Success (JSON)`);
                            resolve(data);
                        } catch (e) {
                            console.error(`${logPrefix} Failed to parse JSON response:`, e);
                            reject(new PikoApiError(`Failed to parse JSON: ${e instanceof Error ? e.message : 'Unknown error'}`, { statusCode: 500, rawError: responseBody }));
                        }
                    });
                } else if (expectedResponseType === 'blob') {
                    if (!contentType || !contentType.startsWith('image/')) { // Assuming blob is always image for now
                        console.error(`${logPrefix} Response was not an image. Content-Type: ${contentType}`);
                        res.resume();
                        reject(new PikoApiError(`Expected image response, got ${contentType || 'unknown'}`, { statusCode }));
                        return;
                    }
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk) => chunks.push(chunk));
                    res.on('end', () => {
                        try {
                            const finalBuffer = Buffer.concat(chunks);
                            const blob = new Blob([finalBuffer], { type: contentType });
                            console.log(`${logPrefix} Success (Blob)`);
                            resolve(blob);
                        } catch (e) {
                            console.error(`${logPrefix} Failed to process blob data:`, e);
                            reject(new PikoApiError(`Failed to process image data: ${e instanceof Error ? e.message : 'Unknown error'}`, { cause: e }));
                        }
                    });
                } else if (expectedResponseType === 'stream') {
                    const webStream = Readable.toWeb(res);
                    const responseHeaders = new Headers();
                    for (const [key, value] of Object.entries(res.headers)) {
                        if (value !== undefined) {
                            if (Array.isArray(value)) value.forEach(v => responseHeaders.append(key, v));
                            else responseHeaders.set(key, value);
                        }
                    }
                    console.log(`${logPrefix} Success (Stream)`);
                    resolve(new Response(webStream as any, { status: statusCode, statusText: res.statusMessage || '', headers: responseHeaders }));
                } else {
                    console.error(`${logPrefix} Invalid expectedResponseType: ${expectedResponseType}`);
                    res.resume(); // Consume data
                    reject(new PikoApiError(`Internal error: Invalid expected response type.`, { statusCode: 500 }));
                }
            } catch (processingError) {
                console.error(`${logPrefix} Error during response processing:`, processingError);
                res.resume(); // Ensure stream is consumed on error
                reject(new PikoApiError(`Failed processing response: ${processingError instanceof Error ? processingError.message : String(processingError)}`, { cause: processingError }));
            }
        });
        req.on('error', (e) => { reject(new PikoApiError(`Request failed: ${e.message}`, { cause: e })); });
        if (requestBodyStr) req.write(requestBodyStr);
        req.end();
    });

  } else {
     // --- Use fetch for cloud or local without ignoreTlsErrors --- 
     console.log(`${logPrefix} Using fetch for: ${method} ${url.toString()}`);
     
     try {
        // Prepare HeadersInit compatible headers 
        const fetchHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(headersToUse)) {
            if (value !== undefined && value !== null) {
                 fetchHeaders[key] = String(value);
            }
        }

        const requestOptions: RequestInit = {
            method: method,
            headers: fetchHeaders, // Use prepared headers
            body: requestBodyStr || undefined, // Use prepared stringified body
        };

        const response = await fetch(url.toString(), requestOptions);
        console.log(`${logPrefix} fetch response status: ${response.status}`);

        if (!response.ok) {
          const errorInfo = { message: `Failed ${method} ${path} (${response.status}) via fetch`, raw: null as any };
          try { errorInfo.raw = await response.text(); } catch {} // Try to get text body
          try { /* Try parsing as JSON? */ const errData = JSON.parse(errorInfo.raw); errorInfo.raw = errData; /* extract details */ } catch {} 
          throw new PikoApiError(errorInfo.message, { statusCode: response.status, rawError: errorInfo.raw });
        }

        // Handle Success based on Expected Type
        if (expectedResponseType === 'json') {
            if (response.status === 204) {
                 console.log(`${logPrefix} Success (204 No Content)`);
                 return null;
            }
            const data = await response.json();
            console.log(`${logPrefix} Success (JSON)`);
            return data;
        } else if (expectedResponseType === 'blob') {
             const blob = await response.blob();
             console.log(`${logPrefix} Success (Blob)`);
             return blob;
        } else if (expectedResponseType === 'stream') {
             console.log(`${logPrefix} Success (Stream)`);
             return response; // Return the raw Response object
        } else {
             console.error(`${logPrefix} Invalid expectedResponseType: ${expectedResponseType}`);
             throw new PikoApiError(`Internal error: Invalid expected response type.`, { statusCode: 500 });
        }

      } catch (error) {
        if (error instanceof PikoApiError) throw error; 
        console.error(`${logPrefix} Fetch/Network error:`, error);
        throw new PikoApiError(`Network or fetch error for ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`, { cause: error });
      }
  }
}

// --- End Consolidated Request Helper ---

// --- Public API Functions (Refactored to use _makePikoRequest) ---

// ... (The rest of the public functions like getSystems, testConnection, getPikoMediaStream, etc.) ...
// ... These should now correctly call _makePikoRequest without linter errors ...
