// This file acts as the entry point for instrumentation and runs in all environments.

export async function register() {
  // Check the runtime environment.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // If in Node.js, dynamically import and run the Node-specific register function.
    console.log('[Instrumentation] Detected Node.js runtime. Importing Node-specific logic...');
    await (await import('./instrumentation.node')).register();
  } else {
    // If in Edge or other environments, log and do nothing.
    console.log(`[Instrumentation] Skipping Node-specific initialization in runtime: ${process.env.NEXT_RUNTIME}`);
  }
}