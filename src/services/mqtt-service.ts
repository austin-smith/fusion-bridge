import 'server-only'; // Mark this module as server-only

// Remove module init log: console.log(`[${new Date().toISOString()}] --- MQTT Service Module Initializing ---`);

import * as mqtt from 'mqtt';
import { getAccessToken, getHomeInfo } from '@/services/drivers/yolink';
import { YoLinkConfig } from '@/services/drivers/yolink';
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq, and } from 'drizzle-orm';
import * as eventsRepository from '@/data/repositories/events';
import { processEvent } from '@/services/automation-service'; // Import the automation processor
import { parseYoLinkEvent } from '@/lib/event-parsers/yolink'; // <-- Import the new parser
import { useFusionStore } from '@/stores/store'; // <-- Import Zustand store
import { Connector } from '@/types'; // Import Connector type
import { initializePikoConnections } from './piko-websocket-service'; // Import Piko initializer

// Define event type based on the example
export interface YolinkEvent {
  event: string;
  time: number;
  msgid: string;
  data: {
    state?: string;
    [key: string]: string | number | boolean | undefined;
  };
  deviceId: string;
}

// Type to represent an MQTT connection state associated with a specific YoLink Home ID
interface MqttConnection {
  client: mqtt.MqttClient | null;
  config: YoLinkConfig; // Stored credentials (UAID, Secret)
  homeId: string; // The YoLink Home ID (key for the map)
  connectorId: string; // The ID of the connector DB entry associated with this connection
  lastEventData: { time: Date, count: number } | null;
  connectionError: string | null;
  reconnectAttempts: number;
  disabled: boolean; // Mirroring the connector's eventsEnabled state
  isConnected: boolean;
}

// Map storing active MQTT connections, keyed by YoLink Home ID
// eslint-disable-next-line no-var
declare global { var __mqttConnections: Map<string, MqttConnection> | undefined; }
const connections: Map<string, MqttConnection> = globalThis.__mqttConnections || (globalThis.__mqttConnections = new Map());

// Remove map init log: console.log(`[${new Date().toISOString()}] --- MQTT Connections Map Initialized (size: ${connections.size}) ---`);

export interface MqttClientState {
  connected: boolean;
  lastEvent: { time: number, count: number } | null;
  homeId: string | null; // The YoLink Home ID
  connectorId: string | null; // The associated connector ID
  error: string | null;
  reconnecting: boolean;
  disabled: boolean;
}

/**
 * Get the current state of the MQTT client associated with a specific HOME ID.
 */
export function getMqttClientState(homeId?: string): MqttClientState {
  if (homeId && connections.has(homeId)) {
    const connection = connections.get(homeId)!;
    const isConnected = connection.isConnected && !connection.disabled;
    const isReconnecting = !isConnected && connection.reconnectAttempts > 0 && !connection.disabled;
    return {
      connected: isConnected,
      lastEvent: connection.lastEventData ? { time: connection.lastEventData.time.getTime(), count: connection.lastEventData.count } : null,
      homeId: connection.homeId,
      connectorId: connection.connectorId,
      error: !isConnected && !isReconnecting ? connection.connectionError : null,
      reconnecting: isReconnecting,
      disabled: connection.disabled
    };
  }
  // Return default disconnected state if homeId not found
  return { connected: false, lastEvent: null, homeId: homeId ?? null, connectorId: null, error: 'No connection state found', reconnecting: false, disabled: true };
}

/**
 * Get all MQTT client states, keyed by Home ID.
 */
export function getAllMqttClientStates(): Map<string, MqttClientState> {
  const states = new Map<string, MqttClientState>();
  for (const [homeId, connection] of connections.entries()) {
    const isConnected = connection.isConnected && !connection.disabled;
    const isReconnecting = !isConnected && connection.reconnectAttempts > 0 && !connection.disabled;
    states.set(homeId, {
      connected: isConnected,
      lastEvent: connection.lastEventData ? { time: connection.lastEventData.time.getTime(), count: connection.lastEventData.count } : null,
      homeId: connection.homeId,
      connectorId: connection.connectorId,
      error: !isConnected && !isReconnecting ? connection.connectionError : null,
      reconnecting: isReconnecting,
      disabled: connection.disabled
    });
  }
  return states;
}

