import { create } from 'zustand';
import { produce, Draft, enableMapSet } from 'immer';
import { toast } from 'sonner'; // <-- Import toast
import { PikoServer } from '@/types';
import type { StandardizedEvent } from '@/types/events';
import { DisplayState, TypedDeviceInfo, EventType, EventCategory, EventSubtype, ArmedState, ActionableState, ON, OFF } from '@/lib/mappings/definitions';
import type { DeviceWithConnector, ConnectorWithConfig, Location, Area, ApiResponse } from '@/types/index';
import { YoLinkConfig } from '@/services/drivers/yolink';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import type { DashboardEvent } from '@/app/api/events/dashboard/route';
import type { User } from '@/lib/actions/user-actions'; // Import User type

// Enable Immer plugin for Map/Set support
enableMapSet();

// Type for connection status representation in the store (shared)
type ConnectionStatus = 'connected' | 'disconnected' | 'unknown' | 'reconnecting' | 'error';

// MQTT state for a specific connector
export interface ConnectorMqttState {
  status: ConnectionStatus; // Use shared type
  error: string | null;
  lastEventTime: number | null; 
  eventCount: number | null;
  lastStandardizedPayload: Record<string, any> | null;
  lastActivity: number | null; // <-- Add consistent lastActivity
}

// Piko WebSocket state for a specific connector
export interface ConnectorPikoState {
  status: ConnectionStatus; // Use shared type
  error: string | null;
  lastEventTime: number | null;
  eventCount: number | null;
  lastStandardizedPayload: Record<string, any> | null;
  lastActivity: number | null; // <-- Add consistent lastActivity
}

// Webhook state (NEW)
export interface ConnectorWebhookState {
    lastActivity: number | null; // Timestamp of last received webhook
    // Add other webhook-specific status fields if needed later
}

interface DeviceStateInfo {
  connectorId: string;
  deviceId: string; // Connector-specific ID
  deviceInfo: TypedDeviceInfo;
  displayState?: DisplayState;
  lastStateEvent?: StandardizedEvent;
  lastStatusEvent?: StandardizedEvent;
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

// --- User Profile Type ---
// Define what parts of the user data we need globally
export interface UserProfile {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    twoFactorEnabled: boolean;
}

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

  // Webhook states by connector ID
  webhookStates: Map<string, ConnectorWebhookState>;

  // Device state map: key = `${connectorId}:${deviceId}`
  deviceStates: Map<string, DeviceStateInfo>;
  
  // All Devices List (NEW)
  allDevices: DeviceWithConnector[];
  isLoadingAllDevices: boolean;
  errorAllDevices: string | null;

  // --- NEW: Locations State ---
  locations: Location[];
  isLoadingLocations: boolean;
  errorLocations: string | null;

  // --- NEW: Areas State ---
  areas: Area[];
  isLoadingAreas: boolean;
  errorAreas: string | null;
  
  // --- NEW: Event Dashboard State ---
  dashboardEvents: DashboardEvent[];
  isLoadingDashboardEvents: boolean;
  errorDashboardEvents: string | null;
  
  // --- Current User State ---
  currentUser: UserProfile | null;
  
  // --- NEW: Device Action Loading State ---
  deviceActionLoading: Map<string, boolean>; // Key: internalDeviceId, Value: true if loading
  
  // --- NEW: User List Refresh State ---
  lastUserListUpdateTimestamp: number | null;
  
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

  // Webhook Actions
  setWebhookState: (connectorId: string, state: Partial<ConnectorWebhookState>) => void;

  // Get MQTT state for a specific connector
  getMqttState: (connectorId: string) => ConnectorMqttState;

  // Get Piko state for a specific connector
  getPikoState: (connectorId: string) => ConnectorPikoState; 

  // Get Webhook state for a specific connector
  getWebhookState: (connectorId: string) => ConnectorWebhookState;

  processStandardizedEvent: (evt: StandardizedEvent) => void;

  // Action to bulk update device states after a sync operation
  setDeviceStatesFromSync: (syncedDevices: DeviceWithConnector[]) => void;
  fetchConnectors: () => Promise<void>;

