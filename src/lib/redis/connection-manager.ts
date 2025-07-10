import 'server-only';
import { getRedisSubClient } from './client';
import { getEventChannelName, getEventThumbnailChannelName, type RedisEventMessage } from './types';

interface SSEConnection {
  id: string;
  organizationId: string;
  controller: ReadableStreamDefaultController;
  eventCategories?: string[];
  eventTypes?: string[];
  connectedAt: Date;
  includeThumbnails?: boolean;
}

class SSEConnectionManager {
  private connections = new Map<string, SSEConnection>();
  private subscribedChannels = new Set<string>();
  private subscriber = getRedisSubClient();
  private initialized = false;
  private hadRedisError = false;

  constructor() {
    this.setupGlobalSubscriber();
  }

  private setupGlobalSubscriber() {
    if (this.initialized) return;
    
    this.subscriber.on('message', (channel: string, message: string) => {
      try {
        // Extract organization ID from channel (handles both regular and thumbnail channels)
        let organizationId: string;
        const isThumbnailChannel = channel.includes(':with-thumbnails');
        
        if (isThumbnailChannel) {
          // Format: events:{orgId}:with-thumbnails
          organizationId = channel.replace('events:', '').replace(':with-thumbnails', '');
        } else {
          // Format: events:{orgId}
          organizationId = channel.replace('events:', '');
        }
        
        const parsedMessage = JSON.parse(message);
        
        // Determine message type
        const messageType = parsedMessage.type;
        
        // Route message to connections based on their channel subscription
        this.connections.forEach((conn) => {
          // Check if connection is for this organization and correct channel type
          if (conn.organizationId === organizationId && 
              conn.includeThumbnails === isThumbnailChannel) {
            let shouldSend = false;
            let sseEventType = 'event';
            
            // Handle different message types
            if (messageType === 'arming') {
              // Arming messages are always sent (no filtering for now)
              shouldSend = true;
              sseEventType = 'arming';
            } else {
              // Legacy event messages
              const event = parsedMessage as RedisEventMessage;
              shouldSend = this.shouldSendEvent(conn, event);
              sseEventType = 'event';
            }
            
            if (shouldSend) {
              try {
                const encoder = new TextEncoder();
                conn.controller.enqueue(encoder.encode(this.formatSSE(parsedMessage, sseEventType)));
              } catch (error) {
                // Connection likely closed, will be cleaned up later
                console.warn(`[SSE Manager] Failed to send to connection ${conn.id}:`, error);
              }
            }
          }
        });
      } catch (error) {
        console.error('[SSE Manager] Error processing Redis message:', error);
      }
    });

    this.subscriber.on('error', (err) => {
      this.handleRedisDisconnect('error', err);
    });

    this.subscriber.on('end', () => {
      this.handleRedisDisconnect('end');
    });

    this.subscriber.on('close', () => {
      this.handleRedisDisconnect('close');
    });

    this.subscriber.on('ready', () => {
      console.log('[SSE Manager] Redis subscriber ready');
      
      // If we previously had an error, notify about restoration
      if (this.hadRedisError) {
        this.hadRedisError = false;
        this.broadcastSystemMessage('Redis connection restored');
      }
      
      // Resubscribe to all channels
      if (this.subscribedChannels.size > 0) {
        this.subscriber.subscribe(...Array.from(this.subscribedChannels));
      }
    });

    this.initialized = true;
  }

  private handleRedisDisconnect(event: string, error?: any) {
    // Only log and notify on the first error to avoid spam
    if (!this.hadRedisError) {
      if (error) {
        console.error(`[SSE Manager] Redis ${event}:`, error);
      } else {
        console.error(`[SSE Manager] Redis ${event}`);
      }
      this.hadRedisError = true;
      this.broadcastSystemMessage('Redis connection lost - attempting reconnect...');
    }
  }

  private shouldSendEvent(conn: SSEConnection, event: RedisEventMessage): boolean {
    // Apply event category filter
    if (conn.eventCategories && !conn.eventCategories.includes(event.event.category)) {
      return false;
    }
    
    // Apply event type filter
    if (conn.eventTypes && !conn.eventTypes.includes(event.event.type)) {
      return false;
    }
    
    return true;
  }

