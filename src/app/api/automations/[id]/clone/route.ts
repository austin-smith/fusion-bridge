import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import type { AutomationConfig } from '@/lib/automation-schemas';

export const POST = withOrganizationAuth(async (
  req: NextRequest,
  authContext: OrganizationAuthContext,
  { params }: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await params;
  const originalId = resolvedParams.id;

  if (!originalId) {
    return NextResponse.json({ 
      success: false, 
      error: 'Automation ID is required' 
    }, { status: 400 });
  }

  try {
    const orgDb = createOrgScopedDb(authContext.organizationId);
    
    // 1. Fetch the original automation within organization scope
    const originalAutomationResult = await orgDb.automations.findById(originalId);

    if (originalAutomationResult.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Automation not found' 
      }, { status: 404 });
    }
    
    const originalAutomation = originalAutomationResult[0];

    // 2. Prepare the new automation data
    // Ensure a deep copy of configJson
    const newConfigJson = JSON.parse(JSON.stringify(originalAutomation.configJson)) as AutomationConfig;
    
    const newAutomationData = {
      name: `${originalAutomation.name} (Copy)`,
      enabled: false, // Cloned automations are disabled by default
      configJson: newConfigJson,
      locationScopeId: originalAutomation.locationScopeId, // Retain location scope
      tags: originalAutomation.tags || [], // Retain tags
    };

    // 3. Insert the new automation using org-scoped method
    const inserted = await orgDb.automations.create(newAutomationData);
    
    if (!inserted || inserted.length === 0) {
        return NextResponse.json({ 
          success: false, 
          error: "Failed to insert the cloned automation" 
        }, { status: 500 });
    }

    const newAutomation = inserted[0];

    return NextResponse.json({ success: true, data: newAutomation }, { status: 201 });

  } catch (error) {
    console.error('Failed to clone automation:', error);
    let errorMessage = 'Internal server error';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to clone automation', 
      details: errorMessage 
    }, { status: 500 });
  }
}); 