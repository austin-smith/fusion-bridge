import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as yolinkDriver from '@/services/drivers/yolink';
import * as pikoDriver from '@/services/drivers/piko';
import * as geneaDriver from '@/services/drivers/genea';

// Schema for test connection request
const testConnectionSchema = z.object({
  driver: z.enum(['yolink', 'piko', 'genea']),
  config: z.record(z.any()),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate input
    const result = testConnectionSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data', details: result.error.format() },
        { status: 400 }
      );
    }
    
    const { driver, config } = result.data;
    let success = false;
    let message: string | null = null;
    let errorMessage: string | null = null;
    
    // Dispatch to the appropriate driver
    try {
      if (driver === 'yolink') {
        // Log the config being sent to the driver for debugging
        console.log('Testing YoLink connection with config:', {
          uaid: config.uaid ? '****' + config.uaid.substring(Math.max(0, config.uaid.length - 4)) : 'missing',
          clientSecret: config.clientSecret ? '[REDACTED]' : 'missing'
        });
        
        // Validate the YoLink config
        if (!config.uaid || !config.clientSecret) {
          console.error('Missing YoLink credentials');
          errorMessage = 'Missing YoLink credentials (UAID or Client Secret)';
          success = false;
        } else {
          // Test the connection - we no longer fetch home ID here
          success = await yolinkDriver.testConnection(config as yolinkDriver.YoLinkConfig);
          if (success) message = "YoLink connection successful!";
        }
      } else if (driver === 'piko') {
        console.log('Testing Piko connection with config type:', config.type);
        const pikoResult = await pikoDriver.testConnection(config as pikoDriver.PikoConfig);
        success = pikoResult.connected;
        if (success) message = "Piko connection successful!";
        // Piko test doesn't return a detailed error message currently

      } else if (driver === 'genea') {
        console.log('Testing Genea connection...');
        const geneaResult = await geneaDriver.testGeneaConnection(config);
        success = geneaResult.success;
        if (success) {
          message = geneaResult.message || 'Genea connection successful!';
        } else {
          errorMessage = geneaResult.error || 'Genea connection failed.';
        }
      }
    } catch (driverError) {
      errorMessage = driverError instanceof Error ? driverError.message : 'Unknown error from driver';
      console.error(`Connection test error (${driver}):`, errorMessage);
      success = false; // Ensure success is false if driver throws
    }
    
    if (success) {
      return NextResponse.json({
        success: true,
        data: {
          connected: true,
          message: message || 'Connection successful!', // Use specific message if available
        },
      });
    } else {
      // Simple mapping for proper display names
      const displayNameMap: Record<string, string> = {
        yolink: 'YoLink',
        piko: 'Piko',
        genea: 'Genea' // Add Genea display name
      };
      const displayName = displayNameMap[driver] || driver;
      
      return NextResponse.json({
        success: true, // The API call itself succeeded, but the connection test failed
        data: {
          connected: false,
          message: errorMessage || `Connection to ${displayName} failed. Please check credentials and try again.`,
        },
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error testing connection:', error);
    return NextResponse.json(
      { success: false, error: `Failed to test connection: ${errorMessage}` },
      { status: 500 }
    );
  }
} 