  // --- NEW: Location Actions ---
  fetchLocations: () => Promise<void>;
  addLocation: (data: { name: string; parentId?: string | null }) => Promise<Location | null>;
  updateLocation: (id: string, data: { name?: string; parentId?: string | null }) => Promise<Location | null>;
  deleteLocation: (id: string) => Promise<boolean>;

  // --- NEW: Area Actions ---
  fetchAreas: (locationId?: string | null) => Promise<void>;
  addArea: (data: { name: string; locationId?: string | null }) => Promise<Area | null>;
  updateArea: (id: string, data: { name?: string; locationId?: string | null }) => Promise<Area | null>;
  deleteArea: (id: string) => Promise<boolean>;
  updateAreaArmedState: (id: string, armedState: ArmedState) => Promise<Area | null>;
  assignDeviceToArea: (areaId: string, deviceId: string) => Promise<boolean>;
  removeDeviceFromArea: (areaId: string, deviceId: string) => Promise<boolean>;
  moveDeviceToArea: (deviceId: string, targetAreaId: string) => Promise<boolean>;
  // Optimistic UI update for single device move
  optimisticallyMoveDevice: (deviceId: string, sourceAreaId: string | undefined, targetAreaId: string) => void;

  // Batch update armed state for areas in a location
  batchUpdateAreasArmedState: (locationId: string, armedState: ArmedState) => Promise<boolean>;

  // NEW: Fetch all devices 
  fetchAllDevices: () => Promise<void>;

  // NEW: Fetch dashboard events
  fetchDashboardEvents: () => Promise<void>;

  // --- Current User Actions ---
  setCurrentUser: (user: UserProfile | null) => void;

  // --- NEW: Action to manually update a single device's state ---
  updateSingleDeviceState: (internalDeviceId: string, newDisplayState: DisplayState) => void;

  // --- NEW: Centralized Action to execute device state change ---
  executeDeviceAction: (internalDeviceId: string, newState: ActionableState) => Promise<void>;

  // --- NEW: User List Refresh Action ---
  triggerUserListRefresh: () => void;
}

// Initial state for MQTT (default)
const initialMqttState: ConnectorMqttState = {
  status: 'unknown',
  error: null,
  lastEventTime: null,
  eventCount: null,
  lastStandardizedPayload: null,
  lastActivity: null, // <-- Initialize
};

// Initial state for Piko WebSocket (default)
const initialPikoState: ConnectorPikoState = {
  status: 'unknown',
  error: null,
  lastEventTime: null,
  eventCount: null,
  lastStandardizedPayload: null,
  lastActivity: null, // <-- Initialize
};

