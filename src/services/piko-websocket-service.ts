import 'server-only';

// --- Dynamically import https for optional TLS ignore ---
let httpsModule: typeof import('https') | undefined;
try {
    // Try importing 'https' first
    import('https')
        .then(mod => { httpsModule = mod; })
        .catch(e => { 
            console.warn("[Piko WS Service] Failed to dynamically import 'https' module. TLS verification cannot be disabled.", e);
            // Optionally try 'node:https' here if needed for specific environments
        });
} catch (e) {
     console.warn("[Piko WS Service] Error setting up dynamic import for 'https' module.", e);
}
// --- End dynamic import --- 

import { client as WebSocketClient, connection as WebSocketConnection, Message } from 'websocket'; 

import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import { Connector } from '@/types';
import {
    PikoConfig, 
    PikoTokenResponse, 
    PikoDeviceRaw, 
    getSystemDevices, // This should be a valid export from piko.ts if used directly
    PikoJsonRpcSubscribeRequest, 
    PikoAuthManager // Correctly import PikoAuthManager
} from '@/services/drivers/piko';
import { parsePikoEvent } from '@/lib/event-parsers/piko';
import * as eventsRepository from '@/data/repositories/events';
import { useFusionStore } from '@/stores/store';
import { processAndPersistEvent } from '@/lib/events/eventProcessor';
import { StandardizedEvent } from '@/types/events';
import { ConnectorCategory, EventCategory, EventType } from '@/lib/mappings/definitions';

// Define connection timeout (e.g., 30 seconds) - Applies to client.connect timeout
const CONNECTION_TIMEOUT_MS = 30000; 
// Define device refresh interval (e.g., 12 hours)
const DEVICE_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000; 
// Restore Max redirects constant - NEEDED AGAIN
const MAX_REDIRECTS = 5; 

// --- Piko WebSocket Connection State ---

interface PikoWebSocketConnection {
    // Store the active connection object from 'websocket' library
    connection: WebSocketConnection | null; 
    // Store the client instance to manage retries/connection state
    client: WebSocketClient | null; 
    config: PikoConfig | null; 
    systemId: string | null; 
    connectorId: string; 
    tokenInfo: PikoTokenResponse | null; 
    deviceGuidMap: Map<string, PikoDeviceRaw> | null; 
    // isConnected now determined by connection object state
    // isConnecting now determined by local logic + client state
    connectionError: string | null;
    reconnectAttempts: number;
    periodicRefreshTimerId: NodeJS.Timeout | null; 
    disabled: boolean; 
    lastActivity: Date | null; 
    lastStandardizedPayload: Record<string, any> | null;
    // Add flag to prevent concurrent connection attempts via the client instance
    isAttemptingConnection: boolean; 
}

// Map storing active WebSocket connections, keyed by Connector ID
// eslint-disable-next-line no-var
declare global { var __pikoWsConnections: Map<string, PikoWebSocketConnection> | undefined; }
const connections: Map<string, PikoWebSocketConnection> = globalThis.__pikoWsConnections || (globalThis.__pikoWsConnections = new Map());

console.log(`[Piko WS Service] Initialized connections map (size: ${connections.size})`);

// --- State Reporting (Adjusted) ---

export interface PikoWebSocketState {
    connectorId: string;
    systemId: string | null;
    isConnected: boolean; // Derived from connection state
    isConnecting: boolean; // Derived from local flag
    error: string | null;
    reconnecting: boolean; // Derived from attempts/state
    disabled: boolean;
    lastActivity: number | null; // Timestamp ms
    lastStandardizedPayload: Record<string, any> | null; 
}

/**
 * Get the current state of the WebSocket client for a specific CONNECTOR ID.
 */
export function getPikoWebSocketState(connectorId: string): PikoWebSocketState {
    const state = connections.get(connectorId);
    if (!state) {
        return { connectorId, systemId: null, isConnected: false, isConnecting: false, error: 'No connection state found', reconnecting: false, disabled: true, lastActivity: null, lastStandardizedPayload: null };
    }

    const isConnected = !!state.connection?.connected;
    const isConnecting = state.isAttemptingConnection;
    const isReconnecting = !isConnected && !isConnecting && state.reconnectAttempts > 0 && !state.disabled;

    return {
        connectorId: state.connectorId,
        systemId: state.systemId,
        isConnected: isConnected,
        isConnecting: isConnecting,
        error: state.connectionError,
        reconnecting: isReconnecting,
        disabled: state.disabled,
        lastActivity: state.lastActivity?.getTime() ?? null,
        lastStandardizedPayload: state.lastStandardizedPayload,
    };
}

/**
 * Get all Piko WebSocket client states, keyed by Connector ID.
 */
export function getAllPikoWebSocketStates(): Map<string, PikoWebSocketState> {
    const states = new Map<string, PikoWebSocketState>();
    for (const connectorId of connections.keys()) {
        states.set(connectorId, getPikoWebSocketState(connectorId));
    }
    return states;
}

// --- Helper Functions (Adjusted for new state structure) ---

