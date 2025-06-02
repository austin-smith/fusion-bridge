import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/data/db';
import { locations } from '@/data/db/schema';
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

    // Update the location's organization
    const updatedLocations = await db
      .update(locations)
      .set({ 
        organizationId,
        updatedAt: new Date() 
      })
      .where(eq(locations.id, id))
      .returning();

    if (updatedLocations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Location not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedLocations[0],
    });
  } catch (error) {
    console.error('Error updating location organization:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update location' },
      { status: 500 }
    );
  }
}); 