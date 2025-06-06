import 'server-only';

import { createServer } from 'http';
import { server as WebSocketServer, connection as WebSocketConnection, request as WebSocketRequest } from 'websocket';
import { auth } from '@/lib/auth/server';
import { db } from '@/data/db';
import { apikey } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import type { ApiRouteAuthContext } from '@/lib/auth/withApiRouteAuth';
import type { 
  WebSocketClient,
  AuthenticationMessage
} from '@/types/websockets';

// Re-export message types for convenience
export type { EventMessage, AuthenticationMessage } from '@/types/websockets';

// Extended authentication context for WebSocket connections with organization
interface WebSocketAuthContext extends ApiRouteAuthContext {
  organizationId: string; // Required - not optional
}

// Enhanced client interface with organization context
interface AuthenticatedWebSocketClient extends WebSocketClient {
  authContext: WebSocketAuthContext;
}

// Registry to track authenticated clients
const connectedClients = new Map<string, AuthenticatedWebSocketClient>();

// WebSocket server instances
let wsServer: WebSocketServer | null = null;
let httpServer: any = null;
let isInitialized = false;

/**
 * Initialize the WebSocket service with authentication
 */
export function initializeWebSocketService(): void {
  if (isInitialized) {
    console.log('[WebSocket Service] Service already initialized');
    return;
  }

  console.log('[WebSocket Service] Initializing WebSocket service with organization authentication...');
  
  // Create HTTP server for WebSocket upgrades
  httpServer = createServer((req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('WebSocket upgrade only');
  });

  // Create WebSocket server
  wsServer = new WebSocketServer({
    httpServer: httpServer,
    autoAcceptConnections: false
  });

  // Handle WebSocket requests
  wsServer.on('request', async (request: WebSocketRequest) => {
    // Only accept requests for /api/stream path
    if (request.resourceURL.pathname === '/api/stream') {
      console.log(`[WebSocket Service] Connection request for ${request.resourceURL.pathname}`);
      await handleWebSocketConnection(request);
    } else {
      console.log(`[WebSocket Service] Rejecting request for invalid path: ${request.resourceURL.pathname}`);
      request.reject(404, 'WebSocket endpoint not found');
    }
  });

  // WebSocket server port - configurable but defaults to 3001
  const wsPort = parseInt(process.env.WEBSOCKET_PORT || '3001');
  httpServer.listen(wsPort, () => {
    console.log(`[WebSocket Service] WebSocket server running on port ${wsPort}`);
    console.log(`[WebSocket Service] WebSocket endpoint: ws://localhost:${wsPort}/api/stream`);
  });

  isInitialized = true;
  console.log('[WebSocket Service] Service ready for organization-scoped event streaming');
}

/**
 * Validate API key and extract organization context using Better Auth pattern
 */
async function validateApiKeyAndOrganization(request: WebSocketRequest): Promise<WebSocketAuthContext | null> {
  try {
    // Extract API key from x-api-key header (consistent with REST API)
    const apiKey = request.httpRequest.headers['x-api-key'] as string;

    if (!apiKey) {
      console.log('[WebSocket Auth] No API key provided in x-api-key header');
      return null;
    }

    // Use Better Auth's verifyApiKey method
    const apiKeyResult = await auth.api.verifyApiKey({
      body: { key: apiKey }
    });

    if (!apiKeyResult.valid || !apiKeyResult.key) {
      console.log('[WebSocket Auth] Invalid API key provided');
      return null;
    }

    // Get the full API key details to access metadata (for organization)
    const apiKeyDetails = await db
      .select({ metadata: apikey.metadata })
      .from(apikey)
      .where(eq(apikey.id, apiKeyResult.key.id))
      .limit(1);

    if (!apiKeyDetails || apiKeyDetails.length === 0) {
      console.log('[WebSocket Auth] API key not found in database');
      return null;
    }

    // Extract organization ID from API key metadata
    let metadata = apiKeyDetails[0].metadata ? JSON.parse(apiKeyDetails[0].metadata as string) : null;
    
    // Handle double-encoded JSON
    if (typeof metadata === 'string') {
      metadata = JSON.parse(metadata);
    }

    const organizationId = metadata?.organizationId;

    if (!organizationId) {
      console.log('[WebSocket Auth] API key is not associated with an organization');
      return null;
    }

    // Create extended authentication context with organization
    const authContext: WebSocketAuthContext = {
      type: 'apikey',
      userId: apiKeyResult.key.userId,
      organizationId: organizationId,
      apiKey: {
        id: apiKeyResult.key.id,
        name: apiKeyResult.key.name,
        enabled: apiKeyResult.key.enabled,
        rateLimitEnabled: apiKeyResult.key.rateLimitEnabled,
        remaining: apiKeyResult.key.remaining,
      }
    };

    console.log(`[WebSocket Auth] API key validated for user ${authContext.userId} in organization ${organizationId}`);
    return authContext;

  } catch (error) {
    console.error('[WebSocket Auth] Error validating API key:', error);
    return null;
  }
}

