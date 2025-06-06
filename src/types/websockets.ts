import type { connection as WebSocketConnection } from 'websocket';
import type { StandardizedEvent } from '@/types/events';

// Basic connection info for tracking clients
export interface WebSocketClient {
  id: string;
  connection: WebSocketConnection;
  connectedAt: Date;
  lastActivity: Date;
}

// Message types that can be sent to/from clients
export interface WebSocketMessage {
  type: string;
  data?: any;
  timestamp: number;
}

// Authentication message sent to newly connected clients
export interface AuthenticationMessage extends WebSocketMessage {
  type: 'authenticated';
  data: {
    clientId: string;
    userId: string;
    organizationId: string;
    connectedAt: string;
  };
}

// Event message sent to clients when new events occur
export interface EventMessage extends WebSocketMessage {
  type: 'event';
  data: StandardizedEvent;
}

 