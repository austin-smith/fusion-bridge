import { Readable } from 'stream';
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import { calculateExpiresAt, isTokenExpiring } from '@/lib/token-utils'; // Ensure both are imported
import { updateConnectorConfig } from '@/data/repositories/connectors'; // <-- IMPORT ADDED

// --- Dynamically import https for optional TLS ignore --- 
let httpsModule: typeof import('https') | undefined;
import('https').then(mod => {
    httpsModule = mod;
}).catch(e => {
    console.warn("Failed to dynamically import 'https' module. TLS verification cannot be disabled.", e);
});
// --- End dynamic import --- 

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
    expiresAt?: number; // Optional as local uses expiresInS
    // expiresIn?: number | string; // Removed: intermediate, not stored after expiresAt is calculated
    scope?: string; // Optional: Piko cloud might return scope
    sessionId?: string; // Optional: Piko local returns session ID
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
  refreshToken?: string;
  expiresAt: number; // STANDARDIZED: Unix timestamp in ms. Always calculated & populated.
  // expiresIn, tokenType removed as they are intermediate or not stored in this standardized object
  scope?: string; // Optional: Piko cloud might return scope
  sessionId?: string; // Optional: Piko local returns session ID
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

// Function definitions should be placed here, before they are called by other functions like testConnection etc.

// --- Helper Functions for API Calls ---
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

function _getPikoBaseHeaders(accessToken?: string): Record<string, string> {
  return accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {};
}

// --- Token Fetching and Management Logic ---

async function _fetchPikoCloudToken(
username: string, 
password: string, 
scope?: string
): Promise<PikoTokenResponse> {
const logPrefix = `[_fetchPikoCloudToken][User: ${username.substring(0,3)}...]`;
console.log(`${logPrefix} Attempting to fetch cloud token. Scope: ${scope || 'general'}`);
if (!username || !password) {
  throw new PikoApiError('Username and password are required for Piko Cloud token fetch.', { 
      statusCode: 400, 
      errorId: PikoErrorCode.MissingParameter 
  });
}
const url = `${PIKO_CLOUD_URL}/cdb/oauth2/token`;
const requestBodyObject: Record<string, string> = {
  grant_type: 'password',
  response_type: 'token',
  client_id: '3rdParty',
  username: username,
  password: password,
};
if (scope) {
  requestBodyObject.scope = scope;
}
const body = JSON.stringify(requestBodyObject);
try {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: body,
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    const errorMessage = data.error_description || data.error || data.message || `Piko Cloud auth failed (Status: ${response.status})`;
    const errorId = data.error;
    console.error(`${logPrefix} Piko Cloud token fetch failed: ${errorMessage}`, data);
    throw new PikoApiError(errorMessage, { statusCode: response.status, errorId: errorId, rawError: data });
  }
  const now = Date.now();
  let calculatedExpiresAt: number;
  if (data.expires_at && typeof data.expires_at === 'string') {
    calculatedExpiresAt = parseInt(data.expires_at, 10);
    if (isNaN(calculatedExpiresAt) || calculatedExpiresAt <= now) {
      console.warn(`${logPrefix} Invalid or past expires_at '${data.expires_at}'. Trying expires_in.`);
      if (data.expires_in && typeof data.expires_in === 'string') {
          const expiresInSec = parseInt(data.expires_in, 10);
          if (!isNaN(expiresInSec) && expiresInSec > 0) {
              calculatedExpiresAt = now + (expiresInSec * 1000);
          } else { calculatedExpiresAt = 0; }
      } else { calculatedExpiresAt = 0; }
    }
  } else if (data.expires_in && typeof data.expires_in === 'string') {
    const expiresInSec = parseInt(data.expires_in, 10);
    if (!isNaN(expiresInSec) && expiresInSec > 0) {
      calculatedExpiresAt = now + (expiresInSec * 1000);
    } else { console.warn(`${logPrefix} Invalid expires_in '${data.expires_in}'.`); calculatedExpiresAt = 0; }
  } else { console.warn(`${logPrefix} expires_at and expires_in missing or invalid from Piko Cloud response.`); calculatedExpiresAt = 0; }
  if (isNaN(calculatedExpiresAt) || calculatedExpiresAt <= now) {
      console.warn(`${logPrefix} Defaulting expiration to 24 hours due to missing/invalid API expiry info.`);
      calculatedExpiresAt = now + (24 * 60 * 60 * 1000);
  }
  if (isNaN(calculatedExpiresAt) || calculatedExpiresAt <= now) {
      console.error(`${logPrefix} Critical failure to determine expiration after all fallbacks. Defaulting to 1 hour.`);
      calculatedExpiresAt = now + (60 * 60 * 1000);
  }
  console.log(`${logPrefix} Successfully fetched Piko Cloud token.`);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: calculatedExpiresAt,
    scope: data.scope || undefined,
  };
} catch (error) {
  console.error(`${logPrefix} Overall error during cloud token fetch:`, error);
  if (error instanceof PikoApiError) throw error;
  throw new PikoApiError(`Failed to fetch Piko Cloud token: ${error instanceof Error ? error.message : String(error)}`, { cause: error, statusCode: (error as any)?.status || 500 });
}
}