/**
 * Handle incoming WebSocket connection with organization authentication
 */
export async function handleWebSocketConnection(request: WebSocketRequest): Promise<void> {
  // Initialize service if not already done
  if (!isInitialized) {
    initializeWebSocketService();
  }
  
  console.log(`[WebSocket Service] Connection request from ${request.origin}`);

  // Validate API key and extract organization context
  const authContext = await validateApiKeyAndOrganization(request);
  if (!authContext) {
    console.log('[WebSocket Service] Rejecting connection - authentication or organization validation failed');
    request.reject(401, 'Unauthorized - Invalid API key or missing organization context');
    return;
  }

  // Accept the authenticated connection
  const connection = request.accept(undefined, request.origin);
  
  // Generate unique client ID
  const clientId = crypto.randomUUID();
  const now = new Date();

  // Create authenticated client object with organization context
  const client: AuthenticatedWebSocketClient = {
    id: clientId,
    connection: connection,
    connectedAt: now,
    lastActivity: now,
    authContext: authContext,
  };

  // Store client in registry
  connectedClients.set(clientId, client);

  console.log(`[WebSocket Service] Client connected: ${clientId}`);
  console.log(`[WebSocket Service] User: ${authContext.userId}, Organization: ${authContext.organizationId}`);
  console.log(`[WebSocket Service] API Key: ${authContext.apiKey?.name || authContext.apiKey?.id}`);
  console.log(`[WebSocket Service] Total clients: ${connectedClients.size}`);

  // Handle connection events
  connection.on('message', (message) => {
    handleClientMessage(clientId, message);
  });

  connection.on('close', (reasonCode, description) => {
    handleClientDisconnect(clientId, reasonCode, description);
  });

  connection.on('error', (error) => {
    console.error(`[WebSocket Service] Client ${clientId} error:`, error);
    handleClientDisconnect(clientId, 1011, 'Server error');
  });

  // Send authentication confirmation message
  const authMessage: AuthenticationMessage = {
    type: 'authenticated',
    data: { 
      clientId, 
      userId: authContext.userId,
      organizationId: authContext.organizationId,
      connectedAt: now.toISOString() 
    },
    timestamp: now.getTime(),
  };
  sendMessageToClient(clientId, authMessage);
}

/**
 * Handle incoming messages from authenticated clients
 */
function handleClientMessage(clientId: string, message: any): void {
  const client = connectedClients.get(clientId);
  if (!client) return;

  // Update last activity
  client.lastActivity = new Date();

  console.log(`[WebSocket Service] Message from client ${clientId} (User: ${client.authContext.userId}, Org: ${client.authContext.organizationId}):`, 
    message.utf8Data || message.binaryData);
}

/**
 * Handle client disconnection
 */
