import { Readable } from 'stream';
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import { calculateExpiresAt, isTokenExpiring } from '@/lib/token-utils';
import { updateConnectorConfig } from '@/data/repositories/connectors';

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

// ###################################################################################
// #                           TYPE DEFINITIONS & ENUMS                            #
// ###################################################################################

export interface PikoConfig {
  type: 'cloud' | 'local';
  username: string;
  password: string;
  host?: string;
  port?: number;
  ignoreTlsErrors?: boolean;
  selectedSystem?: string;
  token?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    scope?: string;
    sessionId?: string;
  };
}

export interface PikoSystem {
  id: string;
  name: string;
  version?: string;
  health?: string;
  role?: string;
}

export interface PikoTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
  sessionId?: string;
}

interface PikoLocalTokenData {
  token: string;
  expiresInS: number;
  id: string; // Session ID
  username: string;
  ageS: number;
}

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
  storages?: unknown[];
  url?: string;
  version?: string;
  accessRole?: string;
}

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
    resolution?: string;
    transcodingRequired?: boolean;
    transports?: string;
  }[];
}

interface PikoSystemRaw {
  id: string;
  name: string;
  version?: string;
  stateOfHealth?: string;
  accessRole?: string;
}

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

export class PikoApiError extends Error {
  public readonly statusCode?: number;
  public readonly errorId?: string; 
  public readonly errorString?: string;
  public readonly rawError?: unknown;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      errorId?: string;
      errorString?: string;
      cause?: unknown;
      rawError?: unknown;
    }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'PikoApiError';
    this.statusCode = options?.statusCode;
    this.errorId = options?.errorId;
    this.errorString = options?.errorString || message;
    this.rawError = options?.rawError;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PikoApiError);
    }
  }
}

export interface PikoJsonRpcSubscribeParams {
    startTimeMs: number;
    eventType: ("analyticsSdkEvent" | "analyticsSdkObjectDetected")[];
    eventsOnly: boolean;
    _with: "eventParams";
}

export interface PikoJsonRpcSubscribeRequest {
    jsonrpc: "2.0";
    id: string;
    method: "rest.v3.servers.events.subscribe";
    params: PikoJsonRpcSubscribeParams;
}

export interface PikoJsonRpcEventParams {
    analyticsEngineId?: string;
    caption?: string;
    description?: string;
    eventResourceId?: string;
    eventTimestampUsec?: string;
    eventType?: string;
    inputPortId?: string;
    key?: string;
    metadata?: {
        allUsers?: boolean;
        level?: string;
        [key: string]: unknown;
    };
    objectTrackId?: string;
    omitDbLogging?: boolean;
    progress?: number;
    reasonCode?: string;
    sourceServerId?: string;
    [key: string]: unknown;
}

export interface PikoCreateEventPayload {
  source: string;
  caption: string;
  description: string;
  timestamp: string;
  metadata?: {
    cameraRefs?: string[];
    [key: string]: unknown;
  };
}

export interface PikoCreateEventResponse {
  error?: string | number;
  errorId?: string;
  errorString?: string;
}

export interface PikoCreateBookmarkPayload {
  name: string;
  description?: string; 
  startTimeMs: number;
  durationMs: number;
  tags?: string[]; 
}

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
  localId: string;
  cloudId: string;
  cloudOwnerId: string;
  organizationId: string;
  servers: string[];
  edgeServerCount: number;
  devices: string[];
  ldapSyncId: string;
  synchronizedTimeMs: number;
}

// ###################################################################################
// #                         NEW CLASS-BASED API CLIENT                            #
// ###################################################################################

interface PikoApiClientRequestParams {
  connectorId?: string;
  path: string;
  queryParams?: Record<string, string>;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: object | null | undefined;
  additionalHeaders?: Record<string, string>;
  expectedResponseType?: 'json' | 'blob' | 'stream';
  directConfig?: PikoConfig;
  directAccessToken?: string;
  isRetry?: boolean;
}

interface PikoAuthContext {
  config: PikoConfig;
  accessToken: string;
}

export class PikoAuthManager {
  async getAuthContext(
    connectorId?: string, 
    directConfig?: PikoConfig, 
    directAccessToken?: string,
    forceRefresh = false
  ): Promise<PikoAuthContext> {
    if (directConfig && directAccessToken) {
      return { config: directConfig, accessToken: directAccessToken };
    } else if (connectorId) {
      try {
        const tokenAndConfig = await this._getTokenAndConfig(connectorId, { forceRefresh });
        return { 
          config: tokenAndConfig.config, 
          accessToken: tokenAndConfig.token.accessToken 
        };
      } catch (error) {
        if (error instanceof PikoApiError) throw error;
        throw new PikoApiError(
          `Failed to get configuration or token for connector ${connectorId}: ${error instanceof Error ? error.message : String(error)}`, 
          { cause: error }
        );
      }
    } else {
      throw new PikoApiError(
        'API request requires either connectorId or directConfig & directAccessToken.',
        { statusCode: 500, errorId: PikoErrorCode.MissingParameter }
      );
    }
  }

