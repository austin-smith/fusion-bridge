import 'server-only';

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
} 