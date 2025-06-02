import { NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { AutomationConfigSchema } from '@/lib/automation-schemas';
import { z } from 'zod';

// Schema for validating the POST request body
const PostBodySchema = z.object({
    name: z.string().min(1, { message: "Name is required" }),
    enabled: z.boolean().optional().default(true),
    config: AutomationConfigSchema,
    locationScopeId: z.string().uuid().nullable().optional(),
    tags: z.array(z.string()).optional().default([]),
});

/**
 * GET /api/automations
 * Fetches all automation configurations for the active organization.
 */
export const GET = withOrganizationAuth(async (request, authContext: OrganizationAuthContext) => {
  try {
    const orgDb = createOrgScopedDb(authContext.organizationId);
    const results = await orgDb.automations.findAll();

    return NextResponse.json({ success: true, data: results });

  } catch (error) {
    console.error("Failed to fetch automations:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to fetch automations" 
    }, { status: 500 });
  }
});

/**
 * POST /api/automations
 * Creates a new automation configuration in the active organization.
 */
export const POST = withOrganizationAuth(async (request, authContext: OrganizationAuthContext) => {
  try {
    const body = await request.json();
    
    const validationResult = PostBodySchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({ 
        success: false,
        error: "Invalid request body", 
        details: validationResult.error.flatten().fieldErrors 
      }, { status: 400 });
    }
    
    const { name, enabled, config, locationScopeId, tags } = validationResult.data;
    const orgDb = createOrgScopedDb(authContext.organizationId);

    // Validate locationScopeId belongs to organization if provided
    if (locationScopeId) {
      const locationExists = await orgDb.locations.exists(locationScopeId);
      if (!locationExists) {
        return NextResponse.json({
          success: false,
          error: "Location not found or not accessible"
        }, { status: 400 });
      }
    }

    const newAutomation = await orgDb.automations.create({
      name,
      enabled,
      configJson: config,
      locationScopeId,
      tags,
    });

    if (!newAutomation || newAutomation.length === 0) {
        return NextResponse.json({ 
          success: false, 
          error: "Failed to create automation record in database" 
        }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: newAutomation[0] }, { status: 201 });

  } catch (error) {
    console.error("Failed to create automation:", error);
    if (error instanceof z.ZodError) {
       return NextResponse.json({ 
         success: false, 
         error: "Invalid configuration data", 
         details: error.flatten().fieldErrors 
       }, { status: 400 });
    }
    return NextResponse.json({ 
      success: false, 
      error: "Failed to create automation" 
    }, { status: 500 });
  }
}); 