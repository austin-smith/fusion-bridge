import 'server-only'; // Mark this module as server-only

// Remove module init log: console.log(`[${new Date().toISOString()}] --- MQTT Service Module Initializing ---`);

import * as mqtt from 'mqtt';
import { getHomeInfo, getRefreshedYoLinkToken, YoLinkConfig as DriverYoLinkConfig } from '@/services/drivers/yolink';
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq, and } from 'drizzle-orm';
import * as eventsRepository from '@/data/repositories/events';
import { processEvent } from '@/services/automation-service'; // Import the automation processor
import { parseYoLinkEvent } from '@/lib/event-parsers/yolink'; // <-- Import the new parser
import { useFusionStore } from '@/stores/store'; // <-- Import Zustand store
import { Connector } from '@/types'; // Import Connector type
import { initializePikoConnections } from './piko-websocket-service'; // Import Piko initializer
import { updateConnectorConfig } from '@/data/repositories/connectors'; // <-- IMPORT ADDED

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
  config: DriverYoLinkConfig; // Use the imported YoLinkConfig from the driver
  homeId: string; // The YoLink Home ID (key for the map)
  connectorId: string; // The ID of the connector DB entry associated with this connection
  lastEventData: { time: Date, count: number } | null;
  connectionError: string | null;
  reconnectAttempts: number;
  disabled: boolean; // Mirroring the connector's eventsEnabled state
  isConnected: boolean;
  lastStandardizedPayload: Record<string, any> | null; // <<< Renamed from lastEventPayload
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
  lastStandardizedPayload: Record<string, any> | null; // <<< Renamed from lastEventPayload
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
      disabled: connection.disabled,
      lastStandardizedPayload: connection.lastStandardizedPayload // <<< Copy renamed payload field
    };
  }
  // Return default disconnected state if homeId not found
  return { connected: false, lastEvent: null, homeId: homeId ?? null, connectorId: null, error: 'No connection state found', reconnecting: false, disabled: true, lastStandardizedPayload: null };
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
      disabled: connection.disabled,
      lastStandardizedPayload: connection.lastStandardizedPayload // <<< Copy renamed payload field
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
  let config: (DriverYoLinkConfig & { homeId?: string }) | undefined;
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
          return Promise.resolve(false); // No error, just not applicable
      }

      let parsedDbConfig: DriverYoLinkConfig & { homeId?: string }; // Type for what we expect from DB JSON
      try {
          parsedDbConfig = JSON.parse(connector.cfg_enc);
          if (!parsedDbConfig?.uaid || !parsedDbConfig?.clientSecret) {
            throw new Error('Missing uaid or clientSecret in parsed DB config');
          }
      } catch (e) {
          console.error(`[initMqttService][${connectorId}] Failed to parse connector.cfg_enc:`, e);
          return Promise.reject(new Error(`Invalid config for ${connectorId}: ${e instanceof Error ? e.message : String(e)}`));
      }
      
      let homeIdFromConfig = parsedDbConfig.homeId;
      let configForTokenFetch: DriverYoLinkConfig = { ...parsedDbConfig }; // Start with DB config for token fetch

      if (!homeIdFromConfig) {
          console.warn(`[initMqttService][${connectorId}] homeId missing from DB config. Fetching via getHomeInfo...`);
          try {
              // First, ensure we have a valid token to call getHomeInfo
              const tokenDetailsForHomeIdFetch = await getRefreshedYoLinkToken(configForTokenFetch);
              configForTokenFetch = tokenDetailsForHomeIdFetch.updatedConfig; // Use the config with the token that will be used

              // Persist token updates if they occurred during this preliminary fetch
              if (tokenDetailsForHomeIdFetch.updatedConfig.accessToken !== parsedDbConfig.accessToken || 
                  tokenDetailsForHomeIdFetch.updatedConfig.refreshToken !== parsedDbConfig.refreshToken || 
                  tokenDetailsForHomeIdFetch.updatedConfig.tokenExpiresAt !== parsedDbConfig.tokenExpiresAt) {
                  console.warn(`[initMqttService][${connectorId}] Token updated during homeId fetch. DB UPDATE NEEDED for cfg_enc with:`, JSON.stringify(configForTokenFetch));
                  // await db.update(connectors).set({ cfg_enc: JSON.stringify(configForTokenFetch) }).where(eq(connectors.id, connectorId));
              }

              homeIdFromConfig = await getHomeInfo(connectorId, configForTokenFetch); // Use the config that has the valid token
              parsedDbConfig.homeId = homeIdFromConfig; // Add homeId to the object that might be saved back to DB
              console.warn(`[initMqttService][${connectorId}] Fetched homeId: ${homeIdFromConfig}. DB UPDATE NEEDED for cfg_enc (to include homeId):`, JSON.stringify(parsedDbConfig));
              // await db.update(connectors).set({ cfg_enc: JSON.stringify(parsedDbConfig) }).where(eq(connectors.id, connectorId));
          } catch (homeIdError) {
              console.error(`[initMqttService][${connectorId}] Could not obtain homeId:`, homeIdError);
              return Promise.reject(new Error(`Could not obtain homeId for ${connectorId}: ${homeIdError instanceof Error ? homeIdError.message : String(homeIdError)}`));
          }
      }
      
      const currentHomeId = homeIdFromConfig!;
      const isDisabled = !connector.eventsEnabled;

      const connection: MqttConnection = connections.get(currentHomeId) ?? {
          client: null,
          config: { ...parsedDbConfig }, // Initialize with the full config from DB (now including homeId)
          homeId: currentHomeId,
          connectorId: connectorId,
          lastEventData: null,
          lastStandardizedPayload: null,
          connectionError: null,
          reconnectAttempts: 0,
          disabled: true, 
          isConnected: false
      };
      connection.connectorId = connectorId;
      // Ensure connection.config has the latest from parsedDbConfig (which might have new homeId or token from homeId fetch step)
      // but retain runtime token info if it existed and this is a re-entrant call for an existing connection object.
      // The main getRefreshedYoLinkToken below will fully reconcile tokens.
      connection.config = { 
          ...parsedDbConfig, 
          accessToken: connection.config?.accessToken, // Prefer existing runtime token if available
          refreshToken: connection.config?.refreshToken,
          tokenExpiresAt: connection.config?.tokenExpiresAt
      }; 
      connections.set(currentHomeId, connection);

      if (isDisabled) {
          console.log(`[initMqttService][${connectorId}] MQTT events are disabled in DB for home ${currentHomeId}.`);
          connection.disabled = true; connection.isConnected = false; connection.connectionError = null; connection.reconnectAttempts = 0;
          if (connection.client) {
              try { connection.client.end(true); } catch (e) { console.error(`Error ending client for ${currentHomeId}:`, e);} finally { connection.client = null; }
          }
          connections.set(currentHomeId, connection);
          return Promise.resolve(false);
      }
      
      connection.disabled = false;
      connections.set(currentHomeId, connection);

      let tokenDetails: Awaited<ReturnType<typeof getRefreshedYoLinkToken>>;
      try {
        // Pass the connection.config, which should be the most up-to-date version including any runtime tokens
        tokenDetails = await getRefreshedYoLinkToken(connection.config); 
      } catch (tokenFetchError) {
        console.error(`[initMqttService][${connectorId}] Failed to obtain token for MQTT:`, tokenFetchError);
        connection.connectionError = `Token fetch error: ${tokenFetchError instanceof Error ? tokenFetchError.message : String(tokenFetchError)}`;
        connection.isConnected = false;
        connections.set(currentHomeId, connection);
        return Promise.reject(tokenFetchError);
      }

      const { newAccessToken, updatedConfig: newYoLinkConfigFromRefresh } = tokenDetails;
      // Store the original config before updating connection.config for comparison
      const originalConnectionConfig = { ...connection.config }; 
      connection.config = newYoLinkConfigFromRefresh; // Update in-memory state with the definitive new token config
      connections.set(currentHomeId, connection);

      // Construct the final config object that would be saved to the DB.
      // Ensure homeId from parsedDbConfig or fetched is included if not already in newYoLinkConfigFromRefresh
      const finalConfigForDb: DriverYoLinkConfig = {
         ...newYoLinkConfigFromRefresh,
         homeId: currentHomeId // Ensure currentHomeId is part of the saved config
      };

      const homeIdWasMissingOrChanged = !originalConnectionConfig.homeId || originalConnectionConfig.homeId !== currentHomeId;

      if (
        newYoLinkConfigFromRefresh.accessToken !== originalConnectionConfig.accessToken ||
        newYoLinkConfigFromRefresh.refreshToken !== originalConnectionConfig.refreshToken ||
        newYoLinkConfigFromRefresh.tokenExpiresAt !== originalConnectionConfig.tokenExpiresAt ||
        homeIdWasMissingOrChanged
      ) {
        console.warn(`[initMqttService][${connectorId}] YoLink config (tokens or homeId) changed. Attempting to save updated configuration to DB.`);
        try {
          await updateConnectorConfig(connectorId, finalConfigForDb);
          console.log(`[initMqttService][${connectorId}] Successfully saved updated config to DB via mqtt-service.`);
        } catch (dbError) {
          console.error(`[initMqttService][${connectorId}] CRITICAL: Failed to save updated config to DB via mqtt-service. Error:`, dbError);
          // Log error, but don't let it stop MQTT connection if token was obtained
        }
      }
      
      if (connection.client && connection.client.connected && connection.config.accessToken === newAccessToken) {
          connection.isConnected = true; connection.disabled = false; connection.connectionError = null; connection.reconnectAttempts = 0;
          connections.set(currentHomeId, connection);
          return Promise.resolve(true);
      }

      if (connection.client) {
          try { connection.client.end(true); } catch (e) { console.error(`Error ending stale client for ${currentHomeId}:`, e); } finally { connection.client = null; }
          connection.isConnected = false;
          connections.set(currentHomeId, connection);
      }

      console.log(`[initMqttService][${currentHomeId}] Attempting MQTT connection for ${connectorId}...`);
      connection.connectionError = null;
      connections.set(currentHomeId, connection);
          
      return new Promise<boolean>(async (resolve, reject) => {
          let connectTimeoutId: NodeJS.Timeout | null = null;
          const cleanup = () => {
              if (connectTimeoutId) clearTimeout(connectTimeoutId);
              connectTimeoutId = null;
              if (connection.client) {
                  connection.client.removeAllListeners('connect');
                  connection.client.removeAllListeners('error');
                  connection.client.removeAllListeners('close');
              }
          };

          try { // This try block was missing in the previous partial application
              console.log(`[${currentHomeId}][${connectorId}] Using access token for MQTT username.`);
              
              connectTimeoutId = setTimeout(() => {
                  cleanup();
                  console.error(`[${currentHomeId}][${connectorId}] MQTT connection timed out.`);
                  if(connections.has(currentHomeId)) {
                      const conn = connections.get(currentHomeId)!;
                      conn.connectionError = 'Connection Timeout'; conn.isConnected = false;
                      if (conn.client) { try { conn.client.end(true); } catch(e){} finally { conn.client = null; } }
                      connections.set(currentHomeId, conn);
                  }
                  reject(new Error('Connection Timeout'));
              }, 15000);

              connection.client = mqtt.connect('mqtt://api.yosmart.com:8003', {
                  clientId: `fusion-bridge-server-${currentHomeId}-${Math.random().toString(16).substring(2, 10)}`,
                  username: newAccessToken, 
                  password: '', 
                  reconnectPeriod: 0, 
                  connectTimeout: 10000,
              });
              connections.set(currentHomeId, connection);
              
              connection.client.once('connect', () => { 
                  cleanup(); 
                  console.log(`[${currentHomeId}] Connected to YoLink MQTT broker`);
                  if (connections.has(currentHomeId)) {
                      const conn = connections.get(currentHomeId)!;
                      conn.connectionError = null; conn.reconnectAttempts = 0; conn.isConnected = true; conn.disabled = false;
                      connections.set(currentHomeId, conn);
                      if (!conn.client) return;
                      const topic = `yl-home/${currentHomeId}/+/report`;
                      conn.client.subscribe(topic, (err) => {
                          if (err) {
                              console.error(`[${currentHomeId}] Failed to subscribe:`, err);
                              conn.connectionError = `Failed to subscribe: ${err.message}`;
                              connections.set(currentHomeId, conn);
                          } 
                      });
                  }
                  resolve(true); 
              });

              connection.client.once('error', (err) => { 
                  cleanup(); 
                  console.error(`[${currentHomeId}] MQTT client error during initial connect:`, err);
                  if (connections.has(currentHomeId)) {
                      const conn = connections.get(currentHomeId)!; conn.connectionError = `Connection error: ${err.message}`; conn.isConnected = false;
                      if (conn.client) { try { conn.client.end(true); } catch(e){} finally { conn.client = null; } }
                      connections.set(currentHomeId, conn);
                  }
                  reject(err); 
              });

              connection.client.once('close', () => { 
                  cleanup(); 
                  if (connections.has(currentHomeId)) {
                      const conn = connections.get(currentHomeId)!; conn.isConnected = false; conn.client = null;
                      conn.connectionError = conn.connectionError || 'Connection closed unexpectedly during init';
                      connections.set(currentHomeId, conn);
                  }
                  reject(new Error(connection.connectionError || 'Connection closed unexpectedly during init')); 
              });

              // Persistent handlers should be outside 'once' if they need to live beyond initial connection attempt
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
                      const standardizedEvents = await parseYoLinkEvent(associatedConnectorId, rawEvent);
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
                          if (rawEventTime) { 
                            conn.lastEventData = { time: new Date(rawEventTime), count }; 
                            conn.lastStandardizedPayload = standardizedEvents[0]?.payload ?? null; // <<< Store first standardized payload
                            connections.set(currentHomeId, conn); 
                          }
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
              cleanup(); 
              console.error(`[${currentHomeId}][${connectorId}] Failed to initiate MQTT connection setup:`, connectErr);
              if (connections.has(currentHomeId)) {
                  const conn = connections.get(currentHomeId)!;
                  conn.connectionError = connectErr instanceof Error ? connectErr.message : 'MQTT connection failed';
                  conn.isConnected = false;
                  if (conn.client) { try { conn.client.end(true); } catch(e){} finally { conn.client = null; } }
                  connections.set(currentHomeId, conn);
              }
              reject(connectErr); 
          }
      }); 

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
        const connection = connections.get(homeId); // <<< Get the connection object
        if (connection?.connectorId === connectorId) {
            // console.log(`[disableMqttConnection][${connectorId}] Found active connection for home ${homeId}. Disconnecting.`);
            // Update the state map immediately
            connection.disabled = true;
            connection.isConnected = false; // Also mark as not connected
            connections.set(homeId, connection); // Save the updated state
            await disconnectMqtt(homeId); // This also updates the connection state map (disabled, isConnected=false, etc.) // <<< COMMENT IS INCORRECT
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
  if (result) { 
    for (const conn of connections.values()) { 
      conn.lastEventData = null; 
      conn.lastStandardizedPayload = null; // <<< Clear renamed payload field
    } 
  } 
  return result;
} 