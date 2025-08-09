import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';
import type { CreateDeviceOverlayPayload } from '@/types/device-overlay';

interface FloorPlanOverlayRouteContext extends RouteContext {
  params: Promise<{ id: string; planId: string }>;
}

// Get device overlays for a specific floor plan
export const GET = withOrganizationAuth(async (
  req: NextRequest,
  authContext: OrganizationAuthContext,
  context: FloorPlanOverlayRouteContext
) => {
  try {
    const { id: locationId, planId } = await context.params;
    // Verify floor plan exists and belongs to organization
    const orgDb = createOrgScopedDb(authContext.organizationId);
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
    
    const overlays = await orgDb.deviceOverlays.findByFloorPlan(planId);
    
    return NextResponse.json({
      success: true,
      overlays: overlays.map(overlay => ({
        ...overlay,
        device: {
          id: overlay.device.id,
          name: overlay.device.name,
          type: overlay.device.type,
          standardizedDeviceType: overlay.device.standardizedDeviceType,
          standardizedDeviceSubtype: overlay.device.standardizedDeviceSubtype,
          status: overlay.device.status,
          connectorCategory: overlay.connector?.category || null,
          connectorName: overlay.connector?.name || null
        }
      }))
    });
  } catch (error) {
    console.error('Error fetching device overlays:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch device overlays' },
      { status: 500 }
    );
  }
});

// Create a new device overlay for a specific floor plan
export const POST = withOrganizationAuth(async (
  req: NextRequest,
  authContext: OrganizationAuthContext,
  context: FloorPlanOverlayRouteContext
) => {
  try {
    const { id: locationId, planId } = await context.params;
    
    if (!authContext.userId) {
      return NextResponse.json(
        { success: false, error: 'User not authenticated' },
        { status: 401 }
      );
    }
    
    const payload: CreateDeviceOverlayPayload = await req.json();
    
    // Validate payload  
    if (!payload.deviceId || !payload.floorPlanId ||
        typeof payload.x !== 'number' || typeof payload.y !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Invalid payload: deviceId, floorPlanId, x, and y are required' },
        { status: 400 }
      );
    }
    
    // Validate coordinates are normalized (0-1)
    if (payload.x < 0 || payload.x > 1 || payload.y < 0 || payload.y > 1) {
      return NextResponse.json(
        { success: false, error: 'Coordinates must be normalized between 0 and 1' },
        { status: 400 }
      );
    }
    
    // Ensure floorPlanId matches route parameter
    if (payload.floorPlanId !== planId) {
      return NextResponse.json(
        { success: false, error: 'Floor plan ID mismatch' },
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
    
    // Validate optional props.camera if present
    const fov = payload?.props?.camera?.fovDeg;
    const rot = payload?.props?.camera?.rotationDeg;
    if (typeof fov !== 'undefined' && (fov < 0 || fov > 360)) {
      return NextResponse.json(
        { success: false, error: 'camera.fovDeg must be between 0 and 360' },
        { status: 400 }
      );
    }
    if (typeof rot !== 'undefined' && (rot < 0 || rot > 360)) {
      return NextResponse.json(
        { success: false, error: 'camera.rotationDeg must be between 0 and 360' },
        { status: 400 }
      );
    }

    // Check if device is already placed on this floor plan
    const existingOverlay = await orgDb.deviceOverlays.findByDeviceAndFloorPlan(
      payload.deviceId,
      payload.floorPlanId
    );
    
    if (existingOverlay.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Device is already placed on this floor plan' },
        { status: 409 }
      );
    }
    
    // Create the overlay
    const result = await orgDb.deviceOverlays.create({
      deviceId: payload.deviceId,
      floorPlanId: payload.floorPlanId,
      x: payload.x,
      y: payload.y,
      createdByUserId: authContext.userId,
      props: payload.props ?? {}
    });
    
    return NextResponse.json({
      success: true,
      overlay: result[0]
    });
    
  } catch (error) {
    console.error('Error creating device overlay:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create device overlay' },
      { status: 500 }
    );
  }
});