  private formatSSE(data: any, event?: string): string {
    const lines: string[] = [];
    if (event) lines.push(`event: ${event}`);
    lines.push(`data: ${JSON.stringify(data)}`);
    lines.push('', ''); // Double newline to end message
    return lines.join('\n');
  }

  private broadcastSystemMessage(message: string) {
    const systemMessage = {
      type: 'system',
      message,
      timestamp: new Date().toISOString()
    };

    const encoder = new TextEncoder();
    this.connections.forEach((conn) => {
      try {
        conn.controller.enqueue(encoder.encode(this.formatSSE(systemMessage, 'system')));
      } catch (error) {
        // Connection likely closed
      }
    });
  }

  async addConnection(connection: SSEConnection): Promise<void> {
    this.connections.set(connection.id, connection);
    
    // Determine which channel to subscribe to based on thumbnail preference
    const channel = connection.includeThumbnails 
      ? getEventThumbnailChannelName(connection.organizationId)
      : getEventChannelName(connection.organizationId);
    
    // Subscribe to organization channel if not already subscribed
    if (!this.subscribedChannels.has(channel)) {
      await this.subscriber.subscribe(channel);
      this.subscribedChannels.add(channel);
      console.log(`[SSE Manager] Subscribed to channel: ${channel}`);
    }
    
    console.log(`[SSE Manager] Added connection ${connection.id} for org ${connection.organizationId} (thumbnails: ${connection.includeThumbnails || false}, total: ${this.connections.size})`);
  }

  async removeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    this.connections.delete(connectionId);
    
    // Determine which channel this connection was using
    const channel = connection.includeThumbnails 
      ? getEventThumbnailChannelName(connection.organizationId)
      : getEventChannelName(connection.organizationId);
    
    // Check if any other connections need this specific channel
    const hasOtherConnections = Array.from(this.connections.values())
      .some(conn => 
        conn.organizationId === connection.organizationId && 
        conn.includeThumbnails === connection.includeThumbnails
      );
    
    // Unsubscribe if no other connections for this organization and thumbnail preference
    if (!hasOtherConnections && this.subscribedChannels.has(channel)) {
      await this.subscriber.unsubscribe(channel);
      this.subscribedChannels.delete(channel);
      console.log(`[SSE Manager] Unsubscribed from channel: ${channel}`);
    }
    
    console.log(`[SSE Manager] Removed connection ${connectionId} (total: ${this.connections.size})`);
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getConnectionCountByOrganization(organizationId: string): number {
    return Array.from(this.connections.values())
      .filter(conn => conn.organizationId === organizationId).length;
  }

  getStats() {
    const stats = new Map<string, number>();
    this.connections.forEach((conn) => {
      const current = stats.get(conn.organizationId) || 0;
      stats.set(conn.organizationId, current + 1);
    });
    
    return {
      totalConnections: this.connections.size,
      subscribedChannels: this.subscribedChannels.size,
      organizationStats: Object.fromEntries(stats)
    };
  }

  // For graceful shutdown
  async notifyShutdown(reconnectDelayMs: number = 5000): Promise<void> {
    const shutdownMessage = {
      type: 'system',
      message: `Server restarting - reconnect in ${reconnectDelayMs}ms`,
      timestamp: new Date().toISOString()
    };

    const encoder = new TextEncoder();
    const promises: Promise<void>[] = [];

    this.connections.forEach((conn) => {
      promises.push(
        new Promise((resolve) => {
          try {
            conn.controller.enqueue(encoder.encode(this.formatSSE(shutdownMessage, 'system')));
          } catch (error) {
            // Connection already closed
          }
          resolve();
        })
      );
    });

    await Promise.all(promises);
    console.log(`[SSE Manager] Notified ${this.connections.size} connections of shutdown`);
  }
}

// Export singleton instance
export const sseConnectionManager = new SSEConnectionManager(); 