async function _fetchPikoLocalToken(
config: PikoConfig & { type: 'local' }
): Promise<PikoTokenResponse> {
const logPrefix = `[_fetchPikoLocalToken][${config.host}:${config.port}]`;
console.log(`${logPrefix} Attempting to fetch local token.`);
if (!config.host || !config.port || !config.username || !config.password) {
  throw new PikoApiError('Host, port, username, and password are required for local Piko token fetch.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
}
const baseUrl = _getPikoApiBaseUrl(config);
const url = new URL('/rest/v3/login/sessions', baseUrl);
const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
const body = JSON.stringify({ username: config.username, password: config.password });
let response: Response;
try {
  if (config.ignoreTlsErrors && httpsModule) {
      console.warn(`${logPrefix} Using https.request (TLS ignored).`);
      const agent = new httpsModule.Agent({ rejectUnauthorized: false });
      const reqOptions: import('https').RequestOptions = {
          hostname: config.host, port: config.port, path: url.pathname + url.search, method: 'POST',
          headers: { ...headers, 'Content-Length': Buffer.byteLength(body).toString() }, agent: agent,
      };
      response = await new Promise<Response>((resolvePromise, rejectPromise) => {
          const req = httpsModule!.request(reqOptions, (res) => {
              let responseBody = ''; res.setEncoding('utf8');
              res.on('data', (chunk) => { responseBody += chunk; });
              res.on('end', () => {
                  const pseudoHeaders = new Headers();
                  for (const [k, v] of Object.entries(res.headers)) { if (typeof v === 'string') pseudoHeaders.set(k, v); else if (Array.isArray(v)) v.forEach(val => pseudoHeaders.append(k, val)); }
                  resolvePromise({ ok: res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode || 0, statusText: res.statusMessage || '', headers: pseudoHeaders, json: async () => JSON.parse(responseBody), text: async () => responseBody } as Response);
              });
          });
          req.on('error', (e) => rejectPromise(new PikoApiError(`Local token request failed (https.request): ${e.message}`, { cause: e })));
          req.write(body); req.end();
      });
  } else {
      console.log(`${logPrefix} Using fetch.`);
      response = await fetch(url.toString(), { method: 'POST', headers, body });
  }
  const data = await response.json() as PikoLocalTokenData;
  if (!response.ok || !data.token) {
      const apiMessage = (data as any).message || (data as any).errorString || (data as any).error;
      throw new PikoApiError(apiMessage || 'Local auth response missing token or invalid structure.', { statusCode: response.status, rawError: data });
  }
  const now = Date.now();
  const expiresInMs = (typeof data.expiresInS === 'number' && !isNaN(data.expiresInS) && data.expiresInS > 0) ? data.expiresInS * 1000 : (console.warn(`${logPrefix} Invalid expiresInS '${data.expiresInS}'. Defaulting to 1 hour.`), 3600000);
  console.log(`${logPrefix} Successfully fetched local token.`);
  return { accessToken: data.token, expiresAt: now + expiresInMs, sessionId: data.id };
} catch (error) {
  console.error(`${logPrefix} Overall error during local token fetch:`, error);
  if (error instanceof PikoApiError) throw error;
  throw new PikoApiError(`Failed to fetch local Piko token: ${error instanceof Error ? error.message : String(error)}`, { cause: error, statusCode: (error as any)?.status || 500 });
}
}

async function _refreshPikoCloudToken(refreshToken: string): Promise<PikoTokenResponse> {
const logPrefix = '[_refreshPikoCloudToken]';
console.log(`${logPrefix} Attempting Piko Cloud token refresh.`);
if (!refreshToken) {
  throw new PikoApiError('Refresh token is required for Piko Cloud token refresh.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
}
const url = `${PIKO_CLOUD_URL}/cdb/oauth2/token`;
const requestBody = { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: '3rdParty' };
const body = JSON.stringify(requestBody);
try {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: body });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    const errorMessage = data.error_description || data.error || data.message || `Piko Cloud token refresh failed (Status: ${response.status})`;
    const errorId = data.error;
    console.error(`${logPrefix} Piko Cloud token refresh failed: ${errorMessage}`, data);
    throw new PikoApiError(errorMessage, { statusCode: response.status, errorId: errorId, rawError: data });
  }
  const now = Date.now();
  let calculatedExpiresAt: number;
  if (data.expires_at && typeof data.expires_at === 'string') {
    calculatedExpiresAt = parseInt(data.expires_at, 10);
    if (isNaN(calculatedExpiresAt) || calculatedExpiresAt <= now) {
      console.warn(`${logPrefix} Invalid or past expires_at '${data.expires_at}'. Trying expires_in.`);
      if (data.expires_in && typeof data.expires_in === 'string') {
          const expiresInSec = parseInt(data.expires_in, 10);
          if (!isNaN(expiresInSec) && expiresInSec > 0) { calculatedExpiresAt = now + (expiresInSec * 1000); }
          else { calculatedExpiresAt = 0; }
      } else { calculatedExpiresAt = 0; }
    }
  } else if (data.expires_in && typeof data.expires_in === 'string') {
    const expiresInSec = parseInt(data.expires_in, 10);
    if (!isNaN(expiresInSec) && expiresInSec > 0) { calculatedExpiresAt = now + (expiresInSec * 1000); }
    else { console.warn(`${logPrefix} Invalid expires_in '${data.expires_in}'.`); calculatedExpiresAt = 0; }
  } else { console.warn(`${logPrefix} expires_at and expires_in missing or invalid from refresh response.`); calculatedExpiresAt = 0; }
  if (isNaN(calculatedExpiresAt) || calculatedExpiresAt <= now) {
      console.warn(`${logPrefix} Defaulting expiration to 24 hours due to missing/invalid API expiry info.`); calculatedExpiresAt = now + (24 * 60 * 60 * 1000);
  }
  if (isNaN(calculatedExpiresAt) || calculatedExpiresAt <= now) {
      console.error(`${logPrefix} Critical failure to determine expiration from refresh. Defaulting to 1 hour.`); calculatedExpiresAt = now + (60 * 60 * 1000);
  }
  console.log(`${logPrefix} Successfully refreshed Piko Cloud token.`);
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: calculatedExpiresAt, scope: data.scope || undefined };
} catch (error) {
  console.error(`${logPrefix} Unexpected error during Piko Cloud token refresh:`, error);
  if (error instanceof PikoApiError) throw error;
  throw new PikoApiError(`Unexpected error during Piko Cloud token refresh: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
}
}

export async function getTokenAndConfig(
  connectorId: string, 
  options?: { forceRefresh?: boolean }
): Promise<{ config: PikoConfig; token: PikoTokenResponse; }> {
  const logPrefix = `[getTokenAndConfig][Piko][${connectorId}]`;
  const forceRefresh = options?.forceRefresh || false;
  if (forceRefresh) {
    console.log(`${logPrefix} Force refresh requested.`);
  }
  console.log(`${logPrefix} Fetching config and ensuring valid token...`);
  const connectorData = await db.select().from(connectors).where(eq(connectors.id, connectorId)).limit(1);
  if (!connectorData.length) {
      console.error(`${logPrefix} Connector not found.`);
      throw new PikoApiError(`Connector not found: ${connectorId}`, { statusCode: 404, errorId: PikoErrorCode.NotFound });
  }
  const dbConnector = connectorData[0];
  if (dbConnector.category !== 'piko') {
       console.error(`${logPrefix} Connector is not a Piko connector.`);
       throw new PikoApiError(`Connector ${connectorId} is not a Piko connector`, { statusCode: 400, errorId: PikoErrorCode.InvalidParameter });
  }
  if (!dbConnector.cfg_enc) {
      console.error(`${logPrefix} Configuration missing.`);
      throw new PikoApiError(`Configuration missing for Piko connector ${connectorId}`, { statusCode: 500, errorId: PikoErrorCode.CantProcessRequest });
  }
  let currentDbConfig: PikoConfig;
  try {
      currentDbConfig = JSON.parse(dbConnector.cfg_enc);
      if (!currentDbConfig.type || !currentDbConfig.username || !currentDbConfig.password) { throw new Error("Parsed config missing type, username, or password."); }
      if (currentDbConfig.type === 'cloud' && !currentDbConfig.selectedSystem) { throw new Error("Cloud config missing selectedSystem."); }
      if (currentDbConfig.type === 'local' && (!currentDbConfig.host || !currentDbConfig.port)) { throw new Error("Local config missing host or port."); }
  } catch (e) {
      const parseErrorMsg = e instanceof Error ? e.message : 'Unknown parsing error';
      console.error(`${logPrefix} Failed to parse configuration: ${parseErrorMsg}`);
      throw new PikoApiError(`Failed to process Piko connector configuration: ${parseErrorMsg}`, { statusCode: 500, errorId: PikoErrorCode.CantProcessRequest });
  }
  // MODIFIED: Add forceRefresh condition to bypass this check
  if (!forceRefresh && currentDbConfig.token?.accessToken && currentDbConfig.token.expiresAt !== undefined && !isTokenExpiring(currentDbConfig.token.expiresAt)) {
    console.log(`${logPrefix} Current token is valid (and not forced to refresh).`);
    return { config: currentDbConfig, token: { accessToken: currentDbConfig.token.accessToken, refreshToken: currentDbConfig.token.refreshToken, expiresAt: currentDbConfig.token.expiresAt!, scope: currentDbConfig.token.scope, sessionId: currentDbConfig.token.sessionId }};
  }
  
  if (forceRefresh && currentDbConfig.token?.accessToken) {
    console.log(`${logPrefix} Token present but forceRefresh is true, proceeding to refresh/fetch logic.`);
  } else if (!currentDbConfig.token?.accessToken) {
    console.log(`${logPrefix} No existing access token found, proceeding to fetch logic.`);
  } else {
    console.log(`${logPrefix} Existing token is expiring or missing expiry, proceeding to refresh/fetch logic.`);
  }

  let newPikoTokenResponse: PikoTokenResponse;
  let attemptedAction = "initial_check_failed_or_expiring";
  try {
    if (currentDbConfig.type === 'cloud' && currentDbConfig.token?.refreshToken && !forceRefresh) { 
      console.log(`${logPrefix} Attempting token refresh using stored refreshToken.`); attemptedAction = "refresh";
      newPikoTokenResponse = await _refreshPikoCloudToken(currentDbConfig.token.refreshToken);
    } else {
      if (forceRefresh) {
          console.log(`${logPrefix} Force refresh: Bypassing stored refresh token. Fetching new token directly via password grant.`);
          attemptedAction = "fetch_new_forced";
      } else {
          console.log(`${logPrefix} No valid refreshToken or not cloud connector. Fetching new token via password grant/local auth.`); 
          attemptedAction = "fetch_new";
      }
      const scope = (currentDbConfig.type === 'cloud' && currentDbConfig.selectedSystem) ? `cloudSystemId=${currentDbConfig.selectedSystem}` : undefined;
      newPikoTokenResponse = currentDbConfig.type === 'cloud' ? 
          await _fetchPikoCloudToken(currentDbConfig.username, currentDbConfig.password, scope) :
          await _fetchPikoLocalToken(currentDbConfig as PikoConfig & { type: 'local' });
    }
    // Log the newly obtained token details before trying to save
    console.log(`${logPrefix} Successfully performed token action: '${attemptedAction}'.`); // Kept a more general success log

  } catch (error) {
    console.warn(`${logPrefix} Token action '${attemptedAction}' failed. Fallback to new fetch. Initial error:`, error);
    attemptedAction = "fetch_new_after_fallback";
    try {
      console.log(`${logPrefix} Fallback: Fetching new token directly via password grant/local auth.`);
      const scope = (currentDbConfig.type === 'cloud' && currentDbConfig.selectedSystem) ? `cloudSystemId=${currentDbConfig.selectedSystem}` : undefined;
      newPikoTokenResponse = currentDbConfig.type === 'cloud' ? 
          await _fetchPikoCloudToken(currentDbConfig.username, currentDbConfig.password, scope) :
          await _fetchPikoLocalToken(currentDbConfig as PikoConfig & { type: 'local' });
      // Log the newly obtained token details after fallback success
      console.log(`${logPrefix} Successfully performed fallback token action: '${attemptedAction}'.`); // Kept a more general success log
    } catch (finalFetchError) {
      console.error(`${logPrefix} All token attempts (including fallback) failed. Last error:`, finalFetchError);
      const errMsg = finalFetchError instanceof Error ? finalFetchError.message : String(finalFetchError);
      throw new PikoApiError(`All Piko token attempts failed for ${connectorId}: ${errMsg}`, { statusCode: (finalFetchError instanceof PikoApiError && finalFetchError.statusCode) || 500, cause: finalFetchError });
    }
  }
  const updatedConfigWithNewToken: PikoConfig = { ...currentDbConfig, token: { accessToken: newPikoTokenResponse.accessToken, refreshToken: newPikoTokenResponse.refreshToken, expiresAt: newPikoTokenResponse.expiresAt, scope: newPikoTokenResponse.scope, sessionId: newPikoTokenResponse.sessionId }};
  
  console.log(`${logPrefix} Attempting to save updated token/config to DB...`);
  try {
    await updateConnectorConfig(connectorId, updatedConfigWithNewToken);
    console.log(`${logPrefix} Successfully called updateConnectorConfig.`);
  } catch (dbUpdateError) {
    console.error(`${logPrefix} CRITICAL: Failed to save updated token/config to DB after successful fetch/refresh. DB update error:`, dbUpdateError);
    // Decide if we should throw here or return the in-memory new token despite DB save failure.
    // For now, let's throw to make the failure very visible, as it will lead to persistent issues.
    throw new PikoApiError(`Failed to persist new token for ${connectorId} to DB. Downstream operations will use stale data. Error: ${dbUpdateError instanceof Error ? dbUpdateError.message : String(dbUpdateError)}`, 
        { cause: dbUpdateError, errorId: PikoErrorCode.CantProcessRequest });
  }
  
  console.log(`${logPrefix} Piko token was updated. Returning new config and token response.`);
  return { config: updatedConfigWithNewToken, token: newPikoTokenResponse };
}
// ===== END: getTokenAndConfig Function =====

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
  // Cloud only
  // The /cdb/systems endpoint lives on the main cloud URL, not a system-specific relay.
  const url = `${PIKO_CLOUD_URL}/cdb/systems`;
  const logPrefix = `[getSystems]`;
  console.log(`${logPrefix} Fetching systems from ${url}`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      let errorData: any = {};
      try {
        errorData = await response.json();
      } catch (e) {
        errorData.message = `HTTP error ${response.status}`;
      }
      const errorMessage = errorData.error_description || errorData.error || errorData.message || `Piko getSystems failed (Status: ${response.status})`;
      const errorId = errorData.error;
      console.error(`${logPrefix} Failed: ${errorMessage}`, errorData);
      throw new PikoApiError(errorMessage, { statusCode: response.status, errorId: errorId, rawError: errorData });
    }

    const data = await response.json();

  if (!data || !data.systems || !Array.isArray(data.systems)) {
    throw new PikoApiError('Piko systems response did not contain a valid systems array', { 
        rawError: data, 
        errorId: PikoErrorCode.InvalidParameter 
    });
  }
    console.log(`${logPrefix} Successfully fetched ${data.systems.length} systems.`);
  return data.systems.map((system: PikoSystemRaw) => ({
      id: system.id,
      name: system.name,
      version: system.version,
      health: system.stateOfHealth,
      role: system.accessRole
  }));
  } catch (error) {
    console.error(`${logPrefix} Error:`, error);
    if (error instanceof PikoApiError) throw error;
    throw new PikoApiError(`Failed to fetch Piko systems: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
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
 * Fetches data from the appropriate Piko API endpoint (Cloud Relay or Local).
 * @param params Object containing all parameters for the API call.
 * @returns Promise resolving to the parsed JSON response data.
 * @throws PikoApiError if the request fails.
 */
interface FetchPikoApiDataParams {
  connectorId?: string; // Made optional
  path: string;
  queryParams?: Record<string, string>;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: object | null | undefined;
  isRetry?: boolean;
  additionalHeaders?: Record<string, string>;
  expectedResponseType?: 'json' | 'blob' | 'stream';
  directConfig?: PikoConfig; // Added
  directAccessToken?: string; // Added
}

async function fetchPikoApiData({
  connectorId,
  path,
  queryParams,
  method = 'GET',
  body,
  isRetry = false,
  additionalHeaders,
  expectedResponseType = 'json',
  directConfig,
  directAccessToken
}: FetchPikoApiDataParams): Promise<unknown> {
  const logPrefix = `[fetchPikoApiData][${connectorId || 'direct'}]${isRetry ? '[RETRY]' : ''}`;
  console.log(`${logPrefix} Called for path: ${path}, method: ${method}, expectedType: ${expectedResponseType}`);

  if (!path) {
    throw new PikoApiError('Missing required parameter (Path) for fetchPikoApiData.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  }

  let effectiveConfig: PikoConfig;
  let effectiveAccessToken: string;

  if (directConfig && directAccessToken) {
    console.log(`${logPrefix} Using directConfig and directAccessToken.`);
    effectiveConfig = directConfig;
    effectiveAccessToken = directAccessToken;
  } else if (connectorId) {
    console.log(`${logPrefix} Using connectorId to fetch config and token.`);
    try {
      const tokenAndConfig = await getTokenAndConfig(connectorId, { forceRefresh: isRetry }); // Pass isRetry to forceRefresh if it's a retry
      effectiveConfig = tokenAndConfig.config;
      effectiveAccessToken = tokenAndConfig.token.accessToken;
    } catch (error) {
      console.error(`${logPrefix} Error from getTokenAndConfig:`, error);
      if (error instanceof PikoApiError) throw error;
      throw new PikoApiError(`Failed to get configuration or token for connector ${connectorId}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  } else {
    throw new PikoApiError('fetchPikoApiData requires either connectorId or directConfig & directAccessToken.', { statusCode: 500, errorId: PikoErrorCode.MissingParameter });
  }

  // const accessToken = token.accessToken; // Now effectiveAccessToken
  const baseUrl = _getPikoApiBaseUrl(effectiveConfig); // Use effectiveConfig
  const url = new URL(path, baseUrl);
  
  if (queryParams) {
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }
  
  const baseHeadersFromHelper = _getPikoBaseHeaders(effectiveAccessToken); // Use effectiveAccessToken
  const finalHeaders: Record<string, string> = {
    ...baseHeadersFromHelper,
    ...additionalHeaders,
  };
  if (!finalHeaders['Accept']) {
    finalHeaders['Accept'] = expectedResponseType === 'json' ? 'application/json' : '*/*';
  }
  if (body && (method === 'POST' || method === 'PUT') && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  
  // --- Conditional Execution: Use https.request for local+ignoreTlsErrors --- 
  if (effectiveConfig.type === 'local' && effectiveConfig.ignoreTlsErrors && httpsModule && effectiveConfig.host && effectiveConfig.port) {
    console.warn(`${logPrefix} Using https.request (TLS ignored) for: ${method} ${url.toString()}`);
    
    const agent = new httpsModule.Agent({ rejectUnauthorized: false });
    const requestBodyString = (body && (method === 'POST' || method === 'PUT')) ? JSON.stringify(body) : '';
    
    const httpsRequestHeaders: import('http').OutgoingHttpHeaders = {};
    for (const [key, value] of Object.entries(finalHeaders)) {
        if (value !== undefined) httpsRequestHeaders[key.toLowerCase()] = value;
    }
    if (requestBodyString && !httpsRequestHeaders['content-length']) {
        httpsRequestHeaders['content-length'] = Buffer.byteLength(requestBodyString).toString();
    }
    
    const options: import('https').RequestOptions = {
      hostname: effectiveConfig.host,
      port: effectiveConfig.port,
      path: url.pathname + url.search, 
      method: method,
      headers: httpsRequestHeaders,
      agent: agent, 
    };

    try {
      return await new Promise((resolve, reject) => {
      const req = httpsModule!.request(options, (res) => {
        let responseBody = '';
        const statusCode = res.statusCode ?? 0;
          const contentType = res.headers['content-type'];

        res.setEncoding('utf8');
          
          if (statusCode < 200 || statusCode >= 300) {
            let errorAccumulator = '';
            res.on('data', chunk => errorAccumulator += chunk);
            res.on('end', () => {
             const errorInfo: { message: string, errorId?: string, errorString?: string, raw?: unknown } = {
                  message: `Failed ${method} request to ${path} (Status: ${statusCode}) via https.request`
              };
              try {
                    const errorData = JSON.parse(errorAccumulator);
                  errorInfo.errorId = errorData.errorId; 
                  errorInfo.errorString = errorData.errorString;
                  errorInfo.message = errorData.errorString || errorData.message || errorInfo.message;
                  errorInfo.raw = errorData;
              } catch (parseError) {
                    console.warn(`${logPrefix} Could not parse JSON error response body:`, errorAccumulator, parseError);
                    if (errorAccumulator && errorAccumulator.length < 200) {
                       errorInfo.message += `: ${errorAccumulator.substring(0, 100)}`;
                    }
                     errorInfo.raw = errorAccumulator;
              }
              reject(new PikoApiError(errorInfo.message, {
                  statusCode: statusCode,
                  errorId: errorInfo.errorId,
                  errorString: errorInfo.errorString,
                  rawError: errorInfo.raw
              }));
            });
              return;
          }

          if (statusCode === 204 && expectedResponseType !== 'stream') {
             console.log(`${logPrefix} Success (204 No Content) via https.request`);
             resolve(null);
             return;
          }

          if (expectedResponseType === 'json') {
            res.on('data', (chunk) => { responseBody += chunk; });
            res.on('end', () => {
          try {
             const data = JSON.parse(responseBody);
                 console.log(`${logPrefix} Success (JSON) via https.request`);
             resolve(data);
          } catch (parseError) {
                 console.error(`${logPrefix} Failed to parse successful JSON response from ${path} (https.request):`, parseError);
             reject(new PikoApiError(`Failed to parse successful API response: ${parseError instanceof Error ? parseError.message : String(parseError)}`, { statusCode: 500, rawError: responseBody }));
          }
        });
          } else if (expectedResponseType === 'blob') {
            if (!contentType || !contentType.startsWith('image/')) {
              console.error(`${logPrefix} Response was not an image. Content-Type: ${contentType}`);
              res.resume(); 
              reject(new PikoApiError(`Expected image response, got ${contentType || 'unknown'}`, { statusCode }));
              return;
            }
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(Buffer.from(chunk as any, 'binary')));
            res.on('end', () => {
              try {
                const finalBuffer = Buffer.concat(chunks);
                const blob = new Blob([finalBuffer], { type: contentType });
                console.log(`${logPrefix} Success (Blob) via https.request`);
                resolve(blob);
              } catch (e) {
                console.error(`${logPrefix} Failed to process blob data:`, e);
                reject(new PikoApiError(`Failed to process image data: ${e instanceof Error ? e.message : 'Unknown error'}`, { cause: e }));
              }
            });
          } else if (expectedResponseType === 'stream') {
            console.log(`${logPrefix} Success (Stream) via https.request. Piping response.`);
            // Manually construct a Web ReadableStream from the Node.js IncomingMessage
            const nodeStream = res; // res is IncomingMessage from https.request
            const webReadableStream = new ReadableStream({
              start(controller) {
                nodeStream.on('data', (chunk) => {
                  // Ensure chunk is Uint8Array, controller expects it.
                  // https.IncomingMessage data events emit Buffer or string.
                  if (typeof chunk === 'string') {
                    controller.enqueue(new TextEncoder().encode(chunk));
                  } else { // Assumes Buffer otherwise
                    controller.enqueue(new Uint8Array(chunk));
                  }
                });
                nodeStream.on('end', () => {
                  controller.close();
                });
                nodeStream.on('error', (err) => {
                  controller.error(err);
                });
              },
              cancel() {
                nodeStream.destroy();
              }
            });

            const responseHeaders = new Headers();
            for (const [key, value] of Object.entries(res.headers)) {
                if (value !== undefined) {
                    if (Array.isArray(value)) value.forEach(v => responseHeaders.append(key, v));
                    else responseHeaders.set(key, value as string);
                }
            }
            resolve(new Response(webReadableStream, { status: statusCode, statusText: res.statusMessage || '', headers: responseHeaders }));
          } else {
            console.error(`${logPrefix} Invalid expectedResponseType for https.request: ${expectedResponseType}`);
            res.resume();
            reject(new PikoApiError(`Internal error: Invalid expected response type for https.request.`, { statusCode: 500 }));
          }
      });

      req.on('error', (e) => {
           console.error(`${logPrefix} https.request direct error for ${method} ${url.toString()}:`, e);
         let errorMessage = `Request failed: ${e.message}`;
         const errorCode = (e as any).code;
         if (errorCode) {
             errorMessage = `Request failed with code ${errorCode}: ${e.message}`;
           }
         reject(new PikoApiError(errorMessage, { cause: e }));
      });

        if (requestBodyString) {
           req.write(requestBodyString);
      }
      req.end();
    });
    } catch (error) {
      // Adjusted retry logic
      if (!isRetry && error instanceof PikoApiError && (error.statusCode === 401 || error.errorId === PikoErrorCode.SessionExpired || error.errorId === PikoErrorCode.Unauthorized)) {
        if (connectorId) { // Only attempt refresh if connectorId was originally used
          console.warn(`${logPrefix} Auth error using https.request (${error.statusCode}, ID: ${error.errorId}). Attempting token refresh and retry for connector ${connectorId}...`);
          return fetchPikoApiData({ // Pass through all original params, isRetry will be true
            connectorId, path, queryParams, method, body, isRetry: true, additionalHeaders, expectedResponseType
            // directConfig and directAccessToken are not passed for connectorId based retry
          });
        } else {
          console.warn(`${logPrefix} Auth error using https.request with direct token. Failing operation as refresh is not available without connectorId.`);
          // Do not retry if directAccessToken was used, just throw the original error.
        }
      }
      console.error(`${logPrefix} Error during https.request execution:`, error);
      throw error; 
    }

  } else {
     console.log(`${logPrefix} Using fetch for: ${method} ${url.toString()}`);
     
     let agent: import('https').Agent | undefined = undefined;
     if (effectiveConfig.type === 'local' && effectiveConfig.ignoreTlsErrors && httpsModule) { // Use effectiveConfig
         console.warn(`${logPrefix} Disabling TLS certificate validation for local API request to ${effectiveConfig.host}:${effectiveConfig.port} (via fetch agent)`);
         agent = new httpsModule.Agent({ rejectUnauthorized: false });
     } else if (effectiveConfig.type === 'local' && effectiveConfig.ignoreTlsErrors && !httpsModule) { // Use effectiveConfig
         console.error(`${logPrefix} Cannot ignore TLS errors via fetch: https module not available.`);
     }

     let currentUrlForFetch: URL = new URL(url.toString());

     try {
        const requestOptionsInit: RequestInit = {
            method: method,
            headers: finalHeaders,
            body: (body && (method === 'POST' || method === 'PUT')) ? JSON.stringify(body) : undefined,
            redirect: effectiveConfig.type === 'cloud' ? 'manual' : 'follow', // Use effectiveConfig
        };

        if (agent) {
            (requestOptionsInit as any).agent = agent; 
        }

        let response!: Response;
        let redirectCount = 0;
        const MAX_REDIRECTS = 5;
        let fetchAttemptSuccessful = false;

        while (redirectCount <= MAX_REDIRECTS) {
            console.log(`${logPrefix} Attempt ${redirectCount + 1} to ${method} ${currentUrlForFetch.toString()}`);
            response = await fetch(currentUrlForFetch.toString(), requestOptionsInit);
            fetchAttemptSuccessful = true; 
            console.log(`${logPrefix} fetch response status: ${response.status}`);

            if (effectiveConfig.type === 'cloud' && response.status === 307) {
                const locationHeader = response.headers.get('Location');
                if (!locationHeader) {
                    fetchAttemptSuccessful = false;
                    throw new PikoApiError(`Redirect status ${response.status} received but no Location header found.`, { statusCode: response.status });
                }
                const nextUrl = new URL(locationHeader, currentUrlForFetch); 
                currentUrlForFetch = nextUrl;
                console.warn(`${logPrefix} Redirecting (${response.status}) to: ${currentUrlForFetch.toString()}`);
                redirectCount++;
                fetchAttemptSuccessful = false; 
                continue; 
            }
            break;
        }

        if (redirectCount > MAX_REDIRECTS) {
            throw new PikoApiError(`Exceeded maximum redirect limit (${MAX_REDIRECTS}) for ${method} ${currentUrlForFetch.toString()}`, { statusCode: 508 });
        }

        if (!fetchAttemptSuccessful) {
             throw new PikoApiError(`Fetch attempt did not result in a final response for ${method} ${currentUrlForFetch.toString()}`, { statusCode: 500 });
        }

        if (!response.ok) {
          let errorBodyText: string | null = null;
          let parsedErrorJson: any = null;
          let specificErrorString: string | undefined = undefined;
          let specificErrorId: string | undefined = undefined;
          
          try { errorBodyText = await response.text(); } catch (textError) { /* Ignore */ }

          if (errorBodyText) {
            try {
              parsedErrorJson = JSON.parse(errorBodyText);
              if (typeof parsedErrorJson.errorString === 'string' && parsedErrorJson.errorString) {
                specificErrorString = parsedErrorJson.errorString;
              }
               if (typeof parsedErrorJson.errorId === 'string' && parsedErrorJson.errorId) {
                 specificErrorId = parsedErrorJson.errorId;
               }
            } catch (jsonError) { /* Ignore */ }
          }

          const baseMessage = `Failed ${method} ${path} (${response.status}) via fetch`;
          const errorMessage = specificErrorString || baseMessage;
          const rawErrorData = parsedErrorJson || errorBodyText;

          const apiError = new PikoApiError(errorMessage, { 
            statusCode: response.status, 
            errorString: specificErrorString, 
            errorId: specificErrorId,
            rawError: rawErrorData
          });

          if (!isRetry && (apiError.statusCode === 401 || apiError.errorId === PikoErrorCode.SessionExpired || apiError.errorId === PikoErrorCode.Unauthorized)) {
            if (connectorId) { // Only attempt refresh if connectorId was originally used
              console.warn(`${logPrefix} Auth error using fetch (${apiError.statusCode}, ID: ${apiError.errorId}). Attempting token refresh and retry for connector ${connectorId}...`);
              return fetchPikoApiData({ // Pass through all original params, isRetry will be true
                connectorId, path, queryParams, method, body, isRetry: true, additionalHeaders, expectedResponseType
                // directConfig and directAccessToken are not passed for connectorId based retry
              });
            } else {
              console.warn(`${logPrefix} Auth error using fetch with direct token. Failing operation as refresh is not available without connectorId.`);
              // Do not retry if directAccessToken was used, just throw the apiError.
            }
          }
          throw apiError;
        }

        if (expectedResponseType === 'json') {
            if (response.status === 204) {
              console.log(`${logPrefix} Success (204 No Content) via fetch`);
          return null;
        }
            try {
                const data = await response.json();
                console.log(`${logPrefix} Success (JSON) via fetch`);
        return data;
            } catch (e) {
                console.error(`${logPrefix} Failed to parse successful JSON response from fetch:`, e);
                let bodyText = '';
                try { bodyText = await response.text(); } catch {} 
                throw new PikoApiError(`Failed to parse successful JSON response from fetch: ${e instanceof Error ? e.message : 'Unknown error'}`, {
                    statusCode: response.status, 
                    rawError: bodyText || 'Could not read response body'
                });
            }
        } else if (expectedResponseType === 'blob') {
            try {
                const blob = await response.blob();
                console.log(`${logPrefix} Success (Blob) via fetch`);
                return blob;
            } catch (e) {
                console.error(`${logPrefix} Failed to process successful Blob response from fetch:`, e);
                throw new PikoApiError(`Failed to process blob response from fetch: ${e instanceof Error ? e.message : 'Unknown error'}`, { cause: e });
            }
        } else if (expectedResponseType === 'stream') {
            console.log(`${logPrefix} Success (Stream) via fetch`);
            return response;
        } else {
            console.error(`${logPrefix} Invalid expectedResponseType for fetch: ${expectedResponseType}`);
            try { await response.text(); } catch {}
            throw new PikoApiError(`Internal error: Invalid expected response type for fetch.`, { statusCode: 500 });
        }

      } catch (error) {
        if (error instanceof PikoApiError) {
          console.error(`${logPrefix} Piko API Error (fetch path): ${error.message}`, { statusCode: error.statusCode, errorId: error.errorId, errorString: error.errorString, rawError: error.rawError });
          throw error;
        } else if (error instanceof Error) {
          console.error(`${logPrefix} Fetch/Network error (fetch path):`, error.message, error.cause ? `Cause: ${JSON.stringify(error.cause)}` : '', error.stack);
          throw new PikoApiError(`Network or fetch error for ${currentUrlForFetch.toString()}: ${error.message}`, { cause: error });
        } else {
          console.error(`${logPrefix} Unexpected non-Error type during fetch (fetch path):`, error);
          throw new PikoApiError(`Unexpected issue during fetch for ${currentUrlForFetch.toString()}`);
        }
      }
  }
}

/**
* Fetches the list of Servers for a specific Piko system.
* @param connectorId The ID of the Piko connector.
* @returns Promise resolving to array of PikoServerRaw objects.
*/
export async function getSystemServers(
  connectorId: string
): Promise<PikoServerRaw[]> {
  const logPrefix = `[getSystemServers][${connectorId}]`;
  console.log(`${logPrefix} Fetching servers.`);

  const queryParams = { '_with': 'id,name,osInfo,parameters.systemRuntime,parameters.physicalMemory,parameters.timeZoneInformation,status,storages,url,version' };
  const path = '/rest/v3/servers';
  
  const data = await fetchPikoApiData({
    connectorId,
    path,
    queryParams,
    method: 'GET',
    expectedResponseType: 'json'
  });

  const servers = (data as any)?.servers || data;

  if (!servers || !Array.isArray(servers)) {
    console.error(`${logPrefix} Invalid servers response format:`, data);
    throw new PikoApiError('Piko servers response did not contain a valid servers array.', { 
        rawError: data, 
        errorId: PikoErrorCode.InvalidParameter 
    });
  }

  console.log(`${logPrefix} Successfully fetched ${servers.length} servers.`);
  return servers as PikoServerRaw[];
}

// Function to be re-introduced and refactored
/**
* Fetches details for a specific Device in a Piko system, including media streams.
* @param connectorId The ID of the Piko connector.
* @param deviceId The GUID of the specific device.
* @returns Promise resolving to a PikoDeviceRaw object or null if not found.
* @throws PikoApiError if the request fails or the response is invalid (other than 404).
*/
export async function getSystemDeviceById(
  connectorId: string,
  deviceId: string
): Promise<PikoDeviceRaw | null> {
  const logPrefix = `[getSystemDeviceById][${connectorId}][Device: ${deviceId.substring(0,8)}...]`;
  console.log(`${logPrefix} Fetching device details.`);

  if (!deviceId) {
    throw new PikoApiError("Device ID is required to fetch specific device details.", { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  }

  const path = `/rest/v3/devices/${deviceId}`;
  const queryParams = { '_with': 'id,deviceType,mac,model,name,serverId,status,url,vendor,mediaStreams' };

  try {
    const data = await fetchPikoApiData({
      connectorId,
      path,
      queryParams,
      method: 'GET',
      expectedResponseType: 'json'
    });

    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      console.log(`${logPrefix} Successfully fetched device details.`);
      return data as PikoDeviceRaw;
    } else if (data === null) { 
      console.warn(`${logPrefix} Received null response for device details (possibly 204 No Content). Treating as not found.`);
      return null;
    } else {
      console.error(`${logPrefix} Unexpected response format for device details:`, data);
      throw new PikoApiError('Unexpected response format when fetching device by ID.', { 
          rawError: data, 
          errorId: PikoErrorCode.InvalidParameter
      });
    }
  } catch (error) {
    if (error instanceof PikoApiError && error.statusCode === 404) {
      console.log(`${logPrefix} Device not found (404).`);
      return null; 
    }
    console.error(`${logPrefix} Error fetching device by ID (or error from fetchPikoApiData that wasn't a 404):`, error); 
    throw error;
  }
}

/**
* Fetches the list of Devices for a specific Piko system.
* @param connectorId The ID of the Piko connector.
* @returns Promise resolving to array of PikoDeviceRaw objects.
* @throws PikoApiError if the request fails or the response is invalid.
*/
export async function getSystemDevices(
  connectorId: string
): Promise<PikoDeviceRaw[]> {
  const logPrefix = `[getSystemDevices][${connectorId}]`;
  console.log(`${logPrefix} Fetching devices.`);

  const path = '/rest/v3/devices/';
  const queryParams = { '_with': 'id,deviceType,mac,model,name,serverId,status,url,vendor,mediaStreams' }; 
      
  const data = await fetchPikoApiData({
    connectorId,
    path,
    queryParams,
    method: 'GET',
    expectedResponseType: 'json'
  });

  // Assuming the Piko API for this endpoint directly returns an array of devices.
  if (!Array.isArray(data)) {
    console.error(`${logPrefix} Invalid response format. Expected a direct array of devices. Received:`, data);
    throw new PikoApiError('Piko devices response was not a valid array.', { 
        rawError: data, 
        errorId: PikoErrorCode.InvalidParameter 
        // No statusCode here, as the HTTP call was successful.
    });
  }

  console.log(`${logPrefix} Successfully fetched ${data.length} devices.`);
  return data as PikoDeviceRaw[]; // Cast the validated array to the expected type
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
 * @param connectorId The ID of the Piko connector.
 * @param serverId The ID of the Piko server hosting the camera.
 * @returns Promise resolving to the ticket token string.
 * @throws PikoApiError if the request fails.
 */
export async function createPikoLoginTicket(
  connectorId: string,
  serverId: string
): Promise<string> {
  const logPrefix = `[createPikoLoginTicket][${connectorId}][Server: ${serverId.substring(0,8)}...]`;
  console.log(`${logPrefix} Creating login ticket.`);

  if (!serverId) {
    throw new PikoApiError('Server ID is required to create a login ticket.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  }

  const path = '/rest/v3/login/tickets';
  const headers = { 'X-Server-Guid': serverId, 'Accept': 'application/json' };

  try {
    const data = await fetchPikoApiData({
      connectorId,
      path,
      queryParams: undefined,
      method: 'POST',
      body: undefined,
      isRetry: false,
      additionalHeaders: headers,
      expectedResponseType: 'json'
    });
  
  const ticketResponse = data as PikoLoginTicketResponse;
  if (!ticketResponse || !ticketResponse.token) {
      console.error(`${logPrefix} Piko Create Ticket response missing token.`, data);
      throw new PikoApiError('Piko Create Ticket response did not contain a token.', { rawError: data });
  }
    console.log(`${logPrefix} Successfully created login ticket.`);
  return ticketResponse.token;

  } catch (error) {
    console.error(`${logPrefix} Error:`, error instanceof Error ? error.message : String(error), error);
    if (error instanceof PikoApiError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new PikoApiError(`Failed to create Piko login ticket: ${errorMessage}`, { cause: error });
  }
}

/**
 * Fetches the "best shot" thumbnail image for a given analytics object track as a Blob.
 * 
 * @param connectorId The ID of the Piko connector.
 * @param objectTrackId The ID of the analytics object track.
 * @param cameraId The GUID of the camera associated with the event.
 * @returns Promise resolving to the image Blob.
 * @throws PikoApiError if the request fails, or the response is not a Blob.
 */
export async function getPikoBestShotImageBlob(
  connectorId: string,
  objectTrackId: string,
  cameraId: string
): Promise<Blob> {
  const logPrefix = `[getPikoBestShotImageBlob][${connectorId}]`;
  console.log(`${logPrefix} Fetching best shot for track ${objectTrackId} on camera ${cameraId}.`);

  if (!objectTrackId || !cameraId) {
    throw new PikoApiError('Missing required parameters (objectTrackId, cameraId) for getPikoBestShotImageBlob.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  }

  const path = '/ec2/analyticsTrackBestShot';
  const queryParams = { objectTrackId, cameraId };
  const additionalHeaders = { 'Accept': 'image/*' };

  const blobData = await fetchPikoApiData({
    connectorId: connectorId,
    path: path,
    queryParams: queryParams,
    method: 'GET',
    additionalHeaders: additionalHeaders,
    expectedResponseType: 'blob'
  });
  
  if (!(blobData instanceof Blob)) {
     console.error(`${logPrefix} Did not receive a Blob for best shot. Received:`, blobData);
     throw new PikoApiError('Expected image Blob response from Best Shot API but received a different type.', { 
       rawError: blobData,
       errorId: PikoErrorCode.InvalidParameter // Or a custom error code
     });
  }

  console.log(`${logPrefix} Successfully retrieved Piko Best Shot image blob (Type: ${blobData.type}, Size: ${blobData.size})`);
  return blobData;
}

/**
 * Fetches the thumbnail image for a specific device as a Blob.
 * Supports both cloud and local connections.
 *
 * @param connectorId The ID of the Piko connector.
 * @param deviceId The GUID of the device.
 * @param timestampMs Optional epoch timestamp in milliseconds for a historical thumbnail.
 * @param size Optional desired image size in "WidthxHeight" format (e.g., "320x240").
 * @returns Promise resolving to the image Blob.
 * @throws PikoApiError if the request fails or the response is not an image.
 */
export async function getPikoDeviceThumbnail(
  connectorId: string,
  deviceId: string,
  timestampMs?: number,
  size?: string
): Promise<Blob> {
  const logPrefix = `[getPikoDeviceThumbnail][${connectorId}][Device: ${deviceId.substring(0,8)}...]`;
  console.log(`${logPrefix} Fetching device thumbnail. Timestamp: ${timestampMs || 'current'}, Size: ${size || 'default'}`);

  if (!deviceId) {
    throw new PikoApiError('Device ID is required for getPikoDeviceThumbnail.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  }

  const path = `/rest/v3/devices/${deviceId}/image`;
  const queryParams: Record<string, string> = {};
  if (timestampMs !== undefined) {
    queryParams['timestampMs'] = String(timestampMs);
  }
  if (size) {
    queryParams['size'] = size;
  }
  const additionalHeaders = { 'Accept': 'image/*' };

  const blobData = await fetchPikoApiData({
    connectorId: connectorId,
    path: path,
    queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    method: 'GET',
    additionalHeaders: additionalHeaders,
    expectedResponseType: 'blob'
  });
  
  if (!(blobData instanceof Blob)) {
     console.error(`${logPrefix} Did not receive a Blob for device thumbnail. Received:`, blobData);
     throw new PikoApiError('Expected image Blob response from Device Thumbnail API but received a different type.', { 
       rawError: blobData,
       errorId: PikoErrorCode.InvalidParameter 
     });
  }

  console.log(`${logPrefix} Successfully retrieved Piko Device Thumbnail blob (Type: ${blobData.type}, Size: ${blobData.size})`);
  return blobData;
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
 * Interface for the Piko createEvent API request body.
 */
export interface PikoCreateEventPayload {
  source: string;
  caption: string;
  description: string;
  timestamp: string; // ISO 8601 format: "YYYY-MM-DDTHH:mm:ss"
  metadata?: {
    cameraRefs?: string[]; // Array of camera GUIDs (usually just one)
        [key: string]: unknown;
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
 * @param connectorId The ID of the Piko connector.
 * @param payload The event data to send.
 * @returns Promise resolving to the parsed JSON response from the Piko API.
 * @throws PikoApiError if the request fails or the API returns an error.
 */
export async function createPikoEvent(
  connectorId: string,
  payload: PikoCreateEventPayload
): Promise<PikoCreateEventResponse> {
  const logPrefix = `[createPikoEvent][${connectorId}]`;
  console.log(`${logPrefix} Creating event. Source: ${payload.source}`);

  // The path /api/createEvent is typically used with the main cloud URL or system relay URL.
  // fetchPikoApiData will use the system-specific relay URL if config.selectedSystem is set,
  // which is appropriate for system-scoped actions.
  const path = '/api/createEvent'; 

  const data = await fetchPikoApiData({
    connectorId: connectorId,
    path: path,
    method: 'POST',
    body: payload,
    expectedResponseType: 'json'
  });

  const result = data as PikoCreateEventResponse;

  // Validate the structure of the successful response from Piko
  // Piko often returns an error field that is "0" on success.
  if (result?.error && String(result.error) !== '0') {
    const errorMessage = `Piko createEvent API returned an error: ${result.errorString || 'Unknown Piko error'} (Code: ${result.error})`;
    console.error(`${logPrefix} ${errorMessage}`, result);
    throw new PikoApiError(errorMessage, { 
      errorId: result.errorId, 
      errorString: result.errorString, 
      rawError: result 
      // statusCode might be 200 if Piko embeds errors in success responses
    });
  }
  // If data is null/undefined but no error field, or if error is "0", consider it success for this endpoint structure.
  // If a more specific success payload is expected, add validation here.

  console.log(`${logPrefix} Successfully created Piko event. Source: ${payload.source}`);
  return result; // Return the (potentially minimal) success response
}

/**
 * Interface for the Piko createBookmark API request body.
 */
export interface PikoCreateBookmarkPayload {
  name: string;
  description?: string; 
  startTimeMs: number; // Epoch timestamp in milliseconds
  durationMs: number;
  tags?: string[]; 
}

/**
 * Creates a bookmark for a specific camera in a Piko system using the Relay API.
 * @param connectorId The ID of the Piko connector.
 * @param pikoCameraDeviceId The external Device ID (GUID) of the Piko camera.
 * @param payload The bookmark data to send.
 * @returns Promise resolving when the bookmark is successfully created (void).
 * @throws PikoApiError if the request fails.
 */
export async function createPikoBookmark(
  connectorId: string,
  pikoCameraDeviceId: string,
  payload: PikoCreateBookmarkPayload
): Promise<void> { // Returns void on success
  const logPrefix = `[createPikoBookmark][${connectorId}][Cam: ${pikoCameraDeviceId.substring(0,8)}...]`;
  console.log(`${logPrefix} Creating bookmark: ${payload.name}`);

  if (!pikoCameraDeviceId) {
    throw new PikoApiError('Piko Camera Device ID is required to create a bookmark.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  }

  const path = `/rest/v3/devices/${pikoCameraDeviceId}/bookmarks`;

  // fetchPikoApiData will handle tokens and standard API errors.
  // A 204 No Content from Piko is a common success response for this, which fetchPikoApiData (json) returns as null.
  // Other 2xx responses with a JSON body would be passed through.
  const data = await fetchPikoApiData({
    connectorId: connectorId,
    path: path,
    method: 'POST',
    body: payload, 
    expectedResponseType: 'json' // Or 'stream' if truly no body is expected on success AND error
  });

  // If fetchPikoApiData returned null (for a 204 from Piko), that's success.
  // If it returned data, Piko might have a specific success structure with an error code.
  // For bookmarks, often a 200/201 with minimal body or just 204 is success.
  // If Piko returns a body on success with an error field like createEvent, add that check here.
  // For now, assuming any 2xx that fetchPikoApiData doesn't throw an error for is success.
  if (data && (data as any).error && String((data as any).error) !== '0') {
    const result = data as PikoCreateEventResponse; // Re-use for error structure if similar
    const errorMessage = `Piko createBookmark API returned an error: ${result.errorString || 'Unknown Piko error'} (Code: ${result.error})`;
    console.error(`${logPrefix} ${errorMessage}`, result);
      throw new PikoApiError(errorMessage, { 
      errorId: result.errorId, 
      errorString: result.errorString, 
      rawError: result 
    });
  }

  console.log(`${logPrefix} Successfully created Piko bookmark: ${payload.name}`);
  // No specific data to return on success for void Promise
}

/**
 * Initiates a media stream request for a specific camera and timestamp.
 * IMPORTANT: This function returns the raw Response object. The caller is responsible
 * for handling the media stream (e.g., reading the body as a ReadableStream).
 *
 * @param connectorId The ID of the Piko connector.
 * @param cameraId The GUID of the camera device.
 * @param positionMs The starting position for the media stream in epoch milliseconds.
 * @param format Optional container format (e.g., 'webm'). If provided, appends '.<format>' to the path.
 * @param serverId Optional server ID. If provided, an attempt will be made to use ticket-based authentication for this stream.
 * @returns Promise resolving to the raw Fetch Response object containing the media stream.
 * @throws PikoApiError if the request fails or required parameters are missing.
 */
export async function getPikoMediaStream(
  connectorId: string,
  cameraId: string,
  positionMs: number,
  format?: string, 
  serverId?: string 
): Promise<Response> {
  const logPrefix = `[getPikoMediaStream][${connectorId}][Cam: ${cameraId.substring(0,8)}...]`;
  console.log(`${logPrefix} Initiating media stream. Position: ${positionMs}, Format: ${format || 'default'}, ServerId: ${serverId || 'N/A'}`);

  if (!cameraId || positionMs === undefined) {
    throw new PikoApiError('Missing required parameters (cameraId, positionMs) for getPikoMediaStream.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  }

  let path = `/rest/v3/devices/${cameraId}/media`;
  if (format) {
    path += `.${format.trim().toLowerCase()}`;
  }
  
  const queryParams: Record<string, string> = { positionMs: String(positionMs) };
  let additionalHeaders: Record<string, string> | undefined = undefined;

  if (serverId) {
    console.log(`${logPrefix} ServerId ${serverId} provided. Attempting to create login ticket.`);
    try {
      const streamTicket = await createPikoLoginTicket(connectorId, serverId);
      queryParams['_ticket'] = streamTicket;
      additionalHeaders = { 'X-Server-Guid': serverId }; 
      console.log(`${logPrefix} Successfully obtained login ticket. Will use ticket for auth.`);
    } catch (ticketError) {
      console.warn(`${logPrefix} Failed to create login ticket for server ${serverId}:`, ticketError instanceof Error ? ticketError.message : String(ticketError));
      console.warn(`${logPrefix} Falling back to bearer token authentication for media stream.`);
      additionalHeaders = undefined;
    }
  }

  const response = await fetchPikoApiData({
    connectorId: connectorId,
    path: path,
    queryParams: queryParams,
    method: 'GET',
    body: undefined,
    isRetry: false,
    additionalHeaders: additionalHeaders,
    expectedResponseType: 'stream'
  });

  if (!(response instanceof Response)) {
     console.error(`${logPrefix} Piko Media Stream did not return a Response object. Received:`, response);
     throw new PikoApiError('Expected stream Response object from fetchPikoApiData for media stream.', { rawError: response });
  }
  console.log(`${logPrefix} Successfully initiated Piko Media Stream request. Status: ${response.status}`);
  return response;
}

/**
 * Initiates an HLS media stream request for a specific camera.
 * Returns the raw Response object containing the M3U8 playlist.
 *
 * @param connectorId The ID of the Piko connector.
 * @param cameraId The GUID of the camera device.
 * @returns Promise resolving to the raw Fetch Response object containing the M3U8 playlist.
 * @throws PikoApiError if the request fails or required parameters are missing.
 */
export async function getPikoHlsStream(
  connectorId: string,
  cameraId: string
): Promise<Response> {
  const logPrefix = `[getPikoHlsStream][${connectorId}][Cam: ${cameraId.substring(0,8)}...]`;
  console.log(`${logPrefix} Initiating HLS stream.`);

  if (!cameraId) {
    throw new PikoApiError('Camera ID is required for getPikoHlsStream.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  }

  const path = `/hls/${cameraId}.m3u8`;
  const additionalHeaders = { 
    'Accept': '*/*', 
    'User-Agent': 'FusionBridge/1.0' 
  };

  const response = await fetchPikoApiData({
    connectorId: connectorId,
    path: path,
    method: 'GET',
    additionalHeaders: additionalHeaders,
    expectedResponseType: 'stream'
  });
  
  if (!(response instanceof Response)) {
     console.error(`${logPrefix} Piko HLS Stream did not return a Response object from fetchPikoApiData. Received:`, response);
     throw new PikoApiError('Expected stream Response object from fetchPikoApiData for HLS stream.', { rawError: response });
  }

  console.log(`${logPrefix} Successfully initiated Piko HLS Stream request. Status: ${response.status}`);
  return response;
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
  const logPrefix = '[getSystemInfo]';

  // Minimal validation, relying on _getPikoApiBaseUrl (via fetchPikoApiData) for detailed config checks.
  if (!config || (config.type !== 'local' && config.type !== 'cloud')) {
       throw new PikoApiError(`Invalid config type provided to getSystemInfo: ${config?.type}`, { statusCode: 400, errorId: PikoErrorCode.InvalidParameter });
  }
  // The exhaustive check for config.type can be removed if we simplify the initial check like above.
  // else if (config.type !== 'local' && config.type !== 'cloud') {
  //   const exhaustiveCheck: never = config.type; // This would cause a compile error if types change
  //   throw new PikoApiError(`Unsupported Piko config type for getSystemInfo.`, { statusCode: 400, errorId: PikoErrorCode.InvalidParameter });
  // }
  console.log(`${logPrefix} Attempting to fetch system info for type: ${config.type}`);

  const path = '/rest/v3/system/info';

  try {
    const data = await fetchPikoApiData({
      directConfig: config,
      directAccessToken: accessToken,
      path: path,
      method: 'GET',
      expectedResponseType: 'json'
      // connectorId is omitted
    });

    // Option 1: Ultra-lean validation. 
    // Trust that 'data' is PikoSystemInfo if fetchPikoApiData (with expectedResponseType: 'json')
    // did not throw and the API contract is met. 
    // Perform a basic check to ensure it's a non-null object.
    if (data && typeof data === 'object') {
      // No further per-field validation here. Trust the cast and downstream consumers.
      return data as PikoSystemInfo;
    } else {
      // This case implies fetchPikoApiData returned something unexpected for a successful JSON response 
      // (e.g., null, or a non-object type, which should be rare if the API is consistent and fetchPikoApiData works as designed).
      console.error(`${logPrefix} Expected an object from API for ${path}, but got:`, JSON.stringify(data, null, 2));
      throw new PikoApiError(`Expected an object for system info, but received different type or null.`, { rawError: data, errorId: PikoErrorCode.InvalidParameter });
    }
  } catch (error) {
    // Log specifically that the error came from the getSystemInfo context
    console.error(`${logPrefix} Failed to get system info:`, error);
    // Re-throw error, assuming fetchPikoApiData already wrapped it as PikoApiError if it originated from the HTTP call
    // or if it was one of our PikoApiErrors from initial validation.
    throw error;
  }
}