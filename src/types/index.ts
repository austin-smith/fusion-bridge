// Common interfaces used throughout the application
import { TypedDeviceInfo } from '@/lib/mappings/definitions';

// Connector type for the database entities
export interface Connector {
  id: string;
  category: string;
  name: string;
  cfg_enc: string;
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

export interface DeviceWithConnector {
  deviceId: string;
  connectorId: string;
  connectorName: string;
  connectorCategory: string;
  name: string;
  type: string;
  status: string | null;
  serverId?: string;
  serverName?: string;
  model?: string;
  vendor?: string;
  url?: string;
  pikoServerDetails?: PikoServer;
  associationCount?: number | null;
  deviceTypeInfo: TypedDeviceInfo;
}

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

// You can add other shared types here as needed 