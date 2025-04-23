import 'server-only'; // Mark this module as server-only

// Remove module init log: console.log(`[${new Date().toISOString()}] --- MQTT Service Module Initializing ---`);

import * as mqtt from 'mqtt';
import { getAccessToken } from '@/services/drivers/yolink';
import { YoLinkConfig } from '@/services/drivers/yolink';
import { db } from '@/data/db';
import { nodes } from '@/data/db/schema';
import { eq, and } from 'drizzle-orm';
import * as eventsRepository from '@/data/repositories/events';
import { processEvent } from '@/services/automation-service'; // Import the automation processor

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

// Type to represent an MQTT connection
interface MqttConnection {
  client: mqtt.MqttClient | null;
  config: YoLinkConfig;
  homeId: string;
  lastEventData: { time: Date, count: number } | null;
  connectionError: string | null;
  reconnectAttempts: number;
  disabled: boolean;
  isConnected: boolean;
}

// Ensure connections map is a singleton using globalThis
declare global {
  // eslint-disable-next-line no-var
  var __mqttConnections: Map<string, MqttConnection> | undefined;
}

const connections: Map<string, MqttConnection> = globalThis.__mqttConnections || (globalThis.__mqttConnections = new Map());

// Remove map init log: console.log(`[${new Date().toISOString()}] --- MQTT Connections Map Initialized (size: ${connections.size}) ---`);

export interface MqttClientState {
  connected: boolean;
  lastEvent: { time: number, count: number } | null;
  homeId: string | null;
  error: string | null;
  reconnecting: boolean;
  disabled: boolean;
}

/**
 * Get the current state of a specific MQTT client
 */
export function getMqttClientState(homeId?: string): MqttClientState {
  // Remove debug logic and restore previous correct logic
  if (homeId && connections.has(homeId)) {
    const connection = connections.get(homeId);
    if (!connection) {
        console.error(`[getMqttClientState][${homeId}] Internal state error: connection object not found despite map.has being true.`);
        return { connected: false, lastEvent: null, homeId: homeId, error: 'Internal state error', reconnecting: false, disabled: true }; 
    }
    // Remove logging: console.log(`[getMqttClientState][${homeId}] Reporting Flags: ...`);
    const isConnected = connection.isConnected && !connection.disabled;
    const isReconnecting = !isConnected && connection.reconnectAttempts > 0 && !connection.disabled;
    return {
      connected: isConnected,
      lastEvent: connection.lastEventData ? {
        time: connection.lastEventData.time.getTime(),
        count: connection.lastEventData.count
      } : null,
      homeId: connection.homeId,
      error: !isConnected && !isReconnecting ? connection.connectionError : null, 
      reconnecting: isReconnecting,
      disabled: connection.disabled
    };
  }
  
  // Default state if no homeId or connection not found in map
  // Remove log: console.log(`[getMqttClientState][${homeId ?? 'undefined'}] No connection found in map...`);
  return { connected: false, lastEvent: null, homeId: null, error: 'No connection state found', reconnecting: false, disabled: true };
}

/**
 * Get all MQTT client states
 * @returns A map of homeId to MqttClientState
 */
export function getAllMqttClientStates(): Map<string, MqttClientState> {
  const states = new Map<string, MqttClientState>();
  for (const [homeId, connection] of connections.entries()) {
    states.set(homeId, {
      connected: !!connection.client && connection.client.connected && !connection.disabled,
      lastEvent: connection.lastEventData ? {
        time: connection.lastEventData.time.getTime(),
        count: connection.lastEventData.count
      } : null,
      homeId: connection.homeId,
      error: connection.connectionError,
      reconnecting: connection.reconnectAttempts > 0 && !connection.disabled,
      disabled: connection.disabled
    });
  }
  return states;
}

// Load the events enabled state from the YoLink node
async function loadDisabledState(homeId: string): Promise<boolean> {
  try {
    // Remove log: console.log(`[loadDisabledState][${homeId}] Querying DB for eventsEnabled status...`);
    const yolinkNode = await db.select({ eventsEnabled: nodes.eventsEnabled }).from(nodes)
      .where(and(eq(nodes.category, 'yolink'), eq(nodes.yolinkHomeId, homeId)))
      .limit(1);
      
    const isDisabled = yolinkNode.length > 0 ? !yolinkNode[0].eventsEnabled : true;
    // Remove log: console.log(`[loadDisabledState][${homeId}] DB Result: ${JSON.stringify(yolinkNode)}. Returning isDisabled: ${isDisabled}`);
    return isDisabled;
  } catch (err) {
    console.error(`[loadDisabledState][${homeId}] Failed to load events enabled state:`, err); // Keep error log
    // Remove log: console.log(`[loadDisabledState][${homeId}] Defaulting to isDisabled: true due to error.`);
    return true; // Default to disabled on error
  }
}

