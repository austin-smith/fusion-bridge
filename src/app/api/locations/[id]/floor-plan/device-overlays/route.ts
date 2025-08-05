import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';
import type { CreateDeviceOverlayPayload } from '@/types/device-overlay';

// Get device overlays for a location
export const GET = withOrganizationAuth(async (
  req: NextRequest,
  authContext: OrganizationAuthContext,
  context: RouteContext
) => {
  try {
    const { id: locationId } = await context.params;
    
    const orgDb = createOrgScopedDb(authContext.organizationId);
    const overlays = await orgDb.deviceOverlays.findByLocation(locationId);
    
    return NextResponse.json({
      success: true,
      overlays: overlays.map(overlay => ({
        ...overlay,
        // Convert string coordinates back to numbers for client
        x: parseFloat(overlay.x),
        y: parseFloat(overlay.y),
        rotation: overlay.rotation ? parseFloat(overlay.rotation) : undefined,
        scale: overlay.scale ? parseFloat(overlay.scale) : undefined,
        device: {
          id: overlay.device.id,
          name: overlay.device.name,
          type: overlay.device.type,
          standardizedDeviceType: overlay.device.standardizedDeviceType,
          standardizedDeviceSubtype: overlay.device.standardizedDeviceSubtype,
          status: overlay.device.status,
          connectorCategory: overlay.connector.category,
          connectorName: overlay.connector.name
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

// Create a new device overlay
export const POST = withOrganizationAuth(async (
  req: NextRequest,
  authContext: OrganizationAuthContext,
  context: RouteContext
) => {
  try {
    const { id: locationId } = await context.params;
    
    if (!authContext.userId) {
      return NextResponse.json(
        { success: false, error: 'User not authenticated' },
        { status: 401 }
      );
    }
    
    const payload: CreateDeviceOverlayPayload = await req.json();
    
    // Validate payload
    if (!payload.deviceId || !payload.locationId || 
        typeof payload.x !== 'number' || typeof payload.y !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Invalid payload: deviceId, locationId, x, and y are required' },
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
    
    // Ensure locationId matches route parameter
    if (payload.locationId !== locationId) {
      return NextResponse.json(
        { success: false, error: 'Location ID mismatch' },
        { status: 400 }
      );
    }
    
    const orgDb = createOrgScopedDb(authContext.organizationId);
    
    // Check if device overlay already exists for this device and location
    const existing = await orgDb.deviceOverlays.findByDeviceAndLocation(
      payload.deviceId, 
      locationId
    );
    
    if (existing.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Device is already placed on this floor plan' },
        { status: 409 }
      );
    }
    
    // Create the overlay
    const result = await orgDb.deviceOverlays.create({
      deviceId: payload.deviceId,
      locationId: locationId,
      x: payload.x.toString(),
      y: payload.y.toString(),
      rotation: payload.rotation?.toString(),
      scale: payload.scale?.toString(),
      createdByUserId: authContext.userId
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