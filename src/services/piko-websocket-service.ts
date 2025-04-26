import 'server-only';

// --- Add Global Error Handlers for Debugging ---
if (typeof process !== 'undefined') { // Check if process exists (server-side)
    // Flag to prevent duplicate logging if both handlers catch the same error
    let errorHandled = false;
    process.on('uncaughtException', (err, origin) => {
        if (errorHandled) return;
        errorHandled = true;
        console.error('<<<<< GLOBAL UNCAUGHT EXCEPTION >>>>>');
        console.error('Origin:', origin);
        console.error('Error Object:', err);
        console.error('Error Name:', err?.name);
        console.error('Error Message:', err?.message);
        console.error('Stack Trace:\n', err?.stack);
        console.error('<<<<< END GLOBAL UNCAUGHT EXCEPTION >>>>>');
        // IMPORTANT: Let Next.js handle the process exit for uncaught exceptions
        // process.exit(1); // Avoid calling this directly unless necessary
    });

    process.on('unhandledRejection', (reason, promise) => {
        if (errorHandled) return;
        // Note: Unhandled rejections might also trigger uncaughtException later
        // depending on Node version and circumstances, hence the flag.
        console.warn('<<<<< GLOBAL UNHANDLED REJECTION >>>>>');
        console.warn('Reason:', reason);
        // console.warn('Promise:', promise); // Promise object can be large, log cautiously
        if (reason instanceof Error) {
            console.warn('Error Name:', reason.name);
            console.warn('Error Message:', reason.message);
            console.warn('Stack Trace:\n', reason.stack);
        }
        console.warn('<<<<< END GLOBAL UNHANDLED REJECTION >>>>>');
        // Let the application decide how to handle unhandled rejections
    });
} else {
    console.warn('[Piko WS Service] Could not attach global error handlers (process object not found).');
}
// --- End Global Error Handlers ---

// --- Use 'websocket' library ---
import { client as WebSocketClient, connection as WebSocketConnection, Message } from 'websocket'; 
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import { Connector } from '@/types';
import { PikoConfig, PikoTokenResponse, getSystemScopedAccessToken, PikoDeviceRaw, getSystemDevices, PikoJsonRpcSubscribeRequest } from '@/services/drivers/piko';
import { parsePikoEvent } from '@/lib/event-parsers/piko';
import * as eventsRepository from '@/data/repositories/events';
import { useFusionStore } from '@/stores/store';
import { processEvent } from '@/services/automation-service';
import { StandardizedEvent, EventCategory, EventType } from '@/types/events'; // Removed AnalyticsEventPayload as it's not used directly here

