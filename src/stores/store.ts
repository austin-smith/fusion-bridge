import { create } from 'zustand';
import { NodeWithConfig, PikoServer } from '@/types';
import type { StandardizedEvent, StateChangedPayload } from '@/types/events';
import type { DisplayState, TypedDeviceInfo } from '@/lib/mappings/definitions';
import type { DeviceWithConnector } from '@/types';

// Type for MQTT status representation in the store
type MqttStatus = 'connected' | 'disconnected' | 'unknown' | 'reconnecting' | 'error';

// MQTT state for a specific connector
interface ConnectorMqttState {
  status: MqttStatus;
  error: string | null;
  lastEventTime: number | null; 
  eventCount: number | null;
}

interface DeviceStateInfo {
  connectorId: string;
  deviceId: string; // Connector-specific ID
  deviceInfo: TypedDeviceInfo;
  displayState?: DisplayState;
  lastStateEvent?: StandardizedEvent<'STATE_CHANGED'>;
  lastStatusEvent?: StandardizedEvent<'ONLINE' | 'OFFLINE' | 'UNAUTHORIZED'>;
  lastSeen: Date;
  name?: string;
  model?: string;
  vendor?: string;
  url?: string;
  rawType?: string; // The original type string from the source
  // --- BEGIN Piko Server Fields --- 
  serverId?: string;   // ID of the Piko server this device belongs to
  serverName?: string; // Name of the Piko server this device belongs to
  pikoServerDetails?: PikoServer; // <-- Add full server details object
  // --- END Piko Server Fields --- 
}

interface FusionState {
  nodes: NodeWithConfig[];
  isLoading: boolean;
  error: string | null;
  addConnectorOpen: boolean;
  yolinkHomeId: string | null;
  editConnectorOpen: boolean;
  editingNode: NodeWithConfig | null;
  
  // MQTT Status States by connector ID
  mqttStates: Record<string, ConnectorMqttState>;
  
  // Device state map: key = `${connectorId}:${deviceId}`
  deviceStates: Record<string, DeviceStateInfo>;
  
  // Actions
  setNodes: (nodes: NodeWithConfig[]) => void;
  addNode: (node: NodeWithConfig) => void;
  updateNode: (node: NodeWithConfig) => void;
  deleteNode: (id: string) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setAddConnectorOpen: (open: boolean) => void;
  setYolinkHomeId: (id: string | null) => void;
  setEditConnectorOpen: (open: boolean) => void;
  setEditingNode: (node: NodeWithConfig | null) => void;

  // MQTT Status Actions
  setMqttState: (connectorId: string, state: { 
    status: MqttStatus; 
    error?: string | null; 
    lastEventTime?: number | null; 
    eventCount?: number | null; 
  }) => void;
  
  // Get MQTT state for a specific connector
  getMqttState: (connectorId: string) => ConnectorMqttState;

  processStandardizedEvent: (evt: StandardizedEvent<any>) => void;

  // Action to bulk update device states after a sync operation
  setDeviceStatesFromSync: (syncedDevices: DeviceWithConnector[]) => void;
  fetchNodes: () => Promise<void>;
}

