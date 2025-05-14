import { NextResponse } from 'next/server';
import { getPushcutConfiguration } from '@/data/repositories/service-configurations';
import { getDefinedPushcutNotifications } from '@/services/drivers/pushcut';

export async function GET(request: Request) {
  console.log('[API /services/pushcut/list-notifications] Received GET request');

  try {
    const config = await getPushcutConfiguration();

    if (!config || !config.apiKey) {
      let errorMessage = 'Pushcut service not configured or API key is missing.';
      if (!config) errorMessage = 'Pushcut service configuration not found.';
      else if (!config.apiKey) errorMessage = 'Pushcut API key is missing in configuration.';
      
      console.warn(`[API /services/pushcut/list-notifications] ${errorMessage}`);
      return NextResponse.json({ success: false, error: errorMessage, notifications: [] }, { status: 400 });
    }
    
    // Note: We proceed to list notifications even if config.isEnabled is false,
    // as the user might want to see their notifications to configure one for testing.
    if (!config.isEnabled) {
        console.log(`[API /services/pushcut/list-notifications] Note: Pushcut service is configured but not enabled. Proceeding to list notifications.`);
    }

    const result = await getDefinedPushcutNotifications(config.apiKey);

    if (result.success && result.notifications) {
      console.log(`[API /services/pushcut/list-notifications] Successfully fetched ${result.notifications.length} notifications.`);
      return NextResponse.json({ 
        success: true, 
        notifications: result.notifications 
      });
    } else {
      console.error('[API /services/pushcut/list-notifications] Failed to fetch notifications from driver:', result.errorMessage, result.errors);
      return NextResponse.json(
        { 
          success: false, 
          error: result.errorMessage || 'Failed to fetch defined notifications from Pushcut.',
          notifications: [],
          details: result.errors
        }, 
        { status: result.status && result.status >= 400 && result.status < 600 ? result.status : 500 }
      );
    }
  } catch (error) {
    console.error('[API /services/pushcut/list-notifications] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ success: false, error: errorMessage, notifications: [] }, { status: 500 });
  }
} 