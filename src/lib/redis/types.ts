/**
 * Types for Redis pub/sub event messages and SSE streaming
 */

import type { StandardizedEvent } from '@/types/events';
import type { ArmedState } from '@/lib/mappings/definitions';

/**
 * Event message format published to Redis channels
 */
export interface RedisEventMessage {
  eventUuid: string;
  timestamp: string;
  organizationId: string;
  deviceId: string;
  deviceName?: string;
  connectorId: string;
  connectorName?: string;
  locationId?: string;
  locationName?: string;
  spaceId?: string;
  spaceName?: string;
  alarmZoneId?: string;
  alarmZoneName?: string;
  isAlarmEvent: boolean;
  event: {
    categoryId: string;
    category: string;
    typeId: string;
    type: string;
    subTypeId?: string;
    subType?: string;
    [key: string]: any; // For additional standardized event data like displayState, batteryPercentage, etc.
  };
  rawEvent?: any;
  thumbnailUri?: string; // data URI format: data:image/jpeg;base64,<base64data>
}

/**
 * SSE message types
 */
export type SSEMessageType = 'connection' | 'event' | 'heartbeat' | 'error' | 'system' | 'arming';

/**
 * Base SSE message structure
 */
export interface SSEMessage {
  type: SSEMessageType;
  timestamp: string;
}

/**
 * SSE connection message
 */
export interface SSEConnectionMessage extends SSEMessage {
  type: 'connection';
  organizationId: string;
}

/**
 * SSE heartbeat message
 */
export interface SSEHeartbeatMessage extends SSEMessage {
  type: 'heartbeat';
}

/**
 * SSE error message
 */
export interface SSEErrorMessage extends SSEMessage {
  type: 'error';
  error: string;
  code?: string;
}

/**
 * SSE system message (for Redis connection status)
 */
export interface SSESystemMessage extends SSEMessage {
  type: 'system';
  message: string;
}

/**
 * SSE arming message (for alarm zone armed state changes)
 */
export interface SSEArmingMessage extends SSEMessage {
  type: 'arming';
  organizationId: string;
  alarmZone: {
    id: string;
    name: string;
    locationId: string;
    locationName: string;
    previousState: ArmedState;
    previousStateDisplayName: string;
    currentState: ArmedState;
    currentStateDisplayName: string;
  };
}

/**
 * Redis channel naming convention
 */
export function getEventChannelName(organizationId: string): string {
  return `events:${organizationId}`;
}

/**
 * Redis channel for events with thumbnails
 */
export function getEventThumbnailChannelName(organizationId: string): string {
  return `events:${organizationId}:with-thumbnails`;
}

/**
 * Connection tracking keys
 */
export function getConnectionCountKey(organizationId: string): string {
  return `connections:${organizationId}:count`;
}

export function getApiKeyConnectionsKey(apiKeyId: string): string {
  return `connections:apikey:${apiKeyId}`;
} 