import { create } from 'zustand';
import { produce, Draft, enableMapSet } from 'immer';
import { PikoServer } from '@/types';
import type { StandardizedEvent, StateChangedPayload } from '@/types/events';
import { DisplayState, TypedDeviceInfo, EventType, EventCategory } from '@/lib/mappings/definitions';
import type { DeviceWithConnector, ConnectorWithConfig } from '@/types';
import { YoLinkConfig } from '@/services/drivers/yolink';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';

// Enable Immer plugin for Map/Set support
enableMapSet();

// Type for connection status representation in the store (shared)
type ConnectionStatus = 'connected' | 'disconnected' | 'unknown' | 'reconnecting' | 'error';

// MQTT state for a specific connector
interface ConnectorMqttState {
  status: ConnectionStatus; // Use shared type
  error: string | null;
  lastEventTime: number | null; 
  eventCount: number | null;
  lastStandardizedPayload: Record<string, any> | null;
}

// Piko WebSocket state for a specific connector
interface ConnectorPikoState {
  status: ConnectionStatus; // Use shared type
  error: string | null;
  lastEventTime: number | null;
  eventCount: number | null;
  lastStandardizedPayload: Record<string, any> | null;
}

interface DeviceStateInfo {
  connectorId: string;
  deviceId: string; // Connector-specific ID
  deviceInfo: TypedDeviceInfo;
  displayState?: DisplayState;
  lastStateEvent?: StandardizedEvent<EventType.STATE_CHANGED>;
  lastStatusEvent?: StandardizedEvent<EventType.DEVICE_ONLINE | EventType.DEVICE_OFFLINE>;
  lastSeen?: Date;
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

// Default structure for a new/unknown device state
const defaultDeviceStateInfo: Partial<DeviceStateInfo> = {
    deviceInfo: getDeviceTypeInfo('unknown', 'unknown'),
    lastStatusEvent: undefined,
    lastStateEvent: undefined,
    displayState: undefined,
    lastSeen: undefined
};

interface FusionState {
  connectors: ConnectorWithConfig[];
  isLoading: boolean;
  error: string | null;
  isAddConnectorOpen: boolean;
  isEditConnectorOpen: boolean;
  editingConnector: ConnectorWithConfig | null;
  
  // MQTT Status States by connector ID
  mqttStates: Map<string, ConnectorMqttState>;
  
  // Piko WebSocket Status States by connector ID
  pikoStates: Map<string, ConnectorPikoState>; 

  // Device state map: key = `${connectorId}:${deviceId}`
  deviceStates: Map<string, DeviceStateInfo>;
  
  // Actions
  setConnectors: (connectors: ConnectorWithConfig[]) => void;
  addConnector: (connector: ConnectorWithConfig) => void;
  updateConnector: (connector: ConnectorWithConfig) => void;
  deleteConnector: (id: string) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setAddConnectorOpen: (open: boolean) => void;
  setEditConnectorOpen: (open: boolean) => void;
  setEditingConnector: (connector: ConnectorWithConfig | null) => void;

  // MQTT Status Actions
  setMqttState: (connectorId: string, state: Partial<ConnectorMqttState>) => void;
  
  // Piko Status Actions
  setPikoState: (connectorId: string, state: Partial<ConnectorPikoState>) => void; 

  // Get MQTT state for a specific connector
  getMqttState: (connectorId: string) => ConnectorMqttState;

  // Get Piko state for a specific connector
  getPikoState: (connectorId: string) => ConnectorPikoState; 

  processStandardizedEvent: (evt: StandardizedEvent) => void;

