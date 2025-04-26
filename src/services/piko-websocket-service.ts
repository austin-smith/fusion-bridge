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
// --- Add Max Redirects ---
const MAX_REDIRECTS = 5; 
// --- End Add ---

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
    lastStandardizedPayload: Record<string, any> | null; // Added standardized payload
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
    lastStandardizedPayload: Record<string, any> | null; // Added standardized payload
}

/**
 * Get the current state of the WebSocket client for a specific CONNECTOR ID.
 */
export function getPikoWebSocketState(connectorId: string): PikoWebSocketState {
    const connection = connections.get(connectorId);
    if (!connection) {
        return { connectorId, systemId: null, isConnected: false, isConnecting: false, error: 'No connection state found', reconnecting: false, disabled: true, lastActivity: null, lastStandardizedPayload: null };
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
        lastStandardizedPayload: connection.lastStandardizedPayload,
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
        // --- Revert Test Google Fetch ---
        // console.log(`[${connection.connectorId}] >>> TESTING FETCH to google.com`);
        // const testResponse = await fetch('https://google.com');
        // console.log(`[${connection.connectorId}] >>> TEST FETCH Status: ${testResponse.status}`);
        // if (!testResponse.ok) {
        //     console.error(`[${connection.connectorId}] >>> TEST FETCH FAILED`);
        // } else {
        //     console.log(`[${connection.connectorId}] >>> TEST FETCH SUCCEEDED`);
        // }
        // --- End Revert ---

        console.log(`[${connection.connectorId}] Fetching system devices for ${connection.systemId}...`);
        // Uncomment original call
        const devices = await getSystemDevices(connection.systemId, connection.tokenInfo.accessToken);
        connection.deviceGuidMap = new Map(devices.map(d => [d.id, d]));
        console.log(`[${connection.connectorId}] Stored device map with ${connection.deviceGuidMap.size} devices.`);
        connections.set(connection.connectorId, connection); // Update the global map
    } catch (error) {
        // Revert log message
        console.error(`[${connection.connectorId}] Failed to fetch or store Piko device map. Raw Error:`, error); 
        console.error(`[${connection.connectorId}] Error Name: ${error instanceof Error ? error.name : 'N/A'}, Message: ${error instanceof Error ? error.message : 'N/A'}`);
        if (error instanceof Error && error.stack) {
            console.error(`[${connection.connectorId}] Stack Trace:\n${error.stack}`);
        }
        
        // Revert error message
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
        try {
          await _fetchAndStoreDeviceMap(currentConnection);
        } catch (refreshError) {
          console.error(`[${connection.connectorId}][Periodic Refresh] Error during _fetchAndStoreDeviceMap:`, refreshError);
          // The error should already be logged in detail by _fetchAndStoreDeviceMap's catch block
          // We might want to update connection.connectionError here too, or rely on the existing logic
        }
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
            reconnectAttempts: 0, periodicRefreshTimerId: null, disabled: true, lastActivity: null,
            lastStandardizedPayload: null
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
                
                let client: WebSocket | null = null; 
                let connectTimeoutId: NodeJS.Timeout | null = null;
                let promiseSettled = false; 

                const cleanup = () => {
                    if (connectTimeoutId) clearTimeout(connectTimeoutId);
                    connectTimeoutId = null;
                    client?.removeAllListeners();
                };

                try {
                    // --- Re-check connection state before proceeding ---
                    const currentConnection = connections.get(connectorId);
                    if (!currentConnection || !currentConnection.config || !currentConnection.systemId) {
                        throw new Error('Internal state error: Connection object missing required fields before token fetch.');
                    }

                    // --- Token Fetch --- 
                    let currentToken = currentConnection.tokenInfo?.accessToken;
                    const tokenNeedsRefresh = !currentToken;
                    if (tokenNeedsRefresh) {
                        console.log(`[initPikoWebSocket][${connectorId}] Fetching new system-scoped token...`);
                        // Use currentConnection safely here due to check above
                        currentConnection.tokenInfo = await getSystemScopedAccessToken(
                            currentConnection.config.username, 
                            currentConnection.config.password, 
                            currentConnection.systemId
                        );
                        currentToken = currentConnection.tokenInfo.accessToken;
                        connections.set(connectorId, currentConnection); // Save updated connection state
                        console.log(`[initPikoWebSocket][${connectorId}] Token obtained.`);
                    } else {
                        console.log(`[initPikoWebSocket][${connectorId}] Using existing token.`);
                    }
                    const accessToken = currentToken;
                    if (!accessToken) {
                        throw new Error("Failed to obtain valid access token.");
                    }
                    // --- End Token Fetch ---

                    const wsUrl = `wss://${currentConnection.systemId}.relay.vmsproxy.com/jsonrpc`;
                    console.log(`[${connectorId}] Connecting directly to: ${wsUrl}`);

                    // Start connection timeout
                    connectTimeoutId = setTimeout(() => {
                        if (promiseSettled) return;
                        promiseSettled = true;
                        console.error(`[${connectorId}] Connection attempt to ${wsUrl} timed out after ${CONNECTION_TIMEOUT_MS}ms.`);
                        cleanup();
                        const conn = connections.get(connectorId);
                        if (conn) {
                            conn.connectionError = 'Connection Timeout';
                            conn.isConnecting = false;
                            conn.isConnected = false;
                            if (conn.client === client) conn.client = null;
                            connections.set(connectorId, conn);
                        }
                        reject(new Error('Connection Timeout')); 
                    }, CONNECTION_TIMEOUT_MS);

                    // Establish WebSocket connection directly
                    client = new WebSocket(wsUrl, {
                        headers: { 'Authorization': `Bearer ${accessToken}` },
                        perMessageDeflate: false // Keep compression disabled
                    });

                    // --- Standard Listeners ---
                    client.on('open', async () => {
                        if (promiseSettled) return;
                        const conn = connections.get(connectorId);
                        
                        // State checks
                        if (!conn || conn.disabled || !conn.isConnecting) {
                           console.warn(`[${connectorId}][open] WS open event for an invalid/disabled/not-connecting state. Aborting.`);
                           promiseSettled = true;
                           cleanup();
                           client?.close(); 
                           reject(false); 
                           return;
                        }
                         if (conn.client !== null && conn.client !== client) {
                            console.warn(`[${connectorId}][open] WS open event for redundant client. Closing.`);
                            promiseSettled = true;
                            cleanup();
                            client?.close(); 
                            reject(false); 
                            return;
                        }

                        // --- SUCCESS --- 
                        promiseSettled = true;
                        conn!.client = client!; 
                        console.log(`[${conn!.connectorId}] WebSocket connection established to ${wsUrl}.`);
                        conn!.isConnected = true;
                        conn!.isConnecting = false;
                        conn!.connectionError = null;
                        conn!.reconnectAttempts = 0;
                        conn!.lastStandardizedPayload = null;
                        connections.set(conn!.connectorId, conn!);
                        if (connectTimeoutId) clearTimeout(connectTimeoutId); // Clear timeout on successful open
                        connectTimeoutId = null;

                        // --- Attach Persistent message/close HERE ---
                        client!.on('message', (data) => {
                            const currentConn = connections.get(connectorId);
                            if(currentConn && !currentConn.disabled) {
                                _handlePikoMessage(connectorId, data);
                            }
                        });

                        client!.on('close', (code, reason) => {
                             const currentConn = connections.get(connectorId);
                             if (!currentConn) return;
                             if (currentConn.client !== null && currentConn.client !== client!) return; // Ignore if client changed

                             const reasonStr = reason.toString();
                             console.log(`[${currentConn.connectorId}][close] WebSocket connection closed. Code: ${code}, Reason: ${reasonStr}`);
                             currentConn.isConnected = false;
                             currentConn.isConnecting = false;
                             currentConn.client = null; 
                             _stopPeriodicDeviceRefresh(currentConn);

                             const wasUnexpected = code !== 1000;
                             if (!currentConn.disabled && wasUnexpected) {
                                 currentConn.connectionError = currentConn.connectionError || `Connection closed unexpectedly (Code: ${code}, Reason: ${reasonStr || 'Unknown'})`;
                                 console.log(`[${currentConn.connectorId}] Scheduling reconnect due to unexpected close.`);
                                 connections.set(connectorId, currentConn);
                                 scheduleReconnect(connectorId); 
                             } else {
                                 currentConn.connectionError = null;
                                 currentConn.reconnectAttempts = 0;
                                 currentConn.lastStandardizedPayload = null;
                                 connections.set(connectorId, currentConn);
                             }
                        });
                        // --- End Persistent message/close ---
                        
                        // Send subscribe message
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
                            const messageString = JSON.stringify(subscribeMsg);
                            console.log(`[${conn!.connectorId}] Sending subscribe request (ID: ${requestId})...`);
                            if (client!.readyState !== WebSocket.OPEN) {
                                throw new Error(`WebSocket not open. ReadyState: ${client!.readyState}`);
                            }
                            client!.send(messageString);
                        } catch (sendError) {
                            console.error(`[${conn!.connectorId}] Failed to send subscribe message. Raw Error:`, sendError);
                            // ... enhanced logging ...
                            conn!.connectionError = `Failed to send subscribe: ${sendError instanceof Error ? sendError.message : 'Unknown send error'}`;
                            connections.set(conn!.connectorId, conn!); // Use checked conn
                            client!.close(); // Use non-null assertion
                            reject(false); 
                            return;
                        }

                        // Fetch initial device map & Start periodic refresh
                        await _fetchAndStoreDeviceMap(conn!); // Use checked conn
                        _startPeriodicDeviceRefresh(conn!); // Use checked conn

                        resolve(true); // Resolve the main promise with true
                    });

                    client.on('error', (err) => {
                        if (promiseSettled) return;
                        promiseSettled = true;
                        const conn = connections.get(connectorId);
                        if (conn && (conn.client === client! || conn.isConnecting)) {
                            console.error(`[${connectorId}][error] WebSocket error:`, err); 
                            conn.isConnecting = false;
                            conn.isConnected = false;
                            conn.connectionError = `WebSocket error: ${err.message}`;
                            if (conn.client === client!) conn.client = null; // Use non-null assertion
                            connections.set(connectorId, conn);
                            cleanup();
                            reject(err); 
                        } else {
                             console.warn(`[${connectorId}][error] Received error for outdated/settled client attempt:`, err.message);
                             cleanup();
                        }
                   });

                // --- NO Redirect ('unexpected-response') Handler Needed --- 

                } catch (setupError) {
                    if (promiseSettled) return;
                    promiseSettled = true;
                    cleanup();
                    const conn = connections.get(connectorId);
                    if(conn && conn.isConnecting) {
                         conn.isConnecting = false;
                         conn.connectionError = `Connection setup error: ${setupError instanceof Error ? setupError.message : String(setupError)}`;
                         connections.set(connectorId, conn);
                     }
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
        throw error; // Throw error instead
    }
}