// Load the events enabled state for a specific connector ID
async function loadDisabledState(connectorId: string): Promise<boolean> {
  try {
    const connectorResult = await db.select({ eventsEnabled: connectors.eventsEnabled })
      .from(connectors)
      .where(eq(connectors.id, connectorId))
      .limit(1);
    return connectorResult.length > 0 ? !connectorResult[0].eventsEnabled : true;
  } catch (err) {
    console.error(`[loadDisabledState][${connectorId}] Failed to load state:`, err);
    return true; // Default to disabled on error
  }
}

// Save the events enabled state for a specific connector ID
async function saveDisabledState(connectorId: string, isDisabled: boolean): Promise<void> {
  try {
    const result = await db.update(connectors)
      .set({ eventsEnabled: !isDisabled })
      .where(eq(connectors.id, connectorId));
    if (result.rowsAffected > 0) {
        console.log(`[saveDisabledState][${connectorId}] Updated eventsEnabled to ${!isDisabled}`);
    } else {
        console.warn(`[saveDisabledState][${connectorId}] Connector not found or state unchanged.`);
    }
  } catch (err) {
    console.error(`[saveDisabledState][${connectorId}] Failed to save state:`, err);
  }
}

// Initialize or update the MQTT service for a specific CONNECTOR ID
// Returns a Promise that resolves(true) on successful connection, rejects on failure/timeout.
export async function initMqttService(connectorId: string): Promise<boolean> {
  // console.log(`[initMqttService][${connectorId}] Starting initialization...`);
  
  let connector: Connector | undefined;
  let config: (YoLinkConfig & { homeId?: string }) | undefined;
  let homeId: string | undefined;
  try {
      const connectorResult = await db.select().from(connectors).where(eq(connectors.id, connectorId)).limit(1);
      if (!connectorResult.length) {
          console.error(`[initMqttService][${connectorId}] Connector not found.`);
          // Clean up potential stray connection if connector is deleted
          const existingConnectionEntry = [...connections.entries()].find(([_, conn]) => conn.connectorId === connectorId);
          if (existingConnectionEntry) {
              console.warn(`[initMqttService][${connectorId}] Found stray connection for deleted connector (Home: ${existingConnectionEntry[0]}). Disconnecting.`);
              await disconnectMqtt(existingConnectionEntry[0]); // Disconnect by homeId
          }
          return Promise.reject(new Error("Connector not found"));
      }
      connector = connectorResult[0];

      if (connector.category !== 'yolink') {
          // console.log(`[initMqttService][${connectorId}] Skipping MQTT init, not a YoLink connector.`);
          return Promise.resolve(false);
      }

      try {
          config = JSON.parse(connector.cfg_enc);
          if (!config?.uaid || !config?.clientSecret) throw new Error('Missing uaid or clientSecret in config');
          
          homeId = config.homeId;
          if (!homeId) {
              console.warn(`[initMqttService][${connectorId}] Missing homeId in config. Fetching...`);
              const accessToken = await getAccessToken(config); // Use parsed config for token
              homeId = await getHomeInfo(accessToken);
              config.homeId = homeId;
              await db.update(connectors).set({ cfg_enc: JSON.stringify(config) }).where(eq(connectors.id, connectorId));
              console.log(`[initMqttService][${connectorId}] Fetched and saved homeId: ${homeId}`);
          }
      } catch (e) {
          console.error(`[initMqttService][${connectorId}] Failed to parse config or fetch/save homeId:`, e);
          return Promise.reject(e);
      }
      
      const currentHomeId = homeId!; // We know homeId is valid here
      const currentConfig = { uaid: config!.uaid, clientSecret: config!.clientSecret };
      const isDisabled = !connector.eventsEnabled;
      // console.log(`[initMqttService][${connectorId}] Target Home ID: ${currentHomeId}, Disabled: ${isDisabled}`);
      const connection: MqttConnection = connections.get(currentHomeId) ?? {
          client: null,
          config: currentConfig,
          homeId: currentHomeId,
          connectorId: connectorId,
          lastEventData: null,
          connectionError: null,
          reconnectAttempts: 0,
          disabled: true, // Will be updated below
          isConnected: false
      };
      connection.config = currentConfig;
      connection.connectorId = connectorId;
      connections.set(currentHomeId, connection);

      if (isDisabled) {
          // console.log(`[initMqttService][${connectorId}] MQTT events are disabled in DB.`);
          connection.disabled = true;
          connection.isConnected = false;
          connection.connectionError = null;
          connection.reconnectAttempts = 0;
          if (connection.client) {
              console.log(`[initMqttService][${currentHomeId}] Disconnecting existing client due to disabled state for connector ${connectorId}.`);
              try { connection.client.end(true); } catch (e) { console.error(`Error ending client for ${currentHomeId}:`, e);} finally { connection.client = null; }
          }
          connections.set(currentHomeId, connection);
          return Promise.resolve(false);
      }
      
      // console.log(`[initMqttService][${connectorId}] Events are enabled.`);
      connection.disabled = false;
      connection.connectionError = null;
      connection.reconnectAttempts = 0;
      connections.set(currentHomeId, connection);
      
      if (connection.client && (!connection.client.connected || connection.config.uaid !== currentConfig.uaid || connection.config.clientSecret !== currentConfig.clientSecret)) {
          console.log(`[initMqttService][${currentHomeId}] Ending existing client for connector ${connectorId} due to config change or disconnected state.`);
          try { connection.client.end(true); } catch (e) { console.error(`Error ending client for ${currentHomeId}:`, e); } finally { connection.client = null; }
          connection.isConnected = false;
          connections.set(currentHomeId, connection);
      }

      if (!connection.client) {
          // console.log(`[initMqttService][${currentHomeId}] Attempting MQTT connection for connector ${connectorId}...`);
          
          return new Promise<boolean>(async (resolve, reject) => {
              let connectTimeoutId: NodeJS.Timeout | null = null;
              
              // Cleanup function for handlers and timeout
              const cleanup = () => {
                  if (connectTimeoutId) clearTimeout(connectTimeoutId);
                  connectTimeoutId = null;
                  if (connection.client) {
                      connection.client.removeAllListeners('connect');
                      connection.client.removeAllListeners('error');
                      connection.client.removeAllListeners('close');
                      // Keep message and offline listeners attached if needed after initial connect?
                  }
              };

              try {
                  const token = await getAccessToken(connection.config);
                  // console.log(`[${currentHomeId}] Access token obtained.`);
                  
                  // Start connection timeout
                  connectTimeoutId = setTimeout(() => {
                      cleanup();
                      console.error(`[${currentHomeId}][${connectorId}] MQTT connection timed out.`);
                      if(connections.has(currentHomeId)) {
                          const conn = connections.get(currentHomeId)!;
                          conn.connectionError = 'Connection Timeout';
                          conn.isConnected = false;
                          if (conn.client) { try { conn.client.end(true); } catch(e){} finally { conn.client = null; } }
                          connections.set(currentHomeId, conn);
                      }
                      reject(new Error('Connection Timeout'));
                  }, 15000); // 15 second timeout

                  connection.client = mqtt.connect('mqtt://api.yosmart.com:8003', {
                      clientId: `fusion-bridge-server-${currentHomeId}-${Math.random().toString(16).substring(2, 10)}`,
                      username: token, password: '', reconnectPeriod: 5000, connectTimeout: 10000,
                  });
                  connections.set(currentHomeId, connection);
                  
                  // --- Setup Event Handlers --- 
                  connection.client.once('connect', () => { // Use .once for initial connect resolve
                      cleanup(); // Clear timeout
                      console.log(`[${currentHomeId}] Connected to YoLink MQTT broker`);
                      if (connections.has(currentHomeId)) {
                          const conn = connections.get(currentHomeId)!;
                          conn.connectionError = null; conn.reconnectAttempts = 0; conn.isConnected = true; conn.disabled = false;
                          connections.set(currentHomeId, conn);
                          // Subscribe after successful connect
                          if (!conn.client) return; // Safety
                          const topic = `yl-home/${currentHomeId}/+/report`;
                          conn.client.subscribe(topic, (err) => {
                              if (err) {
                                  console.error(`[${currentHomeId}] Failed to subscribe:`, err);
                                  conn.connectionError = `Failed to subscribe: ${err.message}`;
                                  connections.set(currentHomeId, conn);
                              } else { 
                                  // console.log(`[${currentHomeId}] Subscribed to ${topic}`); 
                              }
                          });
                      }
                      resolve(true); // Resolve the promise on successful connection
                  });

                  connection.client.once('error', (err) => { // Use .once for initial connect failure
                      cleanup(); // Clear timeout
                      console.error(`[${currentHomeId}] MQTT client error during initial connect:`, err);
                      if (connections.has(currentHomeId)) {
                          const conn = connections.get(currentHomeId)!; conn.connectionError = `Connection error: ${err.message}`; conn.isConnected = false;
                          if (conn.client) { try { conn.client.end(true); } catch(e){} finally { conn.client = null; } }
                          connections.set(currentHomeId, conn);
                          // Don't schedule reconnect here, let the rejection handle it
                      }
                      reject(err); // Reject the promise on error
                  });

                  connection.client.once('close', () => { // Use .once for initial connect failure
                      cleanup(); // Clear timeout
                      // console.log(`[${currentHomeId}] MQTT client connection closed during initial connect.`);
                      if (connections.has(currentHomeId)) {
                          const conn = connections.get(currentHomeId)!; conn.isConnected = false; conn.client = null;
                          conn.connectionError = conn.connectionError || 'Connection closed unexpectedly'; // Keep existing error or set default
                          connections.set(currentHomeId, conn);
                          // Don't schedule reconnect here
                      }
                      reject(new Error(connection.connectionError || 'Connection closed unexpectedly')); // Reject
                  });

                  // Keep persistent message/offline handlers if needed outside the promise logic
                  connection.client.on('message', async (topic, payload) => {
                      const associatedConnectorId = connections.get(currentHomeId)?.connectorId;
                      if (!associatedConnectorId) {
                          console.error(`[${currentHomeId}][message] Cannot process, connectorId not found for homeId.`);
                          return;
                      }
                      
                      let rawEvent: Record<string, any>;
                      try { rawEvent = JSON.parse(payload.toString()); } catch (err) { 
                          console.error(`[${currentHomeId}][${associatedConnectorId}] Failed to parse MQTT payload:`, payload.toString(), err); return; 
                      }

                      try {
                          const standardizedEvents = parseYoLinkEvent(associatedConnectorId, rawEvent);
                          for (const stdEvent of standardizedEvents) {
                              try { await eventsRepository.storeStandardizedEvent(stdEvent); } catch (e) { console.error(`Store error for ${stdEvent.eventId}:`, e); continue; }
                              try { useFusionStore.getState().processStandardizedEvent(stdEvent); } catch (e) { console.error(`Zustand error for ${stdEvent.eventId}:`, e); }
                              processEvent(stdEvent).catch(err => { console.error(`Automation error for ${stdEvent.eventId}:`, err); });
                          }
                          // Update last event data for this homeId
                          const count = await eventsRepository.getEventCount(); 
                          const conn = connections.get(currentHomeId);
                          if (conn) {
                              const rawEventTime = rawEvent?.time as number | undefined;
                              if (rawEventTime) { conn.lastEventData = { time: new Date(rawEventTime), count }; connections.set(currentHomeId, conn); }
                          }
                      } catch(err) { console.error(`[${currentHomeId}][${associatedConnectorId}] Error processing event pipeline:`, err); }
                  });

                  connection.client.on('offline', () => {
                      // console.log(`[${currentHomeId}] MQTT client is offline.`);
                      if (connections.has(currentHomeId)) {
                          const conn = connections.get(currentHomeId)!; conn.connectionError = 'Connection offline'; conn.isConnected = false;
                          connections.set(currentHomeId, conn);
                      }
                  });

              } catch (connectErr) {
                  cleanup(); // Clear timeout on setup error
                  console.error(`[${currentHomeId}][${connectorId}] Failed to initiate MQTT connection setup:`, connectErr);
                  if (connections.has(currentHomeId)) {
                      const conn = connections.get(currentHomeId)!;
                      conn.connectionError = connectErr instanceof Error ? connectErr.message : 'MQTT connection failed';
                      conn.isConnected = false;
                      if (conn.client) { try { conn.client.end(true); } catch(e){} finally { conn.client = null; } }
                      connections.set(currentHomeId, conn);
                  }
                  reject(connectErr); // Reject the promise
              }
          }); // End of new Promise

      } else {
          // console.log(`[initMqttService][${currentHomeId}] Client already exists for connector ${connectorId}. Assuming connected or reconnecting.`);
          // If client exists, assume it's either connected or attempting reconnection.
          // Resolve true immediately if already connected, otherwise maybe wait briefly?
          // For simplicity, let's resolve true if connection.isConnected is true
          return Promise.resolve(connection.isConnected);
      }

  } catch (error) {
    console.error(`[initMqttService][${connectorId}] General initialization error:`, error);
    return Promise.reject(error); // Reject on general error
  }
}

