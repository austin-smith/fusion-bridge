import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth, type ApiRouteAuthContext } from '@/lib/auth/withApiRouteAuth';
import { z } from 'zod';
import { getOpenAIConfiguration } from '@/data/repositories/service-configurations';
import { testApiKey } from '@/services/drivers/openai';
import { OpenAIModel } from '@/types/openai-service-types';

// Request body schema for OpenAI test
const OpenAITestRequestSchema = z.object({
  configId: z.string().uuid('Invalid configuration ID format').optional(),
});

export const POST = withApiRouteAuth(async (req: NextRequest, authContext: ApiRouteAuthContext) => {
  try {
    const body = await req.json();
    
    // Validate request body (configId is optional - we can get config from repository)
    const parseResult = OpenAITestRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }

    // Get OpenAI configuration
    const openAIConfig = await getOpenAIConfiguration();
    
    if (!openAIConfig) {
      return NextResponse.json(
        { success: false, error: 'OpenAI service is not configured. Please configure your OpenAI settings first.' },
        { status: 400 }
      );
    }

    if (!openAIConfig.isEnabled) {
      return NextResponse.json(
        { success: false, error: 'OpenAI service is disabled. Enable the service first to test it.' },
        { status: 400 }
      );
    }

    if (!openAIConfig.apiKey) {
      return NextResponse.json(
        { success: false, error: 'OpenAI API key is missing. Please add your API key in the configuration.' },
        { status: 400 }
      );
    }

    // Test the API key using the configured parameters
    const testResult = await testApiKey(
      openAIConfig.apiKey,
      openAIConfig.model as OpenAIModel,
      Math.min(openAIConfig.maxTokens, 100), // Limit test tokens to 100 max
      openAIConfig.temperature,
      openAIConfig.topP
    );

    if (testResult.success) {
      return NextResponse.json({
        success: true,
        message: 'OpenAI API test successful! Your configuration is working correctly.',
        responseTime: testResult.responseTime,
        usage: testResult.usage,
      });
    } else {
      return NextResponse.json(
        { 
          success: false, 
          error: testResult.errorMessage || 'Failed to test OpenAI API',
          responseTime: testResult.responseTime 
        },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Error testing OpenAI API:', error);
    
    // Handle JSON parsing errors specifically
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON format in request body' },
        { status: 400 }
      );
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return NextResponse.json(
      { success: false, error: `Internal server error: ${errorMessage}` },
      { status: 500 }
    );
  }
}); 