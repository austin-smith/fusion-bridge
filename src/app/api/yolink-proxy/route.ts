import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as yolinkDriver from '@/services/drivers/yolink';
import type { YoLinkConfig } from '@/services/drivers/yolink';

// Schema for token request - expecting uaid/clientSecret
const tokenRequestSchema = z.object({
  uaid: z.string(),
  clientSecret: z.string(),
});

// Schema for home info request
const homeInfoRequestSchema = z.object({
  accessToken: z.string(),
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
      
      const { accessToken } = result.data;
      try {
        // FIXME: The new yolinkDriver.getHomeInfo(connectorId, config) requires a connectorId and config.
        // This proxy action only receives an accessToken and cannot directly use the refactored getHomeInfo.
        // This part needs to be re-evaluated or the proxy action removed/changed.
        // For now, returning an error indicating this part is not functional with the new driver.
        console.warn('[YoLink Proxy] getHomeInfo action is not compatible with the refactored YoLink driver and requires an update.');
        return NextResponse.json(
            { success: false, error: 'getHomeInfo via proxy is currently non-functional due to driver changes. Requires connectorId.' },
            { status: 501 } // Not Implemented
        );
      } catch (error) {
        console.error('Error getting YoLink home info:', error);
        return NextResponse.json(
          { success: false, error: error instanceof Error ? error.message : 'Failed to get home info' },
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