import 'server-only';

import WebSocket from 'ws'; // Using 'ws' library for robust WebSocket handling
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import { Connector } from '@/types';
import { PikoConfig, PikoTokenResponse, getSystemScopedAccessToken, PikoDeviceRaw, getSystemDevices, PikoJsonRpcSubscribeRequest } from '@/services/drivers/piko';
import { parsePikoEvent } from '@/lib/event-parsers/piko';
import * as eventsRepository from '@/data/repositories/events';
import { useFusionStore } from '@/stores/store';
import { processEvent } from '@/services/automation-service';
import { StandardizedEvent, EventCategory, EventType, AnalyticsEventPayload } from '@/types/events';

// Define connection timeout (e.g., 30 seconds)
const CONNECTION_TIMEOUT_MS = 30000;
// Define device refresh interval (e.g., 12 hours)
const DEVICE_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000; 

// --- Piko WebSocket Connection State ---

interface PikoWebSocketConnection {
    client: WebSocket | null;
    config: PikoConfig | null; // Stored config for the connector
    systemId: string | null; // Piko System ID from config.selectedSystem
    connectorId: string; // The ID of the connector DB entry
    tokenInfo: PikoTokenResponse | null; // Store fetched system-scoped token
    deviceGuidMap: Map<string, PikoDeviceRaw> | null; // Map from Device GUID -> Raw Device Info
    isConnected: boolean;
    isConnecting: boolean;
    connectionError: string | null;
    reconnectAttempts: number;
    periodicRefreshTimerId: NodeJS.Timeout | null; // Timer ID for periodic device refresh
    disabled: boolean; // Mirroring connector's eventsEnabled state
    lastActivity: Date | null; // Track last message or connection event
}

// Map storing active WebSocket connections, keyed by Connector ID
// eslint-disable-next-line no-var
declare global { var __pikoWsConnections: Map<string, PikoWebSocketConnection> | undefined; }
const connections: Map<string, PikoWebSocketConnection> = globalThis.__pikoWsConnections || (globalThis.__pikoWsConnections = new Map());

console.log(`[Piko WS Service] Initialized connections map (size: ${connections.size})`);

// --- State Reporting ---

export interface PikoWebSocketState {
    connectorId: string;
    systemId: string | null;
    isConnected: boolean;
    isConnecting: boolean;
    error: string | null;
    reconnecting: boolean;
    disabled: boolean;
    lastActivity: number | null; // Timestamp ms
}

/**
 * Get the current state of the WebSocket client for a specific CONNECTOR ID.
 */