// Define connection timeout (e.g., 30 seconds) - Applies to client.connect timeout
const CONNECTION_TIMEOUT_MS = 30000; 
// Define device refresh interval (e.g., 12 hours)
const DEVICE_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000; 
// Max redirects are not handled by this library by default, removing constant
// const MAX_REDIRECTS = 5; 

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
    if (!state.systemId || !state.tokenInfo?.accessToken) {
        console.error(`[${state.connectorId}][_fetchAndStoreDeviceMap] Missing systemId or access token.`);
        return;
    }
    try {
        console.log(`[${state.connectorId}] Fetching system devices for ${state.systemId}...`);
        const devices = await getSystemDevices(state.systemId, state.tokenInfo.accessToken);
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

    if (!state.systemId) {
        console.error(`[${state.connectorId}][_startPeriodicDeviceRefresh] Cannot start refresh without systemId.`);
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
    let systemId: string | undefined;

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
            if (!pikoConfig?.username || !pikoConfig?.password || !pikoConfig?.selectedSystem) {
                throw new Error('Missing username, password, or selectedSystem in config');
            }
            systemId = pikoConfig.selectedSystem;
        } catch (e) {
            throw new Error(`Failed to parse config or missing required fields: ${e instanceof Error ? e.message : String(e)}`);
        }

        // Update state with latest DB info
        state.config = pikoConfig;
        state.systemId = systemId;
        state.disabled = !dbConnector.eventsEnabled;
        connections.set(connectorId, state);
        
        // 4. Handle disabled state
        if (state.disabled) {
            console.log(`[initPikoWebSocket][${connectorId}] Connector is disabled in DB.`);
            await disconnectPikoWebSocket(connectorId); 
            return false;
        }

        // 5. Manage existing connection state 
        // Disconnect if already connected but system ID changed, or if connection object is missing but client exists
        if (state.connection?.connected && state.systemId !== systemId) {
             console.log(`[initPikoWebSocket][${connectorId}] System ID changed. Reconnecting.`);
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
        if (state.connection?.connected && state.systemId === systemId) {
             console.log(`[initPikoWebSocket][${connectorId}] Already connected to the correct system.`);
             return true;
        }

        // --- Start Connection Attempt --- 
        if (!state.connection && !state.disabled && !state.isAttemptingConnection) {
            console.log(`[initPikoWebSocket][${connectorId}] Attempting WebSocket connection to system ${systemId}...`);
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
                        console.log(`[${connectorId}] Fetching new system-scoped token...`);
                        if (!currentState.config?.username || !currentState.config?.password || !currentState.systemId) {
                            throw new Error("Missing credentials or systemId for token fetch.");
                        }
                        currentState.tokenInfo = await getSystemScopedAccessToken(currentState.config.username, currentState.config.password, currentState.systemId);
                        currentToken = currentState.tokenInfo.accessToken;
                        connections.set(connectorId, currentState); 
                        console.log(`[${connectorId}] Token obtained.`);
                    }
                    const accessToken = currentToken;
                    if (!accessToken) throw new Error("Failed to obtain valid access token.");

                    // 2. Construct URL and Headers
                    const wsUrl = `wss://${currentState.systemId}.relay.vmsproxy.com/jsonrpc`;
                    const headers = { 'Authorization': `Bearer ${accessToken}` };

                    // 3. Create Client Instance (if needed)
                    // Reuse existing client if available and not connected? No, create new for clean attempt.
                    currentState.client = new WebSocketClient({
                        // Options for the client itself (e.g., timeouts)
                        // assembleFragments: true, // Default is true
                        // fragmentOutgoingMessages: true, // Default is true
                    });
                    const client = currentState.client; // Local reference

                    // 4. Start Connection Timeout
                    console.log(`[${connectorId}] Connecting client to: ${wsUrl}`);
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
                         // Check if state is still valid for this connection
                         if (!latestState || latestState.disabled || !latestState.isAttemptingConnection || latestState.connection) {
                             console.warn(`[${connectorId}][connect] Connection established but state is invalid or already connected. Closing this connection.`);
                             connection.close(); // Close the redundant connection
                             // Don't reject, let the existing state prevail
                             return; 
                         }

                         console.log(`[${connectorId}] WebSocket connection established.`);
                         latestState.connection = connection; // Store the active connection
                         latestState.isAttemptingConnection = false; // Clear flag
                         latestState.connectionError = null;
                         latestState.reconnectAttempts = 0;
                         latestState.lastActivity = new Date();
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

                         // Send subscribe message with delay
                         const requestId = crypto.randomUUID();
                         const subscribeMsg: PikoJsonRpcSubscribeRequest = {
                             jsonrpc: "2.0", id: requestId,
                             method: "rest.v3.servers.events.subscribe",
                             params: {
                                 startTimeMs: Date.now(), 
                                 eventType: "analyticsSdkEvent",
                                 eventsOnly: true, 
                                 _with: "eventParams"
                             }
                         };
                         
                         console.log(`[${connectorId}] Waiting 5s before sending subscribe...`);
                         setTimeout(() => {
                             try {
                                 console.log(`[${connectorId}][Send Delay] TIMEOUT FIRED. Entering callback.`);
                                 const currentConnState = connections.get(connectorId);
                                 // Check connection validity again before sending
                                 if (!currentConnState?.connection?.connected) {
                                      console.warn(`[${connectorId}][Send Delay] Connection no longer valid. Aborting send.`);
                                      return; 
                                 }
                                 
                                 const messageString = JSON.stringify(subscribeMsg); 
                                 console.log(`[${connectorId}][Send Delay] Stringified Message:`, messageString); 
                                 console.log(`[${connectorId}][Send Delay] Sending subscribe request after delay (ID: ${requestId})...`);
                                 currentConnState.connection.sendUTF(messageString); // Use sendUTF
                                 console.log(`[${connectorId}][Send Delay] Subscribe message sent successfully.`);
                                 
                                 // Restore post-send operations
                                 console.log(`[${connectorId}][Send Delay] Initiating post-send operations...`);
                                 // Ensure state is passed correctly
                                 _fetchAndStoreDeviceMap(currentConnState); 
                                 _startPeriodicDeviceRefresh(currentConnState);
                                 
                             } catch (sendError) {
                                 const currentConnState = connections.get(connectorId);
                                 console.error(`[${connectorId}][Send Delay] Failed to send subscribe message.`, sendError);
                                 if(currentConnState) { 
                                      currentConnState.connectionError = `Failed to send subscribe after delay: ${sendError instanceof Error ? sendError.message : 'Unknown send error'}`;
                                      connections.set(connectorId, currentConnState);
                                      currentConnState.connection?.close(); // Close connection on send error
                                 }
                             }
                         }, 5000); 

                         resolve(true); // Connection successful
                     });

                    // 6. Initiate Connection
                    // Origin and protocol are often optional for wss
                    client.connect(wsUrl, undefined, undefined, headers); 

                } catch (initialSetupError) {
                    console.error(`[${connectorId}] Error during initial WebSocket setup:`, initialSetupError);
                    cleanupAttempt(initialSetupError instanceof Error ? initialSetupError.message : String(initialSetupError));
                    reject(initialSetupError); 
                }
            }); 
        } else {
            console.log(`[initPikoWebSocket][${connectorId}] No connection attempt needed (Already connected/connecting, or disabled).`);
            // Return status based on current connection state
            return Promise.resolve(!!state.connection?.connected); 
        }

    } catch (error) {
         console.error(`[initPikoWebSocket][${connectorId}] General initialization error:`, error);
         const connState = connections.get(connectorId);
         if (connState) {
             connState.isAttemptingConnection = false;
             connState.connectionError = `Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
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
            state.lastActivity = new Date(); // Update activity on valid message

            // Check if it's the event update message
            if (parsedMessage.method === 'rest.v3.servers.events.update' && parsedMessage.params?.eventParams) {
                const rawEventParams = parsedMessage.params.eventParams;
                const standardizedEvents = parsePikoEvent(connectorId, rawEventParams, state.deviceGuidMap);

                for (const stdEvent of standardizedEvents) {
                     console.log(`[${connectorId}] Processing Standardized Event:`, stdEvent.eventId, stdEvent.eventType); 
                     try { await eventsRepository.storeStandardizedEvent(stdEvent); } catch (e) { console.error(`[${connectorId}] Store error for ${stdEvent.eventId}:`, e); continue; }
                     try { useFusionStore.getState().processStandardizedEvent(stdEvent); } catch (e) { console.error(`[${connectorId}] Zustand error for ${stdEvent.eventId}:`, e); }
                     processEvent(stdEvent).catch(err => { console.error(`[${connectorId}] Automation error for ${stdEvent.eventId}:`, err); });

                     state.lastStandardizedPayload = stdEvent.payload ?? null;
                     connections.set(connectorId, state); // Update state after processing
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
        state.lastActivity = new Date(); // Still update activity
        connections.set(connectorId, state);
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