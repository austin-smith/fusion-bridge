import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPushoverConfiguration } from '@/data/repositories/service-configurations';
import { addPushoverGroupUser } from '@/services/drivers/pushover';
import { AddUserToGroupParamsSchema } from '@/types/pushover-types';

export async function POST(request: NextRequest) {
  try {
    // Get Pushover configuration
    const pushoverConfig = await getPushoverConfiguration();
    if (!pushoverConfig || !pushoverConfig.apiToken || !pushoverConfig.groupKey) {
      return NextResponse.json(
        { success: false, error: 'Pushover configuration is missing or incomplete' },
        { status: 400 }
      );
    }

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const validationResult = AddUserToGroupParamsSchema.safeParse(body);
    if (!validationResult.success) {
      const fieldErrors = validationResult.error.flatten().fieldErrors;
      return NextResponse.json(
        { 
          success: false, 
          error: 'Validation failed', 
          details: fieldErrors 
        },
        { status: 400 }
      );
    }

    const { user, device, memo } = validationResult.data;

    // Add user to the group
    const result = await addPushoverGroupUser(
      pushoverConfig.apiToken,
      pushoverConfig.groupKey,
      { user, device, memo }
    );

    if (!result.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: result.errorMessage || 'Failed to add user to group',
          details: result.errors
        },
        { status: result.rawResponse?.status === 0 && result.errors ? 400 : 500 } // Pushover often returns 4xx for user errors
      );
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'User added to group successfully',
      pushoverRequestId: result.rawResponse?.request
    });
  } catch (error) {
    console.error('[API /pushover/group-users/add] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return NextResponse.json(
      { success: false, error: `Server error: ${errorMessage}` },
      { status: 500 }
    );
  }
} 