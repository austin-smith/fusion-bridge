import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { requestDeviceStateChange } from '@/lib/device-actions';
import { ActionableState, DisplayState, ON, OFF } from '@/lib/mappings/definitions';
import { z } from 'zod';
import { db } from '@/data/db';
import { devices } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';

// Define the expected request body schema
const StateChangeRequestSchema = z.object({
    state: z.nativeEnum(ActionableState), // Ensure state matches the enum values
});

// Define context type for params
// interface RouteContext {
//     params: { 
//         internalDeviceId: string; 
//     }
// }

export const POST = withOrganizationAuth(async (
    request: NextRequest, 
    authContext: OrganizationAuthContext,
    context: RouteContext<{ internalDeviceId: string }>
) => {
    const { internalDeviceId } = await context.params;

    if (!internalDeviceId) {
        return NextResponse.json(
            { success: false, error: 'Missing internal device ID' },
            { status: 400 }
        );
    }

    // Validate device belongs to organization
    try {
        const orgDb = createOrgScopedDb(authContext.organizationId);
        const deviceExists = await orgDb.devices.exists(internalDeviceId);
        
        if (!deviceExists) {
            return NextResponse.json(
                { success: false, error: 'Device not found or not accessible' },
                { status: 404 }
            );
        }
    } catch (error) {
        console.error(`[API StateChange] Error validating device ${internalDeviceId} for organization ${authContext.organizationId}:`, error);
        return NextResponse.json(
            { success: false, error: 'Failed to validate device access' },
            { status: 500 }
        );
    }

    let requestBody: { state: ActionableState };
    try {
        const body = await request.json();
        const validatedBody = StateChangeRequestSchema.parse(body);
        requestBody = validatedBody;
    } catch (error) {
        console.error(`[API StateChange] Invalid request body for ${internalDeviceId}:`, error);
        return NextResponse.json(
            { success: false, error: 'Invalid request body. Expected: { state: ActionableState }' },
            { status: 400 }
        );
    }

    // Call Abstraction Layer
    try {
        console.log(`[API StateChange] Calling requestDeviceStateChange for ${internalDeviceId}`);
        const success = await requestDeviceStateChange(internalDeviceId, requestBody.state);
        
        console.log(`[API StateChange] State change command successful for ${internalDeviceId}`);

        // Determine the new display state based on the requested action
        let newDisplayState: DisplayState | undefined = undefined;
        if (requestBody.state === ActionableState.SET_ON) {
            newDisplayState = ON;
        } else if (requestBody.state === ActionableState.SET_OFF) {
            newDisplayState = OFF;
        } else {
            console.warn(`[API StateChange] Unhandled ActionableState for DB update: ${requestBody.state}`);
        }

        // Update the database status if we determined a new display state
        if (newDisplayState) {
            try {
                console.log(`[API StateChange] Updating DB status for ${internalDeviceId} to '${newDisplayState}'`);
                await db.update(devices)
                  .set({ 
                      status: newDisplayState,
                      updatedAt: new Date() 
                  })
                  .where(eq(devices.id, internalDeviceId));
                console.log(`[API StateChange] DB status updated successfully for ${internalDeviceId}`);
            } catch (dbError) {
                console.error(`[API StateChange] Failed to update DB status for ${internalDeviceId} after successful command:`, dbError);
            }
        }
        
        // Return success, optionally including the new state
        return NextResponse.json({ 
            success: true,
            data: { displayState: newDisplayState }
        });

    } catch (error) {
        console.error(`[API StateChange] Error executing state change for ${internalDeviceId}:`, error);
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        return NextResponse.json(
            { success: false, error: `Failed to change device state: ${message}` },
            { status: 500 }
        );
    }
}); 