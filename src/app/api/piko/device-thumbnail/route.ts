import { NextRequest, NextResponse } from 'next/server';
import * as pikoDriver from '@/services/drivers/piko';
import { sanitizeCameraId } from '@/lib/utils';

export const dynamic = 'force-dynamic'; // Ensure fresh data

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const connectorId = searchParams.get('connectorId');
  const cameraIdParam = searchParams.get('cameraId'); // <-- CORRECTED: Read 'cameraId' param
  const timestampMsStr = searchParams.get('timestamp'); // Use 'timestamp' as sent by frontend
  const size = searchParams.get('size');

  if (!connectorId || !cameraIdParam) { // <-- Check cameraId
    console.error('[API Thumb] Error: Missing connectorId or cameraId'); // <-- Update error log
    return NextResponse.json({ success: false, error: 'Missing connectorId or cameraId' }, { status: 400 }); // <-- Update error message
  }

  // Strip curly braces from cameraId if present (handles Piko device IDs stored with braces)
  const cameraId = sanitizeCameraId(cameraIdParam);

  try {
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
        console.error(`[API Thumb] Piko API Error Details (${statusCode}): ${error.errorString}${error.rawErrorOmitted ? ' (Raw error details omitted)' : ''}`);
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