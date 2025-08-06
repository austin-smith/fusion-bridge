import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { fileStorage, type FloorPlanData } from '@/lib/storage/file-storage';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';

interface FloorPlanRouteContext extends RouteContext {
  params: Promise<{ id: string; planId: string }>;
}

// Serve floor plan file
export const GET = withOrganizationAuth(async (
  req: NextRequest,
  authContext: OrganizationAuthContext, 
  context: FloorPlanRouteContext
) => {
  try {
    const { id: locationId, planId } = await context.params;
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get('file');
    
    if (!filename) {
      return NextResponse.json(
        { success: false, error: 'Filename parameter required' },
        { status: 400 }
      );
    }
    
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
    
    // Verify the filename matches what's stored in the database
    if (!floorPlan.floorPlanData) {
      return NextResponse.json(
        { success: false, error: 'No floor plan file found' },
        { status: 404 }
      );
    }
    
    const floorPlanData = floorPlan.floorPlanData as FloorPlanData;
    const expectedFilename = floorPlanData.filePath.split('/').pop();
    
    if (filename !== expectedFilename) {
      return NextResponse.json(
        { success: false, error: 'Invalid file request' },
        { status: 403 }
      );
    }
    
    // Get file stream
    const { stream, metadata } = await fileStorage.getFloorPlanStream(
      authContext.organizationId,
      locationId,
      planId,
      filename
    );
    
    // Create response with proper headers
    const response = new NextResponse(stream as any, {
      status: 200,
      headers: {
        'Content-Type': metadata.contentType,
        'Content-Length': metadata.size.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
    
    return response;
  } catch (error) {
    console.error('Error serving floor plan file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to serve floor plan file' },
      { status: 500 }
    );
  }
});



// Update a floor plan
export const PUT = withOrganizationAuth(async (
  req: NextRequest,
  authContext: OrganizationAuthContext,
  context: FloorPlanRouteContext
) => {
  try {
    const { id: locationId, planId } = await context.params;
    const formData = await req.formData();
    const name = formData.get('name') as string;
    const file = formData.get('floorPlan') as File;
    
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
    
    const updateData: any = {
      updatedByUserId: authContext.userId
    };
    
    if (name) {
      updateData.name = name;
    }
    
    if (file) {
      // Delete old file if it exists
      if (floorPlan.floorPlanData) {
        try {
          await fileStorage.deleteFloorPlanFromData(
            authContext.organizationId,
            locationId,
            planId,
            floorPlan.floorPlanData as FloorPlanData
          );
        } catch (deleteError) {
          console.warn('Failed to delete old floor plan file:', deleteError);
        }
      }
      
      // Save new file
      const saveResult = await fileStorage.saveFloorPlan(
        authContext.organizationId,
        locationId,
        planId,
        file,
        authContext.userId
      );
      
      updateData.floorPlanData = saveResult.floorPlanData;
    }
    
    const updatedFloorPlan = await orgDb.floorPlans.update(planId, updateData);
    
    return NextResponse.json({
      success: true,
      floorPlan: updatedFloorPlan[0]
    });
  } catch (error) {
    console.error('Error updating floor plan:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update floor plan' },
      { status: 500 }
    );
  }
});

// Delete a floor plan
export const DELETE = withOrganizationAuth(async (
  req: NextRequest,
  authContext: OrganizationAuthContext,
  context: FloorPlanRouteContext
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
    
    // Delete associated device overlays first
    await orgDb.deviceOverlays.deleteByFloorPlan(planId);
    
    // Delete file if it exists
    if (floorPlan.floorPlanData) {
      try {
        await fileStorage.deleteFloorPlanFromData(
          authContext.organizationId,
          locationId,
          planId,
          floorPlan.floorPlanData as FloorPlanData
        );
      } catch (deleteError) {
        console.warn('Failed to delete floor plan file:', deleteError);
      }
    }
    
    // Delete floor plan record
    await orgDb.floorPlans.delete(planId);
    
    return NextResponse.json({
      success: true,
      message: 'Floor plan deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting floor plan:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete floor plan' },
      { status: 500 }
    );
  }
});