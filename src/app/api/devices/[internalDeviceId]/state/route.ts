import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requestDeviceStateChange } from '@/lib/device-actions';
import { ActionableState, DisplayState, ON, OFF } from '@/lib/mappings/definitions';
import { z } from 'zod';
import { db } from '@/data/db';
import { devices } from '@/data/db/schema';
import { eq } from 'drizzle-orm';

// Define the expected request body schema
const StateChangeRequestSchema = z.object({
    state: z.nativeEnum(ActionableState), // Ensure state matches the enum values
});

// Define context type for params
interface RouteContext {
    params: { 
        internalDeviceId: string; 
    }
}

export async function POST(request: NextRequest, context: RouteContext) {
    const { internalDeviceId } = context.params;

    if (!internalDeviceId) {
        return NextResponse.json(
            { success: false, error: 'Missing internal device ID' },
            { status: 400 }
        );
    }

    let requestBody: { state: ActionableState };

    // 1. Parse and Validate Request Body
    try {
        const rawBody = await request.json();
        const validationResult = StateChangeRequestSchema.safeParse(rawBody);
        
        if (!validationResult.success) {
            console.error(`[API StateChange] Invalid request body for ${internalDeviceId}:`, validationResult.error.errors);
            return NextResponse.json(
                { success: false, error: 'Invalid request body', details: validationResult.error.flatten() },
                { status: 400 }
            );
        }
        requestBody = validationResult.data;
        console.log(`[API StateChange] Received request for ${internalDeviceId} to state: ${requestBody.state}`);

    } catch (error) {
        console.error(`[API StateChange] Error parsing request body for ${internalDeviceId}:`, error);
        return NextResponse.json(
            { success: false, error: 'Failed to parse request body' },
            { status: 400 }
        );
    }

    // 2. Call Abstraction Layer
    try {
        console.log(`[API StateChange] Calling requestDeviceStateChange for ${internalDeviceId}`);
        const success = await requestDeviceStateChange(internalDeviceId, requestBody.state);
        
        console.log(`[API StateChange] State change command successful for ${internalDeviceId}`);

        // --- BEGIN DB and Store Update --- //
        // Determine the new display state based on the requested action
        let newDisplayState: DisplayState | undefined = undefined;
        if (requestBody.state === ActionableState.SET_ON) {
            newDisplayState = ON;
        } else if (requestBody.state === ActionableState.SET_OFF) {
            newDisplayState = OFF;
        } else {
            // Handle other actionable states if they exist in the future
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
                // Log error, but still return success to the client as the command succeeded
            }
        }
        // --- END DB and Store Update --- //
        
        // Return success, optionally including the new state
        return NextResponse.json({ 
            success: true,
            data: { displayState: newDisplayState } // Include new state in response
        });

    } catch (error: unknown) {
        console.error(`[API StateChange] Error processing state change for ${internalDeviceId}:`, error);
        
        // Default error message and status
        let errorMessage = 'Failed to change device state.';
        let status = 500;

        if (error instanceof Error) {
            errorMessage = error.message;
            // Set specific statuses based on error messages from the abstraction layer/driver
            if (error.message.includes('Device not found')) {
                status = 404;
            } else if (error.message.includes('Invalid configuration') || error.message.includes('Missing required') || error.message.includes('Invalid raw device data')) {
                status = 400; // Bad request due to config/data issue
            } else if (error.message.includes('Unsupported action') || error.message.includes('Unsupported device type')) {
                status = 400; // Bad request - action not applicable
            } else if (error.message.includes('not yet supported') || error.message.includes('Unsupported connector category')) {
                status = 501; // Not Implemented
            } else if (error.message.includes('YoLink API Error') || error.message.includes('Failed to get YoLink token')){
                 status = 502; // Bad Gateway - upstream API error
            } // Add more specific error checks as needed
        }

        return NextResponse.json(
            { success: false, error: errorMessage },
            { status: status }
        );
    }
} 