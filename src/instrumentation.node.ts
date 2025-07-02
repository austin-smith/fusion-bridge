import 'server-only';
import { initializeCronJobs } from '@/lib/cron/scheduler';
import { getRedisClient } from '@/lib/redis/client';

// This function contains the logic that should only run in the Node.js environment.
export async function register() {
  // Clean up stale SSE connection data from previous server instance
  console.log('[Instrumentation Node] Cleaning up stale SSE connection data...');
  try {
    const redis = getRedisClient();
    
    // Get all connection-related keys and delete them
    const connectionKeys = await redis.keys('connections:*');
    if (connectionKeys.length > 0) {
      await redis.del(...connectionKeys);
      console.log(`[Instrumentation Node] Cleared ${connectionKeys.length} stale connection keys`);
    } else {
      console.log('[Instrumentation Node] No stale connection data found');
    }
  } catch (err) {
    console.error('[Instrumentation Node] Failed to clean up stale connection data:', err);
  }

  // Dynamically import server-only service within the server-only function
  const { initializeAllConnections } = await import('@/services/mqtt-service');

  console.log('[Instrumentation Node] Initializing all connections (MQTT, WebSocket)...');
  try {
    await initializeAllConnections();
    console.log('[Instrumentation Node] All connections initialization process completed.');
  } catch (err) {
    console.error('[Instrumentation Node] Failed during connection initialization:', err);
    // Optionally re-throw or handle the error appropriately
    // throw err;
  }

  // Initialize CRON jobs
  console.log('[Instrumentation Node] Initializing CRON jobs...');
  try {
    initializeCronJobs();
    console.log('[Instrumentation Node] CRON jobs initialization process completed.');
  } catch (err) {
    console.error('[Instrumentation Node] Failed during CRON job initialization:', err);
    // Optionally re-throw or handle the error appropriately
  }
  
  // Setup graceful shutdown handlers for SSE connections
  setupGracefulShutdown();
}

function setupGracefulShutdown() {
  const gracefulShutdown = async (signal: string) => {
    console.log(`[Instrumentation Node] Received ${signal} - starting graceful shutdown...`);
    
    try {
      // Dynamically import the connection manager to avoid circular dependencies
      const { sseConnectionManager } = await import('@/lib/redis/connection-manager');
      
      // Notify all SSE connections about the shutdown
      await sseConnectionManager.notifyShutdown(5000); // 5 second reconnect delay
      
      console.log('[Instrumentation Node] SSE connections notified of shutdown');
    } catch (error) {
      console.error('[Instrumentation Node] Error during graceful shutdown:', error);
    }
    
    // Give time for messages to be sent
    setTimeout(() => {
      console.log('[Instrumentation Node] Graceful shutdown complete');
      process.exit(0);
    }, 1000);
  };
  
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  console.log('[Instrumentation Node] Graceful shutdown handlers registered');
} 