import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import * as piko from '@/services/drivers/piko';
import { mapPikoErrorResponse } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  console.log("Received request for Piko media stream.");

  // --- 1. Extract Query Parameters ---
  const { searchParams } = new URL(request.url);
  const connectorId = searchParams.get('connectorId');
  const pikoSystemIdFromQuery = searchParams.get('pikoSystemId');
  const cameraId = searchParams.get('cameraId');
  const positionMsStr = searchParams.get('positionMs');

  // --- 2. Validate Parameters ---
  if (!connectorId || !pikoSystemIdFromQuery || !cameraId || !positionMsStr) {
    console.error("Piko media request: Missing required query parameters (connectorId, pikoSystemId, cameraId, positionMs).");
    return NextResponse.json({ error: 'Missing required query parameters: connectorId, pikoSystemId, cameraId, positionMs' }, { status: 400 });
  }

  const positionMs = parseInt(positionMsStr, 10);
  if (isNaN(positionMs)) {
    console.error("Piko media request: Invalid positionMs parameter.");
    return NextResponse.json({ error: 'Invalid positionMs parameter, must be a number.' }, { status: 400 });
  }

  console.log(`Piko media request params: C:${connectorId}, PS:${pikoSystemIdFromQuery}, Cam:${cameraId}, Pos:${positionMs}`);

  try {
    // --- 3. Retrieve Connector Configuration using our internal connectorId ---
    // console.log(`Piko media request: Fetching connector config for DB ID: ${connectorId}`);
    const connector = await db.query.connectors.findFirst({
      where: eq(connectors.id, connectorId), // Use our connectorId for DB lookup
      columns: { id: true, category: true, cfg_enc: true } 
    });

    if (!connector) {
      console.error(`Piko media request: Connector not found for DB ID: ${connectorId}`);
      return NextResponse.json({ error: `Connector not found: ${connectorId}` }, { status: 404 });
    }

    // Use cfg_enc field, validate category
    if (connector.category !== 'piko' || !connector.cfg_enc) { 
      console.error(`Piko media request: Connector ${connectorId} is not a valid Piko connector or is missing configuration.`);
      return NextResponse.json({ error: `Connector ${connectorId} is not a valid Piko Cloud connector or is missing configuration` }, { status: 400 });
    }

    // Parse the config from the cfg_enc JSON string
    let config: piko.PikoConfig;
    try {
      config = JSON.parse(connector.cfg_enc) as piko.PikoConfig;
      if (config.type !== 'cloud' || !config.username || !config.password) {
          throw new Error("Parsed configuration is invalid or missing required fields.");
      }
    } catch (e) {
        const parseErrorMsg = e instanceof Error ? e.message : 'Unknown parsing error';
        console.error(`Piko media request: Failed to parse configuration for connector ${connectorId}: ${parseErrorMsg}`);
        return NextResponse.json({ error: 'Failed to process connector configuration (invalid JSON or structure)' }, { status: 500 });
    }
    
    const pikoSystemIdToUse = pikoSystemIdFromQuery; 
    // console.log(`Piko media request: Using Piko System ID from query: ${pikoSystemIdToUse}`);

    // 4. Obtain System-Scoped Token (Restored)
    // console.log(`Piko media request: Getting system-scoped token for Piko system ${pikoSystemIdToUse}...`); 
    const tokenResponse = await piko.getSystemScopedAccessToken(
      config.username,
      config.password, 
      pikoSystemIdToUse // Use the Piko system ID from the query
    );
    // const tokenResponse = await piko.getAccessToken( // Use the general token function (REVERTED)
    //     config.username,
    //     config.password
    // );
    const systemScopedToken = tokenResponse.accessToken; 
    // console.log(`Piko media request: Successfully obtained system-scoped token (start): ${systemScopedToken.substring(0, 15)}...`);
    // --- REMOVE TEMPORARY LOGGING --- 
    // console.log(`[TEMP] Full system-scoped token: ${systemScopedToken}`);
    // --- END TEMPORARY LOGGING ---

    // --- 5. Fetch Device Details to Determine Transport --- 
    // console.log(`Piko media request: Fetching device details for camera ${cameraId} in system ${pikoSystemIdToUse}...`);
    const deviceDetails = await piko.getSystemDeviceById(
        pikoSystemIdToUse, // Use Piko System ID
        systemScopedToken,
        cameraId
    );

    if (!deviceDetails) {
        console.error(`Piko media request: Camera device ${cameraId} not found in system ${pikoSystemIdToUse}.`);
        return NextResponse.json({ error: `Camera device not found: ${cameraId}` }, { status: 404 });
    }

    // --- 6. Determine Best Media Transport (HLS or WebM) ---
    let useHls = false;
    let foundHlsTransport = false; // More explicit flag
    if (deviceDetails.mediaStreams && Array.isArray(deviceDetails.mediaStreams)) {
        foundHlsTransport = deviceDetails.mediaStreams.some(stream => 
            stream.transports?.includes('hls')
        );
        // Clearer log message
        console.log(`Piko media request: HLS available for ${cameraId}: ${foundHlsTransport}`); 
    } else {
        console.warn(`Piko media request: mediaStreams data missing or invalid for camera ${cameraId}. Cannot determine HLS support.`);
    }
    useHls = foundHlsTransport; // Assign to the variable used later

    // --- 7. Call Appropriate Piko Media Service ---
    let pikoResponse: Response;
    let finalContentType: string;

    // --- REMOVE FORCE WebM/Ticket FLOW --- 
    // console.log('Forcing WebM/Ticket flow regardless of HLS detection.');
    // useHls = false; // Override HLS detection - REMOVED
    // --- END REMOVE FORCE --- 

    if (useHls) { // HLS block is now active again
        console.log(`Piko media request: Calling getPikoHlsStream for system ${pikoSystemIdToUse}, camera ${cameraId}`);
        pikoResponse = await piko.getPikoHlsStream(
            pikoSystemIdToUse, 
            systemScopedToken,
            cameraId
        );
        finalContentType = pikoResponse.headers.get('Content-Type') || 'application/vnd.apple.mpegurl'; 

        // --- Log HLS Playlist Content --- 
        if (pikoResponse.ok && pikoResponse.body) {
            try {
                // Clone the response to read the body without consuming it for the client
                const clonedResponse = pikoResponse.clone();
                const playlistText = await clonedResponse.text();
                console.log("--- HLS Playlist Content ---");
                console.log(playlistText);
                console.log("--- End HLS Playlist Content ---");
            } catch (logError) {
                console.warn("Could not read or log HLS playlist content:", logError);
            }
        } else {
             console.warn("HLS Response not OK or body is null, cannot log playlist.");
        }
        // --- End Log --- 

    } else {
        // Use Login Ticket for WebM stream (This path will always be taken now)
        console.log(`Piko media request: Attempting Login Ticket auth for WebM.`);
        const serverId = deviceDetails.serverId; 

        if (!serverId) {
            console.error(`Piko media request: Cannot create login ticket - serverId missing for camera ${cameraId}.`);
            return NextResponse.json({ error: `Configuration error: Server ID missing for camera ${cameraId}. Cannot generate media ticket.` }, { status: 500 });
        }

        try {
            const ticket = await piko.createPikoLoginTicket(
                pikoSystemIdToUse,
                systemScopedToken, // Token needed to *get* the ticket
                serverId
            );
            // Keep ticket success log
            console.log(`Piko media request: Login ticket obtained. Requesting WebM stream using ticket.`);

            pikoResponse = await piko.getPikoMediaStream(
                pikoSystemIdToUse, 
                undefined, // Pass undefined for token when using ticket
                cameraId,
                positionMs,
                'webm', // Explicitly request WebM format
                ticket, // Pass the obtained ticket
                serverId // Pass the serverId for the header
            );
            // Set Content-Type explicitly for WebM
            finalContentType = 'video/webm'; 
        
        } catch (ticketError: unknown) {
            console.error(`Piko media request: Failed to create login ticket for camera ${cameraId} on server ${serverId}:`, ticketError);
            // Use the error mapper for consistency if it makes sense
            const { status, message } = mapPikoErrorResponse(ticketError); 
            return NextResponse.json(
                { error: `Failed to retrieve Piko media stream: Could not create access ticket - ${message}` }, 
                { status: status } // Use status from helper, or maybe force 500/502?
            );
        }
    }
    // console.log(`Piko media request: Piko API responded with status ${pikoResponse.status}. Final Content-Type: ${finalContentType}`);

    // --- 8. Stream the Response Back to Client ---
    if (!pikoResponse.ok || !pikoResponse.body) {
        // Handle cases where the Piko request succeeded initially but failed at the media retrieval step
        console.error(`Piko media request: Failed to get valid media stream from Piko API (Status: ${pikoResponse.status}). Body is null: ${!pikoResponse.body}`);
        // Try to parse error from body if available
        let errorMessage = 'Failed to get media stream from Piko';
        if (pikoResponse.body) {
            try {
                const errorText = await pikoResponse.text(); // Consume body to read error
                errorMessage = `Failed to get media stream from Piko: ${errorText.substring(0, 200)}`;
            } catch { /* Ignore reading error */ }
        }
        return NextResponse.json({ error: errorMessage }, { status: pikoResponse.status || 502 }); // Use Piko status or Bad Gateway
    }

    // Extract other relevant headers from Piko's response
    const contentLength = pikoResponse.headers.get('Content-Length');
    const contentDisposition = pikoResponse.headers.get('Content-Disposition');

    const headers = new Headers();
    headers.set('Content-Type', finalContentType); // Use the determined Content-Type
    if (contentLength) headers.set('Content-Length', contentLength);
    if (contentDisposition) headers.set('Content-Disposition', contentDisposition);
    headers.set('Cache-Control', 'no-cache');
    // Consider adding Accept-Ranges: bytes if the stream supports it
    // headers.set('Accept-Ranges', 'bytes'); 

    // console.log(`Piko media request: Streaming response with Content-Type: ${finalContentType}`);

    return new NextResponse(pikoResponse.body, {
      status: pikoResponse.status,
      statusText: pikoResponse.statusText,
      headers: headers,
    });

  } catch (error: unknown) {
    // Extract connectorId for consistent logging before mapping
    const { searchParams } = new URL(request.url);
    const connectorIdForLog = searchParams.get('connectorId') || 'unknown'; // Log our internal ID
    
    console.error(`Piko media request: Error processing request for connector ${connectorIdForLog}:`, error);

    const { status, message } = mapPikoErrorResponse(error);

    return NextResponse.json(
        { error: `Failed to retrieve Piko media stream: ${message}` }, 
        { status: status } 
    );
  }
}