/** Fetches Piko devices and updates the connection state map */
async function _fetchAndStoreDeviceMap(state: PikoWebSocketConnection): Promise<void> {
    if (!state.config || !state.tokenInfo?.accessToken) {
        // This check might be less critical if getSystemDevices internally handles token fetching robustly via connectorId,
        // but it's a good guard for the state object's consistency.
        console.error(`[${state.connectorId}][_fetchAndStoreDeviceMap] Missing config or access token in local WebSocket state. This might indicate an issue upstream.`);
        // We can still attempt the call with connectorId, as getSystemDevices should handle it.
        // If getSystemDevices itself requires a fully populated config locally for some reason before calling fetchPikoApiData, this might fail there.
        // For now, assume getSystemDevices(connectorId) is self-sufficient.
    }
    if (!state.connectorId) {
        console.error(`[${state.connectorId}][_fetchAndStoreDeviceMap] Critical: connectorId is missing in state. Cannot fetch devices.`);
        return;
    }

    try {
        console.log(`[${state.connectorId}] Fetching system devices...`);
        // UPDATED CALL: Use state.connectorId. state.config and state.tokenInfo are no longer passed directly.
        const devices = await getSystemDevices(state.connectorId);
        state.deviceGuidMap = new Map(devices.map(d => [d.id, d]));
        console.log(`[${state.connectorId}] Stored device map with ${state.deviceGuidMap.size} devices.`);
        connections.set(state.connectorId, state); // Update the global map
    } catch (error) {
        console.error(`[${state.connectorId}] Failed to fetch or store Piko device map. Raw Error:`, error); 
        if (error instanceof Error && error.stack) {
            console.error(`[${state.connectorId}] Stack Trace:
${error.stack}`);
        }
        state.connectionError = `Failed to fetch devices: ${error instanceof Error ? error.message : 'Unknown error'}`;
        connections.set(state.connectorId, state);
    }
}

/** Starts the periodic device refresh timer */
function _startPeriodicDeviceRefresh(state: PikoWebSocketConnection): void {
    _stopPeriodicDeviceRefresh(state); 

    if (!state.config) {
        console.error(`[${state.connectorId}][_startPeriodicDeviceRefresh] Cannot start refresh without config.`);
        return;
    }

    console.log(`[${state.connectorId}] Starting periodic device refresh timer (${DEVICE_REFRESH_INTERVAL_MS}ms).`);
    state.periodicRefreshTimerId = setInterval(async () => {
        console.log(`[${state.connectorId}] Periodic device refresh triggered.`);
        const currentState = connections.get(state.connectorId);
        // Check connection status via the connection object
        if (!currentState || currentState.disabled || !currentState.connection?.connected) { 
            console.log(`[${state.connectorId}] Skipping periodic refresh: Connection not active or disabled.`);
            _stopPeriodicDeviceRefresh(currentState ?? state); 
            return;
        }
        try {
          await _fetchAndStoreDeviceMap(currentState);
        } catch (refreshError) {
          console.error(`[${state.connectorId}][Periodic Refresh] Error during _fetchAndStoreDeviceMap:`, refreshError);
        }
    }, DEVICE_REFRESH_INTERVAL_MS);
    connections.set(state.connectorId, state); 
}

/** Stops the periodic device refresh timer */
function _stopPeriodicDeviceRefresh(state: PikoWebSocketConnection | undefined): void {
    if (state?.periodicRefreshTimerId) {
        console.log(`[${state.connectorId}] Stopping periodic device refresh timer.`);
        clearInterval(state.periodicRefreshTimerId);
        state.periodicRefreshTimerId = null;
        connections.set(state.connectorId, state); // Update state
    }
}

// --- Core Connection Logic (Refactored for 'websocket' library) ---

// Default initial state for a new connector entry
const initialPikoConnectionState: Omit<PikoWebSocketConnection, 'connectorId'> = {
    connection: null, client: null, config: null, systemId: null, 
    tokenInfo: null, deviceGuidMap: null, 
    connectionError: null, reconnectAttempts: 0, periodicRefreshTimerId: null, 
    disabled: true, lastActivity: null, lastStandardizedPayload: null,
    isAttemptingConnection: false
};

// Potentially instantiate PikoAuthManager globally or where needed
const authManager = new PikoAuthManager();

