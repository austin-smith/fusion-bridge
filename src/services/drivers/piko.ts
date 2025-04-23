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
}

// Interface for raw device data from API
interface PikoDeviceRaw {
  id: string;
  deviceType?: string;
  mac?: string;
  model?: string;
  name: string;
  serverId?: string;
  status?: string;
  url?: string;
  vendor?: string;
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
  if (!systemId || !systemScopedToken) {
    throw new Error('System ID and system-scoped token are required');
  }

  const baseUrl = `https://${systemId}.relay.vmsproxy.com`;
  const url = new URL(path, baseUrl);
  
  if (queryParams) {
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  console.log(`Preparing to fetch Piko Relay data: ${method} ${url.toString()}`);

  try {
    const requestOptions: RequestInit = {
      method: method,
      headers: {
        'Authorization': `Bearer ${systemScopedToken}`,
      },
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      requestOptions.headers = { ...requestOptions.headers, 'Content-Type': 'application/json' };
      requestOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), {
      ...requestOptions
    });

    console.log(`Piko Relay fetch response status (${path}):`, response.status);

    if (!response.ok) {
      let errorInfo = `Failed ${method} request to ${path}`;
      try {
        const errorData = await response.json();
        errorInfo = errorData.error_description || errorData.error || errorData.message || errorInfo;
      } catch (parseError) {
        console.error(`Error parsing Piko Relay error response (${path}):`, parseError);
      }
      console.error(`Failed Piko Relay request (${method} ${path}): ${errorInfo}`);
      throw new Error(`Failed Piko Relay request (${method} ${path}): ${errorInfo}`);
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
      throw error; // Re-throw known errors
    }
    console.error(`Unexpected error during Piko Relay fetch (${path}):`, error);
    throw new Error(`Network error or unexpected issue connecting to Piko Relay (${path})`);
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
  const data = await fetchPikoRelayData(systemId, systemScopedToken, '/rest/v3/devices/', { // Note the trailing slash
    '_with': 'id,deviceType,mac,model,name,serverId,status,url,vendor'
  });
  
  if (!Array.isArray(data)) {
     throw new Error('Piko devices response was not a valid array');
  }
  return data as PikoDeviceRaw[];
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
    console.log('Preparing to authenticate with Piko Cloud API');
    
    const response = await fetch(`${PIKO_CLOUD_URL}/cdb/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
 
    console.log(`Piko auth response status (scope: ${scope || 'general'}):`, response.status);
    
    if (!response.ok) {
      let errorInfo = 'Authentication failed';
      try {
        const errorData = await response.json();
        errorInfo = errorData.error_description || errorData.error || errorInfo;
      } catch (parseError) {
        console.error(`Error parsing Piko auth error response (scope: ${scope || 'general'}):`, parseError);
      }
      console.error(`Piko authentication failed (scope: ${scope || 'general'}): ${errorInfo}`);
      throw new Error(`Piko authentication failed (scope: ${scope || 'general'}): ${errorInfo}`);
    }

    const data = await response.json();
    
    if (!data.access_token) {
      throw new Error('Piko auth response did not contain an access token');
    }

    console.log(`Successfully authenticated with Piko (scope: ${scope || 'general'})`);
    
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
      throw error; // Re-throw known errors
    }
    
    // Handle network or unexpected errors
    console.error(`Unexpected error during Piko authentication (scope: ${scope || 'general'}):`, error);
    throw new Error('Network error or unexpected issue connecting to Piko Cloud for token');
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
    const errorMessage = `Piko createEvent API returned error: ${result.errorString || 'Unknown error'} (Code: ${result.error})`;
    console.error(errorMessage, result);
    throw new Error(errorMessage);
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