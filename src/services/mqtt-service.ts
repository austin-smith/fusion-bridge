import 'server-only'; // Mark this module as server-only

import * as mqtt from 'mqtt';
import { EventEmitter } from 'events';
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

// Shared emitter for service events
export const mqttServiceEmitter = new EventEmitter();

// Status listeners for real-time updates
type StatusListener = (status: MqttClientState, homeId: string) => void;
const statusListeners: StatusListener[] = [];

// Type to represent an MQTT connection
interface MqttConnection {
  client: mqtt.MqttClient | null;
  config: YoLinkConfig;
  homeId: string;
  lastEventData: { time: Date, count: number } | null;
  connectionError: string | null;
  reconnectAttempts: number;
  disabled: boolean;
}

// Map of homeId to MQTT connection
const connections: Map<string, MqttConnection> = new Map();

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
  // If homeId is provided, get state for that specific connection
  if (homeId && connections.has(homeId)) {
    const connection = connections.get(homeId)!;
    return {
      connected: !!connection.client && connection.client.connected && !connection.disabled,
      lastEvent: connection.lastEventData ? {
        time: connection.lastEventData.time.getTime(),
        count: connection.lastEventData.count
      } : null,
      homeId: connection.homeId,
      error: connection.connectionError,
      reconnecting: connection.reconnectAttempts > 0 && !connection.disabled,
      disabled: connection.disabled
    };
  }
  
  // If no homeId provided or not found, return a combined state or default state
  // First check if we have any active connections
  for (const [id, connection] of connections.entries()) {
    if (connection.client && connection.client.connected && !connection.disabled) {
      return {
        connected: true,
        lastEvent: connection.lastEventData ? {
          time: connection.lastEventData.time.getTime(),
          count: connection.lastEventData.count
        } : null,
        homeId: id,
        error: null,
        reconnecting: false,
        disabled: false
      };
    }
  }
  
  // No active connections found, return a default state
  return {
    connected: false,
    lastEvent: null,
    homeId: null,
    error: null,
    reconnecting: false,
    disabled: false
  };
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

/**
 * Subscribe to MQTT client state updates
 * @param listener Function to call when the state changes
 * @returns Function to unsubscribe
 */
export function subscribeToMqttState(listener: StatusListener): () => void {
  statusListeners.push(listener);
  
  // Send initial states for all connections
  for (const [homeId] of connections.entries()) {
    listener(getMqttClientState(homeId), homeId);
  }
  
  // Return unsubscribe function
  return () => {
    const index = statusListeners.indexOf(listener);
    if (index !== -1) {
      statusListeners.splice(index, 1);
    }
  };
}

// Notify all listeners of state change for a specific connection
function notifyStateChange(homeId: string) {
  const state = getMqttClientState(homeId);
  statusListeners.forEach(listener => listener(state, homeId));
}

