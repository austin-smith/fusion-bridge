import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import * as piko from '@/services/drivers/piko';
import { mapPikoErrorResponse } from '@/lib/api-utils';

// This route attempts to get the direct Piko HLS URL, including any auth keys or redirects.
// It does NOT proxy the stream itself.
export async function GET(request: NextRequest) {
  console.log("Received request for Piko direct HLS URL.");

  // --- 1. Extract Query Parameters ---
  const { searchParams } = new URL(request.url);
  // Expect the same parameters as the media route for consistency
  const connectorId = searchParams.get('connectorId'); 
  const pikoSystemIdFromQuery = searchParams.get('pikoSystemId');
  const cameraId = searchParams.get('cameraId');

  // --- 2. Validate Parameters ---
  if (!connectorId || !pikoSystemIdFromQuery || !cameraId ) {
    console.error("Piko HLS URL request: Missing required query parameters (connectorId, pikoSystemId, cameraId).");
    return NextResponse.json({ error: 'Missing required query parameters: connectorId, pikoSystemId, cameraId' }, { status: 400 });
  }

  console.log(`Piko HLS URL request params: C:${connectorId}, PS:${pikoSystemIdFromQuery}, Cam:${cameraId}`);

  try {
    // --- 3. Retrieve Connector Configuration ---
    const connector = await db.query.connectors.findFirst({
      where: eq(connectors.id, connectorId), 
      columns: { id: true, category: true, cfg_enc: true } 
    });

    if (!connector) {
      console.error(`Piko HLS URL request: Connector not found: ${connectorId}`);
      return NextResponse.json({ error: `Connector not found: ${connectorId}` }, { status: 404 });
    }
    if (connector.category !== 'piko' || !connector.cfg_enc) { 
      console.error(`Piko HLS URL request: Connector ${connectorId} is not a valid Piko connector or missing config.`);
      return NextResponse.json({ error: `Connector ${connectorId} is not a valid Piko Cloud connector or missing config` }, { status: 400 });
    }

    // Parse config
    let config: piko.PikoConfig;
    try {
      config = JSON.parse(connector.cfg_enc) as piko.PikoConfig;
       if (config.type !== 'cloud' || !config.username || !config.password) {
          throw new Error("Parsed configuration is invalid or missing required fields.");
      }
    } catch (e) {
        const parseErrorMsg = e instanceof Error ? e.message : 'Unknown parsing error';
        console.error(`Piko HLS URL request: Failed to parse config for connector ${connectorId}: ${parseErrorMsg}`);
        return NextResponse.json({ error: 'Failed to process connector configuration' }, { status: 500 });
    }
    
    const pikoSystemIdToUse = pikoSystemIdFromQuery; 

    // --- 4. Obtain System-Scoped Token ---
    const tokenResponse = await piko.getSystemScopedAccessToken(
      config.username,
      config.password, 
      pikoSystemIdToUse
    );
    const systemScopedToken = tokenResponse.accessToken; 

    // --- 5. Call Piko HLS Stream Driver (to get the response object) ---
    // We call this primarily to get the final URL after potential redirects
    console.log(`Piko HLS URL request: Calling getPikoHlsStream for system ${pikoSystemIdToUse}, camera ${cameraId} to find final URL...`);
    const pikoResponse = await piko.getPikoHlsStream(
        pikoSystemIdToUse, 
        systemScopedToken,
        cameraId
    );

    // --- 6. Check Response and Extract Final URL ---
    if (!pikoResponse.ok) {
        // If the request itself failed (e.g., 404, 403 on the playlist itself)
        console.error(`Piko HLS URL request: Initial Piko request failed with status ${pikoResponse.status}`);
        let errorMessage = 'Piko API rejected the HLS playlist request';
        try {
             const errorText = await pikoResponse.text();
             errorMessage += `: ${errorText.substring(0, 200)}`;
        } catch {}
        return NextResponse.json({ error: errorMessage }, { status: pikoResponse.status });
    }

    // The final URL after any redirects handled by fetch
    const finalHlsUrl = pikoResponse.url; 
    
    console.log(`Piko HLS URL request: Successfully determined final HLS URL: ${finalHlsUrl}`);

    // --- 7. Return the URL as JSON ---
    return NextResponse.json({ success: true, hlsUrl: finalHlsUrl });

  } catch (error: unknown) {
    const connectorIdForLog = connectorId || 'unknown'; 
    console.error(`Piko HLS URL request: Error processing request for connector ${connectorIdForLog}:`, error);
    const { status, message } = mapPikoErrorResponse(error);
    return NextResponse.json(
        { error: `Failed to retrieve Piko HLS URL: ${message}` }, 
        { status: status } 
    );
  }
} 