export async function initPikoWebSocket(
    connectorId: string,
    targetUrl?: string, // Optional URL override for redirects
    redirectDepth: number = 0, // Track redirect depth
    isAuthRetry: boolean = false // Added for auth retry logic
): Promise<boolean> {
    // --- Add Redirect Depth Check --- 
    if (redirectDepth > MAX_REDIRECTS) {
        console.error(`[initPikoWebSocket][${connectorId}] Exceeded maximum redirect limit (${MAX_REDIRECTS}). Aborting.`);
        throw new Error(`Exceeded maximum redirect limit (${MAX_REDIRECTS})`);
    }
    const logPrefix = `[initPikoWebSocket][${connectorId}]${redirectDepth > 0 ? `[Redirect ${redirectDepth}]` : ''}`; 
    console.log(`${logPrefix} Starting initialization... Target URL: ${targetUrl ?? 'Default'}`);
    
    let state = connections.get(connectorId);
    if (!state) {
        // Use spread with initial state object
        state = { ...initialPikoConnectionState, connectorId: connectorId }; 
        connections.set(connectorId, state);
    }

    // Prevent concurrent connection attempts using the flag
    if (state.isAttemptingConnection) {
        console.log(`${logPrefix} Connection attempt already in progress.`);
        return false; 
    }

    let dbConnector: Connector | undefined;
    let pikoConfig: PikoConfig | undefined;

    try {
        // 1. Fetch connector from DB
        const connectorResult = await db.select().from(connectors).where(eq(connectors.id, connectorId)).limit(1);
        if (!connectorResult.length) throw new Error("Connector not found in DB");
        dbConnector = connectorResult[0];

        // 2. Check if Piko type and get config
        if (dbConnector.category !== 'piko') {
            console.log(`[initPikoWebSocket][${connectorId}] Skipping: Not a Piko connector.`);
            await disconnectPikoWebSocket(connectorId); 
            return false;
        }

        try {
            pikoConfig = JSON.parse(dbConnector.cfg_enc);
            if (!pikoConfig?.type || !pikoConfig?.username || !pikoConfig?.password) {
                throw new Error('Invalid or incomplete Piko configuration (missing type, username, or password)');
            }
            if (pikoConfig.type === 'cloud' && !pikoConfig.selectedSystem) {
                throw new Error('Missing selectedSystem in Piko cloud config');
            } else if (pikoConfig.type === 'local' && (!pikoConfig.host || !pikoConfig.port)) {
                throw new Error('Missing host or port in Piko local config');
            }
        } catch (e) {
            throw new Error(`Failed to parse Piko config or missing required fields: ${e instanceof Error ? e.message : String(e)}`);
        }

        // Update state with latest DB info
        state.config = pikoConfig;
        state.systemId = pikoConfig.type === 'cloud' ? pikoConfig.selectedSystem ?? null : null;
        state.disabled = !dbConnector.eventsEnabled;
        connections.set(connectorId, state);
        
        // 4. Handle disabled state
        if (state.disabled) {
            console.log(`[initPikoWebSocket][${connectorId}] Connector is disabled in DB.`);
            await disconnectPikoWebSocket(connectorId); 
            return false;
        }

        // 5. Manage existing connection state 
        let configChanged = false;
        if (state.connection?.connected && state.config) {
            if (state.config.type !== pikoConfig.type) configChanged = true;
            else if (state.config.type === 'cloud' && state.config.selectedSystem !== pikoConfig.selectedSystem) configChanged = true;
            else if (state.config.type === 'local' && (state.config.host !== pikoConfig.host || state.config.port !== pikoConfig.port)) configChanged = true;
            else if (state.config.username !== pikoConfig.username || state.config.password !== pikoConfig.password) configChanged = true;
        }

        if (state.connection?.connected && configChanged) {
             console.log(`[initPikoWebSocket][${connectorId}] Piko configuration changed. Reconnecting.`);
             await disconnectPikoWebSocket(connectorId); 
             state = connections.get(connectorId)!; // Get potentially updated state
        } else if (!state.connection && state.client) {
            console.log(`[initPikoWebSocket][${connectorId}] Client exists but no active connection. Cleaning up client.`);
             state.client.abort(); // Abort any pending connection attempt on the old client
             state.client = null;
             state.isAttemptingConnection = false;
             connections.set(connectorId, state);
        }

        // If already connected and config matches, do nothing
        if (state.connection?.connected && !configChanged) {
             console.log(`${logPrefix} Already connected with matching configuration.`);
             return true;
        }

        // --- Start Connection Attempt --- 
        if (!state.connection && !state.disabled && !state.isAttemptingConnection) {
            console.log(`${logPrefix} Attempting WebSocket connection...`);
            state.isAttemptingConnection = true; // Set flag
            state.connectionError = null;
            connections.set(connectorId, state);
            
            const currentState = state; // Use this immutable ref in promise

            return new Promise<boolean>(async (resolve, reject) => {
                
                let connectTimeoutId: NodeJS.Timeout | null = null;

                 // Cleanup function specific to this attempt
                 const cleanupAttempt = (reason?: string) => {
                     if (connectTimeoutId) clearTimeout(connectTimeoutId);
                     connectTimeoutId = null;
                     // Client event listeners are removed automatically by the library on error/close
                     // BUT we might need manual cleanup if we terminate the client early
                     currentState.isAttemptingConnection = false; // Reset flag
                     if (reason && reason !== 'Redirecting') { // Don't set error message if just redirecting
                         currentState.connectionError = currentState.connectionError || reason;
                     }
                     // Update state immediately for cleanup reference
                     connections.set(connectorId, currentState); 
                 };

                try {
                    // 1. Get Token using getTokenAndConfig, potentially forcing refresh on auth retry
                    if (!isAuthRetry) {
                        console.log(`[${connectorId}] Ensuring valid Piko token and config for initial attempt...`);
                    } else {
                        console.log(`[${connectorId}] Ensuring valid Piko token and config for AUTH RETRY...`);
                    }
                    if (!connectorId) { 
                        throw new Error("connectorId is missing in initPikoWebSocket.");
                    }

                    // Use the PikoAuthManager instance to get token and config
                    const tokenAndConfigResponse = await authManager._getTokenAndConfig(
                        connectorId,
                        { forceRefresh: isAuthRetry }
                    );
                    const { config: updatedConfigFromDriver, token: newTokenInfo } = tokenAndConfigResponse;

                    currentState.config = updatedConfigFromDriver;
                    currentState.tokenInfo = newTokenInfo;
                    connections.set(connectorId, currentState); 
                    console.log(`[${connectorId}] Token and config obtained/validated (AuthRetry: ${isAuthRetry}).`);

                    const accessToken = newTokenInfo.accessToken;
                    if (!accessToken) {
                        throw new Error("Failed to obtain a valid access token via getTokenAndConfig.");
                    }

                    // 2. Construct URL, Headers, Origin, and potentially TLS Options
                    let urlToConnect: string;
                    if (targetUrl) {
                        urlToConnect = targetUrl; // Use provided URL if redirecting
                        console.log(`${logPrefix} Using provided target URL: ${urlToConnect}`);
                    } else {
                        // Construct initial URL if not redirecting
                        if (currentState.config?.type === 'local') {
                            urlToConnect = `wss://${currentState.config.host}:${currentState.config.port}/jsonrpc`; 
                        } else if (currentState.config?.type === 'cloud' && currentState.config.selectedSystem) {
                            urlToConnect = `wss://${currentState.config.selectedSystem}.relay.vmsproxy.com/jsonrpc`;
                        } else {
                            throw new Error("Cannot determine WebSocket URL: Invalid config state or missing targetUrl.");
                        }
                        console.log(`${logPrefix} Constructed initial WebSocket URL: ${urlToConnect}`);
                    }

                    const headers = { 'Authorization': `Bearer ${accessToken}` };
                    const origin = new URL(urlToConnect).origin;

                    let tlsOptions: any | undefined = undefined;
                    if (currentState.config?.type === 'local' && currentState.config?.ignoreTlsErrors) {
                        console.warn(`[${connectorId}] Configuring WebSocket client to ignore TLS certificate validation for local connection.`);
                        tlsOptions = { rejectUnauthorized: false };
                    } else if (currentState.config?.type === 'cloud' && currentState.config?.ignoreTlsErrors) {
                        console.warn(`[${connectorId}] WARNING: ignoreTlsErrors is set to true for a cloud connection, but TLS validation will NOT be disabled.`);
                    }

                    // 3. Create Client Instance (if needed)
                    if (currentState.client) {
                         console.warn(`${logPrefix} Previous client instance found during new attempt, ensuring termination.`);
                         currentState.client.removeAllListeners();
                         currentState.client.abort();
                         currentState.client = null;
                    }
                    currentState.client = new WebSocketClient(); 
                    const client = currentState.client;
                    connections.set(connectorId, currentState); 

                    // 4. Start Connection Timeout
                    console.log(`${logPrefix} Connecting client to: ${urlToConnect}`);
                    connectTimeoutId = setTimeout(() => {
                        console.error(`${logPrefix} Connection attempt timed out.`);
                        cleanupAttempt('Connection Timeout');
                        client?.abort(); // Use abort() for connection attempts
                        reject(new Error('Connection Timeout')); 
                    }, CONNECTION_TIMEOUT_MS);

                    // 5. Attach Client Event Listeners
                    client.on('connectFailed', async (error) => { // Made async to await recursive call
                         if (!connectTimeoutId) return; 
                         
                         const errorMessage = error.message || '';
                         const isRedirect = errorMessage.includes('non-101 status: 307');
                         const locationMatch = errorMessage.match(/\nlocation: (https?:\/\/[^\n]+)/);

                         if (isRedirect && locationMatch && locationMatch[1]) {
                             // Log minimal warning for expected redirect
                             console.warn(`${logPrefix}[connectFailed] Handling expected 307 redirect.`);
                             // Continue with redirect logic...
                             const httpsRedirectUrl = locationMatch[1].trim();
                             console.warn(`${logPrefix}[connectFailed] Detected 307 redirect to: ${httpsRedirectUrl}`);
                             
                             let wssRedirectUrl: string;
                             try {
                                 const parsedUrl = new URL(httpsRedirectUrl);
                                 parsedUrl.protocol = 'wss:'; 
                                 if (parsedUrl.port === '443') { 
                                     parsedUrl.port = '';
                                 }
                                 wssRedirectUrl = parsedUrl.toString();
                                 console.log(`${logPrefix}[connectFailed] Attempting connection to redirected WSS URL: ${wssRedirectUrl}`);
                                 
                                 // Cleanup this failed attempt state *before* starting next one
                                 const currentRedirectState = connections.get(connectorId);
                                 if (currentRedirectState) { 
                                    if (currentRedirectState.client === client) {
                                         currentRedirectState.client.removeAllListeners(); 
                                         currentRedirectState.client = null;
                                     }
                                     currentRedirectState.isAttemptingConnection = false;
                                     connections.set(connectorId, currentRedirectState);
                                 }
                                 cleanupAttempt('Redirecting');

                                 // Use setImmediate to avoid deep recursion stack
                                 setImmediate(() => {
                                     initPikoWebSocket(connectorId, wssRedirectUrl, redirectDepth + 1, false) // isAuthRetry is false for redirects
                                         .then(resolve)
                                         .catch(reject);
                                 });
                                 return; 
                             } catch (urlParseError) {
                                 console.error(`${logPrefix}[connectFailed] Failed to parse or convert redirect URL '${httpsRedirectUrl}':`, urlParseError);
                                 // Fall through to normal error handling if URL parsing fails
                             }
                         }
                         
                         // Check for 401 Unauthorized and if it's not already an auth retry attempt
                         if (errorMessage.includes("401 Unauthorized") && !isAuthRetry) {
                            console.warn(`${logPrefix}[connectFailed] WebSocket auth error (401). Attempting token refresh and connection retry...`);
                            cleanupAttempt('Auth Retry Attempt'); // Clean up current attempt artifacts
                            try {
                                // Recursively call initPikoWebSocket with isAuthRetry set to true
                                const retrySuccess = await initPikoWebSocket(connectorId, targetUrl, redirectDepth, true);
                                resolve(retrySuccess); // Resolve the original promise with the outcome of the retry
                            } catch (retryError) {
                                console.error(`${logPrefix}[connectFailed] Auth retry attempt also failed:`, retryError);
                                reject(retryError); // Reject original promise if retry also hard-fails
                            }
                            return; // Stop further processing for this failed attempt
                         }
                         
                         // If it wasn't a handled redirect or a first-time 401, treat as normal failure
                         console.error(`${logPrefix}[connectFailed] WebSocket connection failed (Final attempt or non-auth error):`, error.toString());
                         
                         // Treat as normal failure
                         const normalFailState = connections.get(connectorId);
                         if(normalFailState && normalFailState.client === client) {
                             normalFailState.client = null;
                             connections.set(connectorId, normalFailState);
                         }
                         cleanupAttempt(`Connection failed: ${error.toString()}`);
                         reject(error); 
                    });

                    client.on('connect', (connection) => {
                         if (!connectTimeoutId) return; 
                         clearTimeout(connectTimeoutId); // Clear timeout on successful connect
                         connectTimeoutId = null;

                         const latestState = connections.get(connectorId);
                         if (!latestState || latestState.disabled || latestState.client !== client) {
                              console.warn(`${logPrefix}[connect] Connection established but state is invalid, disabled, or client mismatch. Closing.`);
                              connection.close(); 
                              cleanupAttempt('State mismatch on connect');
                              // Don't resolve/reject, let potential other connection logic proceed or fail
                              return; 
                         }

                         console.log(`${logPrefix} WebSocket connection established.`);
                         latestState.connection = connection; // Store the *active* connection
                         latestState.isAttemptingConnection = false; 
                         latestState.connectionError = null;
                         latestState.reconnectAttempts = 0;
                         latestState.lastActivity = new Date();
                         connections.set(connectorId, latestState);

                         // Attach persistent handlers to the *established* connection
                         connection.on('error', (error) => {
                             console.error(`[${connectorId}][connection.error] WebSocket error:`, error.toString());
                             const connState = connections.get(connectorId);
                             if (connState && connState.connection === connection) {
                                 connState.connectionError = `WebSocket error: ${error.message}`;
                                 connections.set(connectorId, connState);
                                 // Close event will likely follow
                             }
                         });

                         connection.on('close', (code, reason) => {
                             console.log(`[${connectorId}][connection.close] WebSocket connection closed. Code: ${code}, Reason: ${reason}`);
                             const connState = connections.get(connectorId);
                              // Check if this close event pertains to the currently stored connection
                             if (!connState || connState.connection !== connection) {
                                 console.warn(`[${connectorId}][connection.close] Close event for an outdated connection ignored.`);
                                 return; 
                             }
                             
                             connState.connection = null; // Clear the connection object
                             _stopPeriodicDeviceRefresh(connState);

                             const wasUnexpected = code !== 1000 && code !== 1005; // 1005 is normal close
                             if (!connState.disabled && wasUnexpected) {
                                 connState.connectionError = connState.connectionError || `Connection closed unexpectedly (Code: ${code}, Reason: ${reason || 'Unknown'})`;
                                 console.log(`[${connectorId}] Scheduling reconnect due to unexpected close.`);
                                 connections.set(connectorId, connState);
                                 scheduleReconnect(connectorId); 
                             } else {
                                 connState.connectionError = null; // Clear error on intentional close
                                 connState.reconnectAttempts = 0;
                                 connState.lastStandardizedPayload = null;
                                 connections.set(connectorId, connState);
                             }
                         });

                         connection.on('message', (message: Message) => {
                             const connState = connections.get(connectorId);
                             if (connState && !connState.disabled && connState.connection === connection) {
                                 _handlePikoMessage(connectorId, message);
                             }
                         });
                         // --- End Connection Listeners ---

                         // --- Fetch devices and start refresh IMMEDIATELY --- 
                         console.log(`${logPrefix} Connection established. Fetching devices and starting refresh...`);
                         _fetchAndStoreDeviceMap(latestState);
                         _startPeriodicDeviceRefresh(latestState);
                         // --- End Fetch/Refresh ---

                         // --- Send subscribe message immediately (No Delay) ---
                         try {
                             const requestId = crypto.randomUUID();
                             const subscribeMsg: PikoJsonRpcSubscribeRequest = { 
                                 jsonrpc: "2.0", id: requestId,
                                 method: "rest.v3.servers.events.subscribe",
                                 params: {
                                     startTimeMs: Date.now(), 
                                     eventType: ["analyticsSdkEvent", "analyticsSdkObjectDetected"], // Subscribe to both events
                                     eventsOnly: true, 
                                     _with: "eventParams"
                                 }
                             }; 
                             const messageString = JSON.stringify(subscribeMsg); 
                             // console.log(`[${connectorId}] Stringified Message:`, messageString); // Remove diagnostic log
                             console.log(`[${connectorId}] Sending subscribe request (ID: ${requestId})...`);
                             // Ensure connection is still valid before sending
                             if (!latestState.connection?.connected) { 
                                 console.warn(`[${connectorId}] Connection closed before sending subscribe. Aborting.`);
                                 return;
                             }
                             latestState.connection.sendUTF(messageString); // Use sendUTF
                             console.log(`[${connectorId}] Subscribe message sent successfully.`);
                         } catch (sendError) {
                             console.error(`[${connectorId}] Failed to send subscribe message.`, sendError);
                             if(latestState) { // Check latestState exists
                                  latestState.connectionError = `Failed to send subscribe: ${sendError instanceof Error ? sendError.message : 'Unknown send error'}`;
                                  connections.set(connectorId, latestState);
                                  latestState.connection?.close(); // Close connection on send error
                             }
                         }
                         // --- End Send Subscribe --- 

                         resolve(true); // Resolve the main promise on success
                     });

                    // 6. Initiate Connection
                    const requestOptions = { ...tlsOptions }; 
                    client.connect(urlToConnect, undefined, origin, headers, requestOptions);

                } catch (initialSetupError) {
                    // This catch handles errors *before* client.connect or during sync setup
                    console.error(`${logPrefix} Error during initial WebSocket setup phase:`, initialSetupError);
                    const errorDetails = initialSetupError instanceof Error
                        ? initialSetupError.message + (initialSetupError.stack ? `\nStack: ${initialSetupError.stack}` : '')
                        : String(initialSetupError);
                    console.error(`${logPrefix} Detailed Setup Error: ${errorDetails}`);
                    
                    cleanupAttempt(initialSetupError instanceof Error ? initialSetupError.message : String(initialSetupError));
                    // Ensure client instance is cleaned up if created before error
                    const errorState = connections.get(connectorId);
                    if(errorState && errorState.client) {
                        errorState.client.removeAllListeners();
                        errorState.client = null;
                    }
                    reject(initialSetupError); // Reject the main promise
                }
            }); // End of new Promise
        } else {
             console.log(`${logPrefix} No connection attempt needed (Connected: ${!!state.connection?.connected}, Disabled: ${state.disabled}, Connecting: ${state.isAttemptingConnection}).`);
             return Promise.resolve(!!state.connection?.connected); 
         }

    } catch (error) {
         // This catch handles errors during DB fetch, config parse, outer checks
         console.error(`[initPikoWebSocket][${connectorId}] General initialization error:`, error);
         const generalErrorDetails = error instanceof Error
            ? error.message + (error.stack ? `\nStack: ${error.stack}` : '')
            : String(error);
         console.error(`[initPikoWebSocket][${connectorId}] Detailed General Error: ${generalErrorDetails}`);
         const connState = connections.get(connectorId);
         if (connState) {
             connState.isAttemptingConnection = false; // Ensure connecting flag is reset
             connState.connectionError = `Initialization failed: ${error instanceof Error ? error.message : String(error)}`;
             connections.set(connectorId, connState);
         }
         // Do not automatically disconnect here, might interfere with reconnect logic if called from scheduleReconnect
         return Promise.resolve(false); // Indicate failure
     }
}

