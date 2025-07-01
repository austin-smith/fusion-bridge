import 'server-only';
import { initializeCronJobs } from '@/lib/cron/scheduler';

// This function contains the logic that should only run in the Node.js environment.
export async function register() {
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
} 