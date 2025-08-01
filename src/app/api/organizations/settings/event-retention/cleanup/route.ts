import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrganizationAuth } from '@/lib/auth/withOrganizationAuth';
import { 
  cleanupOrganizationEvents,
  previewOrganizationCleanup
} from '@/services/event-cleanup-service';

// Validation schema for cleanup request
const cleanupRequestSchema = z.object({
  preview: z.boolean().default(false), // If true, only preview what would be deleted
});

// POST /api/organizations/settings/event-retention/cleanup - Manual cleanup (preview or execute)
export const POST = withOrganizationAuth(async (req, authContext) => {
  try {
    const body = await req.json();
    const validation = cleanupRequestSchema.safeParse(body);

    if (!validation.success) {
      console.error("Validation Error (POST cleanup):", validation.error.errors);
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid cleanup request', 
        details: validation.error.errors 
      }, { status: 400 });
    }

    const { preview } = validation.data;

    if (preview) {
      // Preview mode - show what would be deleted without actually deleting
      const previewResult = await previewOrganizationCleanup(authContext.organizationId);
      
      return NextResponse.json({ 
        success: true, 
        data: {
          mode: 'preview',
          ...previewResult
        }
      });
    } else {
      // Execute mode - actually perform the cleanup
      const cleanupResult = await cleanupOrganizationEvents(authContext.organizationId);
      
      return NextResponse.json({ 
        success: true, 
        data: {
          mode: 'execute',
          ...cleanupResult
        }
      });
    }

  } catch (error) {
    console.error("Error during manual cleanup:", error);
    let errorMessage = 'Failed to perform cleanup operation';
    if (error instanceof z.ZodError) {
      errorMessage = 'Invalid request format.';
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ 
      success: false, 
      error: errorMessage 
    }, { status: 500 });
  }
});