import { NextRequest, NextResponse } from 'next/server';
import * as pikoDriver from '@/services/drivers/piko';

export const dynamic = 'force-dynamic'; // Ensure fresh data

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const connectorId = searchParams.get('connectorId');
  const deviceId = searchParams.get('deviceId');
  // Optional params from Piko API, pass them along if present
  const timestampMs = searchParams.get('timestampMs');
  const size = searchParams.get('size');

  if (!connectorId || !deviceId) {
    return NextResponse.json({ success: false, error: 'Missing connectorId or deviceId' }, { status: 400 });
  }
  
  console.log(`[API Device Thumbnail] Request for connector: ${connectorId}, device: ${deviceId}, size: ${size}, ts: ${timestampMs}`);

  try {
    // --- Use Helper from piko.ts ---
    const { config, token } = await pikoDriver.getTokenAndConfig(connectorId); // Use the function from the driver

    // --- Fetch Thumbnail ---
    const thumbnailBlob = await pikoDriver.getPikoDeviceThumbnail(
      config,
      token.accessToken,
      deviceId,
      timestampMs ? parseInt(timestampMs, 10) : undefined,
      size ?? undefined // Pass size if provided
    );

    // Return the blob directly with appropriate headers
    return new NextResponse(thumbnailBlob, {
      status: 200,
      headers: {
        'Content-Type': thumbnailBlob.type || 'image/jpeg', // Default to jpeg if type is missing
        'Cache-Control': 'no-cache, no-store, must-revalidate', // Prevent caching
      },
    });

  } catch (error: unknown) {
    let errorMessage = 'Failed to fetch device thumbnail';
    let statusCode = 500;
    if (error instanceof pikoDriver.PikoApiError) {
        errorMessage = `Piko API Error: ${error.message}`;
        statusCode = error.statusCode || 500;
        console.error(`[API Device Thumbnail] Piko API Error (${statusCode}) for device ${deviceId}:`, error.errorString, error.rawError);
    } else if (error instanceof Error) {
        errorMessage = error.message;
         console.error(`[API Device Thumbnail] Error fetching thumbnail for device ${deviceId}:`, error);
    } else {
        console.error(`[API Device Thumbnail] Unknown error fetching thumbnail for device ${deviceId}:`, error);
    }
    return NextResponse.json({ success: false, error: errorMessage }, { status: statusCode });
  }
} 