import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth, type ApiRouteAuthContext, type RouteContext } from '@/lib/auth/withApiRouteAuth';
import { db } from '@/data/db';
import { apikey } from '@/data/db/schema';
import { eq } from 'drizzle-orm';

export const PATCH = withApiRouteAuth(async (req: NextRequest, authContext: ApiRouteAuthContext, context: RouteContext<{ id: string }>) => {
  try {
    // Check if user is admin
    if ((authContext.user as any)?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!context?.params) {
      return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
    }
    
    const { id: keyId } = await context.params;

    const body = await req.json();
    const { enabled } = body;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid enabled value' }, { status: 400 });
    }

    // Update the API key status
    const result = await db
      .update(apikey)
      .set({ 
        enabled,
        updatedAt: new Date()
      })
      .where(eq(apikey.id, keyId))
      .returning({ id: apikey.id });

    if (result.length === 0) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `API key ${enabled ? 'enabled' : 'disabled'} successfully` 
    });
  } catch (error) {
    console.error('[Admin API Keys] Error updating API key:', error);
    return NextResponse.json(
      { error: 'Failed to update API key' },
      { status: 500 }
    );
  }
});

export const DELETE = withApiRouteAuth(async (req: NextRequest, authContext: ApiRouteAuthContext, context: RouteContext<{ id: string }>) => {
  try {
    // Check if user is admin
    if ((authContext.user as any)?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!context?.params) {
      return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
    }
    
    const { id: keyId } = await context.params;

    // Delete the API key
    const result = await db
      .delete(apikey)
      .where(eq(apikey.id, keyId))
      .returning({ id: apikey.id });

    if (result.length === 0) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'API key deleted successfully' 
    });
  } catch (error) {
    console.error('[Admin API Keys] Error deleting API key:', error);
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    );
  }
}); 