// Save the events enabled state to the YoLink node
async function saveDisabledState(homeId: string, isDisabled: boolean): Promise<void> {
  try {
    const yolinkNode = await db.select().from(nodes)
      .where(and(eq(nodes.category, 'yolink'), eq(nodes.yolinkHomeId, homeId)))
      .limit(1);
      
    if (yolinkNode.length > 0) {
      await db
        .update(nodes)
        .set({ eventsEnabled: !isDisabled })
        .where(eq(nodes.id, yolinkNode[0].id));
    }
  } catch (err) {
    console.error(`Failed to save events enabled state for ${homeId}:`, err);
  }
}

// Initialize the MQTT service for a specific home
export async function initMqttService(config: YoLinkConfig, homeId: string) {
  // Check if events are enabled for this home
  const isDisabled = await loadDisabledState(homeId);
    
  const connection: MqttConnection = connections.get(homeId) ?? {
      client: null,
    config: config,
      homeId,
      lastEventData: null,
      connectionError: null,
      reconnectAttempts: 0,
    disabled: true, // Assume disabled initially
    isConnected: false
  };
  connections.set(homeId, connection);
  // Remove log: console.log(`[initMqttService][${homeId}] Ensured entry exists...`);

  if (isDisabled) {
    // Remove log: console.log(`[initMqttService][${homeId}] MQTT events are disabled...`);
    connection.disabled = true;
    connection.isConnected = false;
    connection.connectionError = null;
    connection.reconnectAttempts = 0;
    connections.set(homeId, connection);
    return;
  }
  
  // Remove log: console.log(`[initMqttService][${homeId}] Events enabled per DB state...`);
  connection.disabled = false;
  connection.isConnected = false;
  connection.connectionError = null;
  connection.reconnectAttempts = 0;
  connection.config = config;
  connections.set(homeId, connection);
  
  // Disconnect existing client if any (keep this logic)
  if (connection.client) {
    try {
      connection.client.end(true);
    } catch (e) {
      console.error(`Error disconnecting existing client for ${homeId}:`, e);
    }
    connection.client = null;
  }
  
  try {
    // Keep normal logs like "Initializing...", "Attempting...", "Connected..."
    console.log(`Initializing MQTT service for YoLink home: ${homeId}`);
    
    // Get access token
    console.log(`[${homeId}][MQTT Init] Attempting to get access token...`);
    const token = await getAccessToken(config);
    console.log(`[${homeId}][MQTT Init] Access token obtained successfully.`);
    
    // Connect to the MQTT broker
    console.log(`[${homeId}][MQTT Init] Attempting to connect to MQTT broker...`);
    connection.client = mqtt.connect('mqtt://api.yosmart.com:8003', {
      clientId: `fusion-bridge-server-${homeId}-${Math.random().toString(16).substring(2, 10)}`,
      username: token,
      password: '',
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    });
    
    // Store the updated connection
    connections.set(homeId, connection);
    
    connection.client.on('connect', () => {
      console.log(`[${homeId}] Connected to YoLink MQTT broker`);
      
      // Reset error state and set our connected flag
      if (connections.has(homeId)) {
        const updatedConnection = connections.get(homeId)!;
        updatedConnection.connectionError = null;
        updatedConnection.reconnectAttempts = 0;
        updatedConnection.isConnected = true;
        updatedConnection.disabled = false;
        connections.set(homeId, updatedConnection);
      }
      
      // Check if client is null (TypeScript safety)
      if (!connection.client) {
        console.error(`[${homeId}] MQTT client is null in connect handler`);
        return;
      }
      
      // Subscribe to all events for this home
      const topic = `yl-home/${homeId}/+/report`;
      connection.client.subscribe(topic, (err) => {
        if (err) {
          console.error(`[${homeId}] Failed to subscribe to YoLink events:`, err);
          if (connections.has(homeId)) {
            const updatedConnection = connections.get(homeId)!;
            updatedConnection.connectionError = `Failed to subscribe: ${err.message}`;
            connections.set(homeId, updatedConnection);
          }
        } else {
          console.log(`[${homeId}] Subscribed to ${topic}`);
        }
      });
    });
    
    connection.client.on('message', async (topic, payload) => {
      try {
        const payloadString = payload.toString();
        const event = JSON.parse(payloadString) as YolinkEvent;
        console.log(`[${homeId}] Received YoLink event:`, event.event, 'for device:', event.deviceId);
        
        await storeEvent(event, payloadString);

        // Pass homeId to processEvent
        processEvent(event, homeId).catch(err => {
          console.error(`[Automation Service][${homeId}] Error processing event ${event.msgid}:`, err);
        });

        // Update last event data
        const count = await getEventCount();
        if (connections.has(homeId)) {
          const updatedConnection = connections.get(homeId)!;
          updatedConnection.lastEventData = { 
            time: new Date(event.time),
            count
          };
          connections.set(homeId, updatedConnection);
        }
      } catch (err) {
        console.error(`[${homeId}] Failed to process YoLink event message:`, err);
      }
    });
    
    connection.client.on('error', (err) => {
      // Remove log: console.error(`[MQTT Event][${homeId}] MQTT client error:`, err);
       console.error(`[${homeId}] MQTT client error:`, err); // Keep simplified error log
      if (connections.has(homeId)) {
        const updatedConnection = connections.get(homeId)!;
        updatedConnection.connectionError = `Connection error: ${err.message}`;
        // Don't assume disconnection here, let 'close' handle it or reconnect logic
        connections.set(homeId, updatedConnection);
        // Potentially trigger reconnect or wait for 'close'
         if (!updatedConnection.disabled) {
            // Remove log: console.log(`[MQTT Event][${homeId}] Scheduling reconnect due to error.`);
            scheduleReconnect(homeId); // Schedule reconnect on error if not disabled
         }
      }
    });
    
    connection.client.on('close', () => {
      // Remove log: console.log(`[MQTT Event][${homeId}] MQTT client connection closed.`);
      console.log(`[${homeId}] MQTT client connection closed.`); // Keep simplified log
      // Set our flag to false
      if (connections.has(homeId)) {
        const updatedConnection = connections.get(homeId)!;
        updatedConnection.isConnected = false;
        connections.set(homeId, updatedConnection);

        // Auto-reconnect if not explicitly disabled
        if (!updatedConnection.disabled) {
          scheduleReconnect(homeId);
        }
      }
    });
    
    connection.client.on('offline', () => {
      // Remove log: console.log(`[MQTT Event][${homeId}] MQTT client is offline.`);
      console.log(`[${homeId}] MQTT client is offline.`); // Keep simplified log
      if (connections.has(homeId)) {
        const updatedConnection = connections.get(homeId)!;
        updatedConnection.connectionError = 'Connection offline';
        updatedConnection.isConnected = false; // Set our flag to false
        connections.set(homeId, updatedConnection);
        // Consider if reconnect should be triggered here too, or rely on 'close'
         if (!updatedConnection.disabled) {
            // Remove log: console.log(`[MQTT Event][${homeId}] Scheduling reconnect due to offline event.`);
            scheduleReconnect(homeId); 
         }
      }
    });
    
    console.log(`[${homeId}] MQTT service initialized successfully`);
    
    // Get initial event count
    try {
      const count = await getEventCount();
      const recentEvents = await eventsRepository.getRecentEvents(1);
      
      if (recentEvents.length > 0 && connections.has(homeId)) {
        const updatedConnection = connections.get(homeId)!;
        updatedConnection.lastEventData = {
          time: new Date(recentEvents[0].time),
          count
        };
        connections.set(homeId, updatedConnection);
      }
    } catch (err) {
      console.error(`[${homeId}] Failed to get initial event data:`, err);
    }
  } catch (err) {
    console.error(`[${homeId}] Failed to initialize MQTT service:`, err);
    if (connections.has(homeId)) {
      const updatedConnection = connections.get(homeId)!;
      updatedConnection.connectionError = err instanceof Error ? err.message : 'Unknown connection error';
      connections.set(homeId, updatedConnection);
      
      // Schedule reconnection
      scheduleReconnect(homeId);
    }
    throw err;
  }
}