function handleClientDisconnect(clientId: string, reasonCode: number, description: string): void {
  const client = connectedClients.get(clientId);
  if (client) {
    const connectionDuration = Date.now() - client.connectedAt.getTime();
    console.log(`[WebSocket Service] Client disconnected: ${clientId}`);
    console.log(`[WebSocket Service] User: ${client.authContext.userId}, Organization: ${client.authContext.organizationId}, Duration: ${connectionDuration}ms, Reason: ${reasonCode} - ${description}`);
    
    connectedClients.delete(clientId);
    console.log(`[WebSocket Service] Total clients: ${connectedClients.size}`);
  }
}

/**
 * Send message to specific authenticated client
 */
function sendMessageToClient(clientId: string, message: any): boolean {
  const client = connectedClients.get(clientId);
  if (!client || !client.connection.connected) {
    console.warn(`[WebSocket Service] Cannot send message to client ${clientId}: Client not found or disconnected`);
    return false;
  }

  try {
    client.connection.sendUTF(JSON.stringify(message));
    return true;
  } catch (error) {
    console.error(`[WebSocket Service] Failed to send message to client ${clientId}:`, error);
    return false;
  }
}

/**
 * Broadcast message to clients in specific organization
 */
export function broadcastToOrganization(organizationId: string, message: any): number {
  if (!isInitialized) {
    console.warn('[WebSocket Service] Service not initialized, cannot broadcast');
    return 0;
  }

  let successCount = 0;
  
  for (const [clientId, client] of connectedClients.entries()) {
    if (client.authContext.organizationId === organizationId) {
      if (sendMessageToClient(clientId, message)) {
        successCount++;
      }
    }
  }

  console.log(`[WebSocket Service] Broadcasted message to ${successCount} clients in organization ${organizationId}`);
  return successCount;
}

/**
 * Broadcast message to all connected clients (admin only)
 */
export function broadcastToAllClients(message: any): number {
  if (!isInitialized) {
    console.warn('[WebSocket Service] Service not initialized, cannot broadcast');
    return 0;
  }

  let successCount = 0;
  
  for (const [clientId, client] of connectedClients.entries()) {
    if (sendMessageToClient(clientId, message)) {
      successCount++;
    }
  }

  console.log(`[WebSocket Service] Broadcasted message to ${successCount} clients across all organizations`);
  return successCount;
}

/**
 * Get current connection statistics with organization context
 */
export function getConnectionStats() {
  const organizationStats = new Map<string, number>();
  
  for (const client of connectedClients.values()) {
    const orgId = client.authContext.organizationId;
    organizationStats.set(orgId, (organizationStats.get(orgId) || 0) + 1);
  }

  return {
    initialized: isInitialized,
    totalConnections: connectedClients.size,
    organizationBreakdown: Object.fromEntries(organizationStats),
    clients: Array.from(connectedClients.values()).map(client => ({
      id: client.id,
      userId: client.authContext.userId,
      organizationId: client.authContext.organizationId,
      authType: client.authContext.type,
      apiKeyName: client.authContext.apiKey?.name,
      apiKeyId: client.authContext.apiKey?.id,
      connectedAt: client.connectedAt,
      lastActivity: client.lastActivity,
    })),
  };
}

/**
 * Check if service is ready
 */
export function isServiceReady(): boolean {
  return isInitialized;
}

/**
 * Shutdown the WebSocket service
 */
export function shutdownWebSocketService(): void {
  if (isInitialized) {
    console.log('[WebSocket Service] Shutting down WebSocket service...');
    
    // Close all client connections
    for (const [clientId, client] of connectedClients.entries()) {
      client.connection.close(1001, 'Server shutting down');
    }
    
    connectedClients.clear();
    
    // Close servers
    if (wsServer) {
      wsServer.shutDown();
      wsServer = null;
    }
    
    if (httpServer) {
      httpServer.close();
      httpServer = null;
    }
    
    isInitialized = false;
    
    console.log('[WebSocket Service] Service shut down');
  }
} 