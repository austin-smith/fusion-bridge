import 'server-only';
import Redis from 'ioredis';

/**
 * Redis client singleton for pub/sub and general operations.
 * This is server-only and should never be imported in client components.
 */

// Redis connection options - Railway REDIS_URL with dual stack lookup
const redisOptions = process.env.REDIS_URL + '?family=0';

// Create Redis clients
let redisClient: Redis | null = null;
let redisPubClient: Redis | null = null;
let redisSubClient: Redis | null = null;

/**
 * Get the main Redis client for general operations
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(redisOptions);
    
    redisClient.on('error', (err: any) => {
      // Only log non-connection errors to reduce noise
      if (err.code !== 'ECONNREFUSED' && err.code !== 'ENOTFOUND') {
        console.error('[Redis Client] Error:', err.message);
      }
    });
    
    redisClient.on('connect', () => {
      console.log('[Redis Client] Connected to Redis');
    });
    
    redisClient.on('ready', () => {
      console.log('[Redis Client] Redis client ready');
    });
    
    redisClient.on('close', () => {
      console.log('[Redis Client] Connection closed');
    });
  }
  
  return redisClient;
}

/**
 * Get Redis publisher client for pub/sub
 */
export function getRedisPubClient(): Redis {
  if (!redisPubClient) {
    redisPubClient = new Redis(redisOptions);
    
    redisPubClient.on('error', (err: any) => {
      // Only log non-connection errors to reduce noise
      if (err.code !== 'ECONNREFUSED' && err.code !== 'ENOTFOUND') {
        console.error('[Redis Pub] Error:', err.message);
      }
    });
    
    redisPubClient.on('connect', () => {
      console.log('[Redis Pub] Connected to Redis');
    });
  }
  
  return redisPubClient;
}

/**
 * Get Redis subscriber client for pub/sub
 * Note: A Redis client in subscriber mode cannot be used for other operations
 */
export function getRedisSubClient(): Redis {
  if (!redisSubClient) {
    redisSubClient = new Redis(redisOptions);
    
    redisSubClient.on('error', (err: any) => {
      // Only log non-connection errors to reduce noise
      if (err.code !== 'ECONNREFUSED' && err.code !== 'ENOTFOUND') {
        console.error('[Redis Sub] Error:', err.message);
      }
    });
    
    redisSubClient.on('connect', () => {
      console.log('[Redis Sub] Connected to Redis');
    });
  }
  
  return redisSubClient;
}

/**
 * Close all Redis connections gracefully
 */
export async function closeRedisConnections(): Promise<void> {
  const closePromises: Promise<void>[] = [];
  
  if (redisClient) {
    closePromises.push(redisClient.quit().then(() => {
      redisClient = null;
    }));
  }
  
  if (redisPubClient) {
    closePromises.push(redisPubClient.quit().then(() => {
      redisPubClient = null;
    }));
  }
  
  if (redisSubClient) {
    closePromises.push(redisSubClient.quit().then(() => {
      redisSubClient = null;
    }));
  }
  
  await Promise.all(closePromises);
  console.log('[Redis] All connections closed');
}

// Graceful shutdown handling
if (typeof process !== 'undefined') {
  process.on('SIGTERM', async () => {
    await closeRedisConnections();
  });
  
  process.on('SIGINT', async () => {
    await closeRedisConnections();
  });
} 