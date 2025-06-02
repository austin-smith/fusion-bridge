import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth } from '@/lib/auth/withApiRouteAuth';
import { db } from '@/data/db';
import { apikey, user, organization } from '@/data/db/schema';
import { eq, inArray } from 'drizzle-orm';

export const GET = withApiRouteAuth(async (req: NextRequest, context) => {
  try {
    // Check if user is admin
    if ((context.user as any)?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all API keys with user information (no direct organization join since metadata needs parsing)
    const apiKeys = await db
      .select({
        // API key fields
        id: apikey.id,
        name: apikey.name,
        start: apikey.start,
        enabled: apikey.enabled,
        rateLimitEnabled: apikey.rateLimitEnabled,
        rateLimitMax: apikey.rateLimitMax,
        remaining: apikey.remaining,
        lastRequest: apikey.lastRequest,
        expiresAt: apikey.expiresAt,
        createdAt: apikey.createdAt,
        updatedAt: apikey.updatedAt,
        requestCount: apikey.requestCount,
        metadata: apikey.metadata,
        // User fields
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
      })
      .from(apikey)
      .innerJoin(user, eq(apikey.userId, user.id))
      .orderBy(apikey.createdAt);

    // Transform the data to match the frontend interface and parse metadata
    const transformedKeys = apiKeys.map(key => {
      let organizationId = null;
      
      // Parse metadata JSON string to extract organization ID
      if (key.metadata) {
        try {
          let metadata = typeof key.metadata === 'string' ? JSON.parse(key.metadata) : key.metadata;
          
          // Check if we got a string back (double-encoded JSON)
          if (typeof metadata === 'string') {
            metadata = JSON.parse(metadata);
          }
          
          organizationId = metadata?.organizationId || null;
        } catch (error) {
          console.warn(`Failed to parse API key metadata for ${key.id}:`, error);
        }
      }

      return {
        ...key,
        lastRequest: key.lastRequest ? new Date(key.lastRequest) : null,
        expiresAt: key.expiresAt ? new Date(key.expiresAt) : null,
        createdAt: new Date(key.createdAt),
        updatedAt: new Date(key.updatedAt),
        requestCount: key.requestCount || 0,
        organizationId,
      };
    });

    // If we have organization IDs, fetch organization details
    const orgIds = transformedKeys
      .map(key => key.organizationId)
      .filter((id): id is string => id !== null);
    
    let organizationsMap = new Map();
    if (orgIds.length > 0) {
      const organizations = await db
        .select()
        .from(organization)
        .where(inArray(organization.id, orgIds));
      
      organizationsMap = new Map(organizations.map(org => [org.id, org]));
    }

    // Add organization details to the transformed keys
    const finalKeys = transformedKeys.map(key => {
      const orgInfo = key.organizationId ? organizationsMap.get(key.organizationId) || null : null;
      
      return {
        ...key,
        organizationInfo: orgInfo,
      };
    });

    return NextResponse.json({ apiKeys: finalKeys });
  } catch (error) {
    console.error('[Admin API Keys] Error fetching API keys:', error);
    return NextResponse.json(
      { error: 'Failed to fetch API keys' },
      { status: 500 }
    );
  }
}); 