// Schedule a reconnection attempt for a specific home
function scheduleReconnect(homeId: string) {
  // Remove log: console.log(`[scheduleReconnect][${homeId}] Called.`);
  if (!connections.has(homeId)) {
      // Remove log: console.log(`[scheduleReconnect][${homeId}] Aborted: No connection found...`);
      return;
  }
  const connection = connections.get(homeId)!;
  if (connection.reconnectAttempts > 0) {
      // Remove log: console.log(`[scheduleReconnect][${homeId}] Aborted: Reconnect already in progress...`);
      return;
  }
   if (connection.disabled) {
      // Remove log: console.log(`[scheduleReconnect][${homeId}] Aborted: Connection is explicitly disabled.`);
      return;
  }
  
  // Remove log: console.log(`[scheduleReconnect][${homeId}] Checking DB state...`);
  loadDisabledState(homeId)
    .then(isDisabled => {
      // Remove log: console.log(`[scheduleReconnect][${homeId}] loadDisabledState returned: ${isDisabled}`);
      if (isDisabled) {
        // Remove log: console.log(`[scheduleReconnect][${homeId}] Aborted: MQTT events are disabled...`);
        if (connections.has(homeId)) {
          const updatedConnection = connections.get(homeId)!;
          updatedConnection.reconnectAttempts = 0;
          updatedConnection.connectionError = null;
          updatedConnection.disabled = true;
          updatedConnection.isConnected = false;
          connections.set(homeId, updatedConnection);
          // Remove log: console.log(`[scheduleReconnect][${homeId}] Updated connection state...`);
        }
        return;
      }
      
      // Don't schedule if already attempting to reconnect - check again after async loadDisabledState
      if (connection.reconnectAttempts > 0) {
          // Remove log: console.log(`[scheduleReconnect][${homeId}] Aborted post-DB check...`);
          return;
      }
      
      // Increment reconnect attempts *before* setting timeout
      connection.reconnectAttempts++;
      connections.set(homeId, connection); // Save increased attempt count
      
      // Exponential backoff (5s, 10s, 20s, 40s, max 60s)
      const delay = Math.min(5000 * Math.pow(2, connection.reconnectAttempts - 1), 60000);
      
      // Keep this informative log
      console.log(`[${homeId}] Scheduling reconnection attempt ${connection.reconnectAttempts} in ${delay}ms`);
      connection.connectionError = `Connection lost. Reconnecting (attempt ${connection.reconnectAttempts})...`;
      connections.set(homeId, connection); // Save error message
      
      setTimeout(() => {
        // Remove log: console.log(`[scheduleReconnect][${homeId}] Timeout fired...`);
        // Check if the connection still exists and is still disconnected/not disabled
        if (connections.has(homeId)) {
          const currentConnection = connections.get(homeId)!;
          
           if (currentConnection.disabled) {
              // Remove log: console.log(`[scheduleReconnect][${homeId}] Reconnect cancelled: disabled.`);
              currentConnection.reconnectAttempts = 0; // Reset attempts if disabled
              connections.set(homeId, currentConnection);
              return;
           }

          // If still disconnected after delay, attempt reconnect by calling initMqttService
          if (!currentConnection.isConnected) {
            // Remove log: console.log(`[scheduleReconnect][${homeId}] Attempting initMqttService...`);
            initMqttService(currentConnection.config, homeId).catch(err => {
              console.error(`[${homeId}] Reconnection attempt via initMqttService failed:`, err); // Keep error
              // IMPORTANT: Reset reconnectAttempts here so the next 'close' or 'error' event can trigger a new scheduleReconnect cycle
               if (connections.has(homeId)) {
                 const conn = connections.get(homeId)!;
                 conn.reconnectAttempts = 0; 
                 connections.set(homeId, conn);
               }
            });
          } else {
             // Remove log: console.log(`[scheduleReconnect][${homeId}] Reconnect attempt skipped: connected.`);
             // If connection succeeded elsewhere, reset attempts
             currentConnection.reconnectAttempts = 0;
             connections.set(homeId, currentConnection);
          }
        } else {
           // Remove log: console.log(`[scheduleReconnect][${homeId}] Reconnect cancelled: no longer in map.`);
        }
      }, delay);
    })
    .catch(err => {
      // Remove log: console.error(`[scheduleReconnect][${homeId}] CRITICAL: Failed to check DB state...`);
      console.error(`[${homeId}] CRITICAL: Failed to check DB state for reconnection:`, err); // Keep simplified error
       // Don't disable here, maybe try reconnect anyway or log critical error?
       // Reset attempts so future triggers might work
       if (connections.has(homeId)) {
          const conn = connections.get(homeId)!;
          conn.reconnectAttempts = 0; 
          connections.set(homeId, conn);
       }
    });
}

