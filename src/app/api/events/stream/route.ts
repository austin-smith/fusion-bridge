import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { getRedisClient } from '@/lib/redis/client';
import { 
  getConnectionCountKey,
  getApiKeyConnectionsKey,
  type SSEConnectionMessage,
  type SSEHeartbeatMessage
} from '@/lib/redis/types';
import { sseConnectionManager } from '@/lib/redis/connection-manager';

// SSE helper to format messages
function formatSSE(data: any, event?: string): string {
  const lines: string[] = [];
  if (event) lines.push(`event: ${event}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  lines.push('', ''); // Double newline to end message
  return lines.join('\n');
}

// Maximum connections per API key
const MAX_CONNECTIONS_PER_API_KEY = 5;

export const GET = withOrganizationAuth(async (
  request: NextRequest,
  authContext: OrganizationAuthContext
) => {
  const { organizationId } = authContext;
  const apiKeyId = authContext.type === 'apikey' ? authContext.apiKey?.id : null;
  
  // Check connection limits for API key auth
  if (apiKeyId) {
    const redis = getRedisClient();
    const apiKeyConnectionsKey = getApiKeyConnectionsKey(apiKeyId);
    const currentConnections = await redis.scard(apiKeyConnectionsKey);
    
    if (currentConnections >= MAX_CONNECTIONS_PER_API_KEY) {
      return NextResponse.json(
        { 
          error: 'Connection limit exceeded',
          message: `Maximum ${MAX_CONNECTIONS_PER_API_KEY} concurrent connections allowed per API key`,
          code: 'CONNECTION_LIMIT_EXCEEDED'
        },
        { status: 429 }
      );
    }
  }

  // Parse query parameters for filtering
  const searchParams = request.nextUrl.searchParams;
  const eventCategories = searchParams.get('eventCategories')?.split(',').map(c => c.trim()).filter(Boolean);
  const eventTypes = searchParams.get('eventTypes')?.split(',').map(t => t.trim()).filter(Boolean);
  const includeThumbnails = searchParams.get('includeThumbnails') === 'true'; // Default false
  const alarmEventsOnly = searchParams.get('alarmEventsOnly') === 'true'; // Default false
  
  // Create a unique connection ID
  const connectionId = crypto.randomUUID();
  const startTime = new Date();
  
  console.log(`[SSE] New connection: ${connectionId} for org: ${organizationId}, thumbnails: ${includeThumbnails}, alarmOnly: ${alarmEventsOnly}, filters:`, { eventCategories, eventTypes });

  // Track this connection
  const redis = getRedisClient();
  const connectionCountKey = getConnectionCountKey(organizationId);
  let connectionTracked = false;

  // Create a ReadableStream for SSE
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController;
  let cleanupCalled = false;
  let heartbeatInterval: NodeJS.Timeout | null = null;
  
  const stream = new ReadableStream({
    async start(c) {
      controller = c;
      
      // Track connection when stream actually starts
      if (!connectionTracked) {
        await redis.incr(connectionCountKey);
        connectionTracked = true;
        console.log(`[SSE] Connection tracked: ${connectionId}`);
      }
      
      // Register connection with the global manager (this handles all Redis subscription)
      try {
        await sseConnectionManager.addConnection({
          id: connectionId,
          organizationId,
          controller,
          eventCategories,
          eventTypes,
          alarmEventsOnly,
          connectedAt: startTime,
          lastActivity: startTime,
          includeThumbnails
        });
      } catch (error) {
        console.error(`[SSE] Failed to register connection with manager: ${error}`);
        // Connection tracking was already done, so we need to clean it up
        if (connectionTracked) {
          await redis.decr(connectionCountKey);
          connectionTracked = false;
        }
        // Close the controller and rethrow
        controller.close();
        throw error;
      }
      
      // Send initial connection message immediately
      const connectionMessage: SSEConnectionMessage = {
        type: 'connection',
        organizationId,
        timestamp: new Date().toISOString()
      };
      
      try {
        controller.enqueue(encoder.encode(formatSSE(connectionMessage, 'connection')));
      } catch (error) {
        console.error('[SSE] Failed to send connection message:', error);
      }

      // Send heartbeat every 30 seconds
      heartbeatInterval = setInterval(() => {
        try {
          const heartbeat: SSEHeartbeatMessage = {
            type: 'heartbeat',
            timestamp: new Date().toISOString()
          };
          controller.enqueue(encoder.encode(formatSSE(heartbeat, 'heartbeat')));
        } catch (error) {
          // Connection likely closed, cleanup will happen via abort signal
          console.error(`[SSE] Heartbeat failed for connection ${connectionId}:`, error);
        }
      }, 30000);
    },
    cancel() {
      // Stream cancelled by client - trigger cleanup
      if (!cleanupCalled) {
        cleanupCalled = true;
        cleanup().catch(err => console.error('Cleanup error:', err));
      }
    }
  });

  // Clean up on disconnect
  const cleanup = async () => {
    console.log(`[SSE] Starting cleanup for connection: ${connectionId}`);
    const cleanupErrors: string[] = [];
    
    // Clear heartbeat interval (synchronous, safe)
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
      console.log(`[SSE] Cleared heartbeat interval for: ${connectionId}`);
    }
    
    // Remove connection from the manager (handles Redis unsubscription)
    try {
      await sseConnectionManager.removeConnection(connectionId);
      console.log(`[SSE] Removed from connection manager: ${connectionId}`);
    } catch (error) {
      const errorMsg = `Failed to remove from connection manager: ${error}`;
      console.error(`[SSE] ${errorMsg}`);
      cleanupErrors.push(errorMsg);
    }
    
    // Clean up connection tracking in Redis
    if (connectionTracked) {
      try {
        await redis.decr(connectionCountKey);
        connectionTracked = false;
        console.log(`[SSE] Decremented Redis connection count for: ${connectionId}`);
      } catch (error) {
        const errorMsg = `Failed to decrement Redis counter: ${error}`;
        console.error(`[SSE] ${errorMsg}`);
        cleanupErrors.push(errorMsg);
        // Don't reset connectionTracked on failure - we'll try again if cleanup is called again
      }
    }
    
    // Close the controller (safest operation, already wrapped but let's be explicit)
    try {
      controller.close();
      console.log(`[SSE] Closed controller for: ${connectionId}`);
    } catch (error) {
      // Controller might already be closed - this is usually safe to ignore
      console.log(`[SSE] Controller already closed for: ${connectionId}`);
    }
    
    // Log final cleanup status
    const duration = Date.now() - startTime.getTime();
    if (cleanupErrors.length > 0) {
      console.error(`[SSE] Cleanup completed with ${cleanupErrors.length} errors for ${connectionId} (duration: ${duration}ms):`, cleanupErrors);
    } else {
      console.log(`[SSE] Cleanup completed successfully for ${connectionId} (duration: ${duration}ms)`);
    }
  };

  // Handle client disconnect (only add one cleanup listener)
  const safeCleanup = async () => {
    if (!cleanupCalled) {
      cleanupCalled = true;
      await cleanup();
    }
  };
  
  request.signal.addEventListener('abort', safeCleanup);

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    },
  });
}); 