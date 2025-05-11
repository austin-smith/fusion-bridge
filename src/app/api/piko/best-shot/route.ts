import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import * as piko from '@/services/drivers/piko';
import { mapPikoErrorResponse } from '@/lib/api-utils'; // Import the shared helper
// import { decrypt } from '@/lib/encryption'; // Removed assumption of encryption utility

// Removed placeholder authenticateRequest function

export async function GET(request: NextRequest) {
  // REMOVED Authentication Block
  // const isAuthenticated = await authenticateRequest(request);
  // if (!isAuthenticated) {
  //   return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  // }

  // 1. Parse Query Parameters
  const { searchParams } = new URL(request.url);
  const connectorId = searchParams.get('connectorId'); // Our internal DB ID
  // pikoSystemId is now optional - used ONLY to confirm cloud type if present
  const pikoSystemIdFromQuery = searchParams.get('pikoSystemId'); 
  const objectTrackId = searchParams.get('objectTrackId');
  const cameraId = searchParams.get('cameraId');

  // Minimal validation log
  if (!connectorId || !objectTrackId || !cameraId) {
    console.error(`Piko best-shot: Missing required params. Connector: ${connectorId}, ObjectTrack: ${objectTrackId}, Camera: ${cameraId}`);
    return NextResponse.json(
      { success: false, error: 'Missing required query parameters: connectorId, objectTrackId, cameraId' },
      { status: 400 }
    );
  }

  try {
    // 3. Retrieve Connector Configuration (using connectorId)
    // console.log(`Piko best-shot: Fetching connector config for DB ID: ${connectorId}`);
    const connector = await db.query.connectors.findFirst({
      where: eq(connectors.id, connectorId),
      columns: { id: true, category: true, cfg_enc: true } 
    });

    if (!connector) {
      const { status, message } = mapPikoErrorResponse(new Error(`Connector not found: ${connectorId}`));
      return NextResponse.json({ success: false, error: message }, { status: status });
    }

    if (connector.category !== 'piko' || !connector.cfg_enc) { 
      const { status, message } = mapPikoErrorResponse(new Error(`Connector ${connectorId} is not a valid Piko connector or is missing configuration`));
      return NextResponse.json({ success: false, error: message }, { status: status });
    }

    // Parse config...
    let config: piko.PikoConfig;
    try {
      config = JSON.parse(connector.cfg_enc) as piko.PikoConfig;
      // Basic validation: check type, username, password exist
      if (!config.type || !config.username || !config.password) {
          throw new Error("Parsed configuration is missing type, username, or password.");
      }
      // Type-specific validation
      if (config.type === 'cloud' && !config.selectedSystem) {
          throw new Error("Cloud configuration missing selectedSystem.");
      }
      if (config.type === 'local' && (!config.host || !config.port)) {
          throw new Error("Local configuration missing host or port.");
      }
    } catch (e) {
        console.error(`Failed to parse configuration for connector ${connectorId}:`, e);
        const { status, message } = mapPikoErrorResponse(new Error('Failed to process connector configuration (invalid JSON or structure)'));
        return NextResponse.json({ success: false, error: message }, { status: status });
    }

    // Consistency check (optional but good): if pikoSystemId was passed, it should match the cloud config
    if (config.type === 'cloud' && pikoSystemIdFromQuery && config.selectedSystem !== pikoSystemIdFromQuery) {
        console.warn(`Piko best-shot: Query pikoSystemId (${pikoSystemIdFromQuery}) mismatches connector config (${config.selectedSystem}) for connector ${connectorId}. Using config value.`);
    }
     if (config.type === 'local' && pikoSystemIdFromQuery) {
         // console.warn(`Piko best-shot: Query pikoSystemId (${pikoSystemIdFromQuery}) was passed for a local connector ${connectorId}. Ignoring.`);
     }

    // 5. Call Updated Driver Function to Get Image Data (Buffer and contentType)
    // console.log(`Piko best-shot: Fetching image data for track ${objectTrackId} on camera ${cameraId} (type: ${config.type})...`);
    const { buffer: imageBuffer, contentType: rawContentType } = await piko.getPikoBestShotImageData(
      connectorId, 
      objectTrackId,
      cameraId
    );

    // 6. Return Image Buffer
    // MIME type correction removed, use rawContentType directly
    console.log(`Piko best-shot: Successfully fetched image. Returning image buffer (Type: ${rawContentType}, Size: ${imageBuffer.length})...`);
    return new NextResponse(imageBuffer, {
        status: 200,
        headers: {
            'Content-Type': rawContentType, // Use the content type as received from the driver
            'Content-Length': imageBuffer.length.toString(),
        },
    });

  } catch (error: unknown) { 
    // Log using our internal connectorId
    const connectorIdForLog = connectorId || 'unknown'; 
    const objectTrackIdForLog = objectTrackId || 'unknown';
    
    // Avoid logging the entire error object if it might contain a large buffer
    let briefError = error;
    if (error instanceof Error && error.cause instanceof Buffer) {
        briefError = new Error(error.message); // Create a new error without the buffer as cause for logging
    }
    console.error(`Error fetching Piko best shot for connector ${connectorIdForLog}, track ${objectTrackIdForLog}:`, briefError);

    const { status, message } = mapPikoErrorResponse(error);

    return NextResponse.json(
      { success: false, error: `Failed to retrieve Piko best shot: ${message}` },
      { status: status } 
    );
  }
} 