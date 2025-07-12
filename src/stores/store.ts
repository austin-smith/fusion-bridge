import { create } from 'zustand';
import { produce, Draft, enableMapSet } from 'immer';
import { toast } from 'sonner'; // <-- Import toast
import { PikoServer } from '@/types';
import type { StandardizedEvent } from '@/types/events';
import { DisplayState, TypedDeviceInfo, EventType, EventCategory, EventSubtype, ArmedState, ActionableState, ON, OFF } from '@/lib/mappings/definitions';
import type { DeviceWithConnector, ConnectorWithConfig, Location, Space, AlarmZone, ApiResponse, ArmingSchedule } from '@/types/index';
// Re-export the ArmingSchedule type
export type { ArmingSchedule } from '@/types/index';
import { YoLinkConfig } from '@/services/drivers/yolink';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import type { DashboardEvent } from '@/app/api/events/dashboard/route';
import type { User } from '@/lib/actions/user-actions'; // Import User type
import { authClient } from '@/lib/auth/client'; // Import authClient

// Enable Immer plugin for Map/Set support
enableMapSet();

// --- NEW: Automation Types ---
export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  configJson: any; // AutomationConfig type - keeping as any for now to avoid complex imports
  organizationId: string;
  locationScopeId: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NewAutomationData {
  name: string;
  enabled?: boolean;
  config: any; // AutomationConfig type
  locationScopeId?: string | null;
  tags?: string[];
}

// Type definitions for arming schedules
export interface NewArmingScheduleData {
  name: string;
  daysOfWeek: number[];
  armTimeLocal: string;
  disarmTimeLocal: string;
  isEnabled: boolean;
}