// Schedule a reconnection attempt for a specific HOME ID
function scheduleReconnect(homeId: string): void {
  if (!connections.has(homeId)) {
      // console.log(`[scheduleReconnect][${homeId}] Aborted: No connection found in map.`);
      return; // Should not happen if called from event handlers
  }
  const connection = connections.get(homeId)!;
  if (connection.reconnectAttempts > 0) {
      // console.log(`[scheduleReconnect][${homeId}] Aborted: Reconnect already in progress.`);
      return; 
  }
  if (connection.disabled) { // Check internal state first
      // console.log(`[scheduleReconnect][${homeId}] Aborted: Connection state is disabled.`);
      return;
  }
  
  const connectorId = connection.connectorId;
  if (!connectorId) {
      console.error(`[scheduleReconnect][${homeId}] CRITICAL: Cannot reconnect, connectorId missing from state.`);
      return;
  }

  // Ensure attempts don't race
  connection.reconnectAttempts++;
  connections.set(homeId, connection); // Save increased attempt count immediately

  // Now check DB state before scheduling timeout
  // console.log(`[scheduleReconnect][${homeId}] Checking DB state for connector ${connectorId}...`);
  loadDisabledState(connectorId).then(isDisabled => {
      // Re-fetch connection state in case it changed during async DB check
      if (!connections.has(homeId)) return; // Connection removed
      const currentConnection = connections.get(homeId)!;

      if (currentConnection.reconnectAttempts === 0) { // Check if reset elsewhere (e.g., explicit disconnect/enable)
        // console.log(`[scheduleReconnect][${homeId}] Aborted: Reconnect attempts were reset.`);
        return; 
      }
      if (currentConnection.disabled || isDisabled) {
        // console.log(`[scheduleReconnect][${homeId}] Aborted: Connector ${connectorId} is disabled (state: ${currentConnection.disabled}, db: ${isDisabled}). Resetting attempts.`);
        currentConnection.reconnectAttempts = 0;
        currentConnection.connectionError = null;
        currentConnection.disabled = true;
        currentConnection.isConnected = false;
        if(currentConnection.client) { try{ currentConnection.client.end(true); } catch(e){} finally { currentConnection.client = null; } }
        connections.set(homeId, currentConnection);
        return;
      }
            
      // Exponential backoff (5s, 10s, 20s, 40s, max 60s)
      const delay = Math.min(5000 * Math.pow(2, currentConnection.reconnectAttempts - 1), 60000);
      console.log(`[${homeId}] Scheduling reconnection attempt ${currentConnection.reconnectAttempts} for connector ${connectorId} in ${delay}ms`);
      currentConnection.connectionError = `Connection lost. Reconnecting (attempt ${currentConnection.reconnectAttempts})...`;
      connections.set(homeId, currentConnection); // Save error message
      
      setTimeout(() => {
        if (!connections.has(homeId)) return; // Connection removed
        const checkConnection = connections.get(homeId)!;

        if (checkConnection.disabled || checkConnection.isConnected || checkConnection.reconnectAttempts === 0) { // Check again before attempting
          // console.log(`[scheduleReconnect][${homeId}] Skipping reconnect attempt: Disabled=${checkConnection.disabled}, Connected=${checkConnection.isConnected}, Attempts=${checkConnection.reconnectAttempts}`);
          if (checkConnection.isConnected) checkConnection.reconnectAttempts = 0; // Reset if connected
          connections.set(homeId, checkConnection);
          return;
        }

        // console.log(`[scheduleReconnect][${homeId}] Timeout fired. Attempting initMqttService for connector ${connectorId}...`);
        initMqttService(connectorId).catch(err => {
          console.error(`[${homeId}][${connectorId}] Reconnection attempt via initMqttService failed:`, err);
          // Don't reset attempts here, let the error/close handler trigger the *next* scheduleReconnect
        });
      }, delay);
    }).catch(err => {
      console.error(`[${homeId}][${connectorId}] CRITICAL: Failed to check DB state for reconnection:`, err); 
      // Reset attempts on DB error to allow future triggers
      if (connections.has(homeId)) { connections.get(homeId)!.reconnectAttempts = 0; connections.set(homeId, connections.get(homeId)!); }
    });
}