// Disconnect from the MQTT broker for a specific home
export async function disconnectMqtt(homeId: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!connections.has(homeId)) {
      resolve();
      return;
    }
    
    const connection = connections.get(homeId)!;
    if (!connection.client) {
      resolve();
      return;
    }
    
    // Clear reconnection state
    connection.reconnectAttempts = 0;
    connection.connectionError = null;
    connections.set(homeId, connection);
    
    connection.client.end(true, {}, () => {
      if (connections.has(homeId)) {
        const updatedConnection = connections.get(homeId)!;
        updatedConnection.client = null;
        connections.set(homeId, updatedConnection);
      }
      console.log(`[${homeId}] Disconnected from MQTT broker`);
      resolve();
    });
  });
}

// Disconnect all MQTT connections
export async function disconnectAllMqtt(): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const homeId of connections.keys()) {
    promises.push(disconnectMqtt(homeId));
  }
  await Promise.all(promises);
}

// Store an event in the database
async function storeEvent(event: YolinkEvent, rawPayload: string) {
  try {
    // Store event with original payload - no translation needed here
    await eventsRepository.storeEvent({
      deviceId: event.deviceId,
      eventType: event.event,
      timestamp: new Date(event.time),
      payload: rawPayload, // Store the original payload without modification
    });
  } catch (err) {
    console.error('Failed to store event:', err);
  }
}