// --- Adjusted _handlePikoMessage ---
async function _handlePikoMessage(connectorId: string, message: Message): Promise<void> {
    const state = connections.get(connectorId);
    if (!state || state.disabled || !state.connection?.connected) return;

    if (message.type === 'utf8') {
        const messageString = message.utf8Data;
        try {
            const parsedMessage = JSON.parse(messageString);
            // state.lastActivity = new Date(); // <<< REMOVE THIS LINE (Update moved below)

            // Check if it's the event update message
            if (parsedMessage.method === 'rest.v3.servers.events.update' && parsedMessage.params?.eventParams) {
                const rawEventParams = parsedMessage.params.eventParams;
                const standardizedEvents = await parsePikoEvent(connectorId, rawEventParams, state.deviceGuidMap);

                // Check if any events were actually parsed before updating activity
                if (standardizedEvents.length > 0) {
                    state.lastActivity = new Date(); // <<< MOVE UPDATE HERE
                    for (const stdEvent of standardizedEvents) {
                        console.log(`[${connectorId}] Processing Standardized Event:`, stdEvent.eventId, stdEvent.type);
                        try {
                            // processAndPersistEvent handles DB storage and automation triggers
                            await processAndPersistEvent(stdEvent);
                        } catch (e) { 
                            console.error(`[Piko WS Service][${connectorId}] Error during processAndPersistEvent for ${stdEvent.eventId}:`, e); 
                            continue; // Skip to next event if processing fails
                        }
                        try { useFusionStore.getState().processStandardizedEvent(stdEvent); } catch (e) { console.error(`[${connectorId}] Zustand error for ${stdEvent.eventId}:`, e); }

                        state.lastStandardizedPayload = stdEvent.payload ?? null;
                        // connections.set(connectorId, state); // Update state after processing (moved below loop)
                    }
                    connections.set(connectorId, state); // Update state once after processing all events in the message
                } else {
                    // No events parsed, don't update lastActivity based on this message
                }
            } else if (parsedMessage.error) {
                console.error(`[${connectorId}] Received JSON-RPC Error:`, parsedMessage.error);
                state.connectionError = `RPC Error: ${parsedMessage.error.message || 'Unknown RPC error'}`;
                connections.set(connectorId, state);
            } else if (parsedMessage.result !== undefined) {
                console.log(`[${connectorId}] Received JSON-RPC Result (ID: ${parsedMessage.id}):`, parsedMessage.result);
            } else {
                 console.warn(`[${connectorId}] Received unknown message format:`, parsedMessage);
            }
        } catch (err) {
            console.error(`[${connectorId}] Failed to parse or handle message:`, err);
            state.connectionError = `Failed to parse message: ${err instanceof Error ? err.message : String(err)}`;
            connections.set(connectorId, state);
        }
    } else if (message.type === 'binary') {
        console.warn(`[${connectorId}] Received unexpected binary message.`);
        // state.lastActivity = new Date(); // <<< REMOVE THIS LINE
        connections.set(connectorId, state); // Only update state if necessary, removed activity update
    }
}

