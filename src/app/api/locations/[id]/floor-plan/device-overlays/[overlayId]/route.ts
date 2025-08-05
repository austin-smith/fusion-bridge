import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';
import type { UpdateDeviceOverlayPayload } from '@/types/device-overlay';

interface OverlayRouteContext extends RouteContext {
  params: Promise<{ id: string; overlayId: string }>;
}

// Update device overlay position
export const PATCH = withOrganizationAuth(async (
  req: NextRequest,
  authContext: OrganizationAuthContext,
  context: OverlayRouteContext
) => {
  try {
    const { id: locationId, overlayId } = await context.params;
    
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
        { success: false, error: 'X coordinate must be normalized between 0 and 1' },
        { status: 400 }
      );
    }
    
    if (typeof payload.y === 'number' && (payload.y < 0 || payload.y > 1)) {
      return NextResponse.json(
        { success: false, error: 'Y coordinate must be normalized between 0 and 1' },
        { status: 400 }
      );
    }
    
    const orgDb = createOrgScopedDb(authContext.organizationId);
    
    // Find the overlay to get the device ID
    const existing = await orgDb.deviceOverlays.findByLocation(locationId);
    const overlay = existing.find(o => o.id === overlayId);
    
    if (!overlay) {
      return NextResponse.json(
        { success: false, error: 'Device overlay not found' },
        { status: 404 }
      );
    }
    
    // Update the overlay
    const result = await orgDb.deviceOverlays.update(
      overlay.deviceId, 
      locationId, 
      {
        x: payload.x?.toString(),
        y: payload.y?.toString(),
        rotation: payload.rotation?.toString(),
        scale: payload.scale?.toString(),
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

// Delete device overlay
export const DELETE = withOrganizationAuth(async (
  req: NextRequest,
  authContext: OrganizationAuthContext,
  context: OverlayRouteContext
) => {
  try {
    const { id: locationId, overlayId } = await context.params;
    
    const orgDb = createOrgScopedDb(authContext.organizationId);
    
    // Find the overlay to get the device ID
    const existing = await orgDb.deviceOverlays.findByLocation(locationId);
    const overlay = existing.find(o => o.id === overlayId);
    
    if (!overlay) {
      return NextResponse.json(
        { success: false, error: 'Device overlay not found' },
        { status: 404 }
      );
    }
    
    // Delete the overlay
    await orgDb.deviceOverlays.delete(overlay.deviceId, locationId);
    
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