// Get recent events
export async function getRecentEvents(limit = 100) {
  return eventsRepository.getRecentEvents(limit);
}

// Get the total number of events
async function getEventCount(): Promise<number> {
  return eventsRepository.getEventCount();
}

// Manually reconnect to MQTT for a specific home
export async function reconnectMqtt(homeId: string): Promise<boolean> {
  console.log(`[${homeId}][Reconnect Attempt] Starting...`);
  
  if (!connections.has(homeId)) {
    console.error(`[${homeId}][Reconnect Attempt] Failed: No connection record found.`);
    return false;
  }
  
  const connection = connections.get(homeId)!;
  
  // Skip if disabled
  if (connection.disabled) {
    console.log(`[${homeId}][Reconnect Attempt] Skipped: Connection is disabled.`);
    return false;
  }
  
  // Try to reconnect using the stored config
  try {
    console.log(`[${homeId}][Reconnect Attempt] Calling initMqttService...`);
    await initMqttService(connection.config, homeId);
    console.log(`[${homeId}][Reconnect Attempt] initMqttService call completed.`);
    return true;
  } catch (err) {
    console.error(`[${homeId}][Reconnect Attempt] Failed:`, err);
    return false;
  }
}

// Disable the MQTT connection for a specific home
export async function disableMqttConnection(homeId: string): Promise<void> {
  if (!connections.has(homeId)) {
    console.log(`[${homeId}] No connection to disable`);
    return;
  }
  
  const connection = connections.get(homeId)!;
  if (!connection.disabled) {
    connection.disabled = true;
    connections.set(homeId, connection);
    
    // Save disabled state to database
    await saveDisabledState(homeId, true);
    
    // Disconnect if connected
    if (connection.client && connection.client.connected) {
      await disconnectMqtt(homeId);
    }
    
    console.log(`[${homeId}] MQTT connection disabled`);
    
    // Reset error and reconnect state
    if (connections.has(homeId)) {
      const updatedConnection = connections.get(homeId)!;
      updatedConnection.connectionError = null;
      updatedConnection.reconnectAttempts = 0;
      connections.set(homeId, updatedConnection);
    }
  }
}

