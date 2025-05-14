import { NextResponse } from 'next/server';
import { getPushcutConfiguration } from '@/data/repositories/service-configurations';
import { getActivePushcutDevices } from '@/services/drivers/pushcut';

export async function GET(request: Request) {
  console.log('[API /services/pushcut/list-devices] Received GET request');

  try {
    const config = await getPushcutConfiguration();

    if (!config || !config.apiKey) {
      let errorMessage = 'Pushcut service not configured or API key is missing.';
      if (!config) errorMessage = 'Pushcut service configuration not found.';
      else if (!config.apiKey) errorMessage = 'Pushcut API key is missing in configuration.';
      
      console.warn(`[API /services/pushcut/list-devices] ${errorMessage}`);
      return NextResponse.json({ success: false, error: errorMessage, devices: [] }, { status: 400 });
    }
    
    if (!config.isEnabled) {
        console.log(`[API /services/pushcut/list-devices] Note: Pushcut service is configured but not enabled. Proceeding to list devices.`);
    }

    const result = await getActivePushcutDevices(config.apiKey);

    if (result.success && result.devices) {
      console.log(`[API /services/pushcut/list-devices] Successfully fetched ${result.devices.length} active devices.`);
      return NextResponse.json({ 
        success: true, 
        devices: result.devices 
      });
    } else {
      console.error('[API /services/pushcut/list-devices] Failed to fetch active devices from driver:', result.errorMessage, result.errors);
      return NextResponse.json(
        { 
          success: false, 
          error: result.errorMessage || 'Failed to fetch active devices from Pushcut.',
          devices: [],
          details: result.errors
        }, 
        { status: result.status && result.status >= 400 && result.status < 600 ? result.status : 500 }
      );
    }
  } catch (error) {
    console.error('[API /services/pushcut/list-devices] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ success: false, error: errorMessage, devices: [] }, { status: 500 });
  }
} 