// Disconnect from the MQTT broker for a specific HOME ID
export async function disconnectMqtt(homeId: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!connections.has(homeId)) { resolve(); return; }
    const connection = connections.get(homeId)!;
    if (!connection.client) { resolve(); return; }
    
    console.log(`[disconnectMqtt][${homeId}] Ending connection for connector ${connection.connectorId}`);
    connection.reconnectAttempts = 0; // Stop any reconnection attempts
    connection.connectionError = null;
    connection.isConnected = false;
    // Keep connection.disabled as is
    const client = connection.client;
    connection.client = null; // Set client to null immediately
    connections.set(homeId, connection);
    
    client.end(true, {}, () => {
      // console.log(`[${homeId}] Disconnected from MQTT broker via client.end callback.`);
      resolve();
    });
  });
}

// Disconnect all MQTT connections
export async function disconnectAllMqtt(): Promise<void> {
  // console.log('[disconnectAllMqtt] Disconnecting all clients...');
  const promises: Promise<void>[] = [];
  for (const homeId of connections.keys()) { promises.push(disconnectMqtt(homeId)); }
  await Promise.all(promises);
  // console.log('[disconnectAllMqtt] All disconnects initiated.');
}

// Manually reconnect to MQTT for a specific CONNECTOR ID
export async function reconnectMqtt(connectorId: string): Promise<boolean> {
  // console.log(`[reconnectMqtt][${connectorId}] Starting manual reconnect...`);
  try {
    const connector = await db.select({ category: connectors.category, eventsEnabled: connectors.eventsEnabled, cfg_enc: connectors.cfg_enc }).from(connectors).where(eq(connectors.id, connectorId)).limit(1);
    if (!connector.length) throw new Error(`Connector ${connectorId} not found.`);
    if (connector[0].category !== 'yolink') throw new Error(`Connector ${connectorId} is not a YoLink connector.`);
    if (!connector[0].eventsEnabled) throw new Error(`Events are disabled for connector ${connectorId}.`);
    
    // console.log(`[reconnectMqtt][${connectorId}] Calling initMqttService...`);
    await initMqttService(connectorId);
    
    // Check connection status after init attempt
    let config: { homeId?: string } | undefined;
    try { config = JSON.parse(connector[0].cfg_enc); } catch { /* ignore */ }
    const homeId = config?.homeId;
    if (homeId && connections.has(homeId)) { return connections.get(homeId)!.isConnected; }
    
    console.warn(`[reconnectMqtt][${connectorId}] Connection state not found for homeId ${homeId} after init.`);
    return false;
  } catch (err) {
    console.error(`[reconnectMqtt][${connectorId}] Failed:`, err);
    return false;
  }
}

