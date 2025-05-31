import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth } from '@/lib/auth/withApiRouteAuth';
import { db } from '@/data/db';
import { apikey, user } from '@/data/db/schema';
import { eq } from 'drizzle-orm';

export const GET = withApiRouteAuth(async (req: NextRequest, context) => {
  try {
    // Check if user is admin
    if ((context.user as any)?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all API keys with user information
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
        // User fields
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
      })
      .from(apikey)
      .innerJoin(user, eq(apikey.userId, user.id))
      .orderBy(apikey.createdAt);

    // Transform the data to match the frontend interface
    const transformedKeys = apiKeys.map(key => ({
      ...key,
      lastRequest: key.lastRequest ? new Date(key.lastRequest) : null,
      expiresAt: key.expiresAt ? new Date(key.expiresAt) : null,
      createdAt: new Date(key.createdAt),
      updatedAt: new Date(key.updatedAt),
      requestCount: key.requestCount || 0,
    }));

    return NextResponse.json({ apiKeys: transformedKeys });
  } catch (error) {
    console.error('[Admin API Keys] Error fetching API keys:', error);
    return NextResponse.json(
      { error: 'Failed to fetch API keys' },
      { status: 500 }
    );
  }
}); 