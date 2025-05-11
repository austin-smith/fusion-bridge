import { NextRequest, NextResponse } from 'next/server';
import * as pikoDriver from '@/services/drivers/piko';

export const dynamic = 'force-dynamic'; // Ensure fresh data

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const connectorId = searchParams.get('connectorId');
  const cameraId = searchParams.get('cameraId'); // <-- CORRECTED: Read 'cameraId' param
  const timestampMsStr = searchParams.get('timestamp'); // Use 'timestamp' as sent by frontend
  const size = searchParams.get('size');

  // --- DEBUG LOG: Incoming Params ---
  console.log(`[API Thumb] Req Params - ConnectorID: ${connectorId}, CameraID: ${cameraId}, Timestamp: ${timestampMsStr}, Size: ${size}`); // <-- Use cameraId in log
  // --- END DEBUG --- 

  if (!connectorId || !cameraId) { // <-- Check cameraId
    console.error('[API Thumb] Error: Missing connectorId or cameraId'); // <-- Update error log
    return NextResponse.json({ success: false, error: 'Missing connectorId or cameraId' }, { status: 400 }); // <-- Update error message
  }

  try {
    // --- Use Helper from piko.ts ---
    // The getTokenAndConfig call is not directly needed here because 
    // pikoDriver.getPikoDeviceThumbnail will call fetchPikoApiData, 
    // which internally calls getTokenAndConfig using the connectorId.
    // const { config, token } = await pikoDriver.getTokenAndConfig(connectorId); 
    
    // --- DEBUG LOG: Config & Token ---
    // console.log(`[API Thumb] Fetched Config Type: ${config?.type}, Token Access Token Present: ${!!token?.accessToken}`);
    // --- END DEBUG --- 

    // --- Fetch Thumbnail ---
    const timestampNum = timestampMsStr ? parseInt(timestampMsStr, 10) : undefined;
    console.log(`[API Thumb] Calling getPikoDeviceThumbnail with: ConnectorID=${connectorId}, CameraID=${cameraId}, Timestamp=${timestampNum}, Size=${size}`);
    
    const thumbnailBlob = await pikoDriver.getPikoDeviceThumbnail(
      connectorId,      // Corrected: Pass connectorId
      cameraId,         // Corrected: Pass cameraId as deviceId
      timestampNum, 
      size ?? undefined
      // Removed superfluous arguments
    );

    // --- DEBUG LOG: Blob Result ---
    if (thumbnailBlob instanceof Blob) {
        console.log(`[API Thumb] Received Blob - Size: ${thumbnailBlob.size}, Type: ${thumbnailBlob.type}`);
    } else {
        console.log(`[API Thumb] Received Non-Blob Result:`, thumbnailBlob);
    }
    // --- END DEBUG --- 

    // Ensure we actually received a Blob before attempting to return it
    if (!(thumbnailBlob instanceof Blob)) {
        console.error(`[API Thumb] Error: getPikoDeviceThumbnail did not return a Blob for CameraID: ${cameraId}.`); // <-- Use cameraId in log
        throw new Error("Failed to retrieve image data from source.");
    }

    // Return the blob directly with appropriate headers
    return new NextResponse(thumbnailBlob, {
      status: 200,
      headers: {
        'Content-Type': thumbnailBlob.type || 'image/jpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error: unknown) {
    // --- Enhanced Error Logging ---
    let errorMessage = 'Failed to fetch device thumbnail';
    let statusCode = 500;
    console.error(`[API Thumb] Error occurred for ConnID: ${connectorId}, CameraID: ${cameraId}, Timestamp: ${timestampMsStr}`); // <-- Use cameraId in log
    if (error instanceof pikoDriver.PikoApiError) {
        errorMessage = `Piko API Error: ${error.message}`;
        statusCode = error.statusCode || 500;
        console.error(`[API Thumb] Piko API Error Details (${statusCode}):`, error.errorString, error.rawError);
    } else if (error instanceof Error) {
        errorMessage = error.message;
         console.error(`[API Thumb] Generic Error:`, error);
    } else {
        console.error(`[API Thumb] Unknown Error Type:`, error);
    }
    // --- End Enhanced Error Logging ---
    return NextResponse.json({ success: false, error: errorMessage }, { status: statusCode });
  }
} 