export function getPikoWebSocketState(connectorId: string): PikoWebSocketState {
    const connection = connections.get(connectorId);
    if (!connection) {
        return { connectorId, systemId: null, isConnected: false, isConnecting: false, error: 'No connection state found', reconnecting: false, disabled: true, lastActivity: null };
    }

    const isReconnecting = !connection.isConnected && !connection.isConnecting && connection.reconnectAttempts > 0 && !connection.disabled;
    return {
        connectorId: connection.connectorId,
        systemId: connection.systemId,
        isConnected: connection.isConnected,
        isConnecting: connection.isConnecting,
        error: connection.connectionError,
        reconnecting: isReconnecting,
        disabled: connection.disabled,
        lastActivity: connection.lastActivity?.getTime() ?? null,
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

// --- Helper Functions ---

/** Fetches Piko devices and updates the connection state map */
async function _fetchAndStoreDeviceMap(connection: PikoWebSocketConnection): Promise<void> {
    if (!connection.systemId || !connection.tokenInfo?.accessToken) {
        console.error(`[${connection.connectorId}][_fetchAndStoreDeviceMap] Missing systemId or access token.`);
        return;
    }
    try {
        console.log(`[${connection.connectorId}] Fetching system devices for ${connection.systemId}...`);
        const devices = await getSystemDevices(connection.systemId, connection.tokenInfo.accessToken);
        connection.deviceGuidMap = new Map(devices.map(d => [d.id, d]));
        console.log(`[${connection.connectorId}] Stored device map with ${connection.deviceGuidMap.size} devices.`);
        connections.set(connection.connectorId, connection); // Update the global map
    } catch (error) {
        console.error(`[${connection.connectorId}] Failed to fetch or store Piko device map:`, error);
        // Keep the old map if fetching fails?
        connection.connectionError = `Failed to fetch devices: ${error instanceof Error ? error.message : 'Unknown error'}`;
        connections.set(connection.connectorId, connection);
    }
}

/** Starts the periodic device refresh timer */
function _startPeriodicDeviceRefresh(connection: PikoWebSocketConnection): void {
    _stopPeriodicDeviceRefresh(connection); // Clear any existing timer first

    if (!connection.systemId) {
        console.error(`[${connection.connectorId}][_startPeriodicDeviceRefresh] Cannot start refresh without systemId.`);
        return;
    }

    console.log(`[${connection.connectorId}] Starting periodic device refresh timer (${DEVICE_REFRESH_INTERVAL_MS}ms).`);
    connection.periodicRefreshTimerId = setInterval(async () => {
        console.log(`[${connection.connectorId}] Periodic device refresh triggered.`);
        const currentConnection = connections.get(connection.connectorId);
        if (!currentConnection || currentConnection.disabled || !currentConnection.isConnected) {
            console.log(`[${connection.connectorId}] Skipping periodic refresh: Connection not active or disabled.`);
            _stopPeriodicDeviceRefresh(currentConnection ?? connection); // Stop timer if state is invalid
            return;
        }
        // TODO: Add token refresh logic if needed before fetching devices
        await _fetchAndStoreDeviceMap(currentConnection);
    }, DEVICE_REFRESH_INTERVAL_MS);
    connections.set(connection.connectorId, connection); // Update state with timer ID
}

/** Stops the periodic device refresh timer */
function _stopPeriodicDeviceRefresh(connection: PikoWebSocketConnection | undefined): void {
    if (connection?.periodicRefreshTimerId) {
        console.log(`[${connection.connectorId}] Stopping periodic device refresh timer.`);
        clearInterval(connection.periodicRefreshTimerId);
        connection.periodicRefreshTimerId = null;
        connections.set(connection.connectorId, connection); // Update state
    }
}

// --- Core Connection Logic ---

export async function initPikoWebSocket(connectorId: string): Promise<boolean> {
    console.log(`[initPikoWebSocket][${connectorId}] Starting initialization...`);
    
    let connection = connections.get(connectorId);
    // Ensure a base state exists if it's the first time
    if (!connection) {
        connection = {
            client: null, config: null, systemId: null, connectorId: connectorId, tokenInfo: null,
            deviceGuidMap: null, isConnected: false, isConnecting: false, connectionError: null, 
            reconnectAttempts: 0, periodicRefreshTimerId: null, disabled: true, lastActivity: null
        };
        connections.set(connectorId, connection);
    }

    // Prevent concurrent connection attempts
    if (connection.isConnecting) {
        console.log(`[initPikoWebSocket][${connectorId}] Connection attempt already in progress.`);
        return false; // Or return a promise that resolves when the current attempt finishes?
    }

    let dbConnector: Connector | undefined;
    let pikoConfig: PikoConfig | undefined;
    let systemId: string | undefined;

    try {
        // 1. Fetch connector from DB
        const connectorResult = await db.select().from(connectors).where(eq(connectors.id, connectorId)).limit(1);
        if (!connectorResult.length) {
            throw new Error("Connector not found in DB");
        }
        dbConnector = connectorResult[0];

        // 2. Check if Piko type and get config
        if (dbConnector.category !== 'piko') {
            console.log(`[initPikoWebSocket][${connectorId}] Skipping: Not a Piko connector.`);
            await disconnectPikoWebSocket(connectorId); // Ensure cleanup if type changed
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

        // Update connection state with latest DB info
        connection.config = pikoConfig;
        connection.systemId = systemId;
        connection.disabled = !dbConnector.eventsEnabled;
        connections.set(connectorId, connection);
        
        // 4. Handle disabled state
        if (connection.disabled) {
            console.log(`[initPikoWebSocket][${connectorId}] Connector is disabled in DB.`);
            await disconnectPikoWebSocket(connectorId); // Ensure disconnected
            return false;
        }

        // 5. Manage existing connection state 
        if (connection.client && (!connection.isConnected || connection.systemId !== systemId)) {
            console.log(`[initPikoWebSocket][${connectorId}] Config/System changed or client disconnected. Reconnecting.`);
            await disconnectPikoWebSocket(connectorId); // Disconnect old client
            connection = connections.get(connectorId)!; // Get potentially updated state from disconnect
        }

        // If already connected and config matches, do nothing
        if (connection.isConnected && connection.systemId === systemId) {
             console.log(`[initPikoWebSocket][${connectorId}] Already connected to the correct system.`);
             return true;
        }

        // --- Start Connection Attempt --- 
        if (!connection.client && !connection.disabled) {
            console.log(`[initPikoWebSocket][${connectorId}] Attempting WebSocket connection to system ${systemId}...`);
            connection.isConnecting = true;
            connection.connectionError = null;
            connections.set(connectorId, connection);
            
            // Return a promise that resolves/rejects based on the connection attempt
            return new Promise<boolean>(async (resolve, reject) => {
                let connectTimeoutId: NodeJS.Timeout | null = null;
                const connectionPromiseSettled = false; // Flag to prevent double resolve/reject

                // Store reference to the specific client being created in this attempt
                let attemptClient: WebSocket | null = null;

                // --- Add Checks --- 
                // Ensure config and systemId are definitely available here
                if (!connection || !pikoConfig || !systemId) {
                    console.error(`[initPikoWebSocket][${connectorId}] Critical error: connection, pikoConfig, or systemId is undefined before starting promise.`);
                    reject(new Error("Internal state error before connection attempt."));
                    return;
                }
                // --- End Checks ---

                // Cleanup for this specific attempt
                const cleanupAttempt = () => {
                    if (connectTimeoutId) clearTimeout(connectTimeoutId);
                    connectTimeoutId = null;
                    // Detach temporary listeners used ONLY for this initial connection attempt promise
                    const currentClient = connections.get(connectorId)?.client;
                    currentClient?.removeAllListeners('open');
                    currentClient?.removeAllListeners('error');
                    currentClient?.removeAllListeners('close');
                };

                try {
                    // 6b. Get system-scoped token
                    // TODO: Implement proper token refresh logic based on expiresAt and stored refreshToken
                    let currentToken = connection.tokenInfo?.accessToken;
                    const tokenNeedsRefresh = !currentToken; 

                    if (tokenNeedsRefresh) {
                        console.log(`[initPikoWebSocket][${connectorId}] Fetching new system-scoped token...`);
                        // Ensure config/systemId are valid before calling
                        if (!pikoConfig.username || !pikoConfig.password || !systemId) {
                             throw new Error("Missing credentials or systemId for token fetch.");
                        }
                        connection.tokenInfo = await getSystemScopedAccessToken(pikoConfig.username, pikoConfig.password, systemId);
                        currentToken = connection.tokenInfo.accessToken;
                        connections.set(connectorId, connection); // Save new token info
                        console.log(`[initPikoWebSocket][${connectorId}] Token obtained.`);
                    } else {
                        console.log(`[initPikoWebSocket][${connectorId}] Using existing token.`);
                    }
                    const accessToken = currentToken;
                     // --- Add Check --- 
                     if (!accessToken) {
                        console.error(`[initPikoWebSocket][${connectorId}] Failed to obtain valid access token.`);
                        reject(new Error("Failed to obtain valid access token."));
                        return;
                     } 
                     // --- End Check ---

                    // Start connection timeout
                    connectTimeoutId = setTimeout(() => {
                        console.error(`[initPikoWebSocket][${connectorId}] Connection attempt timed out after ${CONNECTION_TIMEOUT_MS}ms.`);
                        cleanupAttempt();
                        const conn = connections.get(connectorId);
                        if(conn) {
                            conn.connectionError = 'Connection Timeout';
                            conn.isConnecting = false;
                            conn.isConnected = false; 
                            if (conn.client) { conn.client.terminate(); conn.client = null; }
                            connections.set(connectorId, conn);
                        }
                        reject(new Error('Connection Timeout'));
                    }, CONNECTION_TIMEOUT_MS);

                    // 6c. Establish WebSocket connection
                    // --- Add Check --- 
                    if (!systemId) { // Check systemId again just before use
                        console.error(`[initPikoWebSocket][${connectorId}] Critical error: systemId became undefined before WS creation.`);
                        reject(new Error("Internal state error: systemId missing."));
                        return;
                    }
                    // --- End Check ---
                    const wsUrl = `wss://${systemId}.relay.vmsproxy.com/jsonrpc`;
                    console.log(`[initPikoWebSocket][${connectorId}] Connecting to ${wsUrl}`);
                     // Create the client for *this* attempt
                    attemptClient = new WebSocket(wsUrl, {
                        // Pass token in header
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });

                    // --- DEFER SETTING GLOBAL CLIENT ---
                    // Do NOT set connection.client = attemptClient here.
                    // We will set it only inside the 'open' handler after validation.

                    // Setup handlers for the client of *this* attempt
                    attemptClient.on('open', async () => {
                        const conn = connections.get(connectorId);
                        
                        // --- Refined Checks --- 
                        // 1. Check basic connection state validity
                        if (!conn || conn.disabled || !conn.isConnecting) {
                            console.warn(`[${connectorId}][open] WS open event for an invalid/disabled/not-connecting state. Aborting open handler. State:`, conn);
                            attemptClient?.close(); // Close this specific WS
                            cleanupAttempt();
                            resolve(false); // Indicate this attempt didn't succeed
                            return;
                        }
                        // 2. Check if another client already successfully connected
                        if (conn.client !== null && conn.client !== attemptClient) {
                            console.warn(`[${connectorId}][open] WS open event detected, but another client instance is already active. Closing this redundant connection.`);
                            attemptClient?.close(); // Close this specific WS
                            cleanupAttempt();
                            resolve(false); // Indicate this attempt didn't succeed
                            return;
                        }
                         // --- Checks Passed --- 
                         
                        // NOW assign this client as the active one
                        conn.client = attemptClient; 
                        const client = conn.client; // Use non-null client from here

                        console.log(`[${conn.connectorId}] WebSocket connection established.`);
                        conn.isConnected = true;
                        conn.isConnecting = false;
                        conn.connectionError = null;
                        conn.reconnectAttempts = 0;
                        conn.lastActivity = new Date();
                        connections.set(conn.connectorId, conn); // Update global state
                        cleanupAttempt(); // Promise settled successfully

                        // 6e. Send subscribe message
                        const requestId = crypto.randomUUID();
                        const subscribeMsg: PikoJsonRpcSubscribeRequest = {
                            jsonrpc: "2.0", id: requestId,
                            method: "rest.v3.servers.events.subscribe",
                            params: {
                                startTimeMs: Date.now(), eventType: "analyticsSdkEvent",
                                eventsOnly: true, _with: "eventParams"
                            }
                        };
                        try {
                            console.log(`[${conn.connectorId}] Sending subscribe request (ID: ${requestId})...`);
                            // Re-check client immediately before use
                            if (!client) {
                                throw new Error("WebSocket client became null unexpectedly before sending subscribe.");
                            }
                            client.send(JSON.stringify(subscribeMsg));
                        } catch (sendError) {
                            console.error(`[${conn.connectorId}] Failed to send subscribe message:`, sendError);
                            conn.connectionError = `Failed to send subscribe: ${sendError instanceof Error ? sendError.message : 'Unknown'}`;
                            connections.set(conn.connectorId, conn);
                            // Re-check client immediately before use
                             if (!client) {
                                 console.warn(`[${conn.connectorId}] Client was already null when trying to close after send error.`);
                             } else {
                                 client.close();
                             }
                             resolve(false);
                             return;
                        }

                        // Fetch initial device map & Start periodic refresh
                        await _fetchAndStoreDeviceMap(conn);
                        _startPeriodicDeviceRefresh(conn);

                        resolve(true); // Connection successfully established and subscribed
                    });

                    // Persistent message handler (applies to the client instance)
                    attemptClient.on('message', (data) => {
                        // Ensure the handler only processes messages if this client is still the active one
                        const currentConn = connections.get(connectorId);
                         // Compare against the client stored in the global state
                         if(currentConn && currentConn.client === attemptClient && !currentConn.disabled) {
                             _handlePikoMessage(connectorId, data);
                         } else {
                             // console.log(`[${connectorId}][message] Received message for inactive/disabled client. Ignoring.`); // Can be noisy
                         }
                    });

                     // Use .once for initial connection errors to reject the promise
                     attemptClient.once('error', (err) => {
                         const conn = connections.get(connectorId);
                         // Check if the error belongs to the client currently marked as connecting *or* active
                         if (conn && (conn.client === attemptClient || conn.isConnecting) && !connectionPromiseSettled) {
                             console.error(`[${connectorId}][error] WebSocket error during connection phase:`, err);
                             conn.isConnecting = false; // Ensure connecting flag is false
                             conn.isConnected = false; // Ensure connected is false
                             conn.connectionError = `WebSocket error: ${err.message}`;
                             // Only clear client if it was this attempt's client
                             if (conn.client === attemptClient) {
                                 conn.client = null; 
                             }
                             connections.set(connectorId, conn);
                             cleanupAttempt();
                             reject(err); // Reject the promise
                         } else {
                             // Error for an outdated client or after promise settled, just log.
                             console.warn(`[${connectorId}][error] Received error for outdated/settled client attempt:`, err.message);
                             if (!connectionPromiseSettled) {
                                 // Still need to potentially reject if this was the initial failing promise
                                 cleanupAttempt();
                                 reject(err);
                             }
                         }
                    });

                    // Persistent close handler (cleans up and schedules reconnect if needed)
                    attemptClient.on('close', (code, reason) => {
                        const conn = connections.get(connectorId);
                        // Only process close if it's for the currently active client in the state
                        if (!conn || conn.client !== attemptClient) {
                            // console.log(`[${connectorId}][close] Close event for an outdated client. Ignoring.`); // Can be noisy
                            return; // Not the active client anymore
                        }

                        const reasonStr = reason.toString();
                        console.log(`[${conn.connectorId}][close] WebSocket connection closed. Code: ${code}, Reason: ${reasonStr}`);
                        conn.isConnected = false;
                        conn.isConnecting = false; // Ensure connecting flag is false
                        conn.client = null; // Clear the client
                        _stopPeriodicDeviceRefresh(conn); // Stop refresh on close

                        // Only trigger reconnect if the closure was unexpected and not disabled
                        const wasUnexpected = code !== 1000; // 1000 = Normal Closure
                        if (!conn.disabled && wasUnexpected) {
                            conn.connectionError = conn.connectionError || `Connection closed unexpectedly (Code: ${code}, Reason: ${reasonStr || 'Unknown'})`;
                             console.log(`[${conn.connectorId}] Scheduling reconnect due to unexpected close.`);
                            connections.set(connectorId, conn);
                            scheduleReconnect(connectorId); // Schedule async
                        } else {
                            // Normal closure or disabled connector, clear error and attempts
                            conn.connectionError = null;
                            conn.reconnectAttempts = 0;
                            connections.set(connectorId, conn);
                        }

                         // If the promise is still pending (e.g., closed before 'open' or during setup) reject it.
                         if (!connectionPromiseSettled) {
                             console.warn(`[${connectorId}][close] Connection closed before promise settled.`);
                             cleanupAttempt();
                             reject(new Error(`Connection closed unexpectedly during setup (Code: ${code})`));
                         }
                    });

                } catch (setupError) {
                    // Errors during token fetch or initial WS object creation
                     const conn = connections.get(connectorId);
                     if(conn && conn.isConnecting) { // Only update state if still relevant to this attempt
                         console.error(`[initPikoWebSocket][${connectorId}] Error during connection setup:`, setupError);
                         conn.isConnecting = false; // Ensure connecting is false
                         conn.connectionError = `Setup error: ${setupError instanceof Error ? setupError.message : String(setupError)}`;
                          // attemptClient might not be assigned if error was early
                          attemptClient?.terminate();
                         connections.set(connectorId, conn);
                     }
                     cleanupAttempt();
                     reject(setupError);
                }
            }); // End of new Promise
        } else {
            // Client exists but is disconnected, or connection is disabled
            console.log(`[initPikoWebSocket][${connectorId}] Client exists but not connecting (Connected: ${connection.isConnected}, Disabled: ${connection.disabled}). State should be handled by previous checks or reconnect logic.`);
            return Promise.resolve(connection.isConnected); // Return current connected status
        }

    } catch (error) {
        console.error(`[initPikoWebSocket][${connectorId}] General initialization error:`, error);
        const conn = connections.get(connectorId);
        if (conn) {
            conn.isConnected = false;
            conn.isConnecting = false;
            conn.connectionError = `Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            if (conn.client) { await disconnectPikoWebSocket(connectorId); } // Ensure cleanup
            connections.set(connectorId, conn);
        }
        // Propagate the error
        return Promise.reject(error); 
    }
}

async function _handlePikoMessage(connectorId: string, messageData: WebSocket.Data): Promise<void> {
    const connection = connections.get(connectorId);
    if (!connection || connection.disabled) return; // Ignore if disabled or no state

    connection.lastActivity = new Date(); // Update activity timestamp
    connections.set(connectorId, connection);

    let messageString: string;
    if (Buffer.isBuffer(messageData)) {
        messageString = messageData.toString('utf8');
    } else if (typeof messageData === 'string') {
        messageString = messageData;
    } else {
        console.warn(`[${connectorId}] Received unexpected message type:`, typeof messageData);
        return;
    }

    console.log(`[${connectorId}] Received message:`, messageString.substring(0, 200) + (messageString.length > 200 ? '...' : ''));

    try {
        const message = JSON.parse(messageString);

        // Check if it's the event update message
        if (message.method === 'rest.v3.servers.events.update' && message.params?.eventParams) {
            const rawEventParams = message.params.eventParams;
            // console.log(`[${connectorId}] Parsed analytics event:`, rawEventParams);

            const standardizedEvents = parsePikoEvent(connectorId, rawEventParams, connection.deviceGuidMap);

            for (const stdEvent of standardizedEvents) {
                // TODO: Pass through full pipeline (store, Zustand, automation)
                // console.log(`[${connectorId}] Processing Standardized Event:`, stdEvent.eventId, stdEvent.eventType);
                 try { await eventsRepository.storeStandardizedEvent(stdEvent); } catch (e) { console.error(`[${connectorId}] Store error for ${stdEvent.eventId}:`, e); continue; }
                 try { useFusionStore.getState().processStandardizedEvent(stdEvent); } catch (e) { console.error(`[${connectorId}] Zustand error for ${stdEvent.eventId}:`, e); }
                 processEvent(stdEvent).catch(err => { console.error(`[${connectorId}] Automation error for ${stdEvent.eventId}:`, err); });
            }
        } else if (message.result !== undefined || message.error !== undefined) {
            // Handle responses to our requests (like the initial subscribe)
            console.log(`[${connectorId}] Received JSON-RPC response/error:`, message);
             if(message.error) {
                 connection.connectionError = `RPC Error: ${message.error.message || 'Unknown'}`;
                 connections.set(connectorId, connection);
                 // Consider if this error should trigger disconnect/reconnect
             }
        } else {
             console.warn(`[${connectorId}] Received unknown message format:`, message);
        }
    } catch (err) {
        console.error(`[${connectorId}] Failed to parse or handle message:`, messageString, err);
        connection.connectionError = `Failed to parse message: ${err instanceof Error ? err.message : String(err)}`;
        connections.set(connectorId, connection);
    }
}

/**
 * Schedule a reconnection attempt for a specific CONNECTOR ID.
 */
function scheduleReconnect(connectorId: string): void {
     const connection = connections.get(connectorId);
    if (!connection || connection.reconnectAttempts > 0 || connection.isConnecting || connection.isConnected) {
        // console.log(`[scheduleReconnect][${connectorId}] Aborted: Already reconnecting, connecting, connected, or no state.`);
        return;
    }
     if (connection.disabled) {
         console.log(`[scheduleReconnect][${connectorId}] Aborted: Connection is disabled.`);
         return;
     }

    connection.reconnectAttempts++;
    connections.set(connectorId, connection);

    const delay = Math.min(5000 * Math.pow(2, connection.reconnectAttempts - 1), 60000); // 5s, 10s, 20s, 40s, 60s max
    console.log(`[${connectorId}] Scheduling reconnection attempt ${connection.reconnectAttempts} in ${delay}ms`);
    connection.connectionError = `Connection lost. Reconnecting (attempt ${connection.reconnectAttempts})...`;
    connections.set(connectorId, connection);

    setTimeout(async () => {
        const currentConnection = connections.get(connectorId);
        if (!currentConnection || currentConnection.disabled || currentConnection.isConnected || currentConnection.isConnecting || currentConnection.reconnectAttempts === 0) {
            console.log(`[scheduleReconnect][${connectorId}] Skipping reconnect attempt: State changed or reset.`);
             if (currentConnection && currentConnection.isConnected) currentConnection.reconnectAttempts = 0; // Reset if connected
             if(currentConnection) connections.set(connectorId, currentConnection);
            return;
        }

        console.log(`[scheduleReconnect][${connectorId}] Timeout fired. Attempting initPikoWebSocket...`);
        try {
            await initPikoWebSocket(connectorId);
            // If init resolves successfully, the 'open' handler should reset attempts.
            // If init fails, the 'error'/'close' handler should trigger the *next* scheduleReconnect.
        } catch (err) {
            console.error(`[${connectorId}] Reconnection attempt via initPikoWebSocket failed in scheduleReconnect:`, err);
             // The 'error'/'close' handlers within initPikoWebSocket should manage the state and trigger the next schedule.
        }
    }, delay);
}

/**
 * Disconnect the WebSocket client for a specific CONNECTOR ID.
 */
export async function disconnectPikoWebSocket(connectorId: string): Promise<void> {
    return new Promise<void>((resolve) => {
        const connection = connections.get(connectorId);
        // Ensure any pending device refresh is cancelled immediately upon intentional disconnect,
        // regardless of when the 'close' event handler fires.
        _stopPeriodicDeviceRefresh(connection);

        if (!connection || !connection.client) {
            if (connection) { // Ensure state reflects disconnection even if no client object
                 connection.isConnected = false;
                 connection.isConnecting = false;
                 connection.reconnectAttempts = 0; // Stop retries
                 connection.connectionError = null;
                 connections.set(connectorId, connection);
            }
            resolve();
            return;
        }

        console.log(`[disconnectPikoWebSocket][${connectorId}] Ending connection.`);
        connection.reconnectAttempts = 0; // Stop any reconnection attempts
        connection.connectionError = null;
        connection.isConnected = false;
        connection.isConnecting = false;
        // Keep connection.disabled as is

        const client = connection.client;
        connection.client = null; // Set client to null immediately
        connections.set(connectorId, connection); // Update state

        // Remove listeners to prevent issues during close
        client.removeAllListeners();

        client.terminate(); // Force close the WebSocket

        // Since 'close' might not fire reliably after terminate, resolve immediately
        // If a clean close is needed, use client.close() and wait for 'close' event with a timeout.
        // Terminate is generally safer for forceful cleanup.
        console.log(`[${connectorId}] WebSocket terminated.`);
        resolve();
    });
}

// --- Control and Initialization (Stubs) ---

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
         
         // 2. Disconnect the WebSocket
         await disconnectPikoWebSocket(connectorId); // This also updates the connection state map
         
         // 3. Ensure disabled flag is set in map state
         const connection = connections.get(connectorId);
         if (connection) {
             connection.disabled = true;
             connections.set(connectorId, connection);
         } else {
             // Add a basic disabled state if it didn't exist
             connections.set(connectorId, {
                 client: null, config: null, systemId: null, connectorId: connectorId, tokenInfo: null,
                 deviceGuidMap: null, isConnected: false, isConnecting: false, connectionError: null, reconnectAttempts: 0, periodicRefreshTimerId: null, disabled: true, lastActivity: null
             });
         }
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
        const connector = await db.select({ category: connectors.category, cfg_enc: connectors.cfg_enc })
            .from(connectors)
            .where(eq(connectors.id, connectorId))
            .limit(1);

        if (!connector.length || connector[0].category !== 'piko') {
             throw new Error('Connector not found or not Piko.');
        }

        await db.update(connectors)
            .set({ eventsEnabled: true })
            .where(eq(connectors.id, connectorId));
        console.log(`[enablePikoConnection][${connectorId}] Updated DB eventsEnabled to true.`);

        // Update local state immediately to reflect enabled status
        const connection = connections.get(connectorId) ?? {
             client: null, config: null, systemId: null, connectorId: connectorId, tokenInfo: null,
             deviceGuidMap: null, isConnected: false, isConnecting: false, connectionError: null, reconnectAttempts: 0, periodicRefreshTimerId: null, disabled: true, lastActivity: null
        };
        connection.disabled = false;
        connections.set(connectorId, connection);

        console.log(`[enablePikoConnection][${connectorId}] Calling and awaiting initPikoWebSocket...`);
        const success = await initPikoWebSocket(connectorId);
        console.log(`[enablePikoConnection][${connectorId}] initPikoWebSocket completed. Result: ${success}`);
        return success;

    } catch (err) {
        console.error(`[enablePikoConnection][${connectorId}] Caught error:`, err);
        // Ensure state reflects disabled if enabling failed
        const connection = connections.get(connectorId);
        if (connection) {
            connection.disabled = true; // Mark as disabled again if init failed
            connections.set(connectorId, connection);
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
             if (connector.eventsEnabled) {
                 console.log(`[initializePikoConnections] Initializing enabled connector: ${connector.id} (${connector.name})`);
                 try { await initPikoWebSocket(connector.id); } catch (err) { /* init logs errors */ }
             } else {
                 // Ensure any existing connection for a disabled connector is stopped
                 console.log(`[initializePikoConnections] Ensuring disabled connector is stopped: ${connector.id} (${connector.name})`);
                 await disablePikoConnection(connector.id); // Handles disconnect and state update
             }
         }

         // 2. Cleanup: Remove connections from map if their connector was deleted from DB
         for (const [connectorId, connection] of currentConnectionsMap.entries()) {
             if (!dbConnectorMap.has(connectorId)) {
                 console.warn(`[initializePikoConnections] Connector ${connectorId} not found in DB. Removing connection state and disconnecting.`);
                 await disconnectPikoWebSocket(connectorId);
                 connections.delete(connectorId); // Remove from map
             }
         }

         console.log('[initializePikoConnections] Scan finished.');
     } catch (err) {
         console.error('[initializePikoConnections] Error during scan:', err);
     }
} 