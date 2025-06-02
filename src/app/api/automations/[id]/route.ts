import { NextResponse, NextRequest } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { AutomationConfigSchema } from '@/lib/automation-schemas';
import { z } from 'zod';

// Schema for validating the PUT request body
const PutBodySchema = z.object({
    name: z.string().min(1, { message: "Name is required" }).optional(),
    enabled: z.boolean().optional(),
    config: AutomationConfigSchema.optional(),
    locationScopeId: z.string().uuid().nullable().optional(),
    tags: z.array(z.string()).optional(),
}).refine(data => Object.keys(data).length > 0, { 
    message: "At least one field must be provided for update"
});

/**
 * GET /api/automations/{id}
 * Fetches a specific automation configuration by ID within the active organization.
 */
export const GET = withOrganizationAuth(async (
  request: NextRequest,
  authContext: OrganizationAuthContext,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ 
        success: false, 
        error: "Automation ID is required" 
      }, { status: 400 });
    }

    const orgDb = createOrgScopedDb(authContext.organizationId);
    const result = await orgDb.automations.findById(id);

    if (result.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "Automation not found" 
      }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, data: result[0] });

  } catch (error) {
    console.error(`Failed to fetch automation:`, error);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to fetch automation" 
    }, { status: 500 });
  }
});

/**
 * PUT /api/automations/{id}
 * Updates a specific automation configuration within the active organization.
 */
export const PUT = withOrganizationAuth(async (
  request: NextRequest,
  authContext: OrganizationAuthContext,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ 
        success: false, 
        error: "Automation ID is required" 
      }, { status: 400 });
    }

    const body = await request.json();
    const validationResult = PutBodySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ 
        success: false,
        error: "Invalid request body", 
        details: validationResult.error.flatten().fieldErrors 
      }, { status: 400 });
    }
    
    const orgDb = createOrgScopedDb(authContext.organizationId);
    
    // Check if automation exists in this organization
    const existingAutomation = await orgDb.automations.findById(id);
    if (existingAutomation.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "Automation not found" 
      }, { status: 404 });
    }

    // Extract validated data
    const updateData = validationResult.data;
    
    // Validate locationScopeId belongs to organization if provided
    if (updateData.locationScopeId) {
      const locationExists = await orgDb.locations.exists(updateData.locationScopeId);
      if (!locationExists) {
        return NextResponse.json({
          success: false,
          error: "Location not found or not accessible"
        }, { status: 400 });
      }
    }
    
    // Construct the update object
    const updatePayload: any = {};
    if (updateData.name !== undefined) updatePayload.name = updateData.name;
    if (updateData.enabled !== undefined) updatePayload.enabled = updateData.enabled;
    if (updateData.config !== undefined) updatePayload.configJson = updateData.config;
    // Handle locationScopeId explicitly to allow setting it to null
    if ('locationScopeId' in updateData) { 
      updatePayload.locationScopeId = updateData.locationScopeId;
    }
    if (updateData.tags !== undefined) updatePayload.tags = updateData.tags;
    
    // Add updatedAt timestamp
    updatePayload.updatedAt = new Date();

    const updatedAutomation = await orgDb.automations.update(id, updatePayload);
      
    if (!updatedAutomation || updatedAutomation.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "Failed to update automation" 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: updatedAutomation[0] });

  } catch (error) {
    console.error(`Failed to update automation:`, error);
    if (error instanceof z.ZodError) {
       return NextResponse.json({ 
         success: false, 
         error: "Invalid configuration data", 
         details: error.flatten().fieldErrors 
       }, { status: 400 });
    }
    return NextResponse.json({ 
      success: false, 
      error: "Failed to update automation" 
    }, { status: 500 });
  }
});

/**
 * DELETE /api/automations/{id}
 * Deletes a specific automation configuration within the active organization.
 */
export const DELETE = withOrganizationAuth(async (
  request: NextRequest,
  authContext: OrganizationAuthContext,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ 
        success: false, 
        error: "Automation ID is required" 
      }, { status: 400 });
    }

    const orgDb = createOrgScopedDb(authContext.organizationId);
    
    // Check if automation exists in this organization before deleting
    const existingAutomation = await orgDb.automations.findById(id);
    if (existingAutomation.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "Automation not found" 
      }, { status: 404 });
    }

    await orgDb.automations.delete(id);

    return NextResponse.json({ 
      success: true, 
      data: { message: "Automation deleted successfully" } 
    }, { status: 200 });

  } catch (error) {
    console.error(`Failed to delete automation:`, error);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to delete automation" 
    }, { status: 500 });
  }
}); 