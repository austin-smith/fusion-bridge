import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPushoverConfiguration } from '@/data/repositories/service-configurations';
import { validatePushoverUser } from '@/services/drivers/pushover';
import { ValidateUserParamsSchema } from '@/types/pushover-types';

export async function POST(request: NextRequest) {
  try {
    // Get Pushover configuration
    const pushoverConfig = await getPushoverConfiguration();
    if (!pushoverConfig || !pushoverConfig.apiToken) {
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

    const validationResult = ValidateUserParamsSchema.safeParse(body);
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

    const { user, device } = validationResult.data;

    // Validate user key via Pushover API
    const result = await validatePushoverUser(
      pushoverConfig.apiToken,
      { user, device }
    );

    // Return the validation result
    return NextResponse.json({
      success: result.success,
      isValid: result.success, // Explicitly state validity
      devices: result.devices,
      licenses: result.licenses,
      errors: result.errors,
      errorMessage: result.errorMessage,
      pushoverRequestId: result.request
    });
  } catch (error) {
    console.error('[API /pushover/group-users/validate] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return NextResponse.json(
      { success: false, error: `Server error: ${errorMessage}` },
      { status: 500 }
    );
  }
} 