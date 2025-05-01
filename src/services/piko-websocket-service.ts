import 'server-only';

import { client as WebSocketClient, connection as WebSocketConnection, Message } from 'websocket'; 

// --- Remove dynamic import block ---
// let httpsModule: typeof import('https' | 'node:https') | undefined;
// try {
//     // Try both 'https' and 'node:https' for broader Node version compatibility
//     Promise.any([import('https'), import('node:https')])
//         .then(mod => { httpsModule = mod; })
//         .catch(e => { console.warn("[Piko WS Service] Failed to dynamically import 'https' module. TLS verification cannot be disabled.", e); });
// } catch (e) {
//      console.warn("[Piko WS Service] Error setting up dynamic import for 'https' module.", e);
// }
// --- End removed dynamic import --- 

import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import { Connector } from '@/types';
// Restore PikoApiError import
import { PikoConfig, PikoTokenResponse, getToken, PikoDeviceRaw, getSystemDevices, PikoJsonRpcSubscribeRequest, PikoApiError } from '@/services/drivers/piko';
import { parsePikoEvent } from '@/lib/event-parsers/piko';
import * as eventsRepository from '@/data/repositories/events';
import { useFusionStore } from '@/stores/store';
import { processEvent } from '@/services/automation-service';
import { StandardizedEvent } from '@/types/events';
import { ConnectorCategory, EventCategory, EventType } from '@/lib/mappings/definitions';