  // Action to bulk update device states after a sync operation
  setDeviceStatesFromSync: (syncedDevices: DeviceWithConnector[]) => void;
  fetchConnectors: () => Promise<void>;
}

// Initial state for MQTT (default)
const initialMqttState: ConnectorMqttState = {
  status: 'unknown',
  error: null,
  lastEventTime: null,
  eventCount: null,
  lastStandardizedPayload: null,
};

// Initial state for Piko WebSocket (default)
const initialPikoState: ConnectorPikoState = {
  status: 'unknown',
  error: null,
  lastEventTime: null,
  eventCount: null,
  lastStandardizedPayload: null,
};

export const useFusionStore = create<FusionState>((set, get) => ({
  connectors: [],
  isLoading: true,
  error: null,
  isAddConnectorOpen: false,
  isEditConnectorOpen: false,
  editingConnector: null,
  
  // Initial MQTT Status State
  mqttStates: new Map<string, ConnectorMqttState>(),
  
  // Initial Piko WebSocket Status State
  pikoStates: new Map<string, ConnectorPikoState>(),

  // Initial Device State map
  deviceStates: new Map<string, DeviceStateInfo>(),
  
  // Actions
  setConnectors: (connectors) => set({ connectors }),
  addConnector: (connector) => set((state) => ({ connectors: [...state.connectors, connector] })),
  updateConnector: (connector) =>
    set((state) => ({
      connectors: state.connectors.map((c) => 
        c.id === connector.id ? connector : c
      ),
    })),
  deleteConnector: (id) =>
    set((state) => ({
      connectors: state.connectors.filter((connector) => connector.id !== id),
      mqttStates: produce(state.mqttStates, (draft: Draft<Map<string, ConnectorMqttState>>) => { draft.delete(id); }),
      pikoStates: produce(state.pikoStates, (draft: Draft<Map<string, ConnectorPikoState>>) => { draft.delete(id); }),
      deviceStates: produce(state.deviceStates, (draft: Draft<Map<string, DeviceStateInfo>>) => {
        for (const key of draft.keys()) {
          if (key.startsWith(`${id}:`)) {
            draft.delete(key);
          }
        }
      }),
    })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setAddConnectorOpen: (open) => set({ isAddConnectorOpen: open }),
  setEditConnectorOpen: (open) => set({ isEditConnectorOpen: open }),
  setEditingConnector: (connector) => set({ editingConnector: connector }),

  // MQTT Status Actions
  setMqttState: (connectorId, stateUpdate) =>
    set((state) => ({
      mqttStates: produce(state.mqttStates, (draft: Draft<Map<string, ConnectorMqttState>>) => {
        const currentState = draft.get(connectorId) || { ...initialMqttState };
        draft.set(connectorId, { ...currentState, ...stateUpdate });
      }),
    })),
  
  // Piko Status Actions
  setPikoState: (connectorId, stateUpdate) =>
    set((state) => ({
      pikoStates: produce(state.pikoStates, (draft: Draft<Map<string, ConnectorPikoState>>) => {
        const currentState = draft.get(connectorId) || { ...initialPikoState };
        draft.set(connectorId, { ...currentState, ...stateUpdate });
      }),
    })),

  // Get MQTT state for a specific connector with fallback to default state
  getMqttState: (connectorId) => {
    return get().mqttStates.get(connectorId) || { ...initialMqttState };
  },

  // Get Piko state for a specific connector with fallback to default state
  getPikoState: (connectorId) => {
    return get().pikoStates.get(connectorId) || { ...initialPikoState };
  },

  processStandardizedEvent: (evt: StandardizedEvent) =>
    set((state) => {
      const key = `${evt.connectorId}:${evt.deviceId}`;
      
      // Find connector category 
      const connector = state.connectors.find(c => c.id === evt.connectorId);
      const connectorCategory = connector?.category ?? 'unknown';

      const existing = state.deviceStates.get(key) || { 
          ...defaultDeviceStateInfo, 
          connectorId: evt.connectorId, 
          deviceId: evt.deviceId,
          // Initialize deviceInfo using the event's info or fallback
          deviceInfo: evt.deviceInfo ?? getDeviceTypeInfo(connectorCategory, 'unknown') 
      }; 

      // Determine the rawType to use for recalculation. Prioritize existing state.
      const rawTypeForRecalc = existing.rawType ?? 'unknown'; // Use stored rawType if available

      // Extract potential originalEventType from payload (used for UNKNOWN events primarily)
      const originalEventTypeFromPayload = (evt.payload && typeof evt.payload === 'object' && 'originalEventType' in evt.payload) 
                                           ? evt.payload.originalEventType as string 
                                           : undefined;

      // Base update preserves existing static fields
      const updated: DeviceStateInfo = {
        ...existing,
        connectorId: evt.connectorId,
        deviceId: evt.deviceId,
        // Recalculate deviceInfo using the determined rawType
        deviceInfo: getDeviceTypeInfo(connectorCategory, rawTypeForRecalc), 
        lastSeen: new Date(evt.timestamp.getTime()), // Convert number to Date
        // Update displayState safely
        displayState: evt.payload && typeof evt.payload === 'object' && 'displayState' in evt.payload 
                      ? evt.payload.displayState as DisplayState 
                      : existing.displayState,
        // Store the relevant event type conditionally with type assertion using enums
        lastStatusEvent: (evt.eventCategory === EventCategory.DEVICE_CONNECTIVITY) && 
                         (evt.eventType === EventType.DEVICE_ONLINE || evt.eventType === EventType.DEVICE_OFFLINE)
          ? evt as StandardizedEvent<EventType.DEVICE_ONLINE | EventType.DEVICE_OFFLINE>
          : existing.lastStatusEvent,
        lastStateEvent: evt.eventType === EventType.STATE_CHANGED
          ? evt as StandardizedEvent<EventType.STATE_CHANGED>
          : existing.lastStateEvent,
        // Update rawType: Use from payload if available, otherwise keep existing.
        rawType: originalEventTypeFromPayload ?? existing.rawType, 
      };

      return {
        deviceStates: produce(state.deviceStates, (draft: Draft<Map<string, DeviceStateInfo>>) => {
          draft.set(key, updated);
        }),
      };
    }),

  // Action to bulk update device states after a sync operation
  setDeviceStatesFromSync: (syncedDevices) => set((state) => {
      console.log('[Store] setDeviceStatesFromSync received:', syncedDevices);
      const newDeviceStates = new Map<string, DeviceStateInfo>();

      for (const syncedDevice of syncedDevices) {
          const key = `${syncedDevice.connectorId}:${syncedDevice.deviceId}`;
          const updated: DeviceStateInfo = {
              ...defaultDeviceStateInfo,
              connectorId: syncedDevice.connectorId,
              deviceId: syncedDevice.deviceId,
              name: syncedDevice.name,
              rawType: syncedDevice.type,
              vendor: syncedDevice.vendor ?? undefined,
              model: syncedDevice.model ?? undefined,
              url: syncedDevice.url ?? undefined,
              deviceInfo: getDeviceTypeInfo(syncedDevice.connectorCategory, syncedDevice.type),
              lastSeen: new Date(),
              serverId: syncedDevice.serverId ?? undefined,
              serverName: syncedDevice.serverName ?? undefined,
              pikoServerDetails: syncedDevice.pikoServerDetails ?? undefined,
          };
          newDeviceStates.set(key, updated);
      }
      
      console.log('[Store] setDeviceStatesFromSync updated state:', newDeviceStates);
      return { deviceStates: newDeviceStates };
  }),

  fetchConnectors: async () => {
    set({ isLoading: true });
    console.log('[FusionStore] Fetching connectors...');
    try {
      const response = await fetch('/api/connectors');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch connectors');
      }
      if (data.data && Array.isArray(data.data)) {
        set({ connectors: data.data as ConnectorWithConfig[], isLoading: false });
        console.log('[FusionStore] Connectors loaded into store:', data.data);
      } else {
        set({ connectors: [], isLoading: false });
        console.warn('[FusionStore] Connector fetch returned no data.');
      }
    } catch (error) {      console.error('[FusionStore] Error fetching connectors:', error);
      set({ error: error instanceof Error ? error.message : 'Unknown error fetching connectors', connectors: [], isLoading: false });
    }
  },
})); 