// Initial state for Webhook (default)
const initialWebhookState: ConnectorWebhookState = { // <-- Add initial webhook state
  lastActivity: null,
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

  // Initial Webhook Status State
  webhookStates: new Map<string, ConnectorWebhookState>(),

  // Initial Device State map
  deviceStates: new Map<string, DeviceStateInfo>(),
  
  // NEW: All Devices State
  allDevices: [], 
  isLoadingAllDevices: false,
  errorAllDevices: null,

  // NEW: Location State
  locations: [],
  isLoadingLocations: false,
  errorLocations: null,

  // NEW: Area State
  areas: [],
  isLoadingAreas: false,
  errorAreas: null,
  
  // --- NEW: Event Dashboard Initial State ---
  dashboardEvents: [],
  isLoadingDashboardEvents: false,
  errorDashboardEvents: null,
  
  // --- Current User Initial State ---
  currentUser: null,
  
  // --- NEW: Device Action Loading Initial State ---
  deviceActionLoading: new Map<string, boolean>(),
  
  // --- NEW: User List Refresh Initial State ---
  lastUserListUpdateTimestamp: null,
  
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
      webhookStates: produce(state.webhookStates, (draft: Draft<Map<string, ConnectorWebhookState>>) => { draft.delete(id); }),
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

  // Webhook Actions
  setWebhookState: (connectorId, stateUpdate) =>
    set((state) => ({
      webhookStates: produce(state.webhookStates, (draft: Draft<Map<string, ConnectorWebhookState>>) => {
        const currentState = draft.get(connectorId) || { ...initialWebhookState };
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

  // Get Webhook state for a specific connector with fallback to default state
  getWebhookState: (connectorId) => {
    return get().webhookStates.get(connectorId) || { ...initialWebhookState };
  },

  processStandardizedEvent: (evt: StandardizedEvent) =>
    set((state) => {
      const key = `${evt.connectorId}:${evt.deviceId}`;
      
      const connector = state.connectors.find(c => c.id === evt.connectorId);
      const connectorCategory = connector?.category ?? 'unknown';

      const existing = state.deviceStates.get(key) || { 
          ...defaultDeviceStateInfo, 
          connectorId: evt.connectorId, 
          deviceId: evt.deviceId,
          deviceInfo: evt.deviceInfo ?? getDeviceTypeInfo(connectorCategory, 'unknown') 
      }; 

      const rawTypeForRecalc = existing.rawType ?? 'unknown';
      
      // Update logic to use direct category/type/subtype properties
      const updated: DeviceStateInfo = {
        ...existing,
        connectorId: evt.connectorId,
        deviceId: evt.deviceId,
        deviceInfo: getDeviceTypeInfo(connectorCategory, rawTypeForRecalc), 
        lastSeen: new Date(evt.timestamp.getTime()),
        displayState: evt.payload && typeof evt.payload === 'object' && 'displayState' in evt.payload 
                      ? evt.payload.displayState as DisplayState 
                      : existing.displayState,
        // Store lastStateEvent if type matches STATE_CHANGED
        lastStateEvent: evt.type === EventType.STATE_CHANGED ? evt : existing.lastStateEvent,
        // rawType logic might need adjustment depending on how UNKNOWN_EXTERNAL_EVENT is handled
        rawType: (evt.type === EventType.UNKNOWN_EXTERNAL_EVENT && evt.payload?.originalEventType) 
                 ? evt.payload.originalEventType as string 
                 : existing.rawType, 
      };

      return {
        deviceStates: produce(state.deviceStates, (draft: Draft<Map<string, DeviceStateInfo>>) => {
          draft.set(key, updated);
        }),
      };
    }),

  // Action to bulk update device states after a sync operation
  setDeviceStatesFromSync: (syncedDevices) => set((state) => {
      console.log(`[Store] setDeviceStatesFromSync received ${syncedDevices?.length || 0} devices.`);
      
      // Use produce for safe immutable updates within the map
      const newDeviceStates = produce(state.deviceStates, (draft: Draft<Map<string, DeviceStateInfo>>) => {
          // Optional: Create a set of keys from the sync for potential removal later if needed
          // const syncedKeys = new Set(syncedDevices.map(d => `${d.connectorId}:${d.deviceId}`));
          
          for (const syncedDevice of syncedDevices) {
              const key = `${syncedDevice.connectorId}:${syncedDevice.deviceId}`;
              const existing = draft.get(key); // Get existing state from the draft
              
              const updated: DeviceStateInfo = {
                  // --- Base info always taken from syncedDevice --- 
                  connectorId: syncedDevice.connectorId,
                  deviceId: syncedDevice.deviceId,
                  name: syncedDevice.name,
                  rawType: syncedDevice.type,
                  vendor: syncedDevice.vendor ?? undefined,
                  model: syncedDevice.model ?? undefined,
                  url: syncedDevice.url ?? undefined,
                  deviceInfo: getDeviceTypeInfo(syncedDevice.connectorCategory, syncedDevice.type),
                  serverId: syncedDevice.serverId ?? undefined,
                  serverName: syncedDevice.serverName ?? undefined,
                  pikoServerDetails: syncedDevice.pikoServerDetails ?? undefined,
                  
                  // --- Merge stateful/event-driven fields --- 
                  lastSeen: new Date(), // Always update lastSeen on sync
                  
                  // Prioritize incoming displayState, fallback to existing
                  displayState: syncedDevice.displayState ?? existing?.displayState ?? undefined, 
                  
                  // Preserve last known events if not overwritten by sync (keep existing for now)
                  lastStateEvent: existing?.lastStateEvent, 
                  lastStatusEvent: existing?.lastStatusEvent,
              };
              draft.set(key, updated); // Update the draft map
          }
          
          // Optional: Remove devices from the map that are no longer present in the sync
          // for (const key of draft.keys()) {
          //    if (!syncedKeys.has(key)) {
          //        draft.delete(key);
          //    }
          // }
      });
      
      console.log(`[Store] setDeviceStatesFromSync updated state map. New size: ${newDeviceStates?.size || 0}`);
      // Update allDevices with the full list, but deviceStates map uses merged data
      return { 
          deviceStates: newDeviceStates, 
          allDevices: syncedDevices // Update allDevices with the full list as it represents the latest full snapshot
      };
  }),

  fetchConnectors: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch('/api/connectors');
        const data: ApiResponse<ConnectorWithConfig[]> = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to fetch connectors');
        }
        set({ connectors: data.data || [], isLoading: false });
        console.log('[FusionStore] Connectors loaded:', data.data);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[FusionStore] Error fetching connectors:', message);
        set({ error: message, isLoading: false, connectors: [] });
    }
  },

  // --- NEW: Location Actions ---
  fetchLocations: async () => {
    set({ isLoadingLocations: true, errorLocations: null });
    try {
      const response = await fetch('/api/locations');
      const data: ApiResponse<Location[]> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch locations');
      }
      set({ locations: data.data || [], isLoadingLocations: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error fetching locations:", message);
      set({ isLoadingLocations: false, errorLocations: message });
    }
  },
  addLocation: async (locationData) => {
    // No loading state change here, component can handle it
    try {
      const response = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(locationData)
      });
      const data: ApiResponse<Location> = await response.json();
      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to create location');
      }
      const newLocation = data.data;
      set((state) => ({ 
        locations: [...state.locations, newLocation].sort((a, b) => a.path.localeCompare(b.path)),
      }));
      return newLocation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error adding location:", message);
      set({ errorLocations: message }); // Set error state
      return null;
    }
  },
  updateLocation: async (id, locationData) => {
     try {
      const response = await fetch(`/api/locations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(locationData)
      });
      const data: ApiResponse<Location> = await response.json();
       if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to update location');
      }
      const updatedLocation = data.data;
       // If parentId changed, paths of descendants might have changed too, refetch all
      if (locationData.parentId !== undefined) {
        await get().fetchLocations(); // Trigger refetch
      } else {
         set((state) => ({ 
            locations: state.locations.map(loc => loc.id === id ? updatedLocation : loc).sort((a, b) => a.path.localeCompare(b.path)),
          }));
      }
      return updatedLocation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error updating location ${id}:`, message);
      set({ errorLocations: message });
      return null;
    }
  },
   deleteLocation: async (id) => {
    try {
      const response = await fetch(`/api/locations/${id}`, { method: 'DELETE' });
      const data: ApiResponse<{ id: string }> = await response.json();
       if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete location');
      }
      // Refetch all locations after delete to reflect changes (including cascades)
      await get().fetchLocations(); 
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error deleting location ${id}:`, message);
      set({ errorLocations: message });
      return false;
    }
  },

  // --- NEW: Area Actions ---
  fetchAreas: async (locationId) => {
    set({ isLoadingAreas: true, errorAreas: null });
    try {
      const url = locationId ? `/api/areas?locationId=${locationId}` : '/api/areas';
      const response = await fetch(url);
      const data: ApiResponse<Area[]> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch areas');
      }
      set({ areas: data.data || [], isLoadingAreas: false });
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error("Error fetching areas:", message);
       set({ isLoadingAreas: false, errorAreas: message });
    }
  },
  addArea: async (areaData) => {
     try {
      const response = await fetch('/api/areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(areaData)
      });
      const data: ApiResponse<Area> = await response.json();
      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to create area');
      }
       const newArea = data.data;
      set((state) => ({ areas: [...state.areas, newArea].sort((a, b) => a.name.localeCompare(b.name)) }));
      return newArea;
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error("Error adding area:", message);
       set({ errorAreas: message });
       return null;
    }
  },
  updateArea: async (id, areaData) => {
    try {
      const response = await fetch(`/api/areas/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(areaData)
      });
      const data: ApiResponse<Area> = await response.json();
       if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to update area');
      }
      const updatedArea = data.data;
      set((state) => ({ 
        areas: state.areas.map(area => area.id === id ? updatedArea : area).sort((a, b) => a.name.localeCompare(b.name)),
      }));
      return updatedArea;
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error(`Error updating area ${id}:`, message);
       set({ errorAreas: message });
       return null;
    }
  },
  deleteArea: async (id) => {
     try {
      const response = await fetch(`/api/areas/${id}`, { method: 'DELETE' });
      const data: ApiResponse<{ id: string }> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete area');
      }
      set((state) => ({ 
        areas: state.areas.filter(area => area.id !== id),
      }));
      return true;
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error(`Error deleting area ${id}:`, message);
       set({ errorAreas: message });
       return false;
    }
  },
  updateAreaArmedState: async (id, armedState) => {
    try {
      const response = await fetch(`/api/areas/${id}/arm-state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ armedState })
      });
      const data: ApiResponse<Area> = await response.json();
       if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to update armed state');
      }
       // Assuming data.data contains at least { id: string, armedState: ArmedState }
       const partialUpdatedArea = data.data;
       
      // Use produce for safe immutable update
      set(produce((draft: Draft<FusionState>) => {
          const areaIndex = draft.areas.findIndex(area => area.id === id);
          if (areaIndex !== -1) {
              // Merge the new armedState into the existing area object
              draft.areas[areaIndex] = { 
                  ...draft.areas[areaIndex], // Keep existing properties (like deviceIds)
                  armedState: partialUpdatedArea.armedState // Update only the armed state
              };
          }
      }));
      
      // Return the updated area from the store for consistency, if needed elsewhere
      // Note: The API response (partialUpdatedArea) might not be the full Area object now
      const finalUpdatedArea = get().areas.find(area => area.id === id);
      return finalUpdatedArea || null; 

    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error(`Error updating armed state for ${id}:`, message);
       set({ errorAreas: message });
       return null;
    }
  },
  assignDeviceToArea: async (areaId, deviceId) => {
     try {
        const response = await fetch(`/api/areas/${areaId}/devices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId })
        });
        const data: ApiResponse<{ areaId: string, deviceId: string }> = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to assign device');
        }
        return true;
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error(`Error assigning device ${deviceId} to area ${areaId}:`, message);
       set({ errorAreas: message });
       return false;
    }
  },
  removeDeviceFromArea: async (areaId, deviceId) => {
    try {
         const response = await fetch(`/api/areas/${areaId}/devices/${deviceId}`, { method: 'DELETE' });
        const data: ApiResponse<{ areaId: string, deviceId: string }> = await response.json();
         if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to remove device');
        }
        // Refetch areas after successful removal to update the UI
        await get().fetchAreas(); 
        return true;
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error(`Error removing device ${deviceId} from area ${areaId}:`, message);
       set({ errorAreas: message });
       return false;
    }
  },

  // Optimistic UI update for single device move
  optimisticallyMoveDevice: (deviceId, sourceAreaId, targetAreaId) => 
    set(produce((draft: Draft<FusionState>) => {
      if (sourceAreaId) {
        const sourceArea = draft.areas.find(a => a.id === sourceAreaId);
        if (sourceArea && sourceArea.deviceIds) {
          sourceArea.deviceIds = sourceArea.deviceIds.filter(id => id !== deviceId);
        }
      }
      const targetArea = draft.areas.find(a => a.id === targetAreaId);
      if (targetArea) {
        if (!targetArea.deviceIds) {
          targetArea.deviceIds = [];
        }
        if (!targetArea.deviceIds.includes(deviceId)) {
          targetArea.deviceIds.push(deviceId);
        }
      }
      // Ensure sorting is maintained if needed, though usually order isn't critical for deviceIds
      // draft.areas.sort((a, b) => a.name.localeCompare(b.name)); 
    })),

  moveDeviceToArea: async (deviceId, targetAreaId) => {
      set({ errorAreas: null }); // Clear previous area-related errors
      try {
          console.log(`[Store] Attempting to move device ${deviceId} to area ${targetAreaId}`);
          const response = await fetch(`/api/devices/${deviceId}/area`, { // Assuming this API endpoint
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ areaId: targetAreaId })
          });

          const data: ApiResponse<{ deviceId: string, areaId: string }> = await response.json();

          if (!response.ok || !data.success) {
              throw new Error(data.error || `Failed to move device ${deviceId}`);
          }

          console.log(`[Store] Successfully moved device ${deviceId} via API. Refetching areas.`);
          // Refetch areas to get the updated device assignments - REMOVED FOR OPTIMISTIC UPDATE
          // await get().fetchAreas(); 
          return true;

      } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          console.error(`Error moving device ${deviceId} to area ${targetAreaId}:`, message);
          set({ errorAreas: `Failed to move device: ${message}` });
          // Optionally refetch areas even on error to ensure UI consistency with backend state
          await get().fetchAreas(); // Keep refetch on error
          return false;
      }
  },

  // Batch update armed state for areas in a location
  batchUpdateAreasArmedState: async (locationId, armedState) => {
    const { areas } = get(); // Get current areas from state
    const targetAreas = areas.filter(area => area.locationId === locationId);
    
    if (targetAreas.length === 0) {
      console.log(`[Store] No areas found for location ${locationId}. Skipping batch update.`);
      return true; // Nothing to do, consider it success
    }
    
    set({ errorAreas: null }); // Clear previous errors
    console.log(`[Store] Batch updating ${targetAreas.length} areas in location ${locationId} to state ${armedState}`);
    
    try {
      // Create an array of promises for each API call
      const updatePromises = targetAreas.map(area => 
        fetch(`/api/areas/${area.id}/arm-state`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ armedState })
        }).then(async (response) => {
          const data: ApiResponse<Area> = await response.json();
          if (!response.ok || !data.success) {
             // Throw an error for this specific area to be caught by Promise.allSettled
             throw new Error(data.error || `Failed to update area ${area.id}`);
          }
          return { areaId: area.id, success: true, updatedArea: data.data }; // Return success indicator and potentially updated data
        })
      );
      
      // Use Promise.allSettled to wait for all updates, even if some fail
      const results = await Promise.allSettled(updatePromises);
      
      const successfulUpdates: string[] = [];
      const failedUpdates: { areaId: string; reason: string }[] = [];
      
      results.forEach((result, index) => {
        const areaId = targetAreas[index].id;
        if (result.status === 'fulfilled' && result.value.success) {
          successfulUpdates.push(areaId);
        } else {
          const reason = result.status === 'rejected' 
                       ? (result.reason instanceof Error ? result.reason.message : String(result.reason))
                       : 'Unknown failure';
          failedUpdates.push({ areaId, reason });
          console.error(`[Store] Failed batch update for area ${areaId}: ${reason}`);
        }
      });
      
      // Update local state only for successful updates
      if (successfulUpdates.length > 0) {
         set(produce((draft: Draft<FusionState>) => {
           successfulUpdates.forEach(areaId => {
              const areaIndex = draft.areas.findIndex(a => a.id === areaId);
              if (areaIndex !== -1) {
                 draft.areas[areaIndex].armedState = armedState;
              }
           });
         }));
         console.log(`[Store] Successfully updated armed state for ${successfulUpdates.length} areas.`);
      }
      
      if (failedUpdates.length > 0) {
        const errorMsg = `Failed to update ${failedUpdates.length} area(s).`;
        set({ errorAreas: errorMsg });
        console.warn(`[Store] Batch update completed with ${failedUpdates.length} failures.`);
        return false; // Indicate partial or total failure
      }
      
      return true; // All succeeded
      
    } catch (err) {
      // Catch any unexpected errors during the process (e.g., network issues before Promise.allSettled)
      const message = err instanceof Error ? err.message : 'Unknown error during batch update';
      console.error(`[Store] Error during batch area update:`, message);
      set({ errorAreas: message });
      return false;
    }
  },

  // NEW: Fetch all devices 
  fetchAllDevices: async () => {
    set({ isLoadingAllDevices: true, errorAllDevices: null });
    try {
      const response = await fetch('/api/devices'); // Assuming this is the endpoint
      const data: ApiResponse<DeviceWithConnector[]> = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch devices');
      }
      set({ allDevices: data.data || [], isLoadingAllDevices: false });
      console.log('[FusionStore] All devices loaded into state:', data.data?.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error fetching all devices:", message);
      set({ isLoadingAllDevices: false, errorAllDevices: message, allDevices: [] });
    }
  },

  // --- NEW: Fetch Dashboard Events Action ---
  fetchDashboardEvents: async () => {
    set({ isLoadingDashboardEvents: true, errorDashboardEvents: null });
    try {
      const response = await fetch('/api/events/dashboard'); 
      // Expect the direct DashboardEvent type from the API
      const data: ApiResponse<DashboardEvent[]> = await response.json(); 

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch dashboard events');
      }
      
      const eventsWithDates = (data.data || []).map(event => ({
        ...event,
        timestamp: new Date(event.timestamp) 
      }));
      
      // Set the state directly with the fetched data
      set({ dashboardEvents: eventsWithDates, isLoadingDashboardEvents: false });
      console.log('[FusionStore] Dashboard events loaded:', eventsWithDates.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error fetching dashboard events:", message);
      set({ isLoadingDashboardEvents: false, errorDashboardEvents: message, dashboardEvents: [] });
    }
  },

  // --- Current User Actions ---
  setCurrentUser: (user) => set({ currentUser: user }),

  // --- NEW: Action to manually update a single device's state ---
  updateSingleDeviceState: (internalDeviceId: string, newDisplayState: DisplayState) => {
    console.log(`[Store] updateSingleDeviceState called for internal ID: ${internalDeviceId}, New State: ${newDisplayState}`);
    set(produce((draft: Draft<FusionState>) => {
        // Find the device details from allDevices using the internal DB ID
        const targetDevice = draft.allDevices.find(d => d.id === internalDeviceId);
        
        if (!targetDevice) {
            console.warn(`[Store] updateSingleDeviceState: Device with internal ID ${internalDeviceId} not found in allDevices.`);
            return; // Exit if we can't find the device details
        }
        
        // Construct the key for the deviceStates map
        const key = `${targetDevice.connectorId}:${targetDevice.deviceId}`;
        const existingState = draft.deviceStates.get(key);

        if (existingState) {
            // Update the existing state entry
            console.log(`[Store] Found existing state for key ${key}, updating displayState.`);
            existingState.displayState = newDisplayState;
            existingState.lastSeen = new Date(); // Also update lastSeen
            draft.deviceStates.set(key, existingState); // Set the modified state back
        } else {
            // If somehow the device is in allDevices but not deviceStates, log a warning.
            // We could potentially create a new entry, but it might lack other info.
            console.warn(`[Store] updateSingleDeviceState: Device found in allDevices but not in deviceStates map (key: ${key}). State not updated in map.`);
        }
    }));
  },

  // --- NEW: Centralized Action to execute device state change ---
  executeDeviceAction: async (internalDeviceId: string, newState: ActionableState) => {
    const stateDesc = newState === ActionableState.SET_ON ? 'on' : 'off';
    // 1. Set Loading State
    set(produce((draft: Draft<FusionState>) => {
      draft.deviceActionLoading.set(internalDeviceId, true);
    }));
    const loadingToastId = toast.loading(`Turning device ${stateDesc}...`);

    try {
      // 2. Make API Call
      const response = await fetch(`/api/devices/${internalDeviceId}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState }),
      });
      const data: ApiResponse<any> = await response.json(); // Assume ApiResponse structure

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Failed to turn device ${stateDesc}`);
      }

      // 3. Optimistic UI Update (using existing action)
      const newDisplayState = newState === ActionableState.SET_ON ? ON : OFF;
      get().updateSingleDeviceState(internalDeviceId, newDisplayState); // Call existing action
      console.log(`[Store] executeDeviceAction: Manually updated store for ${internalDeviceId} to ${newDisplayState}`);

      // 4. Success Feedback
      toast.success(`Device command sent successfully. State updated.`);

    } catch (err) {
      // 5. Error Handling
      console.error(`[Store] Error setting device state for ${internalDeviceId}:`, err);
      const message = err instanceof Error ? err.message : `Failed to turn device ${stateDesc}.`;
      toast.error(message);
    } finally {
      // 6. Clear Loading State
      toast.dismiss(loadingToastId);
      set(produce((draft: Draft<FusionState>) => {
        draft.deviceActionLoading.delete(internalDeviceId);
      }));
    }
  },

  // --- NEW: User List Refresh Action ---
  triggerUserListRefresh: () => set({ lastUserListUpdateTimestamp: Date.now() }),

  // REMOVE addDashboardEvent action implementation

  // REMOVE markEventAsSeen action implementation

})); 