import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth, type ApiRouteAuthContext } from '@/lib/auth/withApiRouteAuth';
import { OpenWeatherTestSchema } from '@/types/openweather-types';
import { getOpenWeatherConfiguration } from '@/data/repositories/service-configurations';
import { testApiKey } from '@/services/drivers/openweather';

export const POST = withApiRouteAuth(async (req: NextRequest, authContext: ApiRouteAuthContext) => {
  try {
    const body = await req.json();
    
    // Validate request body
    const parseResult = OpenWeatherTestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }

    const { address } = parseResult.data;

    // Get OpenWeather configuration
    const openWeatherConfig = await getOpenWeatherConfiguration();
    
    if (!openWeatherConfig) {
      return NextResponse.json(
        { success: false, error: 'OpenWeather is not configured' },
        { status: 400 }
      );
    }

    if (!openWeatherConfig.isEnabled) {
      return NextResponse.json(
        { success: false, error: 'OpenWeather is disabled' },
        { status: 400 }
      );
    }

    if (!openWeatherConfig.apiKey) {
      return NextResponse.json(
        { success: false, error: 'OpenWeather API key is not configured' },
        { status: 400 }
      );
    }

    // Test the API key with the provided address
    const testResult = await testApiKey(openWeatherConfig.apiKey, address);

    if (testResult.success) {
      return NextResponse.json({
        success: true,
        message: testResult.message,
        result: testResult.result,
      });
    } else {
      return NextResponse.json(
        { success: false, error: testResult.message },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Error testing OpenWeather API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error while testing OpenWeather API' },
      { status: 500 }
    );
  }
}); 