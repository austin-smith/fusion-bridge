import { NextResponse } from 'next/server';
import { getPushcutConfiguration } from '@/data/repositories/service-configurations';
import { sendPushcutNotification } from '@/services/drivers/pushcut';
import type { PushcutSendParams } from '@/types/pushcut-types'; // For request body type
import { PushcutNotificationParamsSchema } from '@/types/pushcut-types'; // For validating specific params

export async function POST(request: Request) {
  console.log('[API /services/pushcut/test] Received POST request');

  let requestBody;
  try {
    requestBody = await request.json();
  } catch (error) {
    console.error('[API /services/pushcut/test] Error parsing JSON body:', error);
    return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
  }

  const { notificationName, ...params } = requestBody as Partial<PushcutSendParams>; // Cast to partial to check existence

  if (!notificationName) {
    return NextResponse.json({ success: false, error: 'Missing notificationName in request body' }, { status: 400 });
  }

  // Validate the rest of the parameters (excluding notificationName which is handled separately)
  const paramsValidation = PushcutNotificationParamsSchema.safeParse(params);
  if (!paramsValidation.success) {
    const errors = paramsValidation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    console.error('[API /services/pushcut/test] Invalid parameters in request body:', errors);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Invalid notification parameters in request body.',
        details: errors 
      },
      { status: 400 }
    );
  }

  const validParams = paramsValidation.data;

  try {
    const config = await getPushcutConfiguration();

    if (!config || !config.apiKey) {
      let errorMessage = 'Pushcut service not configured or API key is missing.';
      if (!config) errorMessage = 'Pushcut service configuration not found.';
      else if (!config.apiKey) errorMessage = 'Pushcut API key is missing in configuration.';
      
      console.warn(`[API /services/pushcut/test] ${errorMessage}`);
      return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
    }

    if (!config.isEnabled) {
        console.log(`[API /services/pushcut/test] Note: Pushcut service is configured but not enabled. Proceeding with test.`);
    }

    console.log(`[API /services/pushcut/test] Sending test notification "${notificationName}" via Pushcut driver.`);
    const result = await sendPushcutNotification(config.apiKey, notificationName, validParams);

    if (result.ok) {
      console.log(`[API /services/pushcut/test] Test notification "${notificationName}" sent successfully.`);
      return NextResponse.json({ 
        success: true, 
        message: result.message || 'Test notification sent successfully.',
        details: result 
      });
    } else {
      console.error(`[API /services/pushcut/test] Failed to send test notification "${notificationName}":`, result.message, result.errors);
      return NextResponse.json(
        { 
          success: false, 
          error: result.message || 'Failed to send test notification.',
          details: result
        }, 
        { status: result.status && result.status >= 400 && result.status < 600 ? result.status : 500 }
      );
    }
  } catch (error) {
    console.error('[API /services/pushcut/test] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
} 