// --- Adjusted scheduleReconnect ---
function scheduleReconnect(connectorId: string): void {
     const state = connections.get(connectorId);
     // Check isAttemptingConnection flag instead of isConnecting
    if (!state || state.reconnectAttempts > 0 || state.isAttemptingConnection || state.connection?.connected) {
        return;
    }
     if (state.disabled) {
         console.log(`[scheduleReconnect][${connectorId}] Aborted: Connection is disabled.`);
         return;
     }

    state.reconnectAttempts++;
    const delay = Math.min(5000 * Math.pow(2, state.reconnectAttempts - 1), 60000); 
    console.log(`[${connectorId}] Scheduling reconnection attempt ${state.reconnectAttempts} in ${delay}ms`);
    state.connectionError = `Connection lost. Reconnecting (attempt ${state.reconnectAttempts})...`;
    connections.set(connectorId, state);

    setTimeout(async () => {
        const currentState = connections.get(connectorId);
        // Re-check conditions before attempting reconnect
        if (!currentState || currentState.disabled || currentState.connection?.connected || currentState.isAttemptingConnection || currentState.reconnectAttempts === 0) {
            console.log(`[scheduleReconnect][${connectorId}] Skipping reconnect attempt: State changed or reset.`);
             if (currentState && currentState.connection?.connected) currentState.reconnectAttempts = 0; // Reset if connected
             if (currentState) connections.set(connectorId, currentState);
            return;
        }

        console.log(`[scheduleReconnect][${connectorId}] Timeout fired. Attempting initPikoWebSocket...`);
        try {
            await initPikoWebSocket(connectorId);
        } catch (err) {
            console.error(`[${connectorId}] Reconnection attempt via initPikoWebSocket failed in scheduleReconnect:`, err);
             // Error handling within init should manage state
        }
    }, delay);
}