export interface UpdateArmingScheduleData {
  name?: string;
  daysOfWeek?: number[];
  armTimeLocal?: string;
  disarmTimeLocal?: string;
  isEnabled?: boolean;
}

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

  // --- NEW: Spaces State ---
  spaces: Space[];
  isLoadingSpaces: boolean;
  errorSpaces: string | null;
  
  // --- NEW: Alarm Zones State ---
  alarmZones: AlarmZone[];
  isLoadingAlarmZones: boolean;
  errorAlarmZones: string | null;
  
  // --- NEW: Arming Schedules State ---
  armingSchedules: ArmingSchedule[];
  isLoadingArmingSchedules: boolean;
  errorArmingSchedules: string | null;
  
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
  
  // --- NEW: PIN Management State ---
  pinStates: Map<string, { hasPin: boolean; setAt: Date | null }>; // Key: userId
  
  // --- NEW: Organization State ---
  organizations: Organization[];
  isLoadingOrganizations: boolean;
  errorOrganizations: string | null;
  
  // --- NEW: Organization Members State ---
  organizationMembers: OrganizationMember[];
  isLoadingMembers: boolean;
  errorMembers: string | null;
  
  // --- NEW: Organization Invitations State ---
  organizationInvitations: OrganizationInvitation[];
  isLoadingInvitations: boolean;
  errorInvitations: string | null;
  
  // --- NEW: Active Organization Tracking ---
  activeOrganizationId: string | null;
  
  // --- NEW: Automations State ---
  automations: Automation[];
  isLoadingAutomations: boolean;
  errorAutomations: string | null;
  
  // --- NEW: OpenAI Service State ---
  openAiEnabled: boolean;
  isLoadingOpenAi: boolean;
  errorOpenAi: string | null;
  
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

  // --- NEW: Space Actions ---
  fetchSpaces: (locationId?: string | null) => Promise<void>;
  addSpace: (data: { name: string; locationId: string; description?: string; metadata?: Record<string, any> }) => Promise<Space | null>;
  updateSpace: (id: string, data: { name?: string; locationId?: string; description?: string; metadata?: Record<string, any> }) => Promise<Space | null>;
  deleteSpace: (id: string) => Promise<boolean>;
  assignDeviceToSpace: (spaceId: string, deviceId: string) => Promise<boolean>;
  removeDeviceFromSpace: (spaceId: string, deviceId: string) => Promise<boolean>;
  bulkAssignDevicesToSpace: (spaceId: string, deviceIds: string[]) => Promise<boolean>;
  bulkRemoveDevicesFromSpace: (spaceId: string, deviceIds: string[]) => Promise<boolean>;
  
  // --- NEW: Alarm Zone Actions ---
  fetchAlarmZones: (locationId?: string | null) => Promise<void>;
  addAlarmZone: (data: { name: string; locationId: string; description?: string; triggerBehavior: 'standard' | 'custom' }) => Promise<AlarmZone | null>;
  updateAlarmZone: (id: string, data: { name?: string; locationId?: string; description?: string; triggerBehavior?: 'standard' | 'custom' }) => Promise<AlarmZone | null>;
  deleteAlarmZone: (id: string) => Promise<boolean>;
  updateAlarmZoneArmedState: (id: string, armedState: ArmedState) => Promise<AlarmZone | null>;
  assignDeviceToAlarmZone: (zoneId: string, deviceId: string) => Promise<boolean>;
  removeDeviceFromAlarmZone: (zoneId: string, deviceId: string) => Promise<boolean>;
  
  // --- Bulk Alarm Zone Device Assignment Actions ---
  bulkAssignDevicesToAlarmZone: (zoneId: string, deviceIds: string[]) => Promise<boolean>;
  bulkRemoveDevicesFromAlarmZone: (zoneId: string, deviceIds: string[]) => Promise<boolean>;

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

  // --- NEW: Arming Schedule Actions ---
  fetchArmingSchedules: () => Promise<void>;
  addArmingSchedule: (scheduleData: NewArmingScheduleData) => Promise<ArmingSchedule | null>;
  updateArmingSchedule: (id: string, scheduleData: UpdateArmingScheduleData) => Promise<ArmingSchedule | null>;
  deleteArmingSchedule: (id: string) => Promise<boolean>;

  // --- NEW: Keypad PIN Management Actions ---
  setPinStatus: (userId: string, hasPin: boolean, setAt?: Date | null) => void;
  getPinStatus: (userId: string) => { hasPin: boolean; setAt: Date | null };
  setUserPin: (userId: string, pin: string) => Promise<boolean>;
  removeUserPin: (userId: string) => Promise<boolean>;
  validatePin: (pin: string) => Promise<{ valid: boolean; userId?: string }>;
  
  // --- NEW: Organization Actions ---
  fetchOrganizations: () => Promise<void>;
  createOrganization: (data: NewOrganizationData) => Promise<Organization | null>;
  updateOrganization: (id: string, data: Partial<NewOrganizationData>) => Promise<Organization | null>;
  deleteOrganization: (id: string) => Promise<boolean>;
  
  // --- NEW: Organization Member Actions ---
  fetchOrganizationMembers: (organizationId?: string) => Promise<void>;
  inviteMember: (email: string, role: string, organizationId?: string) => Promise<OrganizationInvitation | null>;
  updateMemberRole: (memberId: string, role: string) => Promise<boolean>;
  removeMember: (memberIdOrEmail: string, organizationId?: string) => Promise<boolean>;
  
  // --- NEW: Organization Invitation Actions ---
  fetchOrganizationInvitations: (organizationId?: string) => Promise<void>;
  acceptInvitation: (invitationId: string) => Promise<boolean>;
  cancelInvitation: (invitationId: string) => Promise<boolean>;
  rejectInvitation: (invitationId: string) => Promise<boolean>;
  
  // --- NEW: Active Organization Actions ---
  setActiveOrganizationId: (organizationId: string | null) => void;
  
  // --- NEW: Automations Actions ---
  fetchAutomations: () => Promise<void>;
  createAutomation: (data: NewAutomationData) => Promise<Automation | null>;
  updateAutomation: (id: string, data: Partial<NewAutomationData>) => Promise<Automation | null>;
  deleteAutomation: (id: string) => Promise<boolean>;
  cloneAutomation: (id: string) => Promise<Automation | null>;
  
  // --- NEW: OpenAI Service Actions ---
  fetchOpenAiStatus: () => Promise<void>;
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

  // NEW: Space State
  spaces: [],
  isLoadingSpaces: false,
  errorSpaces: null,
  
  // NEW: Alarm Zone State
  alarmZones: [],
  isLoadingAlarmZones: false,
  errorAlarmZones: null,
  
  // --- NEW: Arming Schedules Initial State ---
  armingSchedules: [],
  isLoadingArmingSchedules: false,
  errorArmingSchedules: null,
  
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
  
  // --- NEW: PIN Management Initial State ---
  pinStates: new Map<string, { hasPin: boolean; setAt: Date | null }>(),
  
  // --- NEW: Organization State ---
  organizations: [],
  isLoadingOrganizations: false,
  errorOrganizations: null,
  
  // --- NEW: Organization Members State ---
  organizationMembers: [],
  isLoadingMembers: false,
  errorMembers: null,
  
  // --- NEW: Organization Invitations State ---
  organizationInvitations: [],
  isLoadingInvitations: false,
  errorInvitations: null,
  
  // --- NEW: Active Organization Tracking ---
  activeOrganizationId: null,
  
  // --- NEW: Automations State ---
  automations: [],
  isLoadingAutomations: false,
  errorAutomations: null,
  
  // --- NEW: OpenAI Service State ---
  openAiEnabled: false,
  isLoadingOpenAi: false,
  errorOpenAi: null,
  
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
      // API uses clean JOIN-based organization filtering - explicit WHERE clauses
      const response = await fetch('/api/locations');
      const data: ApiResponse<Location[]> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch locations');
      }
      set({ locations: data.data || [], isLoadingLocations: false });
      console.log(`[FusionStore] Locations loaded via clean organization filtering: ${data.data?.length || 0} locations`);
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

  // --- NEW: Space Actions ---
  fetchSpaces: async (locationId) => {
    set({ isLoadingSpaces: true, errorSpaces: null });
    try {
      const url = locationId ? `/api/spaces?locationId=${locationId}` : '/api/spaces';
      const response = await fetch(url);
      const data: ApiResponse<Space[]> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch spaces');
      }
      set({ spaces: data.data || [], isLoadingSpaces: false });
      console.log(`[FusionStore] Spaces loaded: ${data.data?.length || 0} spaces`);
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error("Error fetching spaces:", message);
       set({ isLoadingSpaces: false, errorSpaces: message });
    }
  },
  addSpace: async (spaceData) => {
     try {
      const response = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spaceData)
      });
      const data: ApiResponse<Space> = await response.json();
      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to create space');
      }
       const newSpace = data.data;
      set((state) => ({ spaces: [...state.spaces, newSpace].sort((a, b) => a.name.localeCompare(b.name)) }));
      return newSpace;
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error("Error adding space:", message);
       set({ errorSpaces: message });
       return null;
    }
  },
  updateSpace: async (id, spaceData) => {
    try {
      const response = await fetch(`/api/spaces/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spaceData)
      });
      const data: ApiResponse<Space> = await response.json();
       if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to update space');
      }
      const updatedSpace = data.data;
      set((state) => ({ 
        spaces: state.spaces.map(space => space.id === id ? updatedSpace : space).sort((a, b) => a.name.localeCompare(b.name)),
      }));
      return updatedSpace;
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error(`Error updating space ${id}:`, message);
       set({ errorSpaces: message });
       return null;
    }
  },
  deleteSpace: async (id) => {
     try {
      const response = await fetch(`/api/spaces/${id}`, { method: 'DELETE' });
      const data: ApiResponse<{ id: string }> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete space');
      }
      set((state) => ({ 
        spaces: state.spaces.filter(space => space.id !== id),
      }));
      return true;
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error(`Error deleting space ${id}:`, message);
       set({ errorSpaces: message });
       return false;
    }
  },
  assignDeviceToSpace: async (spaceId, deviceId) => {
     try {
        const response = await fetch(`/api/spaces/${spaceId}/devices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId })
        });
        const data: ApiResponse<{ spaceId: string, deviceIds: string[] }> = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to assign device to space');
        }
        // Don't refetch here - let bulk operations handle the refresh
        return true;
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error(`Error assigning device ${deviceId} to space ${spaceId}:`, message);
       set({ errorSpaces: message });
       return false;
    }
  },
  removeDeviceFromSpace: async (spaceId, deviceId) => {
    try {
         const response = await fetch(`/api/spaces/${spaceId}/devices?deviceId=${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
        const data: ApiResponse<{ spaceId: string, deviceIds: string[] }> = await response.json();
         if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to remove device from space');
        }
        // Don't refetch here - let bulk operations handle the refresh
        return true;
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error(`Error removing device ${deviceId} from space ${spaceId}:`, message);
       set({ errorSpaces: message });
       return false;
    }
  },

  // NEW: Bulk space device operations
  bulkAssignDevicesToSpace: async (spaceId: string, deviceIds: string[]) => {
    try {
      const response = await fetch(`/api/spaces/${spaceId}/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIds })
      });
      const data: ApiResponse<{ spaceId: string, deviceIds: string[] }> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to assign devices to space');
      }
      // Refresh spaces to update device assignments
      await get().fetchSpaces();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error bulk assigning devices to space ${spaceId}:`, message);
      set({ errorSpaces: message });
      return false;
    }
  },
  
  bulkRemoveDevicesFromSpace: async (spaceId: string, deviceIds: string[]) => {
    try {
      const response = await fetch(`/api/spaces/${spaceId}/devices`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIds })
      });
      const data: ApiResponse<{ spaceId: string, deviceIds: string[] }> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove devices from space');
      }
      // Refresh spaces to update device assignments
      await get().fetchSpaces();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error bulk removing devices from space ${spaceId}:`, message);
      set({ errorSpaces: message });
      return false;
    }
  },

  // --- NEW: Alarm Zone Actions ---
  fetchAlarmZones: async (locationId) => {
    set({ isLoadingAlarmZones: true, errorAlarmZones: null });
    try {
      const url = locationId ? `/api/alarm-zones?locationId=${locationId}` : '/api/alarm-zones';
      const response = await fetch(url);
      const data: ApiResponse<AlarmZone[]> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch alarm zones');
      }
      set({ alarmZones: data.data || [], isLoadingAlarmZones: false });
      console.log(`[FusionStore] Alarm zones loaded: ${data.data?.length || 0} zones`);
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error("Error fetching alarm zones:", message);
       set({ isLoadingAlarmZones: false, errorAlarmZones: message });
    }
  },
  addAlarmZone: async (zoneData) => {
     try {
      const response = await fetch('/api/alarm-zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zoneData)
      });
      const data: ApiResponse<AlarmZone> = await response.json();
      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to create alarm zone');
      }
       const newZone = data.data;
      set((state) => ({ alarmZones: [...state.alarmZones, newZone].sort((a, b) => a.name.localeCompare(b.name)) }));
      return newZone;
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error("Error adding alarm zone:", message);
       set({ errorAlarmZones: message });
       return null;
    }
  },
  updateAlarmZone: async (id, zoneData) => {
    try {
      const response = await fetch(`/api/alarm-zones/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zoneData)
      });
      const data: ApiResponse<AlarmZone> = await response.json();
       if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to update alarm zone');
      }
      const updatedZone = data.data;
      set((state) => ({ 
        alarmZones: state.alarmZones.map(zone => zone.id === id ? updatedZone : zone).sort((a, b) => a.name.localeCompare(b.name)),
      }));
      return updatedZone;
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error(`Error updating alarm zone ${id}:`, message);
       set({ errorAlarmZones: message });
       return null;
    }
  },
  deleteAlarmZone: async (id) => {
     try {
      const response = await fetch(`/api/alarm-zones/${id}`, { method: 'DELETE' });
      const data: ApiResponse<{ id: string }> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete alarm zone');
      }
      set((state) => ({ 
        alarmZones: state.alarmZones.filter(zone => zone.id !== id),
      }));
      return true;
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error(`Error deleting alarm zone ${id}:`, message);
       set({ errorAlarmZones: message });
       return false;
    }
  },
  updateAlarmZoneArmedState: async (id, armedState) => {
    try {
      const response = await fetch(`/api/alarm-zones/${id}/arm-state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ armedState })
      });
      const data: ApiResponse<AlarmZone> = await response.json();
       if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to update armed state');
      }
       const partialUpdatedZone = data.data;
       
      // Use produce for safe immutable update
      set(produce((draft: Draft<FusionState>) => {
          const zoneIndex = draft.alarmZones.findIndex(zone => zone.id === id);
          if (zoneIndex !== -1) {
              // Merge the new armedState into the existing zone object
              draft.alarmZones[zoneIndex] = { 
                  ...draft.alarmZones[zoneIndex], // Keep existing properties
                  armedState: partialUpdatedZone.armedState // Update only the armed state
              };
          }
      }));
      
      const finalUpdatedZone = get().alarmZones.find(zone => zone.id === id);
      return finalUpdatedZone || null; 

    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error(`Error updating armed state for ${id}:`, message);
       set({ errorAlarmZones: message });
       return null;
    }
  },
  assignDeviceToAlarmZone: async (zoneId, deviceId) => {
     try {
        const response = await fetch(`/api/alarm-zones/${zoneId}/devices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceIds: [deviceId] })
        });
        const data: ApiResponse<{ zoneId: string, deviceIds: string[] }> = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to assign device to alarm zone');
        }
        // Don't refetch here - let bulk operations handle the refresh
        return true;
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error(`Error assigning device ${deviceId} to alarm zone ${zoneId}:`, message);
       set({ errorAlarmZones: message });
       return false;
    }
  },
  removeDeviceFromAlarmZone: async (zoneId, deviceId) => {
    try {
         const response = await fetch(`/api/alarm-zones/${zoneId}/devices`, {
           method: 'DELETE',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ deviceIds: [deviceId] })
         });
        const data: ApiResponse<{ zoneId: string, deviceIds: string[] }> = await response.json();
         if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to remove device from alarm zone');
        }
        // Don't refetch here - let bulk operations handle the refresh
        return true;
    } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error';
       console.error(`Error removing device ${deviceId} from alarm zone ${zoneId}:`, message);
       set({ errorAlarmZones: message });
       return false;
    }
  },
  
  // --- Bulk Alarm Zone Device Assignment Actions ---
  bulkAssignDevicesToAlarmZone: async (zoneId: string, deviceIds: string[]) => {
    try {
      const response = await fetch(`/api/alarm-zones/${zoneId}/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIds })
      });
      const data: ApiResponse<any> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to assign devices to alarm zone');
      }
      // Refresh alarm zones to update device assignments
      await get().fetchAlarmZones();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error bulk assigning devices to alarm zone ${zoneId}:`, message);
      set({ errorAlarmZones: message });
      return false;
    }
  },
  
  bulkRemoveDevicesFromAlarmZone: async (zoneId: string, deviceIds: string[]) => {
    try {
      const response = await fetch(`/api/alarm-zones/${zoneId}/devices`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIds })
      });
      const data: ApiResponse<any> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove devices from alarm zone');
      }
      // Refresh alarm zones to update device assignments
      await get().fetchAlarmZones();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error bulk removing devices from alarm zone ${zoneId}:`, message);
      set({ errorAlarmZones: message });
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
      
      const fetchedDevices = data.data || [];
      
      // Update allDevices first
      set({ allDevices: fetchedDevices, isLoadingAllDevices: false });
      console.log('[FusionStore] All devices loaded into state:', fetchedDevices.length);
      
      // Now populate deviceStates from the fetched devices
      console.log(`[Store] Populating deviceStates from ${fetchedDevices.length} fetched devices`);
      
      // Create device state entries for all fetched devices
      const newDeviceStates = new Map<string, DeviceStateInfo>();
      
      fetchedDevices.forEach(device => {
        const key = `${device.connectorId}:${device.deviceId}`;
        const deviceTypeInfo = getDeviceTypeInfo(device.connectorCategory || 'unknown', device.type);
        
        const deviceState: DeviceStateInfo = {
          connectorId: device.connectorId,
          deviceId: device.deviceId,
          deviceInfo: deviceTypeInfo,
          displayState: device.displayState,
          lastSeen: new Date(), // Set to now since we just fetched
          name: device.name ?? undefined,
          model: device.model ?? undefined,
          vendor: device.vendor ?? undefined,
          url: device.url ?? undefined,
          rawType: device.type,
          serverId: device.serverId ?? undefined,
          serverName: device.serverName ?? undefined,
          pikoServerDetails: device.pikoServerDetails,
        };
        
        newDeviceStates.set(key, deviceState);
      });
      
      // Update deviceStates with the populated map
      set({ deviceStates: newDeviceStates });
      console.log(`[Store] Populated deviceStates with ${newDeviceStates.size} devices`);
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error fetching all devices:", message);
      set({ isLoadingAllDevices: false, errorAllDevices: message, allDevices: [] });
    }
  },

  // NEW: Fetch dashboard events
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
      const baseUrl = process.env.APP_URL || '';
      // 2. Make API Call
      const response = await fetch(`${baseUrl}/api/devices/${internalDeviceId}/state`, {
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

  // --- NEW: Arming Schedule Actions ---
  fetchArmingSchedules: async () => {
    set({ isLoadingArmingSchedules: true, errorArmingSchedules: null });
    try {
      const response = await fetch('/api/alarm/arming-schedules');
      const data: ApiResponse<ArmingSchedule[]> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch arming schedules');
      }
      // Convert date strings to Date objects if necessary, API might already do this
      const schedulesWithDates = (data.data || []).map(schedule => ({
        ...schedule,
        createdAt: new Date(schedule.createdAt),
        updatedAt: new Date(schedule.updatedAt),
      }));
      set({ armingSchedules: schedulesWithDates, isLoadingArmingSchedules: false });
      console.log('[FusionStore] Arming schedules loaded:', schedulesWithDates.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error fetching arming schedules:", message);
      set({ isLoadingArmingSchedules: false, errorArmingSchedules: message, armingSchedules: [] });
    }
  },

  addArmingSchedule: async (scheduleData) => {
    try {
      const response = await fetch('/api/alarm/arming-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleData),
      });
      
      const data: ApiResponse<ArmingSchedule> = await response.json();
      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to create arming schedule');
      }
      
      set((state) => ({
        armingSchedules: [...state.armingSchedules, data.data!].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      
      toast.success('Arming schedule created successfully');
      return data.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error creating arming schedule:', message);
      toast.error(`Failed to create arming schedule: ${message}`);
      return null;
    }
  },

  updateArmingSchedule: async (id, scheduleData) => {
    try {
      const response = await fetch(`/api/alarm/arming-schedules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleData),
      });
      
      const data: ApiResponse<ArmingSchedule> = await response.json();
      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to update arming schedule');
      }
      
      set((state) => ({
        armingSchedules: state.armingSchedules.map(schedule => 
          schedule.id === id ? data.data! : schedule
        ).sort((a, b) => a.name.localeCompare(b.name)),
      }));
      
      toast.success('Arming schedule updated successfully');
      return data.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error updating arming schedule ${id}:`, message);
      toast.error(`Failed to update arming schedule: ${message}`);
      return null;
    }
  },

  deleteArmingSchedule: async (id) => {
    const loadingToastId = toast.loading('Deleting arming schedule...');
    try {
      const response = await fetch(`/api/alarm/arming-schedules/${id}`, {
        method: 'DELETE',
      });
      
      const data: ApiResponse<{ id: string }> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete arming schedule');
      }
      
      set((state) => ({
        armingSchedules: state.armingSchedules.filter(schedule => schedule.id !== id),
      }));
      
      toast.success('Arming schedule deleted successfully');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error deleting arming schedule ${id}:`, message);
      toast.error(`Failed to delete arming schedule: ${message}`);
      return false;
    } finally {
      toast.dismiss(loadingToastId);
    }
  },

  // --- NEW: Keypad PIN Management Actions ---
  setPinStatus: (userId: string, hasPin: boolean, setAt?: Date | null) => 
    set(produce((draft: Draft<FusionState>) => {
      draft.pinStates.set(userId, { 
        hasPin, 
        setAt: setAt || (hasPin ? new Date() : null) 
      });
    })),

  getPinStatus: (userId: string) => {
    const state = get().pinStates.get(userId);
    return state || { hasPin: false, setAt: null };
  },

  setUserPin: async (userId: string, pin: string) => {
    const loadingToastId = toast.loading('Setting user PIN...');
    try {
      const response = await fetch(`/api/users/${userId}/keypad-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      
      const data: ApiResponse<{ userId: string }> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to set PIN');
      }
      
      // Update PIN state immediately
      get().setPinStatus(userId, true);
      
      // Trigger user list refresh to update UI
      get().triggerUserListRefresh();
      toast.success('PIN set successfully');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error setting PIN for user ${userId}:`, message);
      toast.error(`Failed to set PIN: ${message}`);
      return false;
    } finally {
      toast.dismiss(loadingToastId);
    }
  },

  removeUserPin: async (userId: string) => {
    const loadingToastId = toast.loading('Removing user PIN...');
    try {
      const response = await fetch(`/api/users/${userId}/keypad-pin`, {
        method: 'DELETE',
      });
      
      const data: ApiResponse<{ userId: string }> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove PIN');
      }
      
      // Update PIN state immediately
      get().setPinStatus(userId, false);
      
      // Trigger user list refresh to update UI
      get().triggerUserListRefresh();
      toast.success('PIN removed successfully');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error removing PIN for user ${userId}:`, message);
      toast.error(`Failed to remove PIN: ${message}`);
      return false;
    } finally {
      toast.dismiss(loadingToastId);
    }
  },

  validatePin: async (pin: string) => {
    try {
      const response = await fetch('/api/alarm/keypad/validate-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      
      const data: ApiResponse<{ 
        valid: boolean; 
        userId?: string;
      }> = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to validate PIN');
      }
      
      return {
        valid: data.data?.valid || false,
        userId: data.data?.userId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error validating PIN:', message);
      return { valid: false, userId: undefined };
    }
  },

  // --- NEW: Organization Actions ---
  fetchOrganizations: async () => {
    set({ isLoadingOrganizations: true, errorOrganizations: null });
    try {
      const response = await authClient.organization.list();
      if (response.error) {
        throw new Error(response.error.message || 'Failed to fetch organizations');
      }
      // Better Auth returns organizations in response.data
      const organizations = response.data || [];
      // Sort organizations alphabetically by name
      const sortedOrganizations = organizations.sort((a, b) => a.name.localeCompare(b.name));
      set({ organizations: sortedOrganizations, isLoadingOrganizations: false });
      console.log('[FusionStore] Organizations loaded via Better Auth:', sortedOrganizations.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error fetching organizations:", message);
      set({ isLoadingOrganizations: false, errorOrganizations: message, organizations: [] });
    }
  },

  createOrganization: async (data: NewOrganizationData) => {
    try {
      const response = await authClient.organization.create({
        name: data.name,
        slug: data.slug,
        logo: data.logo || undefined,
      });
      
      if (response.error) {
        throw new Error(response.error.message || 'Failed to create organization');
      }
      
      const newOrg = response.data;
      if (newOrg) {
        set((state) => ({
          organizations: [...state.organizations, newOrg].sort((a, b) => a.name.localeCompare(b.name)),
        }));
        toast.success('Organization created successfully');
        return newOrg;
      }
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error creating organization:', message);
      toast.error(`Failed to create organization: ${message}`);
      return null;
    }
  },

  updateOrganization: async (id: string, updateData: Partial<NewOrganizationData>) => {
    try {
      const response = await authClient.organization.update({
        organizationId: id,
        data: updateData,
      });
      
      if (response.error) {
        throw new Error(response.error.message || 'Failed to update organization');
      }
      
      const updatedOrg = response.data;
      if (updatedOrg) {
        set((state) => ({
          organizations: state.organizations.map(org => 
            org.id === id ? { ...org, ...updatedOrg } : org
          ).sort((a, b) => a.name.localeCompare(b.name)),
        }));
        toast.success('Organization updated successfully');
        return updatedOrg;
      }
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error updating organization ${id}:`, message);
      toast.error(`Failed to update organization: ${message}`);
      return null;
    }
  },

  deleteOrganization: async (id: string) => {
    const loadingToastId = toast.loading('Deleting organization...');
    try {
      const response = await authClient.organization.delete({
        organizationId: id,
      });
      
      if (response.error) {
        throw new Error(response.error.message || 'Failed to delete organization');
      }
      
      set((state) => ({
        organizations: state.organizations.filter(org => org.id !== id),
      }));
      toast.success('Organization deleted successfully');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error deleting organization ${id}:`, message);
      toast.error(`Failed to delete organization: ${message}`);
      return false;
    } finally {
      toast.dismiss(loadingToastId);
    }
  },

  // --- NEW: Organization Member Actions ---
  fetchOrganizationMembers: async (organizationId?: string) => {
    set({ isLoadingMembers: true, errorMembers: null });
    try {
      const response = await fetch('/api/organizations/members', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: organizationId ? JSON.stringify({ organizationId }) : undefined,
      });
      const data: ApiResponse<OrganizationMember[]> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch organization members');
      }
      set({ organizationMembers: data.data || [], isLoadingMembers: false });
      console.log('[FusionStore] Organization members loaded into state:', data.data?.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error fetching organization members:", message);
      set({ isLoadingMembers: false, errorMembers: message, organizationMembers: [] });
    }
  },

  inviteMember: async (email: string, role: string, organizationId?: string) => {
    try {
      const response = await fetch('/api/organizations/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role, organizationId }),
      });
      const data: ApiResponse<OrganizationInvitation> = await response.json();
      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to invite member');
      }
      set((state) => ({
        organizationInvitations: [...state.organizationInvitations, data.data!].sort((a, b) => a.email.localeCompare(b.email)),
      }));
      toast.success('Member invited successfully');
      return data.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error inviting member:', message);
      toast.error(`Failed to invite member: ${message}`);
      return null;
    }
  },

  updateMemberRole: async (memberId: string, role: string) => {
    try {
      const response = await fetch(`/api/organizations/members/${memberId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const result: ApiResponse<OrganizationMember> = await response.json();
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || 'Failed to update member role');
      }
      set((state) => ({
        organizationMembers: state.organizationMembers.map(member => 
          member.id === memberId ? result.data! : member
        ).sort((a, b) => (a.user?.email || '').localeCompare(b.user?.email || '')),
      }));
      toast.success('Member role updated successfully');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error updating member role: ${message}`);
      toast.error(`Failed to update member role: ${message}`);
      return false;
    }
  },

  removeMember: async (memberIdOrEmail: string, organizationId?: string) => {
    try {
      const response = await fetch('/api/organizations/members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIdOrEmail, organizationId }),
      });
      const result: ApiResponse<{ removed: boolean }> = await response.json();
      if (!response.ok || !result.success || !result.data?.removed) {
        throw new Error(result.error || 'Failed to remove member');
      }
      set((state) => ({
        organizationMembers: state.organizationMembers.filter(member => 
          member.id !== memberIdOrEmail && member.user?.email !== memberIdOrEmail
        ).sort((a, b) => (a.user?.email || '').localeCompare(b.user?.email || '')),
      }));
      toast.success('Member removed successfully');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error removing member: ${message}`);
      toast.error(`Failed to remove member: ${message}`);
      return false;
    }
  },

  // --- NEW: Organization Invitation Actions ---
  fetchOrganizationInvitations: async (organizationId?: string) => {
    set({ isLoadingInvitations: true, errorInvitations: null });
    try {
      const response = await fetch('/api/organizations/invitations', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: organizationId ? JSON.stringify({ organizationId }) : undefined,
      });
      const data: ApiResponse<OrganizationInvitation[]> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch organization invitations');
      }
      set({ organizationInvitations: data.data || [], isLoadingInvitations: false });
      console.log('[FusionStore] Organization invitations loaded into state:', data.data?.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error fetching organization invitations:", message);
      set({ isLoadingInvitations: false, errorInvitations: message, organizationInvitations: [] });
    }
  },

  acceptInvitation: async (invitationId: string) => {
    try {
      const response = await fetch('/api/organizations/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId }),
      });
      const result: ApiResponse<{ accepted: boolean }> = await response.json();
      if (!response.ok || !result.success || !result.data?.accepted) {
        throw new Error(result.error || 'Failed to accept invitation');
      }
      set((state) => ({
        organizationInvitations: state.organizationInvitations.filter(inv => inv.id !== invitationId),
      }));
      toast.success('Invitation accepted successfully');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error accepting invitation: ${message}`);
      toast.error(`Failed to accept invitation: ${message}`);
      return false;
    }
  },

  cancelInvitation: async (invitationId: string) => {
    try {
      const response = await fetch('/api/organizations/invitations/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId }),
      });
      const result: ApiResponse<{ canceled: boolean }> = await response.json();
      if (!response.ok || !result.success || !result.data?.canceled) {
        throw new Error(result.error || 'Failed to cancel invitation');
      }
      set((state) => ({
        organizationInvitations: state.organizationInvitations.filter(inv => inv.id !== invitationId),
      }));
      toast.success('Invitation canceled successfully');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error canceling invitation: ${message}`);
      toast.error(`Failed to cancel invitation: ${message}`);
      return false;
    }
  },

  rejectInvitation: async (invitationId: string) => {
    try {
      const response = await fetch('/api/organizations/invitations/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId }),
      });
      const result: ApiResponse<{ rejected: boolean }> = await response.json();
      if (!response.ok || !result.success || !result.data?.rejected) {
        throw new Error(result.error || 'Failed to reject invitation');
      }
      set((state) => ({
        organizationInvitations: state.organizationInvitations.filter(inv => inv.id !== invitationId),
      }));
      toast.success('Invitation rejected successfully');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error rejecting invitation: ${message}`);
      toast.error(`Failed to reject invitation: ${message}`);
      return false;
    }
  },

  // --- NEW: Active Organization Actions ---
  setActiveOrganizationId: (organizationId: string | null) => {
    const currentOrgId = get().activeOrganizationId;
    
    // Only clear data if organization actually changed
    if (currentOrgId !== organizationId) {
      console.log(`[Store] Organization changed from ${currentOrgId} to ${organizationId} - clearing scoped data`);
      
      set({
        activeOrganizationId: organizationId,
        // Clear organization-scoped data
        connectors: [],
        locations: [],
        spaces: [],
        alarmZones: [],
        allDevices: [],
        deviceStates: new Map(), // Clear device states map
        armingSchedules: [],
        dashboardEvents: [],
        organizationMembers: [],
        organizationInvitations: [],
        automations: [], // NEW: Clear automations
        // Reset loading states
        isLoading: false,
        isLoadingLocations: false,
        isLoadingSpaces: false,
        isLoadingAlarmZones: false,
        isLoadingAllDevices: false,
        isLoadingArmingSchedules: false,
        isLoadingDashboardEvents: false,
        isLoadingMembers: false,
        isLoadingInvitations: false,
        isLoadingAutomations: false, // NEW: Reset automations loading
        isLoadingOpenAi: false, // NEW: Reset OpenAI loading
        // Clear errors
        error: null,
        errorLocations: null,
        errorSpaces: null,
        errorAlarmZones: null,
        errorAllDevices: null,
        errorArmingSchedules: null,
        errorDashboardEvents: null,
        errorMembers: null,
        errorInvitations: null,
        errorAutomations: null, // NEW: Clear automations error
        errorOpenAi: null, // NEW: Clear OpenAI error
        // Reset OpenAI state
        openAiEnabled: false, // NEW: Reset OpenAI enabled state
      });
      
      // Auto-refetch data for new organization if we have one
      if (organizationId) {
        console.log(`[Store] Auto-refetching data for organization ${organizationId}`);
        // Trigger refetch of all organization-scoped data
        get().fetchConnectors();
        get().fetchLocations();
        get().fetchSpaces();
        get().fetchAlarmZones();
        get().fetchAllDevices(); // This now also populates deviceStates
        get().fetchArmingSchedules();
        get().fetchDashboardEvents();
        get().fetchAutomations(); // NEW: Fetch automations
        get().fetchOpenAiStatus(); // NEW: Fetch OpenAI status
      }
    } else {
      // Same organization, just update the ID (shouldn't happen but safe)
      set({ activeOrganizationId: organizationId });
    }
  },

  // --- NEW: Automations Actions ---
  fetchAutomations: async () => {
    set({ isLoadingAutomations: true, errorAutomations: null });
    try {
      const response = await fetch('/api/automations');
      const data: ApiResponse<Automation[]> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch automations');
      }
      set({ automations: data.data || [], isLoadingAutomations: false });
      console.log('[FusionStore] Automations loaded:', data.data?.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error fetching automations:", message);
      set({ isLoadingAutomations: false, errorAutomations: message, automations: [] });
    }
  },

  createAutomation: async (data: NewAutomationData) => {
    try {
      const response = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result: ApiResponse<Automation> = await response.json();
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || 'Failed to create automation');
      }
      const newAutomation = result.data;
      set((state) => ({ 
        automations: [...state.automations, newAutomation].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      toast.success('Automation created successfully');
      return newAutomation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error creating automation:', message);
      toast.error(`Failed to create automation: ${message}`);
      set({ errorAutomations: message });
      return null;
    }
  },

  updateAutomation: async (id: string, data: Partial<NewAutomationData>) => {
    try {
      const response = await fetch(`/api/automations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result: ApiResponse<Automation> = await response.json();
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || 'Failed to update automation');
      }
      const updatedAutomation = result.data;
      set((state) => ({ 
        automations: state.automations.map(automation => 
          automation.id === id ? updatedAutomation : automation
        ).sort((a, b) => a.name.localeCompare(b.name)),
      }));
      toast.success('Automation updated successfully');
      return updatedAutomation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error updating automation ${id}:`, message);
      toast.error(`Failed to update automation: ${message}`);
      set({ errorAutomations: message });
      return null;
    }
  },

  deleteAutomation: async (id: string) => {
    const loadingToastId = toast.loading('Deleting automation...');
    try {
      const response = await fetch(`/api/automations/${id}`, { method: 'DELETE' });
      const result: ApiResponse<{ id: string }> = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete automation');
      }
      set((state) => ({ 
        automations: state.automations.filter(automation => automation.id !== id),
      }));
      toast.success('Automation deleted successfully');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error deleting automation ${id}:`, message);
      toast.error(`Failed to delete automation: ${message}`);
      set({ errorAutomations: message });
      return false;
    } finally {
      toast.dismiss(loadingToastId);
    }
  },

  cloneAutomation: async (id: string) => {
    const loadingToastId = toast.loading('Cloning automation...');
    try {
      const response = await fetch(`/api/automations/${id}/clone`, { 
        method: 'POST' 
      });
      const result: ApiResponse<Automation> = await response.json();
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || 'Failed to clone automation');
      }
      const clonedAutomation = result.data;
      set((state) => ({ 
        automations: [...state.automations, clonedAutomation].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      toast.success('Automation cloned successfully');
      return clonedAutomation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error cloning automation ${id}:`, message);
      toast.error(`Failed to clone automation: ${message}`);
      set({ errorAutomations: message });
      return null;
    } finally {
      toast.dismiss(loadingToastId);
    }
  },

  // --- NEW: OpenAI Service Actions ---
  fetchOpenAiStatus: async () => {
    set({ isLoadingOpenAi: true, errorOpenAi: null });
    try {
      const response = await fetch('/api/services/openai/status');
      const data: ApiResponse<{ enabled: boolean }> = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch OpenAI status');
      }
      
      const enabled = data.data?.enabled || false;
      set({ openAiEnabled: enabled, isLoadingOpenAi: false });
      console.log('[FusionStore] OpenAI status updated - enabled:', enabled);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[FusionStore] Error fetching OpenAI status:', message);
      set({ isLoadingOpenAi: false, errorOpenAi: message, openAiEnabled: false });
    }
  },

})); 

// --- NEW: Organization Types ---
export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: Date;
  // Better Auth may not have updatedAt, so making it optional
  updatedAt?: Date;
  // Better Auth includes members array
  members?: Array<{
    id: string;
    userId: string;
    organizationId: string;
    role: string;
    createdAt: Date;
    teamId?: string;
  }>;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  organizationId: string;
  role: string; // owner, admin, member
  createdAt: Date;
  updatedAt: Date;
  user?: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

export interface OrganizationInvitation {
  id: string;
  email: string;
  inviterId: string;
  organizationId: string;
  role: string;
  status: string; // pending, accepted, rejected, expired
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  inviter?: {
    name: string | null;
    email: string;
  };
  organization?: {
    name: string;
  };
}

export interface NewOrganizationData {
  name: string;
  slug: string;
  logo?: string;
} 