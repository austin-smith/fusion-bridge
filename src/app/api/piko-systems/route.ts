import { NextResponse } from 'next/server';
import { getAccessToken, getSystems } from '@/services/drivers/piko';

/**
 * Authenticates with Piko CDB and fetches the list of available systems
 */
export async function POST(request: Request) {
  try {
    // Parse request body
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // Step 1: Obtain a bearer token using our driver function
    let tokenResponse;
    try {
      tokenResponse = await getAccessToken(username, password);
    } catch (error) {
      console.error('Failed to obtain Piko token:', error);
      return NextResponse.json(
        { 
          success: false, 
          error: error instanceof Error 
            ? error.message 
            : 'Authentication failed. Please check your credentials.' 
        },
        { status: 401 }
      );
    }

    // Step 2: Fetch the list of systems using our driver function
    let systems;
    try {
      systems = await getSystems(tokenResponse.accessToken);
    } catch (error) {
      console.error('Failed to fetch Piko systems:', error);
      return NextResponse.json(
        { 
          success: false, 
          error: error instanceof Error 
            ? error.message 
            : 'Failed to fetch systems list' 
        },
        { status: 500 }
      );
    }

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
  } catch (error) {
    console.error('Error processing Piko systems request:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    );
  }
} 