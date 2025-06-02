import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import { withApiRouteAuth, type ApiRouteAuthContext, type RouteContext } from '@/lib/auth/withApiRouteAuth';

export const PATCH = withApiRouteAuth(async (
  req: NextRequest,
  authContext: ApiRouteAuthContext,
  context: RouteContext<{ id: string }>
) => {
  try {
    // Check if user is admin
    if (authContext.type !== 'session' || (authContext.session?.user as any)?.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = await req.json();
    const { organizationId } = body;

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: 'organizationId is required' },
        { status: 400 }
      );
    }

    // Verify the organization exists
    const org = await db.query.organization.findFirst({
      where: (org, { eq }) => eq(org.id, organizationId),
    });

    if (!org) {
      return NextResponse.json(
        { success: false, error: 'Target organization not found' },
        { status: 404 }
      );
    }

    // Update the connector's organization
    const updatedConnectors = await db
      .update(connectors)
      .set({ 
        organizationId,
        updatedAt: new Date() 
      })
      .where(eq(connectors.id, id))
      .returning();

    if (updatedConnectors.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Connector not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedConnectors[0],
      message: `Connector moved to organization: ${org.name}`,
    });
  } catch (error) {
    console.error('Error updating connector organization:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update connector' },
      { status: 500 }
    );
  }
});

// GET endpoint to fetch all connectors across organizations (for admin use)
export const GET = withApiRouteAuth(async (
  req: NextRequest,
  authContext: ApiRouteAuthContext
) => {
  try {
    // Check if user is admin
    if (authContext.type !== 'session' || (authContext.session?.user as any)?.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Fetch all connectors across all organizations with organization details
    const allConnectors = await db
      .select({
        id: connectors.id,
        name: connectors.name,
        category: connectors.category,
        organizationId: connectors.organizationId,
        eventsEnabled: connectors.eventsEnabled,
        createdAt: connectors.createdAt,
        updatedAt: connectors.updatedAt,
      })
      .from(connectors)
      .orderBy(connectors.name);

    return NextResponse.json({
      success: true,
      data: allConnectors,
    });
  } catch (error) {
    console.error('Error fetching all connectors for admin:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch connectors' },
      { status: 500 }
    );
  }
}); 