import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as yolinkDriver from '@/services/drivers/yolink';
import * as pikoDriver from '@/services/drivers/piko';
import * as geneaDriver from '@/services/drivers/genea';
import type { PikoConfig } from '@/services/drivers/piko';
import type { YoLinkConfig } from '@/services/drivers/yolink';

// Define specific config schemas required for testing
const TestYoLinkConfigSchema = z.object({
  uaid: z.string().min(1, "UAID is required"),
  clientSecret: z.string().min(1, "Client Secret is required"),
});

const TestPikoCloudConfigSchema = z.object({
  type: z.literal('cloud').optional(), // Optional on input, will default if missing
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const TestPikoLocalConfigSchema = z.object({
  type: z.literal('local'),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  host: z.string().min(1, "Host is required"),
  port: z.number().int().min(1).max(65535, "Invalid port number"),
  ignoreTlsErrors: z.boolean().optional(), // Add TLS ignore flag for testing
});

// Discriminated union for Piko test config
const TestPikoConfigSchema = z.discriminatedUnion("type", [
  TestPikoCloudConfigSchema,
  TestPikoLocalConfigSchema
]);

const TestGeneaConfigSchema = z.object({
  apiKey: z.string().min(1, "API Key is required"),
});

// Schema for the overall test connection request using discriminated union based on driver
const testConnectionSchema = z.discriminatedUnion("driver", [
  z.object({
    driver: z.literal('yolink'),
    config: TestYoLinkConfigSchema,
  }),
  z.object({
    driver: z.literal('piko'),
    // We need to handle the case where 'type' might be missing or incorrect before passing to Piko union
    // Use a preprocess step or a refinement later
    config: z.record(z.any()), // Keep as record for now, refine inside route
  }),
  z.object({
    driver: z.literal('genea'),
    config: TestGeneaConfigSchema,
  }),
]);

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
    
    // Type assertion needed because Piko config parsing is handled separately below
    const { driver, config } = result.data as { 
        driver: 'yolink' | 'piko' | 'genea'; 
        config: any; // Use any here, specific parsing happens below
    };
    let success = false;
    let message: string | null = null;
    let errorMessage: string | null = null;
    let additionalData: Record<string, any> | null = null; // To store extra data like customerUuid
    let validatedPikoConfig: PikoConfig | null = null; // To store validated Piko config
    
    // Dispatch to the appropriate driver
    try {
      if (driver === 'yolink') {
        console.log('Testing YoLink connection with config:', {
          uaid: config.uaid ? '****' + config.uaid.substring(Math.max(0, config.uaid.length - 4)) : 'missing',
          clientSecret: config.clientSecret ? '[REDACTED]' : 'missing'
        });
        
        const validatedConfig = config as z.infer<typeof TestYoLinkConfigSchema>;
        
        // UPDATED LOGIC for YoLink testConnection:
        // The refactored yolinkDriver.testConnection(connectorId, cfg) requires a connectorId.
        // For testing new, unsaved credentials, we will call getRefreshedYoLinkToken directly.
        // Success means we can obtain a token with the given uaid/clientSecret.
        try {
          const tempCfg: YoLinkConfig = { 
            uaid: validatedConfig.uaid, 
            clientSecret: validatedConfig.clientSecret, 
            scope: [] // Scope is required by YoLinkConfig, provide a default
          };
          await yolinkDriver.getRefreshedYoLinkToken(tempCfg);
          success = true;
          message = "YoLink credentials validated successfully (token obtained).";
        } catch (tokenError) {
          console.error('YoLink credential test failed (getRefreshedYoLinkToken):', tokenError);
          success = false;
          errorMessage = tokenError instanceof Error ? tokenError.message : "Failed to obtain token with provided YoLink credentials.";
        }
      } else if (driver === 'piko') {
        console.log('Testing Piko connection with config type:', config.type);
        
        // Manually parse/validate Piko config because the type field dictates the schema
        const pikoConfigParse = TestPikoConfigSchema.safeParse({
            // Ensure 'type' is present for discriminated union, default to cloud if missing
            type: config?.type === 'local' ? 'local' : 'cloud',
            ...config 
        });

        if (!pikoConfigParse.success) {
            // Aggregate Zod errors into a single message
            errorMessage = pikoConfigParse.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
            success = false;
            console.error('Piko Config Validation Error:', errorMessage);
        } else {
            validatedPikoConfig = pikoConfigParse.data as PikoConfig; // Use validated data
            const pikoResult = await pikoDriver.testConnection(validatedPikoConfig);
            success = pikoResult.connected;
            // Use the message returned by the driver
            if (success) {
                message = pikoResult.message || 'Piko connection successful!';
            } else {
                errorMessage = pikoResult.message || 'Piko connection failed.';
            }
        }

      } else if (driver === 'genea') {
        console.log('Testing Genea connection...');
        // Validation done by Zod schema
        const validatedConfig = config as z.infer<typeof TestGeneaConfigSchema>;
        const geneaResult = await geneaDriver.testGeneaConnection(validatedConfig);
        success = geneaResult.success;
        if (success) {
          message = geneaResult.message || 'Genea connection successful!';
          // Store the customerUuid if available
          if (geneaResult.customerUuid) {
            additionalData = { customerUuid: geneaResult.customerUuid };
          }
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
          ...additionalData, // Spread additional data like customerUuid here
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