async function _handlePikoMessage(connectorId: string, messageData: WebSocket.Data): Promise<void> {
    const connection = connections.get(connectorId);
    if (!connection || connection.disabled) {
        return; // Ignore if disabled or no state
    }

    let messageString: string;
    if (Buffer.isBuffer(messageData)) {
        messageString = messageData.toString('utf8');
    } else if (typeof messageData === 'string') {
        messageString = messageData;
    } else {
        console.warn(`[${connectorId}] Received unexpected message type:`, typeof messageData);
        return;
    }

    try {
        const message = JSON.parse(messageString);

        // Check if it's the event update message
        if (message.method === 'rest.v3.servers.events.update' && message.params?.eventParams) {
            const rawEventParams = message.params.eventParams;

            const standardizedEvents = parsePikoEvent(connectorId, rawEventParams, connection.deviceGuidMap);

            for (const stdEvent of standardizedEvents) {
                 console.log(`[${connectorId}] Processing Standardized Event:`, stdEvent.eventId, stdEvent.eventType); // Keep this log
                 try { await eventsRepository.storeStandardizedEvent(stdEvent); } catch (e) { console.error(`[${connectorId}] Store error for ${stdEvent.eventId}:`, e); continue; }
                 try { useFusionStore.getState().processStandardizedEvent(stdEvent); } catch (e) { console.error(`[${connectorId}] Zustand error for ${stdEvent.eventId}:`, e); }
                 processEvent(stdEvent).catch(err => { console.error(`[${connectorId}] Automation error for ${stdEvent.eventId}:`, err); });

                 // Update lastStandardizedPayload *after* successful processing of this specific event
                 connection.lastStandardizedPayload = stdEvent.payload ?? null;
                 
                 // << ADD lastActivity UPDATE HERE >>
                 connection.lastActivity = new Date();
                 connections.set(connectorId, connection);
            }
        } else if (message.error) {
            // Handle JSON-RPC Errors explicitly
            console.error(`[${connectorId}] Received JSON-RPC Error:`, message.error);
            connection.connectionError = `RPC Error: ${message.error.message || 'Unknown RPC error'}`;
            connections.set(connectorId, connection);
            // Consider if this error should trigger disconnect/reconnect
        } else if (message.result !== undefined) {
            // Handle JSON-RPC Successful Responses explicitly
            console.log(`[${connectorId}] Received JSON-RPC Result (ID: ${message.id}):`, message.result);
        } else {
             console.warn(`[${connectorId}] Received unknown message format:`, message);
        }
    } catch (err) {
        console.error(`[${connectorId}] Failed to parse or handle message:`, err);
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
             if(currentConnection) {
                currentConnection.lastStandardizedPayload = null;
                connections.set(connectorId, currentConnection);
             }
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
                 connection.lastStandardizedPayload = null;
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
             connection.lastStandardizedPayload = null;
             connections.set(connectorId, connection);
         } else {
             // Add a basic disabled state if it didn't exist
             connections.set(connectorId, {
                 client: null, config: null, systemId: null, connectorId: connectorId, tokenInfo: null,
                 deviceGuidMap: null, isConnected: false, isConnecting: false, connectionError: null, reconnectAttempts: 0, periodicRefreshTimerId: null, disabled: true, lastActivity: null,
                 lastStandardizedPayload: null
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
             deviceGuidMap: null, isConnected: false, isConnecting: false, connectionError: null, reconnectAttempts: 0, periodicRefreshTimerId: null, disabled: true, lastActivity: null,
             lastStandardizedPayload: null
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
            connection.lastStandardizedPayload = null;
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