// Disable the MQTT connection for a specific CONNECTOR ID
export async function disableMqttConnection(connectorId: string): Promise<void> {
  // console.log(`[disableMqttConnection][${connectorId}] Attempting to disable...`);
  try {
    // 1. Update DB state first
    await saveDisabledState(connectorId, true);

    // 2. Find the corresponding connection state (if any) to disconnect
    const connector = await db.select({ cfg_enc: connectors.cfg_enc }).from(connectors).where(eq(connectors.id, connectorId)).limit(1);
    if (!connector.length) return; // Connector deleted, nothing to do

    let config: { homeId?: string } | undefined;
    try { config = JSON.parse(connector[0].cfg_enc); } catch { /* ignore */ }
    const homeId = config?.homeId;

    if (homeId && connections.has(homeId)) {
        // Ensure we only disconnect if this connection belongs to the connector being disabled
        if (connections.get(homeId)?.connectorId === connectorId) {
            // console.log(`[disableMqttConnection][${connectorId}] Found active connection for home ${homeId}. Disconnecting.`);
            await disconnectMqtt(homeId); // This also updates the connection state map (disabled, isConnected=false, etc.)
        } else {
            // console.log(`[disableMqttConnection][${connectorId}] Found connection for home ${homeId}, but it belongs to a different connector (${connections.get(homeId)?.connectorId}). Skipping disconnect.`);
        }
    } else {
        // console.log(`[disableMqttConnection][${connectorId}] No active MQTT connection found for homeId ${homeId}.`);
    }
  } catch (error) {
      console.error(`[disableMqttConnection][${connectorId}] Error:`, error);
  }
}

