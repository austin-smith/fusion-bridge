import { NextResponse } from 'next/server';
import { getPushoverConfiguration } from '@/data/repositories/service-configurations';
import { getGroupInfo } from '@/services/drivers/pushover';
import { PushoverGroupInfoSchema } from '@/types/pushover-types';
import { z } from 'zod';

// Define response schema for API
const ResponseSchema = z.object({
  success: z.boolean(),
  groupInfo: PushoverGroupInfoSchema.optional(),
  error: z.string().optional(),
  errors: z.array(z.string()).optional(),
});

export async function GET() {
  try {
    // Get stored Pushover configuration
    const config = await getPushoverConfiguration();
    
    if (!config || !config.apiToken || !config.groupKey) {
      const response = {
        success: false, 
        error: 'Pushover configuration is missing or incomplete'
      };
      // Validate response
      ResponseSchema.parse(response);
      return NextResponse.json(response, { status: 400 });
    }

    // Call Pushover API to get group information
    const groupInfoResult = await getGroupInfo(config.apiToken, config.groupKey);
    
    if (!groupInfoResult.success) {
      const response = {
        success: false, 
        error: groupInfoResult.errorMessage || 'Failed to retrieve group information',
        errors: groupInfoResult.errors 
      };
      // Validate response
      ResponseSchema.parse(response);
      return NextResponse.json(response, { status: 400 });
    }

    // Return group information after validation
    const response = {
      success: true,
      groupInfo: groupInfoResult.groupInfo
    };
    
    // Validate response
    ResponseSchema.parse(response);
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in group info API route:', error);
    
    let errorMessage = 'An unexpected error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    // If error is from Zod validation, provide more context
    if (error instanceof z.ZodError) {
      errorMessage = `Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
    }
    
    const response = {
      success: false,
      error: errorMessage
    };
    
    try {
      // Attempt to validate the error response
      ResponseSchema.parse(response);
    } catch (validationError) {
      console.error('Failed to validate error response:', validationError);
      // Fall back to a simple response that will pass validation
      return NextResponse.json({
        success: false,
        error: 'Internal server error with response validation'
      }, { status: 500 });
    }
    
    return NextResponse.json(response, { status: 500 });
  }
} 