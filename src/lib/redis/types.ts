/**
 * Types for Redis pub/sub event messages and SSE streaming
 */

import type { StandardizedEvent } from '@/types/events';

/**
 * Event message format published to Redis channels
 */
export interface RedisEventMessage {
  eventUuid: string;
  timestamp: string;
  organizationId: string;
  category: string;
  type: string;
  subtype?: string;
  deviceId: string;
  deviceName?: string;
  connectorId: string;
  connectorName?: string;
  locationId?: string;
  locationName?: string;
  areaId?: string;
  areaName?: string;
  payload: any;
  rawPayload?: any;
}

/**
 * SSE message types
 */
export type SSEMessageType = 'connection' | 'event' | 'heartbeat' | 'error' | 'system';

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
 * Redis channel naming convention
 */
export function getEventChannelName(organizationId: string): string {
  return `events:${organizationId}`;
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