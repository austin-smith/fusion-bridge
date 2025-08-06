import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';
import type { UpdateDeviceOverlayPayload } from '@/types/device-overlay';

interface DeviceOverlayRouteContext extends RouteContext {
  params: Promise<{ id: string; planId: string; overlayId: string }>;
}

// Get a specific device overlay
export const GET = withOrganizationAuth(async (
  req: NextRequest,
  authContext: OrganizationAuthContext,
  context: DeviceOverlayRouteContext
) => {
  try {
    const { id: locationId, planId, overlayId } = await context.params;
    
    const orgDb = createOrgScopedDb(authContext.organizationId);
    
    // Verify floor plan exists and belongs to organization
    const floorPlans = await orgDb.floorPlans.findById(planId);
    
    if (floorPlans.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Floor plan not found' },
        { status: 404 }
      );
    }
    
    const floorPlan = floorPlans[0];
    
    // Verify location matches
    if (floorPlan.locationId !== locationId) {
      return NextResponse.json(
        { success: false, error: 'Floor plan does not belong to this location' },
        { status: 403 }
      );
    }
    
    // Get the specific overlay
    const overlays = await orgDb.deviceOverlays.findByFloorPlan(planId);
    const overlay = overlays.find(o => o.id === overlayId);
    
    if (!overlay) {
      return NextResponse.json(
        { success: false, error: 'Device overlay not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      overlay
    });
  } catch (error) {
    console.error('Error fetching device overlay:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch device overlay' },
      { status: 500 }
    );
  }
});

// Update a device overlay
export const PATCH = withOrganizationAuth(async (
  req: NextRequest,
  authContext: OrganizationAuthContext,
  context: DeviceOverlayRouteContext
) => {
  try {
    const { id: locationId, planId, overlayId } = await context.params;
    
    if (!authContext.userId) {
      return NextResponse.json(
        { success: false, error: 'User not authenticated' },
        { status: 401 }
      );
    }
    
    const payload: UpdateDeviceOverlayPayload = await req.json();
    
    // Validate coordinates if provided
    if (typeof payload.x === 'number' && (payload.x < 0 || payload.x > 1)) {
      return NextResponse.json(
        { success: false, error: 'X coordinate must be between 0 and 1' },
        { status: 400 }
      );
    }
    
    if (typeof payload.y === 'number' && (payload.y < 0 || payload.y > 1)) {
      return NextResponse.json(
        { success: false, error: 'Y coordinate must be between 0 and 1' },
        { status: 400 }
      );
    }
    
    const orgDb = createOrgScopedDb(authContext.organizationId);
    
    // Verify floor plan exists and belongs to organization
    const floorPlans = await orgDb.floorPlans.findById(planId);
    
    if (floorPlans.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Floor plan not found' },
        { status: 404 }
      );
    }
    
    const floorPlan = floorPlans[0];
    
    // Verify location matches
    if (floorPlan.locationId !== locationId) {
      return NextResponse.json(
        { success: false, error: 'Floor plan does not belong to this location' },
        { status: 403 }
      );
    }
    
    // Update the overlay
    const result = await orgDb.deviceOverlays.update(
      overlayId,
      {
        x: payload.x,
        y: payload.y,
        updatedByUserId: authContext.userId
      }
    );
    
    return NextResponse.json({
      success: true,
      overlay: result[0]
    });
  } catch (error) {
    console.error('Error updating device overlay:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update device overlay' },
      { status: 500 }
    );
  }
});

// Delete a device overlay
export const DELETE = withOrganizationAuth(async (
  req: NextRequest,
  authContext: OrganizationAuthContext,
  context: DeviceOverlayRouteContext
) => {
  try {
    const { id: locationId, planId, overlayId } = await context.params;
    
    const orgDb = createOrgScopedDb(authContext.organizationId);
    
    // Verify floor plan exists and belongs to organization
    const floorPlans = await orgDb.floorPlans.findById(planId);
    
    if (floorPlans.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Floor plan not found' },
        { status: 404 }
      );
    }
    
    const floorPlan = floorPlans[0];
    
    // Verify location matches
    if (floorPlan.locationId !== locationId) {
      return NextResponse.json(
        { success: false, error: 'Floor plan does not belong to this location' },
        { status: 403 }
      );
    }
    
    // Delete the overlay
    await orgDb.deviceOverlays.delete(overlayId);
    
    return NextResponse.json({
      success: true,
      message: 'Device overlay deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting device overlay:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete device overlay' },
      { status: 500 }
    );
  }
});