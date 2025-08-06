import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { fileStorage } from '@/lib/storage/file-storage';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';

interface FloorPlansRouteContext extends RouteContext {
  params: Promise<{ id: string }>;
}

// Get all floor plans for a location
export const GET = withOrganizationAuth(async (
  req: NextRequest,
  authContext: OrganizationAuthContext,
  context: FloorPlansRouteContext
) => {
  try {
    const { id: locationId } = await context.params;
    
    // Verify location exists and belongs to organization
    const orgDb = createOrgScopedDb(authContext.organizationId);
    const locations = await orgDb.locations.findById(locationId);
    
    if (locations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Location not found' },
        { status: 404 }
      );
    }
    
    const floorPlans = await orgDb.floorPlans.findByLocation(locationId);
    
    return NextResponse.json({
      success: true,
      floorPlans
    });
  } catch (error) {
    console.error('Error fetching floor plans:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch floor plans' },
      { status: 500 }
    );
  }
});

// Create a new floor plan for a location
export const POST = withOrganizationAuth(async (
  req: NextRequest,
  authContext: OrganizationAuthContext,
  context: FloorPlansRouteContext
) => {
  try {
    const { id: locationId } = await context.params;
    const formData = await req.formData();
    const name = formData.get('name') as string;
    const file = formData.get('floorPlan') as File;
    
    if (!name || !file) {
      return NextResponse.json(
        { success: false, error: 'Name and floor plan file are required' },
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
    
    // Create floor plan record first to get the ID
    const floorPlan = await orgDb.floorPlans.create({
      name,
      locationId,
      createdByUserId: authContext.userId
    });
    
    const floorPlanId = floorPlan[0].id;
    
    try {
      // Save floor plan file with the floor plan ID
      const saveResult = await fileStorage.saveFloorPlan(
        authContext.organizationId,
        locationId,
        floorPlanId,
        file,
        authContext.userId
      );
      
      // Update floor plan record with file data
      const updatedFloorPlan = await orgDb.floorPlans.update(floorPlanId, {
        floorPlanData: saveResult.floorPlanData,
        updatedByUserId: authContext.userId
      });
      
      return NextResponse.json({
        success: true,
        floorPlan: updatedFloorPlan[0]
      });
      
    } catch (fileError) {
      // If file save fails, delete the floor plan record
      await orgDb.floorPlans.delete(floorPlanId);
      throw fileError;
    }
    
  } catch (error) {
    console.error('Error creating floor plan:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create floor plan' },
      { status: 500 }
    );
  }
});