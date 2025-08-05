import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { fileStorage } from '@/lib/storage/file-storage';

import type { FloorPlanData } from '@/types/index';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Upload floor plan
export const POST = withOrganizationAuth(async (
  req: NextRequest, 
  authContext: OrganizationAuthContext,
  context: RouteContext
) => {
  try {
    const { id: locationId } = await context.params;
    
    // Get form data
    const formData = await req.formData();
    const file = formData.get('floorPlan') as File;
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }
    
    // Check if location exists and belongs to organization
    const orgDb = createOrgScopedDb(authContext.organizationId);
    const locations = await orgDb.locations.findById(locationId);
    
    if (locations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Location not found' },
        { status: 404 }
      );
    }
    
    const location = locations[0];
    
    // Delete existing floor plan if it exists
    if (location.floorPlan) {
      await fileStorage.deleteFloorPlanFromData(
        authContext.organizationId,
        locationId,
        location.floorPlan as FloorPlanData
      );
    }
    
    // Save new floor plan
    const saveResult = await fileStorage.saveFloorPlan(
      authContext.organizationId,
      locationId,
      file,
      authContext.userId
    );
    
    // Update database with new floor plan metadata
    const updatedLocations = await orgDb.locations.update(locationId, {
      floorPlan: saveResult.floorPlanData
    });
    
    return NextResponse.json({
      success: true,
      data: {
        location: updatedLocations[0],
        floorPlan: saveResult.floorPlanData
      }
    });
    
  } catch (error) {
    console.error('Error uploading floor plan:', error);
    
    // Check if it's a validation error (from storage service)
    if (error instanceof Error && (
      error.message.includes('File size exceeds') ||
      error.message.includes('is not allowed') ||
      error.message.includes('File type') ||
      error.message.includes('File extension')
    )) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to upload floor plan' },
      { status: 500 }
    );
  }
});

// Serve floor plan file
export const GET = withOrganizationAuth(async (
  req: NextRequest,
  authContext: OrganizationAuthContext, 
  context: RouteContext
) => {
  try {
    const { id: locationId } = await context.params;
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get('file');
    
    if (!filename) {
      return NextResponse.json(
        { success: false, error: 'Filename parameter required' },
        { status: 400 }
      );
    }
    
    // Verify location exists and belongs to organization
    const orgDb = createOrgScopedDb(authContext.organizationId);
    const locations = await orgDb.locations.findById(locationId);
    
    if (locations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Location not found' },
        { status: 404 }
      );
    }
    
    // Additional security: verify the filename matches what's stored in the database
    const location = locations[0];
    if (!location.floorPlan) {
      return NextResponse.json(
        { success: false, error: 'No floor plan found for this location' },
        { status: 404 }
      );
    }
    
    const floorPlanData = location.floorPlan as FloorPlanData;
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
      filename
    );
    
    // Create response with proper headers
    const response = new NextResponse(stream as any, {
      status: 200,
      headers: {
        'Content-Type': metadata.contentType,
        'Content-Length': metadata.size.toString(),
        'Cache-Control': 'public, max-age=31536000', // 1 year cache
        'Content-Disposition': `inline; filename="${floorPlanData.filename}"`
      }
    });
    
    return response;
    
  } catch (error) {
    console.error('Error serving floor plan:', error);
    return NextResponse.json(
      { success: false, error: 'Floor plan not found' },
      { status: 404 }
    );
  }
});

// Delete floor plan
export const DELETE = withOrganizationAuth(async (
  req: NextRequest,
  authContext: OrganizationAuthContext,
  context: RouteContext
) => {
  try {
    const { id: locationId } = await context.params;
    
    // Get location
    const orgDb = createOrgScopedDb(authContext.organizationId);
    const locations = await orgDb.locations.findById(locationId);
    
    if (locations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Location not found' },
        { status: 404 }
      );
    }
    
    const location = locations[0];
    
    if (!location.floorPlan) {
      return NextResponse.json(
        { success: false, error: 'No floor plan to delete' },
        { status: 404 }
      );
    }
    
    // Delete file from storage
    await fileStorage.deleteFloorPlanFromData(
      authContext.organizationId,
      locationId,
      location.floorPlan as FloorPlanData
    );
    
    // Update database to remove floor plan reference
    const updatedLocations = await orgDb.locations.update(locationId, {
      floorPlan: null
    });
    
    return NextResponse.json({
      success: true,
      data: updatedLocations[0]
    });
    
  } catch (error) {
    console.error('Error deleting floor plan:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete floor plan' },
      { status: 500 }
    );
  }
});