// Load the events enabled state from the YoLink node
async function loadDisabledState(homeId: string): Promise<boolean> {
  try {
    const yolinkNode = await db.select().from(nodes)
      .where(and(eq(nodes.category, 'yolink'), eq(nodes.yolinkHomeId, homeId)))
      .limit(1);
      
    return yolinkNode.length > 0 ? !yolinkNode[0].eventsEnabled : true;
  } catch (err) {
    console.error(`Failed to load events enabled state for ${homeId}:`, err);
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
  // Check if the connection already exists and is connected
  if (connections.has(homeId)) {
    const connection = connections.get(homeId)!;
    if (connection.client && connection.client.connected && !connection.disabled) {
      console.log(`MQTT service already initialized and connected for home ${homeId}`);
      return;
    }
  }
  
  // Check if events are enabled for this home
  const isDisabled = await loadDisabledState(homeId);
  if (isDisabled) {
    console.log(`MQTT events are disabled for ${homeId}, skipping connection`);
    
    // Create or update the connection with disabled state
    connections.set(homeId, {
      client: null,
      config,
      homeId,
      lastEventData: null,
      connectionError: null,
      reconnectAttempts: 0,
      disabled: true
    });
    
    // Notify listeners of the disabled state
    notifyStateChange(homeId);
    return;
  }
  
  // Create a new connection or update the existing one
  const connection: MqttConnection = connections.has(homeId) 
    ? { ...connections.get(homeId)!, config } 
    : {
        client: null,
        config,
        homeId,
        lastEventData: null,
        connectionError: null,
        reconnectAttempts: 0,
        disabled: false
      };
  
  // Disconnect existing client if any
  if (connection.client) {
    try {
      connection.client.end(true);
    } catch (e) {
      console.error(`Error disconnecting existing client for ${homeId}:`, e);
    }
    connection.client = null;
  }
  
  // Reset state
  connection.connectionError = null;
  connection.reconnectAttempts = 0;
  connection.disabled = false;
  
  try {
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
      
      // Reset error state
      if (connections.has(homeId)) {
        const updatedConnection = connections.get(homeId)!;
        updatedConnection.connectionError = null;
        updatedConnection.reconnectAttempts = 0;
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
            notifyStateChange(homeId);
          }
        } else {
          console.log(`[${homeId}] Subscribed to ${topic}`);
        }
      });
      
      // Notify state change
      notifyStateChange(homeId);
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
        
        mqttServiceEmitter.emit('newMessage', event);

        // Update last event data
        const count = await getEventCount();
        if (connections.has(homeId)) {
          const updatedConnection = connections.get(homeId)!;
          updatedConnection.lastEventData = { 
            time: new Date(event.time),
            count
          };
          connections.set(homeId, updatedConnection);
          
          // Notify state change
          notifyStateChange(homeId);
        }
      } catch (err) {
        console.error(`[${homeId}] Failed to process YoLink event message:`, err);
      }
    });
    
    connection.client.on('error', (err) => {
      console.error(`[${homeId}] MQTT error:`, err);
      if (connections.has(homeId)) {
        const updatedConnection = connections.get(homeId)!;
        updatedConnection.connectionError = `Connection error: ${err.message}`;
        connections.set(homeId, updatedConnection);
        notifyStateChange(homeId);
      }
    });
    
    connection.client.on('close', () => {
      console.log(`[${homeId}] MQTT connection closed`);
      notifyStateChange(homeId);
      
      // Auto-reconnect if not explicitly disabled
      if (connections.has(homeId)) {
        const updatedConnection = connections.get(homeId)!;
        if (!updatedConnection.disabled) {
          scheduleReconnect(homeId);
        }
      }
    });
    
    connection.client.on('offline', () => {
      console.log(`[${homeId}] MQTT client is offline`);
      if (connections.has(homeId)) {
        const updatedConnection = connections.get(homeId)!;
        updatedConnection.connectionError = 'Connection offline';
        connections.set(homeId, updatedConnection);
        notifyStateChange(homeId);
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
    
    // Notify initial state
    notifyStateChange(homeId);
  } catch (err) {
    console.error(`[${homeId}] Failed to initialize MQTT service:`, err);
    if (connections.has(homeId)) {
      const updatedConnection = connections.get(homeId)!;
      updatedConnection.connectionError = err instanceof Error ? err.message : 'Unknown connection error';
      connections.set(homeId, updatedConnection);
      notifyStateChange(homeId);
      
      // Schedule reconnection
      scheduleReconnect(homeId);
    }
    throw err;
  }
}

// Schedule a reconnection attempt for a specific home
function scheduleReconnect(homeId: string) {
  if (!connections.has(homeId)) return;
  
  const connection = connections.get(homeId)!;
  
  // Check if events are enabled before attempting reconnection
  loadDisabledState(homeId)
    .then(isDisabled => {
      if (isDisabled) {
        console.log(`[${homeId}] MQTT events are disabled, skipping reconnection`);
        // Update the connection state
        if (connections.has(homeId)) {
          const updatedConnection = connections.get(homeId)!;
          updatedConnection.reconnectAttempts = 0;
          updatedConnection.connectionError = null;
          updatedConnection.disabled = true;
          connections.set(homeId, updatedConnection);
          notifyStateChange(homeId);
        }
        return;
      }
      
      // Don't schedule if already attempting to reconnect
      if (connection.reconnectAttempts > 0) return;
      
      // Increment reconnect attempts
      connection.reconnectAttempts++;
      connections.set(homeId, connection);
      
      // Exponential backoff (5s, 10s, 20s, 40s, max 60s)
      const delay = Math.min(5000 * Math.pow(2, connection.reconnectAttempts - 1), 60000);
      
      console.log(`[${homeId}] Scheduling reconnection attempt ${connection.reconnectAttempts} in ${delay}ms`);
      connection.connectionError = `Connection lost. Reconnecting (attempt ${connection.reconnectAttempts})...`;
      connections.set(homeId, connection);
      notifyStateChange(homeId);
      
      setTimeout(() => {
        // Check if the connection still exists and is still disconnected
        if (connections.has(homeId)) {
          const currentConnection = connections.get(homeId)!;
          const isConnected = currentConnection.client && currentConnection.client.connected;
          
          if (!isConnected && !currentConnection.disabled) {
            console.log(`[${homeId}] Attempting to reconnect to MQTT (attempt ${currentConnection.reconnectAttempts})`);
            initMqttService(currentConnection.config, homeId).catch(err => {
              console.error(`[${homeId}] Reconnection attempt failed:`, err);
              // Another reconnection will be scheduled by the error handler in initMqttService
            });
          }
        }
      }, delay);
    })
    .catch(err => {
      console.error(`[${homeId}] Failed to check events enabled state for reconnection:`, err);
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
        notifyStateChange(homeId);
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
    // Store every event we receive
    await eventsRepository.storeEvent({
      deviceId: event.deviceId,
      eventType: event.event,
      timestamp: new Date(event.time),
      payload: rawPayload, // Store the complete payload
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
      notifyStateChange(homeId);
    }
  }
}

// Enable the MQTT connection for a specific home
export async function enableMqttConnection(homeId: string): Promise<boolean> {
  if (!connections.has(homeId)) {
    console.log(`[${homeId}][Enable Attempt] No connection record found.`);
    
    // Try to find the node configuration and initialize
    try {
      const yolinkNode = await db.select().from(nodes)
        .where(and(eq(nodes.category, 'yolink'), eq(nodes.yolinkHomeId, homeId)))
        .limit(1);
      
      if (yolinkNode.length > 0) {
        const node = yolinkNode[0];
        const config = JSON.parse(node.cfg_enc);
        
        if (config && config.uaid && config.clientSecret) {
          // Create the connection record
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
            disabled: false
          });
          
          // Update database state
          await db
            .update(nodes)
            .set({ eventsEnabled: true })
            .where(eq(nodes.id, node.id));
          
          // Initialize the service
          await initMqttService({
            uaid: config.uaid,
            clientSecret: config.clientSecret
          }, homeId);
          
          return true;
        }
      }
      
      console.error(`[${homeId}][Enable Attempt] No YoLink connector found with this homeId.`);
      return false;
    } catch (err) {
      console.error(`[${homeId}][Enable Attempt] Error finding node:`, err);
      return false;
    }
  }
  
  const connection = connections.get(homeId)!;
  console.log(`[${homeId}][Enable Attempt] Starting. Current state: disabled=${connection.disabled}`);
  
  if (connection.disabled) {
    // Update the connection state
    connection.disabled = false;
    connections.set(homeId, connection);
    
    // Save to database
    console.log(`[${homeId}][Enable Attempt] Setting disabled=false. Saving state...`);
    await saveDisabledState(homeId, false);
    console.log(`[${homeId}][Enable Attempt] State saved. Notifying change...`);
    notifyStateChange(homeId);
    
    // Try to reconnect
    console.log(`[${homeId}][Enable Attempt] Calling reconnectMqtt()...`);
    const reconnectSuccess = await reconnectMqtt(homeId);
    console.log(`[${homeId}][Enable Attempt] reconnectMqtt() returned:`, reconnectSuccess);
    return reconnectSuccess;
  }
  
  // If it wasn't disabled, it means we are already in an enabled state
  console.log(`[${homeId}][Enable Attempt] Already enabled. Checking connection...`);
  
  if (connection.client && connection.client.connected) {
    console.log(`[${homeId}][Enable Attempt] Client already connected.`);
    return true;
  }
  
  // If not connected, try to reconnect
  console.log(`[${homeId}][Enable Attempt] Client not connected. Attempting to reconnect...`);
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
      notifyStateChange(homeId);
    }
  }
  
  return result;
}

// Scan DB and automatically connect to any YoLink nodes that have events enabled.
export async function initializeEnabledConnections(): Promise<void> {
  try {
    const yolinkNodes = await db
      .select()
      .from(nodes)
      .where(eq(nodes.category, 'yolink'));

    for (const node of yolinkNodes) {
      if (node.eventsEnabled && node.yolinkHomeId) {
        try {
          const config = JSON.parse(node.cfg_enc);
          if (config && config.uaid && config.clientSecret) {
            // Initialise each connection but do not await – run in parallel
            initMqttService(
              {
                uaid: config.uaid,
                clientSecret: config.clientSecret,
              },
              node.yolinkHomeId,
            ).catch((err) => {
              console.error(`Failed to initialize MQTT for ${node.yolinkHomeId}:`, err);
            });
          }
        } catch (err) {
          console.error(`Failed to parse config for node ${node.id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('Failed to initialize MQTT connections:', err);
  }
} 