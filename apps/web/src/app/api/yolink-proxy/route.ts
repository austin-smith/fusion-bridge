import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as yolinkDriver from '@/services/drivers/yolink';
import type { YoLinkConfig } from '@/services/drivers/yolink';

// Schema for token request - expecting uaid/clientSecret
const tokenRequestSchema = z.object({
  uaid: z.string(),
  clientSecret: z.string(),
});

// Schema for home info request - UPDATED
const homeInfoRequestSchema = z.object({
  uaid: z.string(),
  clientSecret: z.string(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = request.headers.get('x-yolink-action');
    
    // Proxy the getAccessToken request
    if (action === 'getAccessToken') {
      const result = tokenRequestSchema.safeParse(body);
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: 'Invalid request data' },
          { status: 400 }
        );
      }
      
      const { uaid, clientSecret } = result.data;
      try {
        // Create a minimal config for getRefreshedYoLinkToken
        const tempConfig: YoLinkConfig = { uaid, clientSecret, scope: [] }; 
        const tokenDetails = await yolinkDriver.getRefreshedYoLinkToken(tempConfig);
        // Return the relevant token details. Client might expect just accessToken or more.
        // For now, returning an object with accessToken, refreshToken, and expiresAt.
        return NextResponse.json({
          success: true, 
          accessToken: tokenDetails.newAccessToken,
          refreshToken: tokenDetails.newRefreshToken,
          expiresAt: tokenDetails.newExpiresAt,
          // updatedConfig: tokenDetails.updatedConfig // Optionally return the full updated config if needed by client
        });
      } catch (error) {
        console.error('Error getting YoLink access token via proxy:', error);
        return NextResponse.json(
          { success: false, error: error instanceof Error ? error.message : 'Failed to get access token' },
          { status: 500 }
        );
      }
    }
    
    // Proxy the getHomeInfo request
    if (action === 'getHomeInfo') {
      const result = homeInfoRequestSchema.safeParse(body);
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: 'Invalid request data' },
          { status: 400 }
        );
      }
      
      const { uaid, clientSecret } = result.data;
      try {
        const credTestResult = await yolinkDriver.testYoLinkCredentials(uaid, clientSecret);

        if (credTestResult.success && credTestResult.homeId) {
          return NextResponse.json({
            success: true,
            homeId: credTestResult.homeId,
          });
        } else {
          // If testYoLinkCredentials was not successful or homeId is missing, return an error.
          // Use the error message from credTestResult if available.
          return NextResponse.json(
            { success: false, error: credTestResult.error || 'Failed to get home info: Invalid credentials or unable to retrieve homeId.' },
            { status: credTestResult.error?.includes("Invalid") || credTestResult.error?.includes("required") ? 400 : 401 } // 400 for bad input, 401 for auth failure
          );
        }
      } catch (error) {
        // This catch is for unexpected errors during the call to testYoLinkCredentials itself.
        console.error('Error calling testYoLinkCredentials in YoLink proxy for getHomeInfo:', error);
        return NextResponse.json(
          { success: false, error: error instanceof Error ? error.message : 'Failed to get home info due to an unexpected error.' },
          { status: 500 }
        );
      }
    }
    
    // If we get here, the action is not supported
    return NextResponse.json(
      { success: false, error: 'Unsupported action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in YoLink proxy:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 