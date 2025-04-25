import { NextResponse } from 'next/server';
import { getAccessToken, getSystems, PikoApiError } from '@/services/drivers/piko';
import { mapPikoErrorResponse } from '@/lib/api-utils'; // Import the shared helper

/**
 * Authenticates with Piko CDB and fetches the list of available systems
 */
export async function POST(request: Request) {
  let username: string | undefined;
  let password: string | undefined;

  try {
    // Parse request body safely
    try {
      const body = await request.json();
      username = body.username;
      password = body.password;
    } catch (parseError) {
      console.error('Error parsing request body for Piko systems:', parseError);
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 } // Bad Request for missing credentials in body
      );
    }

    // Step 1: Obtain a bearer token using our driver function
    const tokenResponse = await getAccessToken(username, password);

    // Step 2: Fetch the list of systems using our driver function
    const systems = await getSystems(tokenResponse.accessToken);

    // Return the systems data along with the token for future requests
    return NextResponse.json({
      success: true,
      systems,
      token: {
        accessToken: tokenResponse.accessToken,
        expiresAt: tokenResponse.expiresAt,
        refreshToken: tokenResponse.refreshToken,
      }
    });

  } catch (error: unknown) {
    console.error('Error processing Piko systems request:', error);

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