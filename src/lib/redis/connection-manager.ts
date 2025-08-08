import 'server-only';
import { getRedisSubClient } from './client';
import { getEventChannelName, getEventThumbnailChannelName, type RedisEventMessage } from './types';

interface SSEConnection {
  id: string;
  organizationId: string;
  controller: ReadableStreamDefaultController;
  eventCategories?: string[];
  eventTypes?: string[];
  alarmEventsOnly?: boolean;
  connectedAt: Date;
  lastActivity: Date;
  includeThumbnails?: boolean;
}

class SSEConnectionManager {
  private connections = new Map<string, SSEConnection>();
  private subscribedChannels = new Set<string>();
  private subscriber = getRedisSubClient();
  private initialized = false;
  private hadRedisError = false;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  
  // Enhanced monitoring
  private cleanupStats = {
    deadConnectionsRemoved: 0,
    staleConnectionsRemoved: 0,
    healthChecksPassed: 0,
    healthChecksFailed: 0,
    redisErrors: 0,
    totalCleanupsRun: 0
  };
  
  // Configuration constants
  private readonly CLEANUP_INTERVAL_MS = 60000; // Run cleanup every minute
  private readonly MAX_CONNECTION_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours max
  private readonly STALE_CONNECTION_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours without activity

  constructor() {
    this.setupGlobalSubscriber();
    this.startPeriodicCleanup();
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
        
        // Track connections to remove if they're dead
        const deadConnections: string[] = [];
        
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
                // Update last activity on successful message send
                conn.lastActivity = new Date();
              } catch (error) {
                // Connection is dead - mark for removal
                console.warn(`[SSE Manager] Dead connection detected: ${conn.id}, marking for cleanup:`, error);
                deadConnections.push(conn.id);
              }
            }
          }
        });
        
        // Clean up dead connections immediately
        if (deadConnections.length > 0) {
          console.log(`[SSE Manager] Cleaning up ${deadConnections.length} dead connections`);
          // Handle async cleanup operations properly
          Promise.allSettled(
            deadConnections.map(connectionId => this.removeDeadConnectionAsync(connectionId))
          ).then(results => {
            const failed = results.filter(r => r.status === 'rejected').length;
            if (failed > 0) {
              console.warn(`[SSE Manager] ${failed} of ${deadConnections.length} dead connection cleanups failed`);
            }
          }).catch(error => {
            console.error('[SSE Manager] Unexpected error in dead connection cleanup:', error);
          });
        }
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
    // Apply alarm events filter first (most specific)
    if (conn.alarmEventsOnly && !event.isAlarmEvent) {
      return false;
    }
    
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
    const deadConnections: string[] = [];
    
    this.connections.forEach((conn) => {
      try {
        conn.controller.enqueue(encoder.encode(this.formatSSE(systemMessage, 'system')));
        // Update last activity on successful message send
        conn.lastActivity = new Date();
      } catch (error) {
        // Connection is dead - mark for removal
        console.warn(`[SSE Manager] Dead connection detected during system broadcast: ${conn.id}`);
        deadConnections.push(conn.id);
      }
    });
    
    // Clean up dead connections found during broadcast
    if (deadConnections.length > 0) {
      console.log(`[SSE Manager] Cleaning up ${deadConnections.length} dead connections from system broadcast`);
      // Handle async cleanup operations properly
      Promise.allSettled(
        deadConnections.map(connectionId => this.removeDeadConnectionAsync(connectionId))
      ).then(results => {
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) {
          console.warn(`[SSE Manager] ${failed} of ${deadConnections.length} dead connection cleanups failed during broadcast`);
        }
      }).catch(error => {
        console.error('[SSE Manager] Unexpected error in dead connection cleanup during broadcast:', error);
      });
    }
  }

  async addConnection(connection: SSEConnection): Promise<void> {
    // Ensure lastActivity is set if not provided
    if (!connection.lastActivity) {
      connection.lastActivity = new Date();
    }
    
    this.connections.set(connection.id, connection);
    
    // Determine which channel to subscribe to based on thumbnail preference
    const channel = connection.includeThumbnails 
      ? getEventThumbnailChannelName(connection.organizationId)
      : getEventChannelName(connection.organizationId);
    
    // Subscribe to organization channel if not already subscribed
    if (!this.subscribedChannels.has(channel)) {
      try {
        await this.subscriber.subscribe(channel);
        this.subscribedChannels.add(channel);
        console.log(`[SSE Manager] Subscribed to channel: ${channel}`);
      } catch (error) {
        console.error(`[SSE Manager] Failed to subscribe to channel ${channel}:`, error);
        this.cleanupStats.redisErrors++;
        // Don't add to subscribedChannels on failure
        // Connection is still tracked but won't receive messages until Redis recovers
        throw new Error(`Failed to subscribe to Redis channel: ${error}`);
      }
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
      try {
        await this.subscriber.unsubscribe(channel);
        this.subscribedChannels.delete(channel);
        console.log(`[SSE Manager] Unsubscribed from channel: ${channel}`);
      } catch (error) {
        console.error(`[SSE Manager] Failed to unsubscribe from channel ${channel}:`, error);
        this.cleanupStats.redisErrors++;
        // Don't remove from subscribedChannels on failure to maintain consistency
      }
    }
    
    console.log(`[SSE Manager] Removed connection ${connectionId} (total: ${this.connections.size})`);
  }

  private removeDeadConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    console.log(`[SSE Manager] Removing dead connection: ${connectionId}`);
    
    // Remove from connections map immediately (synchronous)
    this.connections.delete(connectionId);
    this.cleanupStats.deadConnectionsRemoved++;
    
    // Schedule async cleanup of Redis subscriptions
    this.cleanupConnectionChannels(connection).catch(error => {
      console.error(`[SSE Manager] Failed to cleanup channels for dead connection ${connectionId}:`, error);
      this.cleanupStats.redisErrors++;
    });
    
    console.log(`[SSE Manager] Dead connection removed: ${connectionId} (total: ${this.connections.size})`);
  }

  private async removeDeadConnectionAsync(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    console.log(`[SSE Manager] Removing dead connection (async): ${connectionId}`);
    
    // Remove from connections map immediately (synchronous)
    this.connections.delete(connectionId);
    this.cleanupStats.deadConnectionsRemoved++;
    
    // Await async cleanup of Redis subscriptions
    try {
      await this.cleanupConnectionChannels(connection);
    } catch (error) {
      console.error(`[SSE Manager] Failed to cleanup channels for dead connection ${connectionId}:`, error);
      this.cleanupStats.redisErrors++;
    }
    
    console.log(`[SSE Manager] Dead connection removed (async): ${connectionId} (total: ${this.connections.size})`);
  }

  private removeStaleConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    console.log(`[SSE Manager] Removing stale connection: ${connectionId}`);
    
    // Remove from connections map immediately (synchronous)
    this.connections.delete(connectionId);
    this.cleanupStats.staleConnectionsRemoved++;
    
    // Schedule async cleanup of Redis subscriptions
    this.cleanupConnectionChannels(connection).catch(error => {
      console.error(`[SSE Manager] Failed to cleanup channels for stale connection ${connectionId}:`, error);
      this.cleanupStats.redisErrors++;
    });
    
    console.log(`[SSE Manager] Stale connection removed: ${connectionId} (total: ${this.connections.size})`);
  }

  private async removeStaleConnectionAsync(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    console.log(`[SSE Manager] Removing stale connection (async): ${connectionId}`);
    
    // Remove from connections map immediately (synchronous)
    this.connections.delete(connectionId);
    this.cleanupStats.staleConnectionsRemoved++;
    
    // Await async cleanup of Redis subscriptions
    try {
      await this.cleanupConnectionChannels(connection);
    } catch (error) {
      console.error(`[SSE Manager] Failed to cleanup channels for stale connection ${connectionId}:`, error);
      this.cleanupStats.redisErrors++;
    }
    
    console.log(`[SSE Manager] Stale connection removed (async): ${connectionId} (total: ${this.connections.size})`);
  }

  private async cleanupConnectionChannels(connection: SSEConnection): Promise<void> {
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
      try {
        await this.subscriber.unsubscribe(channel);
        this.subscribedChannels.delete(channel);
        console.log(`[SSE Manager] Unsubscribed from channel after dead connection cleanup: ${channel}`);
      } catch (error) {
        console.error(`[SSE Manager] Failed to unsubscribe from channel ${channel}:`, error);
        this.cleanupStats.redisErrors++;
        // Don't remove from subscribedChannels on failure to avoid inconsistent state
        // Channel will remain "subscribed" until Redis recovers
      }
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getConnectionCountByOrganization(organizationId: string): number {
    return Array.from(this.connections.values())
      .filter(conn => conn.organizationId === organizationId).length;
  }

  getStats() {
    const now = Date.now();
    const organizationStats = new Map<string, number>();
    const connectionAges: number[] = [];
    const lastActivityAges: number[] = [];
    const thumbnailConnections = Array.from(this.connections.values()).filter(conn => conn.includeThumbnails).length;
    
    this.connections.forEach((conn) => {
      const current = organizationStats.get(conn.organizationId) || 0;
      organizationStats.set(conn.organizationId, current + 1);
      
      connectionAges.push(now - conn.connectedAt.getTime());
      lastActivityAges.push(now - conn.lastActivity.getTime());
    });
    
    const avgConnectionAge = connectionAges.length > 0 
      ? connectionAges.reduce((a, b) => a + b, 0) / connectionAges.length 
      : 0;
    
    const avgLastActivity = lastActivityAges.length > 0
      ? lastActivityAges.reduce((a, b) => a + b, 0) / lastActivityAges.length
      : 0;
    
    return {
      // Basic connection info
      totalConnections: this.connections.size,
      subscribedChannels: this.subscribedChannels.size,
      organizationStats: Object.fromEntries(organizationStats),
      
      // Connection health metrics
      thumbnailConnections,
      averageConnectionAge: Math.round(avgConnectionAge / 1000), // seconds
      averageLastActivity: Math.round(avgLastActivity / 1000), // seconds
      
      // Cleanup statistics
      cleanupStats: { ...this.cleanupStats },
      
      // System health
      redisSubscriberHealthy: !this.hadRedisError,
      periodicCleanupRunning: this.cleanupInterval !== null,
      
      // Configuration
      config: {
        cleanupIntervalMs: this.CLEANUP_INTERVAL_MS,
        maxConnectionAgeMs: this.MAX_CONNECTION_AGE_MS,
        staleConnectionAgeMs: this.STALE_CONNECTION_AGE_MS
      }
    };
  }

  // Reset statistics (useful for monitoring)
  resetStats() {
    this.cleanupStats = {
      deadConnectionsRemoved: 0,
      staleConnectionsRemoved: 0,
      healthChecksPassed: 0,
      healthChecksFailed: 0,
      redisErrors: 0,
      totalCleanupsRun: 0
    };
    console.log(`[SSE Manager] Statistics reset`);
  }

  // For graceful shutdown - call this first to prevent new cleanup tasks
  shutdown(): void {
    this.isShuttingDown = true;
    this.stopPeriodicCleanup();
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

  private startPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.performPeriodicCleanup();
    }, this.CLEANUP_INTERVAL_MS);
    console.log(`[SSE Manager] Periodic cleanup started with interval: ${this.CLEANUP_INTERVAL_MS}ms`);
  }

  private performPeriodicCleanup() {
    this.cleanupStats.totalCleanupsRun++;
    const now = Date.now();
    const staleConnections: string[] = [];
    const oldConnections: string[] = [];

    this.connections.forEach((conn, id) => {
      const age = now - conn.connectedAt.getTime();
      const lastActivityAge = now - conn.lastActivity.getTime();
      
      // Remove connections that are too old regardless of activity
      if (age > this.MAX_CONNECTION_AGE_MS) {
        oldConnections.push(id);
      }
      // Remove connections that haven't had activity recently
      else if (lastActivityAge > this.STALE_CONNECTION_AGE_MS) {
        staleConnections.push(id);
      }
    });

    if (oldConnections.length > 0) {
      console.log(`[SSE Manager] Found ${oldConnections.length} connections exceeding max age (${this.MAX_CONNECTION_AGE_MS}ms), removing.`);
      // Handle async cleanup operations properly
      Promise.allSettled(
        oldConnections.map(id => this.removeStaleConnectionAsync(id))
      ).then(results => {
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) {
          console.warn(`[SSE Manager] ${failed} of ${oldConnections.length} old connection cleanups failed`);
        }
      }).catch(error => {
        console.error('[SSE Manager] Unexpected error in old connection cleanup:', error);
      });
    }

    if (staleConnections.length > 0) {
      console.log(`[SSE Manager] Found ${staleConnections.length} stale connections (no activity for ${this.STALE_CONNECTION_AGE_MS}ms), testing health.`);
      staleConnections.forEach(id => {
        this.healthCheckConnection(id);
      });
    }

    // Log periodic stats
    if (this.connections.size > 0) {
      console.log(`[SSE Manager] Periodic cleanup completed. Active connections: ${this.connections.size}`);
    }
  }

  private healthCheckConnection(connectionId: string) {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    try {
      // Send a health check heartbeat
      const healthCheck = {
        type: 'heartbeat',
        timestamp: new Date().toISOString()
      };
      
      conn.controller.enqueue(new TextEncoder().encode(this.formatSSE(healthCheck, 'heartbeat')));
      conn.lastActivity = new Date();
      this.cleanupStats.healthChecksPassed++;
      console.log(`[SSE Manager] Health check passed for connection: ${connectionId}`);
    } catch (error) {
      console.warn(`[SSE Manager] Health check failed for connection ${connectionId}, removing:`, error);
      this.cleanupStats.healthChecksFailed++;
      // Use async version for consistency, but don't await to avoid blocking health checks
      this.removeDeadConnectionAsync(connectionId).catch(error => {
        console.error(`[SSE Manager] Failed to cleanup dead connection after health check failure:`, error);
      });
    }
  }

  // Method to stop periodic cleanup (useful for testing or shutdown)
  stopPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log(`[SSE Manager] Periodic cleanup stopped`);
    }
  }
}

// Export singleton instance
export const sseConnectionManager = new SSEConnectionManager(); 