  private async _fetchPikoCloudToken(
    username: string, 
    password: string, 
    scope?: string
  ): Promise<PikoTokenResponse> {
    const logPrefix = `[PikoAuthManager:_fetchPikoCloudToken][User: ${username.substring(0,3)}...]`;
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
      const calculatedExpiresAt = calculateExpiresAt(data.expires_at || (data.expires_in ? now + parseInt(data.expires_in, 10) * 1000 : undefined));
      
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

  private async _fetchPikoLocalToken(
    config: PikoConfig & { type: 'local' }
  ): Promise<PikoTokenResponse> {
    const logPrefix = `[PikoAuthManager:_fetchPikoLocalToken][${config.host}:${config.port}]`;
    console.log(`${logPrefix} Attempting to fetch local token.`);
    if (!config.host || !config.port || !config.username || !config.password) {
      throw new PikoApiError('Host, port, username, and password are required for local Piko token fetch.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
    }
    const baseUrl = this._getPikoApiBaseUrl(config);
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

  private async _refreshPikoCloudToken(refreshToken: string): Promise<PikoTokenResponse> {
    const logPrefix = '[PikoAuthManager:_refreshPikoCloudToken]';
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
      const calculatedExpiresAt = calculateExpiresAt(data.expires_at || (data.expires_in ? now + parseInt(data.expires_in, 10) * 1000 : undefined));
      console.log(`${logPrefix} Successfully refreshed Piko Cloud token.`);
      return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: calculatedExpiresAt, scope: data.scope || undefined };
    } catch (error) {
      console.error(`${logPrefix} Unexpected error during Piko Cloud token refresh:`, error);
      if (error instanceof PikoApiError) throw error;
      throw new PikoApiError(`Unexpected error during Piko Cloud token refresh: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }

  public async _getTokenAndConfig( // Made public for now, might be internal to manager later
    connectorId: string, 
    options?: { forceRefresh?: boolean }
  ): Promise<{ config: PikoConfig; token: PikoTokenResponse; }> {
    const logPrefix = `[PikoAuthManager:_getTokenAndConfig][Piko][${connectorId}]`;
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
        newPikoTokenResponse = await this._refreshPikoCloudToken(currentDbConfig.token.refreshToken);
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
            await this._fetchPikoCloudToken(currentDbConfig.username, currentDbConfig.password, scope) :
            await this._fetchPikoLocalToken(currentDbConfig as PikoConfig & { type: 'local' });
      }
      console.log(`${logPrefix} Successfully performed token action: '${attemptedAction}'.`);

    } catch (error) {
      console.warn(`${logPrefix} Token action '${attemptedAction}' failed. Fallback to new fetch. Initial error:`, error);
      attemptedAction = "fetch_new_after_fallback";
      try {
        console.log(`${logPrefix} Fallback: Fetching new token directly via password grant/local auth.`);
        const scope = (currentDbConfig.type === 'cloud' && currentDbConfig.selectedSystem) ? `cloudSystemId=${currentDbConfig.selectedSystem}` : undefined;
        newPikoTokenResponse = currentDbConfig.type === 'cloud' ? 
            await this._fetchPikoCloudToken(currentDbConfig.username, currentDbConfig.password, scope) :
            await this._fetchPikoLocalToken(currentDbConfig as PikoConfig & { type: 'local' });
        console.log(`${logPrefix} Successfully performed fallback token action: '${attemptedAction}'.`);
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
      throw new PikoApiError(`Failed to persist new token for ${connectorId} to DB. Downstream operations will use stale data. Error: ${dbUpdateError instanceof Error ? dbUpdateError.message : String(dbUpdateError)}`, 
          { cause: dbUpdateError, errorId: PikoErrorCode.CantProcessRequest });
    }
    
    console.log(`${logPrefix} Piko token was updated. Returning new config and token response.`);
    return { config: updatedConfigWithNewToken, token: newPikoTokenResponse };
  }
  
  private _getPikoApiBaseUrl(config: PikoConfig): string {
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
        // This case should ideally be caught by TypeScript's exhaustiveness check
        // if PikoConfig.type has more variants in the future.
        const exhaustiveCheck: never = config.type;
        throw new PikoApiError(`Unsupported Piko config type: ${exhaustiveCheck}`, { errorId: PikoErrorCode.InvalidParameter });
    }
  }
}

interface PikoHttpRequestStrategy {
  request(
    url: URL,
    method: string,
    headers: Record<string, string>,
    body?: string | null,
    config?: PikoConfig, // For NodeHttpsStrategy to access host/port/ignoreTls
    logPrefix?: string,
    expectedResponseType?: 'json' | 'blob' | 'stream'
  ): Promise<unknown>;
}

class PikoFetchStrategy implements PikoHttpRequestStrategy {
  async request(
    url: URL,
    method: string,
    headers: Record<string, string>,
    body?: string | null,
    config?: PikoConfig, // config is used for redirect logic
    logPrefix: string = '[PikoFetchStrategy]',
    expectedResponseType: 'json' | 'blob' | 'stream' = 'json'
  ): Promise<unknown> {
    console.log(`${logPrefix} Using fetch for: ${method} ${url.toString()}`);
     
    let agent: import('https').Agent | undefined = undefined;
    if (config?.type === 'local' && config.ignoreTlsErrors && httpsModule) {
      console.warn(`${logPrefix} Disabling TLS certificate validation (via fetch agent)`);
      agent = new httpsModule.Agent({ rejectUnauthorized: false });
    } else if (config?.type === 'local' && config.ignoreTlsErrors && !httpsModule) {
      console.error(`${logPrefix} Cannot ignore TLS errors via fetch: https module not available.`);
    }

    const requestOptionsInit: RequestInit = {
      method: method,
      headers: headers,
      body: body ?? undefined,
      redirect: config?.type === 'cloud' ? 'manual' : 'follow',
    };

    if (agent) {
      (requestOptionsInit as any).agent = agent; 
    }

    try {
      const { response } = await this._handleFetchRedirects(url, requestOptionsInit, config, logPrefix);
       
      if (!response.ok) {
        const errorDetails = await this._extractFetchErrorDetails(response);
        throw new PikoApiError(errorDetails.errorMessage, { 
          statusCode: response.status, 
          errorString: errorDetails.errorString, 
          errorId: errorDetails.errorId,
          rawError: errorDetails.rawError
        });
      }
      return this._processFetchResponse(response, expectedResponseType, logPrefix);
    } catch (error) {
      if (error instanceof PikoApiError) {
        console.error(`${logPrefix} Piko API Error (fetch):`, error.message);
        throw error;
      } else if (error instanceof Error) {
        console.error(`${logPrefix} Fetch/Network error:`, error.message);
        throw new PikoApiError(`Network or fetch error: ${error.message}`, { cause: error });
      } else {
        console.error(`${logPrefix} Unexpected non-Error type during fetch:`, error);
        throw new PikoApiError(`Unexpected issue during fetch`);
      }
    }
  }

  private async _handleFetchRedirects(
    initialUrl: URL,
    requestOptions: RequestInit,
    config: PikoConfig | undefined,
    logPrefix: string
  ): Promise<{ response: Response; finalUrl: URL }> {
    let currentUrl = new URL(initialUrl.toString());
    let response: Response;
    let redirectCount = 0;
    const MAX_REDIRECTS = 5;

    while (redirectCount <= MAX_REDIRECTS) {
      console.log(`${logPrefix} Attempt ${redirectCount + 1} to ${requestOptions.method} ${currentUrl.toString()}`);
      response = await fetch(currentUrl.toString(), requestOptions);
      console.log(`${logPrefix} fetch response status: ${response.status}`);

      if (config?.type === 'cloud' && response.status === 307) {
        const locationHeader = response.headers.get('Location');
        if (!locationHeader) {
          throw new PikoApiError(`Redirect status ${response.status} received but no Location header found.`, { statusCode: response.status });
        }
        const nextUrl = new URL(locationHeader, currentUrl); 
        currentUrl = nextUrl;
        console.warn(`${logPrefix} Redirecting (${response.status}) to: ${currentUrl.toString()}`);
        redirectCount++;
        continue; 
      }
      return { response, finalUrl: currentUrl };
    }
    throw new PikoApiError(`Exceeded maximum redirect limit (${MAX_REDIRECTS})`, { statusCode: 508 });
  }

  private async _extractFetchErrorDetails(response: Response): Promise<{
    errorMessage: string; errorId?: string; errorString?: string; rawError?: unknown;
  }> {
    let errorBodyText: string | null = null;
    let parsedErrorJson: any = null;
    let specificErrorString: string | undefined = undefined;
    let specificErrorId: string | undefined = undefined;
    try { errorBodyText = await response.text(); } catch (textError) { /* Ignore */ }
    if (errorBodyText) {
      try {
        parsedErrorJson = JSON.parse(errorBodyText);
        if (typeof parsedErrorJson.errorString === 'string' && parsedErrorJson.errorString) specificErrorString = parsedErrorJson.errorString;
        if (typeof parsedErrorJson.errorId === 'string' && parsedErrorJson.errorId) specificErrorId = parsedErrorJson.errorId;
      } catch (jsonError) { /* Ignore */ }
    }
    const baseMessage = `Failed request (${response.status})`;
    const errorMessage = specificErrorString || baseMessage;
    const rawErrorData = parsedErrorJson || errorBodyText;
    return { errorMessage, errorId: specificErrorId, errorString: specificErrorString, rawError: rawErrorData };
  }

  private async _processFetchResponse(
    response: Response, 
    expectedResponseType: 'json' | 'blob' | 'stream',
    logPrefix: string
  ): Promise<unknown> {
    if (expectedResponseType === 'json') {
      if (response.status === 204) { console.log(`${logPrefix} Success (204 No Content) via fetch`); return null; }
      try {
        const data = await response.json(); console.log(`${logPrefix} Success (JSON) via fetch`); return data;
      } catch (e) {
        console.error(`${logPrefix} Failed to parse successful JSON response from fetch:`, e);
        let bodyText = ''; try { bodyText = await response.text(); } catch {} 
        throw new PikoApiError(`Failed to parse successful JSON response from fetch: ${e instanceof Error ? e.message : 'Unknown error'}`, {
          statusCode: response.status, rawError: bodyText || 'Could not read response body'
        });
      }
    } else if (expectedResponseType === 'blob') {
      try {
        const blob = await response.blob(); console.log(`${logPrefix} Success (Blob) via fetch`); return blob;
      } catch (e) {
        console.error(`${logPrefix} Failed to process successful Blob response from fetch:`, e);
        throw new PikoApiError(`Failed to process blob response from fetch: ${e instanceof Error ? e.message : 'Unknown error'}`, { cause: e });
      }
    } else if (expectedResponseType === 'stream') {
      console.log(`${logPrefix} Success (Stream) via fetch`); return response;
    } else {
      console.error(`${logPrefix} Invalid expectedResponseType for fetch: ${expectedResponseType}`);
      try { await response.text(); } catch {}
      throw new PikoApiError(`Internal error: Invalid expected response type for fetch.`, { statusCode: 500 });
    }
  }
}

class PikoNodeHttpsStrategy implements PikoHttpRequestStrategy {
  async request(
    url: URL,
    method: string,
    headers: Record<string, string>,
    body?: string | null,
    config?: PikoConfig,
    logPrefix: string = '[PikoNodeHttpsStrategy]',
    expectedResponseType: 'json' | 'blob' | 'stream' = 'json'
  ): Promise<unknown> {
    if (!httpsModule || !config || !config.host || !config.port) {
      throw new PikoApiError('NodeHttpsStrategy requires https module and valid host/port in config.', {errorId: PikoErrorCode.InternalServerError});
    }
    console.warn(`${logPrefix} Using https.request for: ${method} ${url.toString()}`);
    
    // Correctly create the agent options based on ignoreTlsErrors
    const agentOptions: import('https').AgentOptions = {};
    if (config.ignoreTlsErrors) {
      console.warn(`${logPrefix} TLS certificate validation will be IGNORED.`);
      agentOptions.rejectUnauthorized = false;
    } else {
      // Default behavior: reject unauthorized (unless a CA is provided, which we are not doing here)
      agentOptions.rejectUnauthorized = true; 
    }
    const agent = new httpsModule.Agent(agentOptions);
    
    const requestBodyString = body ?? '';
    
    const httpsRequestHeaders: import('http').OutgoingHttpHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
        if (value !== undefined) httpsRequestHeaders[key.toLowerCase()] = value;
    }
    if (requestBodyString && !httpsRequestHeaders['content-length']) {
        httpsRequestHeaders['content-length'] = Buffer.byteLength(requestBodyString).toString();
    }
    
    const options: import('https').RequestOptions = {
      hostname: config.host,
      port: config.port,
      path: url.pathname + url.search, 
      method: method,
      headers: httpsRequestHeaders,
      agent: agent, 
    };

    return new Promise((resolve, reject) => {
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
              message: `Failed ${options.method} request to ${options.path} (Status: ${statusCode}) via https.request`
            };
            try {
              const errorData = JSON.parse(errorAccumulator);
              errorInfo.errorId = errorData.errorId; 
              errorInfo.errorString = errorData.errorString;
              errorInfo.message = errorData.errorString || errorData.message || errorInfo.message;
              errorInfo.raw = errorData;
            } catch (parseError) {
              console.warn(`${logPrefix} Could not parse JSON error response body:`, errorAccumulator, parseError);
              if (errorAccumulator && errorAccumulator.length < 200) errorInfo.message += `: ${errorAccumulator.substring(0, 100)}`;
              errorInfo.raw = errorAccumulator;
            }
            reject(new PikoApiError(errorInfo.message, {
              statusCode: statusCode, errorId: errorInfo.errorId, errorString: errorInfo.errorString, rawError: errorInfo.raw
            }));
          });
          return;
        }

        if (statusCode === 204 && expectedResponseType !== 'stream') {
          console.log(`${logPrefix} Success (204 No Content) via https.request`); resolve(null); return;
        }

        if (expectedResponseType === 'json') {
          res.on('data', (chunk) => { responseBody += chunk; });
          res.on('end', () => {
            try {
              const data = JSON.parse(responseBody); console.log(`${logPrefix} Success (JSON) via https.request`); resolve(data);
            } catch (parseError) {
              console.error(`${logPrefix} Failed to parse successful JSON response (https.request):`, parseError);
              reject(new PikoApiError(`Failed to parse successful API response: ${parseError instanceof Error ? parseError.message : String(parseError)}`, { statusCode: 500, rawError: responseBody }));
            }
          });
        } else if (expectedResponseType === 'blob') {
          if (!contentType || !contentType.startsWith('image/')) {
            console.error(`${logPrefix} Response was not an image. Content-Type: ${contentType}`);
            res.resume(); reject(new PikoApiError(`Expected image response, got ${contentType || 'unknown'}`, { statusCode })); return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk as any, 'binary')));
          res.on('end', () => {
            try {
              const finalBuffer = Buffer.concat(chunks);
              const blob = new Blob([finalBuffer], { type: contentType });
              console.log(`${logPrefix} Success (Blob) via https.request`); resolve(blob);
            } catch (e) {
              console.error(`${logPrefix} Failed to process blob data:`, e);
              reject(new PikoApiError(`Failed to process image data: ${e instanceof Error ? e.message : 'Unknown error'}`, { cause: e }));
            }
          });
        } else if (expectedResponseType === 'stream') {
          console.log(`${logPrefix} Success (Stream) via https.request. Piping response.`);
          const nodeStream = res;
          const webReadableStream = new ReadableStream({
            start(controller) {
              nodeStream.on('data', (chunk) => {
                if (typeof chunk === 'string') controller.enqueue(new TextEncoder().encode(chunk));
                else controller.enqueue(new Uint8Array(chunk));
              });
              nodeStream.on('end', () => controller.close());
              nodeStream.on('error', (err) => controller.error(err));
            },
            cancel() { nodeStream.destroy(); }
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
          res.resume(); reject(new PikoApiError(`Internal error: Invalid expected response type for https.request.`, { statusCode: 500 }));
        }
      });
      req.on('error', (e) => {
        console.error(`${logPrefix} https.request direct error:`, e);
        let errorMessage = `Request failed: ${e.message}`;
        const errorCode = (e as any).code;
        if (errorCode) errorMessage = `Request failed with code ${errorCode}: ${e.message}`;
        reject(new PikoApiError(errorMessage, { cause: e }));
      });
      if (requestBodyString) req.write(requestBodyString);
      req.end();
    });
  }
}

class PikoHttpClient {
  private authManager: PikoAuthManager;
  private fetchStrategy: PikoFetchStrategy;
  private nodeHttpsStrategy: PikoNodeHttpsStrategy;

  constructor() {
    this.authManager = new PikoAuthManager();
    this.fetchStrategy = new PikoFetchStrategy();
    this.nodeHttpsStrategy = new PikoNodeHttpsStrategy();
  }

  private _getPikoApiBaseUrl(config: PikoConfig): string { // Re-added as private helper within client
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
        const exhaustiveCheck: never = config.type;
        throw new PikoApiError(`Unsupported Piko config type: ${exhaustiveCheck}`, { errorId: PikoErrorCode.InvalidParameter });
    }
  }

  private _getPikoBaseHeaders(accessToken?: string): Record<string, string> { // Re-added
    return accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {};
  }
  
  private _buildRequestUrl(baseUrl: string, path: string, queryParams?: Record<string, string>): URL { // Re-added
    const url = new URL(path, baseUrl);
    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    return url;
  }

  private _buildRequestHeaders(
    accessToken: string, 
    method: string, 
    body?: object | null, 
    expectedResponseType: 'json' | 'blob' | 'stream' = 'json',
    additionalHeaders?: Record<string, string>
  ): Record<string, string> { // Re-added
    const baseHeaders = this._getPikoBaseHeaders(accessToken);
    const headers: Record<string, string> = { ...baseHeaders, ...additionalHeaders };
    if (!headers['Accept']) {
      headers['Accept'] = expectedResponseType === 'json' ? 'application/json' : '*/*';
    }
    if (body && (method === 'POST' || method === 'PUT') && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  }

  async request(params: PikoApiClientRequestParams): Promise<unknown> {
    const { 
      connectorId, path, queryParams, method = 'GET', body: requestBody, 
      additionalHeaders, expectedResponseType = 'json', 
      directConfig, directAccessToken, isRetry = false 
    } = params;

    const logPrefix = `[PikoHttpClient][${connectorId || 'direct'}]${isRetry ? '[RETRY]' : ''}`;
    console.log(`${logPrefix} Requesting path: ${path}, method: ${method}, expectedType: ${expectedResponseType}`);

    if (!path) {
      throw new PikoApiError('Missing required parameter (Path).', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
    }

    const authContext = await this.authManager.getAuthContext(connectorId, directConfig, directAccessToken, isRetry);
    const { config: effectiveConfig, accessToken: effectiveAccessToken } = authContext;

    const baseUrl = this._getPikoApiBaseUrl(effectiveConfig);
    const url = this._buildRequestUrl(baseUrl, path, queryParams);
    const headers = this._buildRequestHeaders(effectiveAccessToken, method, requestBody, expectedResponseType, additionalHeaders);
    const bodyString = (requestBody && (method === 'POST' || method === 'PUT')) ? JSON.stringify(requestBody) : null;

    let strategy: PikoHttpRequestStrategy;
    if (effectiveConfig.type === 'local' && effectiveConfig.ignoreTlsErrors && httpsModule && effectiveConfig.host && effectiveConfig.port) {
      strategy = this.nodeHttpsStrategy;
    } else {
      strategy = this.fetchStrategy;
    }
    
    try {
      return await strategy.request(url, method, headers, bodyString, effectiveConfig, logPrefix, expectedResponseType);
    } catch (error) {
      if (!isRetry && error instanceof PikoApiError && 
          (error.statusCode === 401 || error.errorId === PikoErrorCode.SessionExpired || error.errorId === PikoErrorCode.Unauthorized)) {
        if (connectorId) {
          console.warn(`${logPrefix} Auth error. Attempting token refresh and retry...`);
          return this.request({ ...params, isRetry: true });
        } else {
          console.warn(`${logPrefix} Auth error with direct token. Failing as refresh is not available.`);
        }
      }
      throw error; // Re-throw if not handled by retry or not an auth error
    }
  }
}

// Singleton instance of the client
const pikoApiClient = new PikoHttpClient();

// ###################################################################################
// #                         PUBLIC API FUNCTIONS (Refactored)                       #
// ###################################################################################

export async function getAccessToken(username: string, password: string): Promise<PikoTokenResponse> {
  // This function directly calls PikoAuthManager's method, doesn't use the full PikoHttpClient
  const authManager = new PikoAuthManager();
  return authManager['_fetchPikoCloudToken'](username, password); // Accessing private method for this specific case
}

export async function getSystems(accessToken: string): Promise<PikoSystem[]> {
  // This is a specific cloud endpoint, doesn't fit the generic client well without directAccessToken usage
  const url = `${PIKO_CLOUD_URL}/cdb/systems`;
  const logPrefix = `[getSystems]`;
  console.log(`${logPrefix} Fetching systems from ${url}`);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
    });
    if (!response.ok) {
      let errorData: any = {}; try { errorData = await response.json(); } catch (e) { errorData.message = `HTTP error ${response.status}`; }
      const errorMessage = errorData.error_description || errorData.error || errorData.message || `Piko getSystems failed (Status: ${response.status})`;
      throw new PikoApiError(errorMessage, { statusCode: response.status, errorId: errorData.error, rawError: errorData });
    }
    const data = await response.json();
    if (!data || !data.systems || !Array.isArray(data.systems)) {
      throw new PikoApiError('Piko systems response did not contain a valid systems array', { rawError: data, errorId: PikoErrorCode.InvalidParameter });
    }
    console.log(`${logPrefix} Successfully fetched ${data.systems.length} systems.`);
    return data.systems.map((system: PikoSystemRaw) => ({
        id: system.id, name: system.name, version: system.version, health: system.stateOfHealth, role: system.accessRole
    }));
  } catch (error) {
    console.error(`${logPrefix} Error:`, error);
    if (error instanceof PikoApiError) throw error;
    throw new PikoApiError(`Failed to fetch Piko systems: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

export async function testConnection(config: PikoConfig): Promise<{
  connected: boolean; message?: string; systems?: PikoSystem[]; token?: PikoTokenResponse;
}> {
  console.log(`Piko testConnection called for type: ${config.type} with username: ${config.username}`);
  const authManager = new PikoAuthManager(); // Use a local authManager instance
  try {
    if (!config.username || !config.password) return { connected: false, message: 'Missing username or password' };
    if (config.type === 'cloud') {
        const tokenResponse = await authManager['_fetchPikoCloudToken'](config.username, config.password);
        const systems = await getSystems(tokenResponse.accessToken); // getSystems uses its own fetch
        return { connected: true, message: `Successfully connected to Piko Cloud. Found ${systems.length} systems.`, systems, token: tokenResponse };
    } else {
        if (!config.host || !config.port) return { connected: false, message: 'Missing host or port for local connection test' };
        const tokenResponse = await authManager['_fetchPikoLocalToken'](config as PikoConfig & { type: 'local' });
        // TODO: Optionally make a test API call using pikoApiClient to verify token works
        return { connected: true, message: `Successfully authenticated with Piko at ${config.host}:${config.port}.`, systems: [], token: tokenResponse };
    }
  } catch (error) {
    console.error('Piko connection test failed:', error);
    return { connected: false, message: error instanceof Error ? error.message : `Failed to connect to Piko ${config.type}` };
  }
}

export async function testLocalPikoConnection(config: PikoConfig): Promise<{
  connected: boolean; message?: string; token?: PikoTokenResponse;
}> {
  if (config.type !== 'local') throw new Error('testLocalPikoConnection called with non-local config type.');
  if (!config.host || !config.port || !config.username || !config.password) {
      return { connected: false, message: 'Missing required parameters for local connection test.' };
  }
  console.log(`testLocalPikoConnection called for ${config.host}:${config.port}`);
  const authManager = new PikoAuthManager(); // Use a local authManager instance
  try {
      const tokenResponse = await authManager['_fetchPikoLocalToken'](config as PikoConfig & { type: 'local' });
      // Optionally, could use pikoApiClient.request here for a lightweight API call
      return { connected: true, message: `Successfully authenticated with Piko at ${config.host}:${config.port}.`, token: tokenResponse };
  } catch (error) {
      console.error(`Local Piko connection test failed for ${config.host}:${config.port}:`, error);
      const message = (error instanceof PikoApiError && error.errorString) ? error.errorString : (error instanceof Error ? error.message : 'Failed to connect to local Piko');
      return { connected: false, message: message };
  }
}

export async function getSystemScopedAccessToken(
  username: string, password: string, systemId: string
): Promise<PikoTokenResponse> {
  const authManager = new PikoAuthManager();
  const scope = `cloudSystemId=${systemId}`;
  return authManager['_fetchPikoCloudToken'](username, password, scope);
}

export async function getSystemServers(connectorId: string): Promise<PikoServerRaw[]> {
  const logPrefix = `[getSystemServers][${connectorId}]`;
  console.log(`${logPrefix} Fetching servers.`);
  const queryParams = { '_with': 'id,name,osInfo,parameters.systemRuntime,parameters.physicalMemory,parameters.timeZoneInformation,status,storages,url,version' };
  const path = '/rest/v3/servers';
  const data = await pikoApiClient.request({ connectorId, path, queryParams, expectedResponseType: 'json' });
  const servers = (data as any)?.servers || data;
  if (!servers || !Array.isArray(servers)) {
    console.error(`${logPrefix} Invalid servers response format:`, data);
    throw new PikoApiError('Piko servers response did not contain a valid servers array.', { rawError: data, errorId: PikoErrorCode.InvalidParameter });
  }
  console.log(`${logPrefix} Successfully fetched ${servers.length} servers.`);
  return servers as PikoServerRaw[];
}

export async function getSystemDeviceById(connectorId: string, deviceId: string): Promise<PikoDeviceRaw | null> {
  const logPrefix = `[getSystemDeviceById][${connectorId}][Device: ${deviceId.substring(0,8)}...]`;
  console.log(`${logPrefix} Fetching device details.`);
  if (!deviceId) throw new PikoApiError("Device ID is required.", { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  const path = `/rest/v3/devices/${deviceId}`;
  const queryParams = { '_with': 'id,deviceType,mac,model,name,serverId,status,url,vendor,mediaStreams' };
  try {
    const data = await pikoApiClient.request({ connectorId, path, queryParams, expectedResponseType: 'json' });
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      console.log(`${logPrefix} Successfully fetched device details.`);
      return data as PikoDeviceRaw;
    } else if (data === null) { 
      console.warn(`${logPrefix} Received null response (possibly 204 No Content). Treating as not found.`);
      return null;
    } else {
      console.error(`${logPrefix} Unexpected response format for device details:`, data);
      throw new PikoApiError('Unexpected response format for device by ID.', { rawError: data, errorId: PikoErrorCode.InvalidParameter });
    }
  } catch (error) {
    if (error instanceof PikoApiError && error.statusCode === 404) {
      console.log(`${logPrefix} Device not found (404).`); return null; 
    }
    console.error(`${logPrefix} Error fetching device by ID:`, error); throw error;
  }
}

export async function getSystemDevices(connectorId: string): Promise<PikoDeviceRaw[]> {
  const logPrefix = `[getSystemDevices][${connectorId}]`;
  console.log(`${logPrefix} Fetching devices.`);
  const path = '/rest/v3/devices/';
  const queryParams = { '_with': 'id,deviceType,mac,model,name,serverId,status,url,vendor,mediaStreams' }; 
  const data = await pikoApiClient.request({ connectorId, path, queryParams, expectedResponseType: 'json' });
  if (!Array.isArray(data)) {
    console.error(`${logPrefix} Invalid response. Expected array. Received:`, data);
    throw new PikoApiError('Piko devices response was not a valid array.', { rawError: data, errorId: PikoErrorCode.InvalidParameter });
  }
  console.log(`${logPrefix} Successfully fetched ${data.length} devices.`);
  return data as PikoDeviceRaw[];
}

interface PikoLoginTicketResponse { id: string; username: string; token: string; ageS: number; expiresInS: number; }

export async function createPikoLoginTicket(connectorId: string, serverId: string): Promise<string> {
  const logPrefix = `[createPikoLoginTicket][${connectorId}][Server: ${serverId.substring(0,8)}...]`;
  console.log(`${logPrefix} Creating login ticket.`);
  if (!serverId) throw new PikoApiError('Server ID required.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  const path = '/rest/v3/login/tickets';
  const headers = { 'X-Server-Guid': serverId, 'Accept': 'application/json' };
  try {
    const data = await pikoApiClient.request({
      connectorId, path, method: 'POST', additionalHeaders: headers, expectedResponseType: 'json'
    });
    const ticketResponse = data as PikoLoginTicketResponse;
    if (!ticketResponse || !ticketResponse.token) {
      console.error(`${logPrefix} Create Ticket response missing token.`, data);
      throw new PikoApiError('Piko Create Ticket response did not contain a token.', { rawError: data });
    }
    console.log(`${logPrefix} Successfully created login ticket.`);
    return ticketResponse.token;
  } catch (error) {
    console.error(`${logPrefix} Error:`, error instanceof Error ? error.message : String(error), error);
    if (error instanceof PikoApiError) throw error;
    throw new PikoApiError(`Failed to create Piko login ticket: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

export async function getPikoBestShotImageBlob(connectorId: string, objectTrackId: string, cameraId: string): Promise<Blob> {
  const logPrefix = `[getPikoBestShotImageBlob][${connectorId}]`;
  console.log(`${logPrefix} Fetching best shot for track ${objectTrackId} on camera ${cameraId}.`);
  if (!objectTrackId || !cameraId) throw new PikoApiError('Missing params.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  const path = '/ec2/analyticsTrackBestShot';
  const queryParams = { objectTrackId, cameraId };
  const additionalHeaders = { 'Accept': 'image/*' };
  const blobData = await pikoApiClient.request({
    connectorId, path, queryParams, additionalHeaders, expectedResponseType: 'blob'
  });
  if (!(blobData instanceof Blob)) {
     console.error(`${logPrefix} Did not receive Blob. Received:`, blobData);
     throw new PikoApiError('Expected image Blob from Best Shot API.', { rawError: blobData, errorId: PikoErrorCode.InvalidParameter });
  }
  console.log(`${logPrefix} Successfully retrieved Best Shot blob (Type: ${blobData.type}, Size: ${blobData.size})`);
  return blobData;
}

export async function getPikoDeviceThumbnail(
  connectorId: string, deviceId: string, timestampMs?: number, size?: string
): Promise<Blob> {
  const logPrefix = `[getPikoDeviceThumbnail][${connectorId}][Device: ${deviceId.substring(0,8)}...]`;
  console.log(`${logPrefix} Fetching thumbnail. Timestamp: ${timestampMs || 'current'}, Size: ${size || 'default'}`);
  if (!deviceId) throw new PikoApiError('Device ID required.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  const path = `/rest/v3/devices/${deviceId}/image`;
  const queryParams: Record<string, string> = {};
  if (timestampMs !== undefined) queryParams['timestampMs'] = String(timestampMs);
  if (size) queryParams['size'] = size;
  const additionalHeaders = { 'Accept': 'image/*' };
  const blobData = await pikoApiClient.request({
    connectorId, path, queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined, 
    additionalHeaders, expectedResponseType: 'blob'
  });
  if (!(blobData instanceof Blob)) {
     console.error(`${logPrefix} Did not receive Blob. Received:`, blobData);
     throw new PikoApiError('Expected image Blob from Device Thumbnail API.', { rawError: blobData, errorId: PikoErrorCode.InvalidParameter });
  }
  console.log(`${logPrefix} Successfully retrieved Thumbnail blob (Type: ${blobData.type}, Size: ${blobData.size})`);
  return blobData;
}

export async function createPikoEvent(connectorId: string, payload: PikoCreateEventPayload): Promise<PikoCreateEventResponse> {
  const logPrefix = `[createPikoEvent][${connectorId}]`;
  console.log(`${logPrefix} Creating event. Source: ${payload.source}`);
  const path = '/api/createEvent'; 
  const data = await pikoApiClient.request({
    connectorId, path, method: 'POST', body: payload, expectedResponseType: 'json'
  });
  const result = data as PikoCreateEventResponse;
  if (result?.error && String(result.error) !== '0') {
    const errorMessage = `Piko createEvent API error: ${result.errorString || 'Unknown'} (Code: ${result.error})`;
    console.error(`${logPrefix} ${errorMessage}`, result);
    throw new PikoApiError(errorMessage, { errorId: result.errorId, errorString: result.errorString, rawError: result });
  }
  console.log(`${logPrefix} Successfully created Piko event. Source: ${payload.source}`);
  return result;
}

export async function createPikoBookmark(connectorId: string, pikoCameraDeviceId: string, payload: PikoCreateBookmarkPayload): Promise<void> {
  const logPrefix = `[createPikoBookmark][${connectorId}][Cam: ${pikoCameraDeviceId.substring(0,8)}...]`;
  console.log(`${logPrefix} Creating bookmark: ${payload.name}`);
  if (!pikoCameraDeviceId) throw new PikoApiError('Piko Camera ID required.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  const path = `/rest/v3/devices/${pikoCameraDeviceId}/bookmarks`;
  const data = await pikoApiClient.request({
    connectorId, path, method: 'POST', body: payload, expectedResponseType: 'json'
  });
  if (data && (data as any).error && String((data as any).error) !== '0') {
    const result = data as PikoCreateEventResponse; // Re-use error structure
    const errorMessage = `Piko createBookmark API error: ${result.errorString || 'Unknown'} (Code: ${result.error})`;
    console.error(`${logPrefix} ${errorMessage}`, result);
    throw new PikoApiError(errorMessage, { errorId: result.errorId, errorString: result.errorString, rawError: result });
  }
  console.log(`${logPrefix} Successfully created Piko bookmark: ${payload.name}`);
}

export async function getPikoMediaStream(
  connectorId: string, cameraId: string, positionMs: number, format?: string, serverId?: string 
): Promise<Response> {
  const logPrefix = `[getPikoMediaStream][${connectorId}][Cam: ${cameraId.substring(0,8)}...]`;
  console.log(`${logPrefix} Initiating media stream. Position: ${positionMs}, Format: ${format || 'default'}, ServerId: ${serverId || 'N/A'}`);
  if (!cameraId || positionMs === undefined) throw new PikoApiError('Missing params.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  let path = `/rest/v3/devices/${cameraId}/media`;
  if (format) path += `.${format.trim().toLowerCase()}`;
  const queryParams: Record<string, string> = { positionMs: String(positionMs) };
  let additionalHeaders: Record<string, string> | undefined = undefined;
  if (serverId) {
    console.log(`${logPrefix} ServerId ${serverId} provided. Attempting login ticket.`);
    try {
      const streamTicket = await createPikoLoginTicket(connectorId, serverId); // Uses refactored version
      queryParams['_ticket'] = streamTicket;
      additionalHeaders = { 'X-Server-Guid': serverId }; 
      console.log(`${logPrefix} Successfully obtained login ticket.`);
    } catch (ticketError) {
      console.warn(`${logPrefix} Failed to create login ticket:`, ticketError instanceof Error ? ticketError.message : String(ticketError));
      console.warn(`${logPrefix} Falling back to bearer token auth for media stream.`);
    }
  }
  const response = await pikoApiClient.request({
    connectorId, path, queryParams, additionalHeaders, expectedResponseType: 'stream'
  });
  if (!(response instanceof Response)) {
     console.error(`${logPrefix} Did not return Response object. Received:`, response);
     throw new PikoApiError('Expected stream Response object for media stream.', { rawError: response });
  }
  console.log(`${logPrefix} Successfully initiated Piko Media Stream. Status: ${response.status}`);
  return response;
}

export async function getPikoHlsStream(connectorId: string, cameraId: string): Promise<Response> {
  const logPrefix = `[getPikoHlsStream][${connectorId}][Cam: ${cameraId.substring(0,8)}...]`;
  console.log(`${logPrefix} Initiating HLS stream.`);
  if (!cameraId) throw new PikoApiError('Camera ID required.', { statusCode: 400, errorId: PikoErrorCode.MissingParameter });
  const path = `/hls/${cameraId}.m3u8`;
  const additionalHeaders = { 'Accept': '*/*', 'User-Agent': 'FusionBridge/1.0' };
  const response = await pikoApiClient.request({
    connectorId, path, additionalHeaders, expectedResponseType: 'stream'
  });
  if (!(response instanceof Response)) {
     console.error(`${logPrefix} Did not return Response object. Received:`, response);
     throw new PikoApiError('Expected stream Response object for HLS stream.', { rawError: response });
  }
  console.log(`${logPrefix} Successfully initiated HLS Stream. Status: ${response.status}`);
  return response;
}

export async function getSystemInfo(config: PikoConfig, accessToken: string): Promise<PikoSystemInfo> {
  const logPrefix = '[getSystemInfo]';
  if (!config || (config.type !== 'local' && config.type !== 'cloud')) {
       throw new PikoApiError(`Invalid config type: ${config?.type}`, { statusCode: 400, errorId: PikoErrorCode.InvalidParameter });
  }
  console.log(`${logPrefix} Attempting to fetch system info for type: ${config.type}`);
  const path = '/rest/v3/system/info';
  try {
    const data = await pikoApiClient.request({
      directConfig: config, directAccessToken: accessToken, path, expectedResponseType: 'json'
    });
    if (data && typeof data === 'object') {
      return data as PikoSystemInfo;
    } else {
      console.error(`${logPrefix} Expected object, got:`, JSON.stringify(data, null, 2));
      throw new PikoApiError(`Expected object for system info.`, { rawError: data, errorId: PikoErrorCode.InvalidParameter });
    }
  } catch (error) {
    console.error(`${logPrefix} Failed to get system info:`, error);
    throw error;
  }
}

export async function getTokenAndConfig(
  connectorId: string,
  options?: { forceRefresh?: boolean }
): Promise<{ config: PikoConfig; token: PikoTokenResponse }> {
  const authManager = new PikoAuthManager();
  return authManager._getTokenAndConfig(connectorId, options);
}