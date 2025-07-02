import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { getRedisClient } from '@/lib/redis/client';
import { sseConnectionManager } from '@/lib/redis/connection-manager';

export const GET = withOrganizationAuth(async (
  request: NextRequest,
  authContext: OrganizationAuthContext
) => {
  const { organizationId } = authContext;
  
  try {
    const redis = getRedisClient();
    
    // Check Redis health
    let redisHealthy = false;
    let redisPingMs = null;
    
    try {
      const startTime = Date.now();
      await redis.ping();
      redisPingMs = Date.now() - startTime;
      redisHealthy = true;
    } catch (error) {
      // Redis is down
      redisHealthy = false;
      redisPingMs = null;
    }
    
    // Get connection count from the connection manager (only for this organization)
    const activeConnections = sseConnectionManager.getConnectionCountByOrganization(organizationId);
    
    return NextResponse.json({
      success: true,
      data: {
        organizationId,
        activeConnections,
        subscribedChannels: activeConnections > 0 ? 1 : 0,
        timestamp: new Date().toISOString(),
        redis: {
          healthy: redisHealthy,
          pingMs: redisPingMs
        }
      }
    });
  } catch (error) {
    console.error('[SSE Stats] Error fetching connection stats:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch connection statistics' 
      },
      { status: 500 }
    );
  }
}); 