// Enable the MQTT connection for a specific home
export async function enableMqttConnection(homeId: string): Promise<boolean> {
  if (!connections.has(homeId)) {
    try {
      const yolinkNode = await db.select().from(nodes)
        .where(and(eq(nodes.category, 'yolink'), eq(nodes.yolinkHomeId, homeId)))
        .limit(1);
      if (yolinkNode.length > 0) {
        const node = yolinkNode[0];
        const config = JSON.parse(node.cfg_enc);
        if (config && config.uaid && config.clientSecret) {
          connections.set(homeId, {
            client: null,
            config: {
              uaid: config.uaid,
              clientSecret: config.clientSecret
            },
            homeId,
            lastEventData: null,
            connectionError: null,
            reconnectAttempts: 0,
            disabled: false, // Explicitly false
            isConnected: false 
          });
          await db
            .update(nodes)
            .set({ eventsEnabled: true })
            .where(eq(nodes.id, node.id));
          await initMqttService({
            uaid: config.uaid,
            clientSecret: config.clientSecret
          }, homeId);
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }
  
  const connection = connections.get(homeId)!;
  if (connection.disabled) {
    connection.disabled = false;
    connections.set(homeId, connection);
    await saveDisabledState(homeId, false);
    const reconnectSuccess = await reconnectMqtt(homeId);
    return reconnectSuccess;
  }
  
  if (connection.isConnected) {
    return true;
  }
  
  return reconnectMqtt(homeId);
}

// Check if MQTT is disabled for a specific home
export function isMqttDisabled(homeId: string): boolean {
  if (!connections.has(homeId)) return true;
  return connections.get(homeId)!.disabled;
}

// Truncate the events table
export async function truncateEvents() {
  const result = await eventsRepository.truncateEvents();
  
  if (result) {
    // Update last event data for all connections
    for (const [homeId, connection] of connections.entries()) {
      connection.lastEventData = null;
      connections.set(homeId, connection);
    }
  }
  
  return result;
}

// Scan DB and automatically connect to any YoLink nodes that have events enabled.
export async function initializeEnabledConnections(): Promise<void> {
  // Remove log: console.log('[initializeEnabledConnections] Starting scan...');
  try {
    const yolinkNodes = await db
      .select()
      .from(nodes)
      .where(eq(nodes.category, 'yolink'));

    // Remove log: console.log(`[initializeEnabledConnections] Found ${yolinkNodes.length} total YoLink nodes.`);

    for (const node of yolinkNodes) {
      if (node.eventsEnabled && node.yolinkHomeId) {
        // Remove log: console.log(`[initializeEnabledConnections] Node ${node.id} (${node.name}) has eventsEnabled=true. Initializing...`);
        try {
          const config = JSON.parse(node.cfg_enc);
          if (config && config.uaid && config.clientSecret) {
            // AWAIT the initialization attempt
            await initMqttService(
              {
                uaid: config.uaid,
                clientSecret: config.clientSecret,
              },
              node.yolinkHomeId,
            ).catch((err) => { // Catch errors from initMqttService itself
              console.error(`[initializeEnabledConnections] Error during initMqttService for ${node.yolinkHomeId}:`, err);
            });
            // Remove log: console.log(`[initializeEnabledConnections] Initialization attempt finished for ${node.yolinkHomeId}.`);
          } else {
             // Keep warning: console.warn(`[initializeEnabledConnections] Node ${node.id} (${node.name}) is enabled but missing valid config.`);
          }
        } catch (err) {
          console.error(`[initializeEnabledConnections] Failed to parse config for node ${node.id}:`, err);
        }
      } else if (node.yolinkHomeId) {
        // Node exists but eventsEnabled=false in DB. Ensure service state matches.
        // Remove log: console.log(`[initializeEnabledConnections] Node ${node.id} (${node.name}) has eventsEnabled=false.`);
        if (connections.has(node.yolinkHomeId)) {
           const connection = connections.get(node.yolinkHomeId)!;
           if (!connection.disabled || connection.isConnected) {
              // Remove log: console.log(`[initializeEnabledConnections] Correcting service state for ${node.yolinkHomeId}: Setting disabled=true, isConnected=false to match DB.`);
              connection.disabled = true;
              connection.isConnected = false;
              // Attempt to gracefully disconnect if client exists and thinks it's connected
              if (connection.client && connection.client.connected) {
                 // Remove log: console.log(`[initializeEnabledConnections] Disconnecting stray client for ${node.yolinkHomeId}.`);
                 try {
                   connection.client.end(true); // End gracefully
                 } catch (e) { 
                   console.error(`[initializeEnabledConnections] Error ending client for ${node.yolinkHomeId}:`, e); 
                 }
                 connection.client = null; // Clear client reference
              }
              connections.set(node.yolinkHomeId, connection);
           }
        } else {
            // Optionally: Create a default disabled entry if needed?
            // console.log(`[initializeEnabledConnections] No existing service state for disabled node ${node.yolinkHomeId}. Creating default disabled entry.`);
            // connections.set(node.yolinkHomeId, { client: null, config: {}, homeId: node.yolinkHomeId, lastEventData: null, connectionError: null, reconnectAttempts: 0, disabled: true, isConnected: false });
        }
      }
    }
    // Remove log: console.log('[initializeEnabledConnections] Scan finished.');
  } catch (err) {
    console.error('[initializeEnabledConnections] Error during scan:', err);
  }
} 