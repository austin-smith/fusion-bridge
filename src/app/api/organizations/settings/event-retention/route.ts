import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrganizationAuth } from '@/lib/auth/withOrganizationAuth';
import { 
  getEventRetentionSettings, 
  saveEventRetentionSettings,
  getOrCreateEventRetentionSettings
} from '@/data/repositories/organization-settings';
import type { EventRetentionPolicy } from '@/types/organization-settings';
import { RetentionStrategy } from '@/types/organization-settings';

// Validation schema for event retention policy
const eventRetentionPolicySchema = z.object({
  strategy: z.nativeEnum(RetentionStrategy),
  maxAgeInDays: z.number().int().min(1).max(365).optional(),
  maxEvents: z.number().int().min(1000).max(250000).optional(),
}).refine((data) => {
  // Ensure required fields are present based on strategy
  if (data.strategy === RetentionStrategy.TIME || data.strategy === RetentionStrategy.HYBRID) {
    return data.maxAgeInDays !== undefined;
  }
  return true;
}, {
  message: "maxAgeInDays is required for time-based and hybrid strategies",
  path: ["maxAgeInDays"],
}).refine((data) => {
  // Ensure required fields are present based on strategy
  if (data.strategy === RetentionStrategy.COUNT || data.strategy === RetentionStrategy.HYBRID) {
    return data.maxEvents !== undefined;
  }
  return true;
}, {
  message: "maxEvents is required for count-based and hybrid strategies",
  path: ["maxEvents"],
});

// GET /api/organizations/settings/event-retention - Get current retention settings
export const GET = withOrganizationAuth(async (req, authContext) => {
  try {
    const settings = await getOrCreateEventRetentionSettings(authContext.organizationId);
    
    return NextResponse.json({ 
      success: true, 
      data: settings 
    });

  } catch (error: unknown) {
    console.error('Error fetching event retention settings:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Failed to fetch event retention settings: ${errorMessage}` },
      { status: 500 }
    );
  }
});

// PUT /api/organizations/settings/event-retention - Update retention policy
export const PUT = withOrganizationAuth(async (req, authContext) => {
  try {
    const body = await req.json();
    const validation = eventRetentionPolicySchema.safeParse(body);

    if (!validation.success) {
      console.error("Validation Error (PUT):", validation.error.errors);
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid retention policy', 
        details: validation.error.errors 
      }, { status: 400 });
    }

    const policy: EventRetentionPolicy = validation.data;

    // Save the updated policy (preserves existing stats)
    const updatedSettings = await saveEventRetentionSettings(
      authContext.organizationId, 
      policy
    );

    return NextResponse.json({ 
      success: true, 
      data: updatedSettings 
    });

  } catch (error) {
    console.error("Error updating event retention settings:", error);
    let errorMessage = 'Failed to update event retention settings';
    if (error instanceof z.ZodError) {
      errorMessage = 'Invalid data format.';
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ 
      success: false, 
      error: errorMessage 
    }, { status: 500 });
  }
});