// --- Adjusted disconnectPikoWebSocket ---
export async function disconnectPikoWebSocket(connectorId: string): Promise<void> {
    // No need for promise wrapper anymore
    const state = connections.get(connectorId);
    _stopPeriodicDeviceRefresh(state); // Stop timer first

    if (!state) return; // No state to disconnect

    // Abort any connection attempt by the client
    if (state.client && state.isAttemptingConnection) {
         console.log(`[disconnectPikoWebSocket][${connectorId}] Aborting in-progress connection attempt.`);
         state.client.abort();
    }
    
    // Close the active connection if it exists
    if (state.connection?.connected) {
        console.log(`[disconnectPikoWebSocket][${connectorId}] Closing active connection.`);
        // Set flags before closing to prevent immediate reconnect attempt by 'close' handler
        state.reconnectAttempts = 0; 
        state.disabled = true; // Temporarily disable to prevent reconnect
        const connectionToClose = state.connection; // Keep reference
        state.connection = null; // Clear connection object in state *first*
        connections.set(connectorId, state);
        connectionToClose.close(); // Close the actual connection
    } else {
        // If no active connection, still ensure flags are reset
        state.connection = null;
    }

    console.log(`[disconnectPikoWebSocket][${connectorId}] Cleaning up state.`);
    state.client?.removeAllListeners(); // Remove listeners if client exists
    state.client = null; 
    state.isAttemptingConnection = false; // Use correct flag
    state.reconnectAttempts = 0;
    state.connectionError = null;
    state.lastStandardizedPayload = null;
    connections.set(connectorId, state); 
}

