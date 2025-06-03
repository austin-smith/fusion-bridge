// Common interfaces used throughout the application
import { TypedDeviceInfo } from '@/lib/mappings/definitions';
import { ArmedState } from '@/lib/mappings/definitions'; // <-- Import the enum
import { DisplayState } from '@/lib/mappings/definitions'; // <-- Import DisplayState
// import { ConnectorCategory } from '@/lib/mappings/connector-categories'; // <-- Removed potentially incorrect import
// import { PikoServer } from './piko'; // <-- Removed potentially incorrect import
import { YoLinkConfig } from '@/services/drivers/yolink'; // Example config type
// import { NetboxConfig } from '@/services/drivers/netbox'; // <-- Removed potentially incorrect import

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
  areaId?: string | null;
  locationId?: string | null; 
  associationCount?: number | null;
  deviceTypeInfo?: TypedDeviceInfo;
  displayState?: DisplayState;
};

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
  createdAt: Date;
  updatedAt: Date;
  activeArmingScheduleId?: string | null;
  // Optional: Populated for hierarchical display, not stored directly in DB table this way
  children?: Location[];
  areas?: Area[]; // Areas directly within this location (optional population)
}

// Represents a security partition (Area)
export interface Area {
  id: string;
  locationId: string;
  name: string;
  armedState: ArmedState; // <-- Use imported Enum
  createdAt: Date;
  updatedAt: Date;
  overrideArmingScheduleId?: string | null;
  nextScheduledArmTime?: string | null; // ISO date string (as typically used in API responses/Zustand state for dates)
  nextScheduledDisarmTime?: string | null; // ISO date string
  lastArmedStateChangeReason?: string | null;
  isArmingSkippedUntil?: string | null; // ISO date string
  locationName?: string; // Convenience field, often populated from a join

  // Optional: Populated for display, not stored directly in DB table this way
  location?: Location | null; // The parent location details
  deviceIds?: string[]; // IDs of devices assigned to this area
  devices?: DeviceWithConnector[]; // Full device details (optional population)
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

// You can add other shared types here as needed 