// Enable the MQTT connection for a specific CONNECTOR ID
export async function enableMqttConnection(connectorId: string): Promise<boolean> {
  // console.log(`[enableMqttConnection][${connectorId}] Attempting to enable...`);
  try {
      const connector = await db.select({ category: connectors.category, cfg_enc: connectors.cfg_enc }).from(connectors).where(eq(connectors.id, connectorId)).limit(1);
      if (!connector.length || connector[0].category !== 'yolink') throw new Error('Connector not found or not YoLink.');

      await saveDisabledState(connectorId, false);
      
      // console.log(`[enableMqttConnection][${connectorId}] Calling and awaiting initMqttService...`);
      // Await the result of initMqttService
      const success = await initMqttService(connectorId);
      // console.log(`[enableMqttConnection][${connectorId}] initMqttService completed. Result: ${success}`);
      return success; // Return the resolved status

  } catch (err) {
      // Log the caught error more specifically
      console.error(`[enableMqttConnection][${connectorId}] Caught error:`, err);
      return false;
  }
}

// Check if MQTT is disabled for a specific CONNECTOR ID (checks DB)
export async function isMqttDisabled(connectorId: string): Promise<boolean> {
   return await loadDisabledState(connectorId);
}

// Scan DB and automatically initialize/cleanup connections for all YoLink connectors.
export async function initializeYoLinkConnections(): Promise<void> {
  // console.log('[initializeYoLinkConnections] Starting scan for all YoLink connectors...');
  try {
    const allDbYolinkConnectors = await db.select().from(connectors).where(eq(connectors.category, 'yolink'));
    // console.log(`[initializeYoLinkConnections] Found ${allDbYolinkConnectors.length} total YoLink connectors in DB.`);
    const dbConnectorMap = new Map(allDbYolinkConnectors.map(c => [c.id, c]));
    const currentConnectionsMap = new Map(connections); // Clone current connections

    // 1. Initialize/Update connections based on DB state
    for (const connector of allDbYolinkConnectors) {
      if (connector.eventsEnabled) {
        // console.log(`[initializeYoLinkConnections] Initializing enabled connector: ${connector.id} (${connector.name})`);
        try { await initMqttService(connector.id); } catch (err) { /* init logs errors */ }
      } else {
        // If connector is disabled in DB, ensure any existing connection for it is stopped
        // console.log(`[initializeYoLinkConnections] Ensuring disabled connector is stopped: ${connector.id} (${connector.name})`);
        await disableMqttConnection(connector.id); // This handles finding by homeId and disconnecting
      }
    }

    // 2. Cleanup: Remove connections from map if their connector was deleted from DB
    for (const [homeId, connection] of currentConnectionsMap.entries()) {
        if (!dbConnectorMap.has(connection.connectorId)) {
            console.warn(`[initializeYoLinkConnections] Connector ${connection.connectorId} (Home: ${homeId}) not found in DB. Removing connection state and disconnecting.`);
            await disconnectMqtt(homeId);
            // connections.delete(homeId); // disconnectMqtt should clear the client, map entry can potentially linger but is harmless? Let's delete.
            connections.delete(homeId);
        }
    }

    // console.log('[initializeYoLinkConnections] Scan finished.');
  } catch (err) {
    console.error('[initializeYoLinkConnections] Error during scan:', err);
  }
}

// --- Initialization Coordinator ---

/**
 * Initializes connections for ALL supported connector types (YoLink MQTT, Piko WS).
 */
export async function initializeAllConnections(): Promise<void> {
    // console.log('[initializeAllConnections] Starting initialization for all connector types...');
    
    // Run initializations concurrently
    const initPromises = [
        initializeYoLinkConnections(),
        initializePikoConnections()
    ];
    
    try {
        await Promise.allSettled(initPromises);
        // console.log('[initializeAllConnections] Initialization scan finished for all types.');
    } catch (error) {
        // This catch might not be strictly necessary if using allSettled,
        // as individual errors are logged within the specific init functions.
        console.error('[initializeAllConnections] An unexpected error occurred during overall initialization:', error);
    }
}

// --- Event Repository Passthrough --- 

export async function getRecentEvents(limit = 100) { return eventsRepository.getRecentEvents(limit); }
export async function truncateEvents() {
  const result = await eventsRepository.truncateEvents();
  if (result) { for (const conn of connections.values()) { conn.lastEventData = null; } }
  return result;
} 