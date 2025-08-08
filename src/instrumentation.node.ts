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
    
    // Railway gives 30 seconds, use 25 seconds with 5 second buffer
    const shutdownTimeout = setTimeout(() => {
      console.error('[Instrumentation Node] Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 25000);
    
    try {
      // Notify SSE clients (2 seconds max)
      try {
        const { sseConnectionManager } = await import('@/lib/redis/connection-manager');
        // Stop all SSE operations first to prevent race conditions
        console.log('[Instrumentation Node] Initiating SSE manager shutdown...');
        sseConnectionManager.shutdown();
        console.log('[Instrumentation Node] Notifying SSE clients of shutdown...');
        await Promise.race([
          sseConnectionManager.notifyShutdown(5000),
          new Promise((_, reject) => setTimeout(() => reject(new Error('SSE timeout')), 2000))
        ]);
        console.log('[Instrumentation Node] SSE shutdown complete');
      } catch (error) {
        console.error('[Instrumentation Node] SSE notification failed:', error);
      }

      // Clean up services in parallel (10 seconds max total)
      try {
        console.log('[Instrumentation Node] Loading service modules...');
        const modules = await Promise.race([
          Promise.all([
            import('@/services/mqtt-service'),
            import('@/services/piko-websocket-service'),
            import('@/lib/redis/client'),
            import('@/data/db')
          ]),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Module import timeout')), 5000))
        ]);
        const [mqttModule, pikoModule, redisModule, dbModule] = modules;
        console.log('[Instrumentation Node] Service modules loaded successfully');
        
        // Stop cron jobs immediately (sync)
        console.log('[Instrumentation Node] Stopping cron jobs...');
        const cronModule = await Promise.race([
          import('@/lib/cron/scheduler'),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Cron import timeout')), 2000))
        ]);
        cronModule.stopCronJobs();
        console.log('[Instrumentation Node] Cron jobs stopped');
        
        // Cleanup async services in parallel with individual timeouts
        console.log('[Instrumentation Node] Starting individual service cleanups...');
        
        // Helper function to wrap each cleanup with individual timeout
        const withTimeout = (promise: Promise<any>, name: string, timeoutMs: number) => {
          return Promise.race([
            promise.then(() => console.log(`[Instrumentation Node] ${name} cleanup complete`)),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`${name} cleanup timeout`)), timeoutMs))
          ]);
        };
        
        const cleanupResults = await Promise.allSettled([
          withTimeout(mqttModule.cleanupAllMqttConnections(), 'MQTT', 3000),
          withTimeout(pikoModule.cleanupAllPikoConnections(), 'Piko', 3000),
          withTimeout(redisModule.closeRedisConnections(), 'Redis', 2000),
          withTimeout(dbModule.closeDbConnection(), 'DB', 1000)
        ]);
        
        // Log results
        cleanupResults.forEach((result, index) => {
          const services = ['MQTT', 'Piko', 'Redis', 'DB'];
          if (result.status === 'rejected') {
            console.error(`[Instrumentation Node] ${services[index]} cleanup failed:`, result.reason);
          }
        });
        
        console.log('[Instrumentation Node] All service cleanups attempted');
      } catch (error) {
        console.error('[Instrumentation Node] Service cleanup failed:', error);
      }

    } catch (criticalError) {
      console.error('[Instrumentation Node] Critical shutdown error:', criticalError);
    }
    
    clearTimeout(shutdownTimeout);
    console.log('[Instrumentation Node] Graceful shutdown complete');
    
    // Force exit immediately - don't wait for remaining handles
    // Railway deployment should complete cleanly
    process.exit(0);
  };
  
  // Register handlers only once
  let handlersRegistered = false;
  if (!handlersRegistered) {
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    handlersRegistered = true;
    console.log('[Instrumentation Node] Graceful shutdown handlers registered');
  }
} 