// --- Control and Initialization (Adjusted) ---

/**
 * Disable the WebSocket connection for a specific CONNECTOR ID.
 */
export async function disablePikoConnection(connectorId: string): Promise<void> {
     console.log(`[disablePikoConnection][${connectorId}] Attempting to disable...`);
     try {
         // 1. Update DB state first
         await db.update(connectors)
             .set({ eventsEnabled: false })
             .where(eq(connectors.id, connectorId));
         console.log(`[disablePikoConnection][${connectorId}] Updated DB eventsEnabled to false.`);
         
         // 2. Disconnect the WebSocket and update state
         await disconnectPikoWebSocket(connectorId); 
         
         // 3. Ensure disabled flag is definitively set in map state
         let state = connections.get(connectorId);
         if (state) {
             state.disabled = true;
         } else {
             // Add a basic disabled state if it didn't exist
             state = {
                 connection: null, client: null, config: null, systemId: null, 
                 connectorId: connectorId, tokenInfo: null, deviceGuidMap: null, 
                 connectionError: null, reconnectAttempts: 0, periodicRefreshTimerId: null, 
                 disabled: true, lastActivity: null, lastStandardizedPayload: null,
                 isAttemptingConnection: false
             };
         }
         connections.set(connectorId, state);
         console.log(`[disablePikoConnection][${connectorId}] Connection disabled and state updated.`);
     } catch (error) {
         console.error(`[disablePikoConnection][${connectorId}] Error:`, error);
     }
}

