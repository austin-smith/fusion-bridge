import { NextResponse } from 'next/server';
import { z } from 'zod'; // Import Zod
import { 
    // getSystemInfo, // This will cause a build error until re-implemented or an alternative is found
    PikoApiError, // Keep for error handling if needed by mapPikoErrorResponse
    PikoConfig, 
    // PikoTokenResponse, // Not directly used by this route's logic anymore, token comes from request
    getSystemInfo as pikoGetSystemInfo, // Import and alias to avoid conflict if any
    PikoSystemInfo // Import the interface for the return type
} from '@/services/drivers/piko';
import { mapPikoErrorResponse } from '@/lib/api-utils';

// Define Zod schema for the token part (as per original code)
const pikoTokenSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
  // Other token fields are optional and not directly used by getSystemInfo
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
  expiresIn: z.number().optional(),
  sessionId: z.string().optional(),
  tokenType: z.string().optional(),
  scope: z.string().optional(),
});

// Define Zod schema for the config part (local only - as per original code)
const pikoLocalConfigSchema = z.object({
  type: z.literal('local'),
  host: z.string().min(1, 'Host is required'),
  port: z.number().int().positive('Port must be a positive integer'),
  username: z.string().min(1, 'Username is required'), 
  password: z.string().min(1, 'Password is required'), 
  ignoreTlsErrors: z.boolean().optional().default(false),
  // Fields from PikoConfig that are optional but allowed on the schema if someone passes them, 
  // though getSystemInfo for local type won't use selectedSystem or token from config.
  selectedSystem: z.string().optional(), 
  token: z.any().optional() 
});

// Define Zod schema for the entire request body
const systemInfoRequestBodySchema = z.object({
  // Use pikoLocalConfigSchema directly. 
  // The object produced by this schema is assignable to PikoConfig 
  // because PikoConfig has host/port as optional, and this schema makes them required.
  // TypeScript will handle assignability when calling pikoGetSystemInfo.
  config: pikoLocalConfigSchema, 
  token: pikoTokenSchema,
});

/**
 * Fetches system information (specifically the name) for a LOCAL Piko system
 * using a previously obtained access token and config.
 */
export async function POST(request: Request) {
  console.log('[Piko API /system-info] Received request');
  
  try {
    let parsedBody;
    try {
      const rawBody = await request.json();
      const result = systemInfoRequestBodySchema.safeParse(rawBody);
      if (!result.success) {
        console.error('[Piko API /system-info] Invalid request body:', result.error.format());
        return NextResponse.json(
          { success: false, error: 'Invalid request body', details: result.error.format() },
          { status: 400 }
        );
      }
      parsedBody = result.data;
    } catch (parseError: any) {
      console.error('[Piko API /system-info] Error parsing JSON body:', parseError);
      return NextResponse.json({ success: false, error: 'Invalid JSON format' }, { status: 400 });
    }

    // The config here is already validated by Zod to be PikoConfig & { type: 'local' }
    const { config, token } = parsedBody;
    console.log(`[Piko API /system-info] Processing validated request for host: ${config.host}:${config.port}`);

    // Call the correctly re-implemented getSystemInfo from the Piko driver
    const systemInfo: PikoSystemInfo = await pikoGetSystemInfo(config, token.accessToken);

    console.log(`[Piko API /system-info] Successfully fetched system info for host: ${config.host}. Name: ${systemInfo.name}`);
    return NextResponse.json({
      success: true,
      name: systemInfo.name,
      version: systemInfo.version,
      id: systemInfo.localId, 
      // Removed fullInfo to only return specified fields
    });

  } catch (error: unknown) {
    console.error('[Piko API /system-info] Error fetching Piko system info:', error);
    const { status, message } = mapPikoErrorResponse(error);
    return NextResponse.json(
      { success: false, error: `Failed to fetch system info: ${message}` }, 
      { status: status }
    );
  }
} 