// Define connection timeout (e.g., 30 seconds) - Applies to client.connect timeout
const CONNECTION_TIMEOUT_MS = 30000; 
// Define device refresh interval (e.g., 12 hours)
const DEVICE_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000; 
// Restore Max redirects constant
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
        console.error(`[${state.connectorId}][_fetchAndStoreDeviceMap] Missing config or access token.`);
        return;
    }
    try {
        console.log(`[${state.connectorId}] Fetching system devices (${state.config.type})...`);
        const devices = await getSystemDevices(state.config, state.tokenInfo.accessToken);
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

// +++ Restore HELPER FUNCTION +++
/**
 * Resolves the final Piko Cloud WebSocket endpoint URL by handling 307 redirects via fetch.
 * @param initialHttpsUrl The initial HTTPS URL (e.g., https://{systemId}.relay.vmsproxy.com/jsonrpc).
 * @param accessToken The bearer token for authorization.
 * @param connectorId For logging purposes.
 * @returns Promise resolving to the final HTTPS URL after following redirects.
 * @throws PikoApiError if redirects fail or exceed the limit.
 */
async function _resolveWebSocketUrlWithRedirects(initialHttpsUrl: string, accessToken: string, connectorId: string): Promise<string> {
    let currentUrl = initialHttpsUrl;
    let redirectCount = 0;
    const logPrefix = `[${connectorId}][_resolveWebSocketUrl]`;

    console.log(`${logPrefix} Starting URL resolution from: ${currentUrl}`);

    while (redirectCount <= MAX_REDIRECTS) {
        console.log(`${logPrefix} Attempt ${redirectCount + 1} to fetch: ${currentUrl}`);
        const requestOptions: RequestInit = {
            method: 'GET', // Use GET for URL resolution, handshake uses headers later
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                // User-Agent removed previously
            },
            redirect: 'manual', // Handle redirects manually
        };

        try {
            const response = await fetch(currentUrl, requestOptions);
            console.log(`${logPrefix} Fetch response status: ${response.status}`);

            if (response.status === 307) { // Only follow 307
                const locationHeader = response.headers.get('Location');
                if (!locationHeader) {
                    throw new PikoApiError(`Redirect status ${response.status} received but no Location header found.`, { statusCode: response.status });
                }

                // Resolve the new URL against the current one
                let nextUrl: URL;
                try {
                    const originalUrlObj = new URL(currentUrl);
                     nextUrl = new URL(locationHeader, originalUrlObj);
                 } catch (urlError) {
                     console.error(`${logPrefix} Failed to parse or construct URL from Location header '${locationHeader}' relative to '${currentUrl}':`, urlError);
                     throw new PikoApiError(`Invalid Location header received during redirect: ${locationHeader}`, { cause: urlError });
                 }
                currentUrl = nextUrl.toString();

                console.warn(`${logPrefix} Redirecting (${response.status}) to: ${currentUrl}`);
                redirectCount++;
                // Consume the response body to release resources before next fetch
                try { await response.text(); } catch {} 
                continue; // Next iteration
            }

             // If status is OK (2xx) or any other non-redirect status, we assume this is the final URL.
             // We don't need the body, just the URL. Consume body.
             try { await response.text(); } catch {} 

             console.log(`${logPrefix} Resolved final URL: ${currentUrl}`);
             return currentUrl; // Return the current URL as the final one

        } catch (error) {
             // Keep enhanced logging
             console.error(`${logPrefix} Error during fetch for URL resolution (Type: ${typeof error}):`, error);
             if (error instanceof Error) {
                 console.error(`${logPrefix} Raw error properties: name=${error.name}, message=${error.message}, code=${(error as any).code}, errno=${(error as any).errno}, syscall=${(error as any).syscall}`);
             }
             if (error instanceof PikoApiError) throw error;
             throw new PikoApiError(`Fetch error during WebSocket URL resolution for ${currentUrl}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
    } // End while loop

    // If loop finishes, we exceeded max redirects
    throw new PikoApiError(`Exceeded maximum redirect limit (${MAX_REDIRECTS}) resolving WebSocket URL from ${initialHttpsUrl}`, { statusCode: 508 });
}
// +++ END Restore HELPER FUNCTION +++

// --- Core Connection Logic (Refactored for 'websocket' library) ---

// Default initial state for a new connector entry
const initialPikoConnectionState: Omit<PikoWebSocketConnection, 'connectorId'> = {
    connection: null, client: null, config: null, systemId: null, 
    tokenInfo: null, deviceGuidMap: null, 
    connectionError: null, reconnectAttempts: 0, periodicRefreshTimerId: null, 
    disabled: true, lastActivity: null, lastStandardizedPayload: null,
    isAttemptingConnection: false
};

export async function initPikoWebSocket(connectorId: string): Promise<boolean> {
    console.log(`[initPikoWebSocket][${connectorId}] Starting initialization...`);
    
    let state = connections.get(connectorId);
    if (!state) {
        // Use spread with initial state object
        state = { ...initialPikoConnectionState, connectorId: connectorId }; 
        connections.set(connectorId, state);
    }

    // Prevent concurrent connection attempts using the flag
    if (state.isAttemptingConnection) {
        console.log(`[initPikoWebSocket][${connectorId}] Connection attempt already in progress.`);
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
             console.log(`[initPikoWebSocket][${connectorId}] Already connected with matching configuration.`);
             return true;
        }

        // --- Start Connection Attempt --- 
        if (!state.connection && !state.disabled && !state.isAttemptingConnection) {
            console.log(`[initPikoWebSocket][${connectorId}] Attempting WebSocket connection (${state.config?.type})...`);
            state.isAttemptingConnection = true; // Set flag
            state.connectionError = null;
            connections.set(connectorId, state);
            
            // Store mutable state reference for handlers
            const currentState = state; 

            return new Promise<boolean>(async (resolve, reject) => {
                let connectTimeoutId: NodeJS.Timeout | null = null;

                 // Cleanup function specific to this attempt
                 const cleanupAttempt = (errorMsg?: string) => {
                     if (connectTimeoutId) clearTimeout(connectTimeoutId);
                     // Client event listeners are removed automatically by the library on error/close
                     currentState.isAttemptingConnection = false; // Reset flag
                     if (errorMsg) {
                         currentState.connectionError = currentState.connectionError || errorMsg;
                     }
                     connections.set(connectorId, currentState);
                 };

                try {
                    // 1. Get Token
                    let currentToken = currentState.tokenInfo?.accessToken;
                    if (!currentToken) {
                        console.log(`[${connectorId}] Fetching new Piko token (${currentState.config?.type})...`);
                        if (!currentState.config) {
                            throw new Error("Piko config missing in state during token fetch.");
                        }
                        currentState.tokenInfo = await getToken(currentState.config);
                        currentToken = currentState.tokenInfo.accessToken;
                        connections.set(connectorId, currentState); 
                        console.log(`[${connectorId}] Token obtained.`);
                    }
                    const accessToken = currentToken;
                    if (!accessToken) throw new Error("Failed to obtain valid access token.");

                    // 2. Construct URL, Headers, Origin, and potentially TLS Options
                    // Restore logic to determine initial HTTPS URL
                    let initialHttpsUrl: string;
                    if (currentState.config?.type === 'local') {
                        initialHttpsUrl = `https://${currentState.config.host}:${currentState.config.port}/jsonrpc`; // Start with HTTPS for local too, though redirects unlikely
                    } else if (currentState.config?.type === 'cloud' && currentState.config.selectedSystem) {
                        initialHttpsUrl = `https://${currentState.config.selectedSystem}.relay.vmsproxy.com/jsonrpc`;
                    } else {
                        throw new Error("Cannot determine initial HTTPS URL: Invalid config state.");
                    }

                    // Restore logic to resolve redirects first using the helper
                    let finalHttpsUrl: string;
                    if (currentState.config?.type === 'cloud') {
                        finalHttpsUrl = await _resolveWebSocketUrlWithRedirects(initialHttpsUrl, accessToken, connectorId);
                    } else {
                        finalHttpsUrl = initialHttpsUrl; // Assume no redirects needed for local
                    }

                    // Restore logic to convert final HTTPS URL to WSS URL
                    const finalWssUrl = finalHttpsUrl.replace(/^https:/, 'wss:');
                    console.log(`[${connectorId}] Final WebSocket URL resolved to: ${finalWssUrl}`);

                    const headers = { 'Authorization': `Bearer ${accessToken}` };
                    // Explicitly set origin based on the final WSS URL
                    const origin = new URL(finalWssUrl).origin;

                    // Prepare TLS options ONLY if ignoring errors AND it's a local connection
                    let tlsOptions: any | undefined = undefined;
                    if (currentState.config?.type === 'local' && currentState.config?.ignoreTlsErrors) {
                        console.warn(`[${connectorId}] Configuring WebSocket client to ignore TLS certificate validation for local connection.`);
                        tlsOptions = { rejectUnauthorized: false };
                    } else if (currentState.config?.type === 'cloud' && currentState.config?.ignoreTlsErrors) {
                        // Log a warning if ignoreTlsErrors is true for a cloud connection, but DO NOT set tlsOptions
                        console.warn(`[${connectorId}] WARNING: ignoreTlsErrors is set to true for a cloud connection, but TLS validation will NOT be disabled.`);
                    }

                    // 3. Create Client Instance (if needed)
                    currentState.client = new WebSocketClient(); 
                    const client = currentState.client; // Local reference

                    // 4. Start Connection Timeout
                    console.log(`[${connectorId}] Connecting client to: ${finalWssUrl}`); // Use finalWssUrl
                    connectTimeoutId = setTimeout(() => {
                        cleanupAttempt('Connection Timeout');
                        client.abort(); // Abort the connection attempt
                        reject(new Error('Connection Timeout')); 
                    }, CONNECTION_TIMEOUT_MS);

                    // 5. Attach Client Event Listeners
                    client.on('connectFailed', (error) => {
                         if (connectTimeoutId) clearTimeout(connectTimeoutId);
                         console.error(`[${connectorId}][connectFailed] WebSocket connection failed:`, error.toString());
                         cleanupAttempt(`Connection failed: ${error.toString()}`);
                         reject(error); 
                    });

                    client.on('connect', (connection) => {
                         if (connectTimeoutId) clearTimeout(connectTimeoutId);
                         
                         const latestState = connections.get(connectorId);
                         // Check if state is valid, not disabled, and connection slot is free
                         if (!latestState || latestState.disabled || latestState.connection) {
                              console.warn(`[${connectorId}][connect] Connection established but state is invalid or already connected. Closing this connection.`);
                              connection.close(); // Close the redundant connection
                              // Don't reject, let the existing state prevail
                              return; 
                         }

                         console.log(`[${connectorId}] WebSocket connection established.`);
                         latestState.connection = connection; // Store the active connection NOW
                         latestState.isAttemptingConnection = false; // Clear flag
                         latestState.connectionError = null;
                         latestState.reconnectAttempts = 0;
                         connections.set(connectorId, latestState);

                         // --- Attach Connection Event Listeners ---
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
                         console.log(`[${connectorId}] Connection established. Fetching devices and starting refresh...`);
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

                         resolve(true); // Connection successful
                     });

                    // 6. Initiate Connection
                    // Origin and protocol are often optional for wss, but trying explicit origin
                    // Construct requestOptions, including tlsOptions if applicable
                    const requestOptions = { ...tlsOptions }; // Start with tlsOptions (which might be undefined or { rejectUnauthorized: false })

                    client.connect(finalWssUrl, undefined, origin, headers, requestOptions); // Use finalWssUrl & Pass constructed requestOptions

                } catch (initialSetupError) {
                    console.error(`[${connectorId}] Error during initial WebSocket setup:`, initialSetupError);
                    // Enhanced logging:
                    const errorDetails = initialSetupError instanceof Error
                        ? initialSetupError.message + (initialSetupError.stack ? `\\nStack: ${initialSetupError.stack}` : '')
                        : String(initialSetupError);
                    console.error(`[${connectorId}] Detailed Setup Error: ${errorDetails}`);
                    // --- End Enhanced Logging ---
                    cleanupAttempt(initialSetupError instanceof Error ? initialSetupError.message : String(initialSetupError));
                    reject(initialSetupError); // Still reject with the original error for promise chain
                }
            }); 
        } else {
            console.log(`[initPikoWebSocket][${connectorId}] No connection attempt needed (Already connected/connecting, or disabled).`);
            // Return status based on current connection state
            return Promise.resolve(!!state.connection?.connected); 
        }

    } catch (error) {
         console.error(`[initPikoWebSocket][${connectorId}] General initialization error:`, error);
         // Enhanced logging:
         const generalErrorDetails = error instanceof Error
            ? error.message + (error.stack ? `\\nStack: ${error.stack}` : '')
            : String(error);
         console.error(`[initPikoWebSocket][${connectorId}] Detailed General Error: ${generalErrorDetails}`);
         // --- End Enhanced Logging ---
         const connState = connections.get(connectorId);
         if (connState) {
             connState.isAttemptingConnection = false;
             connState.connectionError = `Initialization failed: ${error instanceof Error ? error.message : String(error)}`; // Use captured details
             connections.set(connectorId, connState);
         }
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
                const standardizedEvents = parsePikoEvent(connectorId, rawEventParams, state.deviceGuidMap);

                // Check if any events were actually parsed before updating activity
                if (standardizedEvents.length > 0) {
                    state.lastActivity = new Date(); // <<< MOVE UPDATE HERE
                    for (const stdEvent of standardizedEvents) {
                        console.log(`[${connectorId}] Processing Standardized Event:`, stdEvent.eventId, stdEvent.type);
                        try { await eventsRepository.storeStandardizedEvent(stdEvent); } catch (e) { console.error(`[${connectorId}] Store error for ${stdEvent.eventId}:`, e); continue; }
                        try { useFusionStore.getState().processStandardizedEvent(stdEvent); } catch (e) { console.error(`[${connectorId}] Zustand error for ${stdEvent.eventId}:`, e); }
                        processEvent(stdEvent).catch(err => { console.error(`[${connectorId}] Automation error for ${stdEvent.eventId}:`, err); });

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
        connections.set(connectorId, state);
        state.connection.close(); // Trigger close event
    }

    // Clean up state vars immediately
    console.log(`[disconnectPikoWebSocket][${connectorId}] Cleaning up state.`);
    state.connection = null;
    state.client = null; 
    state.isAttemptingConnection = false;
    state.reconnectAttempts = 0;
    state.connectionError = null;
    state.lastStandardizedPayload = null;
    // Keep disabled state as potentially intended by caller (e.g. disablePikoConnection)
    // If called internally due to config change, disabled might be reset later by init.
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