/**
 * Enable the WebSocket connection for a specific CONNECTOR ID.
 * Returns Promise<boolean> indicating if connection likely succeeded.
 */
export async function enablePikoConnection(connectorId: string): Promise<boolean> {
    console.log(`[enablePikoConnection][${connectorId}] Attempting to enable...`);
    try {
        // Fetch connector data (same as before)
        const connector = await db.select({ category: connectors.category, cfg_enc: connectors.cfg_enc })
            .from(connectors).where(eq(connectors.id, connectorId)).limit(1);
        if (!connector.length || connector[0].category !== 'piko') {
             throw new Error('Connector not found or not Piko.');
        }

        // Update DB (same as before)
        await db.update(connectors)
            .set({ eventsEnabled: true }).where(eq(connectors.id, connectorId));
        console.log(`[enablePikoConnection][${connectorId}] Updated DB eventsEnabled to true.`);

        // Update local state immediately
        const existingState = connections.get(connectorId);
        let state: PikoWebSocketConnection; // Declare type
        if (!existingState) {
             state = { ...initialPikoConnectionState, connectorId: connectorId, disabled: false };
        } else {
             state = existingState; // Assign from existing
             state.disabled = false; // Mutate the existing state object
        }
        connections.set(connectorId, state);

        // Initiate connection
        console.log(`[enablePikoConnection][${connectorId}] Calling and awaiting initPikoWebSocket...`);
        const success = await initPikoWebSocket(connectorId);
        console.log(`[enablePikoConnection][${connectorId}] initPikoWebSocket completed. Result: ${success}`);
        console.log(`[enablePikoConnection][${connectorId}] FINISHED enablePikoConnection function.`);
        return success;

    } catch (err) {
        console.error(`[enablePikoConnection][${connectorId}] Caught error:`, err);
         // Enhanced logging:
         const enableErrorDetails = err instanceof Error
            ? err.message + (err.stack ? `\\nStack: ${err.stack}` : '')
            : String(err);
         console.error(`[enablePikoConnection][${connectorId}] Detailed Enable Error: ${enableErrorDetails}`);
         // --- End Enhanced Logging ---
        // Use const here as well
        const finalState = connections.get(connectorId);
        if (finalState) {
            finalState.disabled = true;
            finalState.lastStandardizedPayload = null;
            connections.set(connectorId, finalState);
        }
        return false;
    }
}

/**
 * Scan DB and automatically initialize/cleanup connections for all Piko connectors.
 */
export async function initializePikoConnections(): Promise<void> {
     console.log('[initializePikoConnections] Starting scan for all Piko connectors...');
     try {
         const allDbPikoConnectors = await db.select().from(connectors).where(eq(connectors.category, 'piko'));
         console.log(`[initializePikoConnections] Found ${allDbPikoConnectors.length} Piko connectors in DB.`);
         const dbConnectorMap = new Map(allDbPikoConnectors.map(c => [c.id, c]));
         const currentConnectionsMap = new Map(connections); // Clone current connections

         // 1. Initialize/Update connections based on DB state
         for (const connector of allDbPikoConnectors) {
             console.log(`[initializePikoConnections] Processing connector: ${connector.id}`);
             if (connector.eventsEnabled) {
                 console.log(`[initializePikoConnections] Initializing enabled connector: ${connector.id} (${connector.name})`);
                 // Use const if not reassigned
                 const state = connections.get(connector.id);
                 if (state) {
                     state.disabled = false;
                     connections.set(connector.id, state);
                 } // If no state exists, initPikoWebSocket will create it
                 
                 try { 
                     console.log(`[initializePikoConnections] BEFORE await initPikoWebSocket for ${connector.id}`);
                     await initPikoWebSocket(connector.id);
                     console.log(`[initializePikoConnections] AFTER await initPikoWebSocket for ${connector.id}`);
                 } catch (err) { /* init logs errors */ }
             } else {
                 console.log(`[initializePikoConnections] Ensuring disabled connector is stopped: ${connector.id} (${connector.name})`);
                 await disablePikoConnection(connector.id); // Handles disconnect and state update
             }
         }

         // 2. Cleanup: Remove state for connectors deleted from DB
         for (const connectorId of currentConnectionsMap.keys()) { 
             if (!dbConnectorMap.has(connectorId)) {
                 console.warn(`[initializePikoConnections] Connector ${connectorId} not found in DB. Disconnecting and removing state.`);
                 await disconnectPikoWebSocket(connectorId); // disconnect handles state cleanup
                 connections.delete(connectorId); 
             }
         }

         console.log('[initializePikoConnections] FINISHED initializePikoConnections function.');
     } catch (err) {
         console.error('[initializePikoConnections] Error during scan:', err);
     }
}