export const useFusionStore = create<FusionState>((set, get) => ({
  nodes: [],
  isLoading: false,
  error: null,
  addConnectorOpen: false,
  yolinkHomeId: null,
  editConnectorOpen: false,
  editingNode: null,
  
  // Initial MQTT Status State
  mqttStates: {},
  
  // Initial Device State map
  deviceStates: {},
  
  // Actions
  setNodes: (nodes) => set({ nodes }),
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  updateNode: (updatedNode) => set((state) => ({
    nodes: state.nodes.map((node) => 
      node.id === updatedNode.id ? updatedNode : node
    )
  })),
  deleteNode: (id) => set((state) => ({
    nodes: state.nodes.filter((node) => node.id !== id),
    // Also clean up the MQTT state for this node
    mqttStates: Object.fromEntries(
      Object.entries(state.mqttStates).filter(([nodeId]) => nodeId !== id)
    )
  })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setAddConnectorOpen: (open) => set({ addConnectorOpen: open }),
  setYolinkHomeId: (id) => set({ yolinkHomeId: id }),
  setEditConnectorOpen: (open) => set({ editConnectorOpen: open }),
  setEditingNode: (node) => set({ editingNode: node }),

  // MQTT Status Actions
  setMqttState: (connectorId, state) => set((existingState) => {
    const currentState = existingState.mqttStates[connectorId] || {
      status: 'unknown',
      error: null,
      lastEventTime: null,
      eventCount: null
    };
    
    return {
      mqttStates: {
        ...existingState.mqttStates,
        [connectorId]: {
          status: state.status,
          error: state.error !== undefined ? state.error : currentState.error,
          lastEventTime: state.lastEventTime !== undefined ? state.lastEventTime : currentState.lastEventTime,
          eventCount: state.eventCount !== undefined ? state.eventCount : currentState.eventCount,
        }
      }
    };
  }),
  
  // Get MQTT state for a specific connector with fallback to default state
  getMqttState: (connectorId) => {
    const state = get().mqttStates[connectorId];
    if (!state) {
      return {
        status: 'unknown',
        error: null,
        lastEventTime: null,
        eventCount: null
      };
    }
    return state;
  },

  processStandardizedEvent: (evt) => set((state) => {
    const key = `${evt.connectorId}:${evt.deviceId}`;
    const existing = state.deviceStates[key] || {}; // Default to empty object if new

    // Base update preserves existing static fields (like name, model) 
    // and updates dynamic fields from the event.
    const updated: DeviceStateInfo = {
      ...existing, // Spread existing first to keep name, model etc.
      connectorId: evt.connectorId,
      deviceId: evt.deviceId,
      deviceInfo: evt.deviceInfo, // This contains standardized type/subtype
      lastSeen: evt.timestamp,
      // Update rawType if it comes with the event payload (optional)
      rawType: (evt.payload as any)?.deviceType ?? (evt.payload as any)?.originalEventType ?? existing.rawType,
    };

    // Handle state/status updates
    if (evt.eventType === 'STATE_CHANGED') {
      const payload = evt.payload as StateChangedPayload;
      updated.displayState = payload.displayState;
      updated.lastStateEvent = evt as StandardizedEvent<'STATE_CHANGED'>;
    } else if (evt.eventType === 'ONLINE' || evt.eventType === 'OFFLINE' || evt.eventType === 'UNAUTHORIZED') {
      updated.lastStatusEvent = evt as StandardizedEvent<'ONLINE' | 'OFFLINE' | 'UNAUTHORIZED'>;
    }
    // Add logic here if other event types should update specific fields?

    return {
      deviceStates: {
        ...state.deviceStates,
        [key]: updated,
      },
    };
  }),

  // Action to bulk update device states after a sync operation
  setDeviceStatesFromSync: (syncedDevices) => set((state) => {
    const newDeviceStates = { ...state.deviceStates }; // Start with current states

    for (const syncedDevice of syncedDevices) {
      const key = `${syncedDevice.connectorId}:${syncedDevice.deviceId}`;
      const existing = state.deviceStates[key] || {}; // Get existing or empty object

      // Map DeviceWithConnector to DeviceStateInfo
      const updated: DeviceStateInfo = {
        // Preserve existing dynamic state unless sync provides newer info
        ...existing,
        // Overwrite with details from sync
        connectorId: syncedDevice.connectorId,
        deviceId: syncedDevice.deviceId,
        name: syncedDevice.name,
        model: syncedDevice.model,
        vendor: syncedDevice.vendor,
        url: syncedDevice.url,
        rawType: syncedDevice.type, // Use the raw type from sync
        deviceInfo: syncedDevice.deviceTypeInfo,
        // --- BEGIN Map Piko Server Fields --- 
        serverId: syncedDevice.serverId, // Map serverId
        serverName: syncedDevice.serverName, // Map serverName
        pikoServerDetails: syncedDevice.pikoServerDetails, // <-- Map the full object
        // --- END Map Piko Server Fields ---
        // Avoid overwriting lastSeen/displayState/lastEvents from sync?
        // Sync provides existence & basic info, events provide live state.
        // Let's keep existing lastSeen/displayState/events unless explicitly handled.
        lastSeen: existing.lastSeen ?? new Date(0), // Keep existing or default
        displayState: existing.displayState, // Keep existing
        lastStateEvent: existing.lastStateEvent, // Keep existing
        lastStatusEvent: existing.lastStatusEvent, // Keep existing
      };
      newDeviceStates[key] = updated;
    }
    
    // TODO: Optionally remove devices from store that are NOT in syncedDevices list?

    return {
      deviceStates: newDeviceStates,
    };
  }),

  // --- BEGIN Fetch Nodes Action ---
  fetchNodes: async () => {
    try {
      // Optional: Set loading state if you have one specific to nodes
      // set({ isLoading: true }); 
      console.log('[FusionStore] Fetching nodes...');
      const response = await fetch('/api/nodes');
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch nodes');
      }

      if (data.data && Array.isArray(data.data)) {
        set({ nodes: data.data as NodeWithConfig[] });
        console.log('[FusionStore] Nodes loaded into store:', data.data);
      } else {
        console.warn('[FusionStore] Node fetch returned no data.');
        set({ nodes: [] }); // Set to empty array if no nodes found
      }
    } catch (error) {
      console.error('[FusionStore] Error fetching nodes:', error);
      set({ error: error instanceof Error ? error.message : 'Unknown error fetching nodes' });
      set({ nodes: [] }); // Clear nodes on error
    } finally {
      // Optional: Clear loading state
      // set({ isLoading: false });
    }
  },
  // --- END Fetch Nodes Action ---
})); 