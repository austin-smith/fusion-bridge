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
    
    // Set a hard timeout for shutdown to prevent hanging indefinitely
    const shutdownTimeout = setTimeout(() => {
      console.error('[Instrumentation Node] Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 10000); // 10 second maximum shutdown time
    
    try {
      // Notify SSE clients
      try {
        const { sseConnectionManager } = await import('@/lib/redis/connection-manager');
        await Promise.race([
          sseConnectionManager.notifyShutdown(5000),
          new Promise((_, reject) => setTimeout(() => reject(new Error('SSE notification timeout')), 3000))
        ]);
      } catch (error) {
        console.error('[Instrumentation Node] Error during SSE shutdown notification:', error);
        // Continue with shutdown even if SSE notification fails
      }

      // Clean up connection services
      try {
        const [mqttModule, pikoModule] = await Promise.all([
          import('@/services/mqtt-service'),
          import('@/services/piko-websocket-service')
        ]);
        
        await Promise.race([
          Promise.allSettled([
            mqttModule.cleanupAllMqttConnections(),
            pikoModule.cleanupAllPikoConnections()
          ]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connection cleanup timeout')), 5000))
        ]);
      } catch (error) {
        console.error('[Instrumentation Node] Error during connection cleanup:', error);
        // Continue with shutdown even if connection cleanup fails
      }

      // Stop CRON jobs
      try {
        const { stopCronJobs } = await import('@/lib/cron/scheduler');
        await Promise.race([
          Promise.resolve(stopCronJobs()),
          new Promise((_, reject) => setTimeout(() => reject(new Error('CRON stop timeout')), 2000))
        ]);
      } catch (error) {
        console.error('[Instrumentation Node] Error stopping CRON jobs:', error);
      }

      // Close Redis connections
      try {
        const { closeRedisConnections } = await import('@/lib/redis/client');
        await Promise.race([
          closeRedisConnections(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Redis close timeout')), 3000))
        ]);
      } catch (error) {
        console.error('[Instrumentation Node] Error closing Redis connections:', error);
      }

      // Close database connections
      try {
        const { closeDbConnection } = await import('@/data/db');
        await Promise.race([
          closeDbConnection(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Database close timeout')), 2000))
        ]);
      } catch (error) {
        console.error('[Instrumentation Node] Error closing database connection:', error);
      }

    } catch (criticalError) {
      console.error('[Instrumentation Node] Critical error during shutdown:', criticalError);
    }
    
    // Clear the shutdown timeout since we're completing normally
    clearTimeout(shutdownTimeout);
    
    console.log('[Instrumentation Node] Graceful shutdown complete');
    
    // Small delay to ensure logs are flushed before exit
    setTimeout(() => {
      process.exit(0);
    }, 100);
  };
  
  // Ensure we only register shutdown handlers once
  let handlersRegistered = false;
  if (!handlersRegistered) {
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    handlersRegistered = true;
    console.log('[Instrumentation Node] Graceful shutdown handlers registered');
  }
} 