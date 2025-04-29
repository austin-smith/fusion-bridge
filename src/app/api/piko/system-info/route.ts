import { NextResponse } from 'next/server';
import { z } from 'zod'; // Import Zod
import { 
    getSystemInfo, 
    PikoApiError, 
    PikoConfig, 
    PikoTokenResponse 
} from '@/services/drivers/piko';
import { mapPikoErrorResponse } from '@/lib/api-utils';

// Define Zod schema for the token part
const pikoTokenSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
  refreshToken: z.string().optional(),
  expiresAt: z.string().optional(),
  expiresIn: z.union([z.string(), z.number()]).optional(),
  sessionId: z.string().optional(),
  tokenType: z.string().optional(), // Allow other fields if present
  scope: z.string().optional(),
});

// Define Zod schema for the config part (local only)
const pikoLocalConfigSchema = z.object({
  type: z.literal('local'),
  host: z.string().min(1, 'Host is required'),
  port: z.number().int().positive('Port must be a positive integer'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  ignoreTlsErrors: z.boolean().optional().default(false),
  // Omit selectedSystem and token from PikoConfig base
});

// Define Zod schema for the entire request body
const systemInfoRequestBodySchema = z.object({
  config: pikoLocalConfigSchema,
  token: pikoTokenSchema,
});

/**
 * Fetches system information (specifically the name) for a LOCAL Piko system
 * using a previously obtained access token.
 */
export async function POST(request: Request) {
  console.log('[Piko API /system-info] Received request');
  
  try {
    // Parse and validate request body using Zod
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

    const { config, token } = parsedBody;
    console.log(`[Piko API /system-info] Processing validated request for host: ${config.host}:${config.port}`);

    // Call the driver function to get system info - casting token is safe due to schema validation
    const systemInfo = await getSystemInfo(config, token.accessToken);

    // Successfully fetched system info
    console.log(`[Piko API /system-info] Successfully fetched system info for host: ${config.host}. Name: ${systemInfo.name}`);
    return NextResponse.json({
      success: true,
      name: systemInfo.name,
      // Optionally return other info if needed later
      // version: systemInfo.version, 
      // localId: systemInfo.localId 
    });

  } catch (error: unknown) {
    console.error('[Piko API /system-info] Error fetching Piko system info:', error);

    // Use the shared error mapping function
    const { status, message } = mapPikoErrorResponse(error);

    return NextResponse.json(
      { success: false, error: `Failed to fetch system info: ${message}` }, 
      { status: status }
    );
  }
} 