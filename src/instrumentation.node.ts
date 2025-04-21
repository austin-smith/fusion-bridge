import 'server-only';

// This function contains the logic that should only run in the Node.js environment.
export async function register() {
  // Dynamically import server-only service within the server-only function
  const { initializeEnabledConnections } = await import('@/services/mqtt-service');

  console.log('[Instrumentation Node] Initializing enabled MQTT connections…');
  try {
    await initializeEnabledConnections();
    console.log('[Instrumentation Node] MQTT connections initialized');
  } catch (err) {
    console.error('[Instrumentation Node] Failed to initialize MQTT connections:', err);
    // Optionally re-throw or handle the error appropriately
    // throw err;
  }
} 