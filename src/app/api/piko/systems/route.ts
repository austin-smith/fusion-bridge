import { NextResponse } from 'next/server';
import {
    getAccessToken,
    getSystems,
    // testLocalPikoConnection, // Import the (planned) local test function
    PikoApiError,
    PikoConfig,
    PikoTokenResponse
} from '@/services/drivers/piko';
// Temp import for planned function type
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { testLocalPikoConnection as testLocalPikoConnectionTypeDefinition } from '@/services/drivers/piko';
import { mapPikoErrorResponse } from '@/lib/api-utils'; // Import the shared helper

/**
 * Authenticates with Piko (Cloud or Local) and either fetches cloud systems or tests local connection.
 */
export async function POST(request: Request) {
  let username: string | undefined;
  let password: string | undefined;
  let type: 'cloud' | 'local' = 'cloud'; // Explicitly type
  let host: string | undefined;
  let port: number | undefined;
  let ignoreTlsErrors: boolean | undefined;

  try {
    // Parse request body safely
    try {
      const body = await request.json();
      username = body.username;
      password = body.password;
      type = body.type === 'local' ? 'local' : 'cloud'; // Determine type
      if (type === 'local') {
        host = body.host;
        port = body.port;
        ignoreTlsErrors = body.ignoreTlsErrors; // Parse TLS flag
      }
    } catch (parseError) {
      console.error('Error parsing request body for Piko systems/test:', parseError);
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    // --- Common Validation ---
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 } // Bad Request for missing credentials in body
      );
    }
    // --- Local Specific Validation ---
    if (type === 'local' && (!host || port === undefined || port === null || isNaN(port))) {
        return NextResponse.json(
            { success: false, error: 'Host and Port are required for local connection type' },
            { status: 400 }
        );
    }

    // --- Branch based on type ---
    if (type === 'cloud') {
        // --- Cloud Logic (Existing) ---
        console.log('[Piko API /systems] Processing CLOUD request');
        // Step 1: Obtain a bearer token using our driver function
        const tokenResponse = await getAccessToken(username, password);

        // Step 2: Fetch the list of systems using our driver function
        const systems = await getSystems(tokenResponse.accessToken);

        // Return the systems data along with the token for future requests
        return NextResponse.json({
          success: true,
          type: 'cloud', // Include type in response
          systems,
          token: tokenResponse // Return the full token response object
        });
    } else {
        // --- Local Logic ---
        console.log(`[Piko API /systems] Processing LOCAL request for host: ${host}:${port}`);
        const config: PikoConfig = { type: 'local', username, password, host: host!, port: port!, ignoreTlsErrors: ignoreTlsErrors || false }; // Include TLS flag

        // Call the driver function to test local connection and get token
        // TODO: Remove type assertion when testLocalPikoConnection is implemented
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { testLocalPikoConnection } = require('@/services/drivers/piko'); // Temporary require
        const testLocalPikoConnectionFn = testLocalPikoConnection as unknown as typeof testLocalPikoConnectionTypeDefinition;
        const testResult = await testLocalPikoConnectionFn(config);

        // testLocalPikoConnection should return { connected: boolean, message?: string, token?: PikoTokenResponse }
        if (testResult.connected && testResult.token) {
            return NextResponse.json({
                success: true,
                type: 'local', // Include type in response
                message: testResult.message || 'Local connection successful!',
                token: testResult.token // Return the local token object
            });
        } else {
            // If testLocalPikoConnection didn't throw but returned connected: false
            throw new Error(testResult.message || 'Local connection test failed');
        }
    }

  } catch (error: unknown) {
    console.error(`Error processing Piko ${type || 'unknown type'} request:`, error);

    // Use the shared error mapping function
    const { status, message } = mapPikoErrorResponse(error);

    // Log the final determined error and status
    // console.error(`Responding with status ${status} and error: ${message}`); // Logging is done inside mapPikoErrorResponse now

    return NextResponse.json(
      { success: false, error: message }, // Use the message from the helper
      { status: status } // Use the status from the helper
    );
  }
} 