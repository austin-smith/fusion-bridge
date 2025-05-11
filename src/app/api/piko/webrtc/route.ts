import { NextRequest, NextResponse } from 'next/server';
import { withAuthApi } from '@/lib/auth/withAuthApi';
import type { PikoConfig } from '@/services/drivers/piko';
import { getTokenAndConfig } from '@/services/drivers/piko';
// getSystemDeviceById and createPikoLoginTicket are no longer needed here
// as the library will handle WebRTC connection directly with accessToken

async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const connectorId = searchParams.get('connectorId');
  // cameraId is known by the frontend and passed to the library directly
  // positionMs is also handled by the frontend/library

  if (!connectorId) {
    return NextResponse.json({ success: false, error: 'Missing connectorId parameter' }, { status: 400 });
  }

  try {
    const { config: pikoConfig, token: pikoToken } = await getTokenAndConfig(connectorId);

    if (!pikoConfig || !pikoToken || !pikoToken.accessToken) {
      console.error(`[API Piko WebRTC] Failed to get Piko config or token for connector ${connectorId}`);
      return NextResponse.json({ success: false, error: 'Failed to retrieve Piko authentication details or configuration' }, { status: 500 });
    }

    let pikoSystemIdForLib: string | undefined = undefined;
    if (pikoConfig.type === 'cloud') {
      if (!pikoConfig.selectedSystem) {
        // This should ideally be caught by getTokenAndConfig or config validation earlier
        return NextResponse.json({ success: false, error: 'Cloud Piko configuration is missing selectedSystem' }, { status: 500 });
      }
      pikoSystemIdForLib = pikoConfig.selectedSystem;
    } else if (pikoConfig.type === 'local') {
      // For local, systemId might not be directly applicable for WebRtcUrlConfig in the same way.
      // The library might infer server address from other means or need a different config structure for local.
      // For now, we'll return undefined for systemId if it's local, and the frontend/library will need to handle it.
      // Or, the library might primarily target cloud access via systemId and accessToken.
      // This needs to be tested with the library for local Piko systems.
      console.warn(`[API Piko WebRTC] Connector ${connectorId} is local. pikoSystemId will be undefined. Library compatibility for local needs verification.`);
    } else {
      const exhaustiveCheck: never = pikoConfig.type;
      console.error(`[API Piko WebRTC] Unsupported Piko config type: ${exhaustiveCheck}`);
      return NextResponse.json({ success: false, error: 'Unsupported Piko configuration type' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        pikoSystemId: pikoSystemIdForLib, // Will be undefined for local, or if not a cloud config
        accessToken: pikoToken.accessToken,
        connectionType: pikoConfig.type,
      },
    });

  } catch (error) {
    console.error('[API Piko WebRTC] Error providing details for WebRTCStreamManager:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    if ((error as any).statusCode) {
        return NextResponse.json({ success: false, error: message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ success: false, error: `Internal server error: ${message}` }, { status: 500 });
  }
}

export const GET = withAuthApi(handler); 