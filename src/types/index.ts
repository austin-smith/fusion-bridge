// Common interfaces used throughout the application
import { TypedDeviceInfo } from '@/lib/mappings/definitions';
import { ArmedState } from '@/lib/mappings/definitions'; // <-- Import the enum
import { DisplayState } from '@/lib/mappings/definitions'; // <-- Import DisplayState
import type { FloorPlanData } from '@/lib/storage/file-storage';

// Connector type for the database entities
export interface Connector {
  id: string;
  category: string;
  name: string;
  cfg_enc: string;
  organizationId: string | null;
  createdAt: Date;
  eventsEnabled: boolean;
}

// Driver configuration types
export interface YoLinkConfigRaw {
  apiKey: string;
  secretKey: string;
  region?: string;
}

export interface PikoConfigRaw {
  type: 'local' | 'cloud';
  url?: string;
  username: string;
  password: string;
}

// Connector with decoded configuration
export interface ConnectorWithConfig<T = unknown> extends Omit<Connector, 'cfg_enc'> {
  config: T;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Device type from the database, potentially augmented with connector info
// (Adjust based on actual usage, e.g., in API responses or store)
export type DeviceWithConnector = {
  id: string;
  deviceId: string;
  connectorId: string;
  connectorCategory: string;
  connectorName?: string;
  name: string;
  type: string;
  status?: string | null;
  batteryPercentage?: number | null;
  vendor?: string | null;
  model?: string | null;
  url?: string | null;
  createdAt: Date;
  updatedAt: Date;
  serverId?: string | null;
  serverName?: string | null;
  pikoServerDetails?: any | null;
  locationId?: string | null; 
  rawDeviceData?: Record<string, unknown> | null;
  deviceTypeInfo?: TypedDeviceInfo;
  displayState?: DisplayState;
  spaceId?: string | null;
  spaceName?: string | null;
};

// Device overlay types for floor plan positioning
export type {
  DeviceOverlayPosition,
  DeviceOverlayData,
  CreateDeviceOverlayPayload,
  UpdateDeviceOverlayPayload,
  DeviceOverlayWithDevice,
  CanvasCoordinates,
  CanvasDimensions
} from './device-overlay';

export {
  normalizedToCanvas,
  canvasToNormalized,
  isValidNormalizedCoordinate
} from './device-overlay';

// Interface for Piko Server details (based on DB schema)
export interface PikoServer {
  serverId: string;
  connectorId: string;
  name: string;
  status: string | null;
  version: string | null;
  osPlatform: string | null;
  osVariantVersion: string | null;
  url: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Represents a physical location in the hierarchy
export interface Location {
  id: string;
  parentId: string | null; // UUID of the parent location, or null for root
  name: string;
  path: string; // Materialized path (e.g., "rootId.childId.grandchildId")
  timeZone: string; // Added: IANA Time Zone (e.g., "America/New_York")
  externalId?: string | null; // Added: Optional external identifier
  addressStreet: string; // Updated: Street address (now required)
  addressCity: string; // Updated: City (now required)
  addressState: string; // Updated: State/Province (now required)
  addressPostalCode: string; // Updated: Postal/Zip code (now required)
  notes?: string | null; // Added: Optional notes
  latitude?: string | null;
  longitude?: string | null;
  sunriseTime?: string | null; // "HH:mm" format in local timezone
  sunsetTime?: string | null;  // "HH:mm" format in local timezone
  sunTimesUpdatedAt?: Date | null;
  floorPlan?: FloorPlanData | null; // Floor plan metadata
  createdAt: Date;
  updatedAt: Date;
  activeArmingScheduleId?: string | null;
  // Optional: Populated for hierarchical display, not stored directly in DB table this way
  children?: Location[];
}



export interface ArmingSchedule {
  id: string;
  name: string;
  daysOfWeek: number[]; // 0 (Sun) to 6 (Sat)
  armTimeLocal: string; // HH:mm format
  disarmTimeLocal: string; // HH:mm format
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Represents a physical space where devices coexist
export interface Space {
  id: string;
  locationId: string;
  name: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
  
  // Optional: Populated for display, not stored directly in DB
  location?: Location | null;
  deviceIds?: string[]; // IDs of devices in this space
  devices?: DeviceWithConnector[]; // Full device details (optional population)
}

// Represents a logical alarm zone for security management
export interface AlarmZone {
  id: string;
  locationId: string;
  name: string;
  description?: string | null;
  armedState: ArmedState;
  lastArmedStateChangeReason?: string | null;
  triggerBehavior: 'standard' | 'custom';
  createdAt: Date;
  updatedAt: Date;
  
  // Optional: Populated for display, not stored directly in DB
  location?: Location | null;
  deviceIds?: string[]; // IDs of devices in this zone
  devices?: DeviceWithConnector[]; // Full device details (optional population)
  triggerOverrides?: AlarmZoneTriggerOverride[]; // Custom trigger rules
}

// Represents a custom trigger override for an alarm zone
export interface AlarmZoneTriggerOverride {
  id: string;
  zoneId: string;
  eventType: string; // EventType enum value
  shouldTrigger: boolean;
  createdAt: Date;
}

export interface CreateTriggerOverrideData {
  eventType: string;
  shouldTrigger: boolean;
}

// Represents an audit log entry for alarm zone actions
export interface AlarmZoneAuditLogEntry {
  id: string;
  zoneId: string;
  userId?: string | null;
  action: 'armed' | 'disarmed' | 'triggered' | 'acknowledged';
  previousState?: ArmedState | null;
  newState?: ArmedState | null;
  reason?: string | null;
  triggerEventId?: string | null;
  createdAt: Date;
  
  // Optional: Populated for display
  zone?: AlarmZone | null;
  user?: { id: string; name?: string | null; email: string } | null;
}

// ====================================
// RE-EXPORTS FOR CONVENIENCE
// ====================================

// Re-export commonly used types from definitions
export type { TypedDeviceInfo, ArmedState, DisplayState } from '@/lib/mappings/definitions';

// Re-export from existing type files
export * from './events';
export * from './automation-thumbnails';
export * from './ai/openai-service-types';
export * from './ai/chat-types'; 