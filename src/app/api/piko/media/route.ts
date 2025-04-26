import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import * as piko from '@/services/drivers/piko';
import { mapPikoErrorResponse } from '@/lib/api-utils';

// Helper function to get validated config and token (used by both actions)
async function getPikoConfigAndToken(connectorId: string, pikoSystemId: string) {
  const connector = await db.query.connectors.findFirst({
    where: eq(connectors.id, connectorId),
    columns: { id: true, category: true, cfg_enc: true }
  });

  if (!connector) {
    throw { status: 404, message: `Connector not found: ${connectorId}` };
  }
  if (connector.category !== 'piko' || !connector.cfg_enc) {
    throw { status: 400, message: `Connector ${connectorId} is not a valid Piko connector or is missing configuration` };
  }

  let config: piko.PikoConfig;
  try {
    config = JSON.parse(connector.cfg_enc) as piko.PikoConfig;
    if (config.type !== 'cloud' || !config.username || !config.password) {
      throw new Error("Parsed configuration is invalid or missing required fields.");
    }
  } catch (e) {
    const parseErrorMsg = e instanceof Error ? e.message : 'Unknown parsing error';
    console.error(`Piko media request: Failed to parse configuration for connector ${connectorId}: ${parseErrorMsg}`);
    throw { status: 500, message: 'Failed to process connector configuration (invalid JSON or structure)' };
  }

  const tokenResponse = await piko.getSystemScopedAccessToken(
    config.username,
    config.password,
    pikoSystemId
  );
  
  return { config, systemScopedToken: tokenResponse.accessToken };
}

// --- Main GET Handler ---
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'getInfo'; // Default to 'getInfo'

  // --- 1. Extract and Validate Common Parameters ---
  const connectorId = searchParams.get('connectorId');
  const pikoSystemId = searchParams.get('pikoSystemId');
  const cameraId = searchParams.get('cameraId');
  const positionMsStr = searchParams.get('positionMs');

  if (!connectorId || !pikoSystemId || !cameraId || !positionMsStr) {
    console.error("Piko media request: Missing required query parameters (connectorId, pikoSystemId, cameraId, positionMs).");
    return NextResponse.json({ error: 'Missing required query parameters: connectorId, pikoSystemId, cameraId, positionMs' }, { status: 400 });
  }

  const positionMs = parseInt(positionMsStr, 10);
  if (isNaN(positionMs)) {
    console.error("Piko media request: Invalid positionMs parameter.");
    return NextResponse.json({ error: 'Invalid positionMs parameter, must be a number.' }, { status: 400 });
  }

  console.log(`Piko media request: Action=${action}, C:${connectorId}, PS:${pikoSystemId}, Cam:${cameraId}, Pos:${positionMs}`);

  try {
    // --- 2. Get Config and Token ---
    const { systemScopedToken } = await getPikoConfigAndToken(connectorId, pikoSystemId);

    // --- 3. Fetch Device Details (Needed for both actions) ---
    const deviceDetails = await piko.getSystemDeviceById(
        pikoSystemId,
        systemScopedToken,
        cameraId
    );
    if (!deviceDetails) {
        console.error(`Piko media request: Camera device ${cameraId} not found in system ${pikoSystemId}.`);
        return NextResponse.json({ error: `Camera device not found: ${cameraId}` }, { status: 404 });
    }

    // --- 4. Determine Transport Type (HLS vs WebM) ---
    let useHls = false;
    if (deviceDetails.mediaStreams && Array.isArray(deviceDetails.mediaStreams)) {
        useHls = deviceDetails.mediaStreams.some(stream => 
            stream.transports?.includes('hls')
        );
        console.log(`Piko media request: HLS available for ${cameraId}: ${useHls}`); 
    } else {
        console.warn(`Piko media request: mediaStreams data missing or invalid for camera ${cameraId}. Cannot determine HLS support. Defaulting to WebM.`);
    }
    const determinedMediaType = useHls ? 'hls' : 'webm';


    // --- 5. Execute Action ---
    if (action === 'getInfo') {
        // --- Action: getInfo ---
        console.log(`Piko media request [getInfo]: Determined type: ${determinedMediaType}`);

        // Construct the URL for the getStream action
        const streamUrl = new URL(request.url);
        streamUrl.searchParams.set('action', 'getStream'); 
        
        return NextResponse.json({ 
            mediaType: determinedMediaType, 
            streamUrl: streamUrl.pathname + streamUrl.search // Return relative path + params
        });

    } else if (action === 'getStream') {
        // --- Action: getStream ---
        console.log(`Piko media request [getStream]: Proceeding with type: ${determinedMediaType}`);
        
        let pikoResponse: Response;
        let finalContentType: string;

        if (determinedMediaType === 'hls') {
            // --- Get HLS Stream ---
            console.log(`Piko media request [getStream/HLS]: Calling getPikoHlsStream`);
            pikoResponse = await piko.getPikoHlsStream(
                pikoSystemId, 
                systemScopedToken,
                cameraId
            );
            finalContentType = pikoResponse.headers.get('Content-Type') || 'application/vnd.apple.mpegurl'; 
            
            // Optional: Log HLS playlist for debugging
            // if (pikoResponse.ok && pikoResponse.body) { /* ... logging code ... */ }

        } else {
            // --- Get WebM Stream (using Ticket) ---
            console.log(`Piko media request [getStream/WebM]: Attempting Login Ticket auth.`);
            const serverId = deviceDetails.serverId; 
            if (!serverId) {
                throw { status: 500, message: `Configuration error: Server ID missing for camera ${cameraId}. Cannot generate media ticket.` };
            }

            try {
                const ticket = await piko.createPikoLoginTicket(
                    pikoSystemId,
                    systemScopedToken, 
                    serverId
                );
                console.log(`Piko media request [getStream/WebM]: Login ticket obtained. Requesting stream.`);

                pikoResponse = await piko.getPikoMediaStream(
                    pikoSystemId, 
                    undefined, // Pass undefined for token when using ticket
                    cameraId,
                    positionMs,
                    'webm', 
                    ticket, 
                    serverId 
                );
                finalContentType = 'video/webm'; 
            
            } catch (ticketError: unknown) {
                console.error(`Piko media request [getStream/WebM]: Failed to create login ticket or get stream:`, ticketError);
                const { status, message } = mapPikoErrorResponse(ticketError); 
                // Throw structured error for the global handler
                throw { 
                    status: status, 
                    message: `Failed to retrieve Piko media stream via ticket`, // Generic part
                    details: message // Specific Piko error message
                };
            }
        }

        // --- Stream Piko Response Back ---
        if (!pikoResponse.ok || !pikoResponse.body) {
            console.error(`Piko media request [getStream]: Failed to get valid media stream from Piko API (Status: ${pikoResponse.status}). Body is null: ${!pikoResponse.body}`);
            let errorMessage = 'Failed to get media stream from Piko';
            let errorDetails = `Piko API returned status ${pikoResponse.status}`;
            try { 
                const errorText = await pikoResponse.text();
                errorDetails = errorText.substring(0, 300); // Capture more details
                // Attempt to parse as Piko error JSON
                try {
                    const errorJson = JSON.parse(errorText); 
                    errorDetails = errorJson.errorString || errorJson.message || errorDetails; 
                } catch {}
            } catch {}
            // Throw structured error for the global handler
            throw { 
                status: pikoResponse.status || 502, 
                message: errorMessage, // Generic part
                details: errorDetails // Specific Piko error details
            };
        }

        const headers = new Headers();
        headers.set('Content-Type', finalContentType); 
        const contentLength = pikoResponse.headers.get('Content-Length');
        if (contentLength) headers.set('Content-Length', contentLength);
        headers.set('Cache-Control', 'no-cache');
        // Add other headers if needed (e.g., Accept-Ranges)

        console.log(`Piko media request [getStream]: Streaming response with Content-Type: ${finalContentType}`);
        return new NextResponse(pikoResponse.body, {
            status: pikoResponse.status,
            statusText: pikoResponse.statusText,
            headers: headers,
        });

    } else {
        // --- Invalid Action ---
        console.warn(`Piko media request: Invalid action parameter: ${action}`);
        return NextResponse.json({ error: `Invalid action: ${action}. Use 'getInfo' or 'getStream'.` }, { status: 400 });
    }

  } catch (error: unknown) {
     // --- Global Error Handling ---
    console.error(`Piko media request: Unhandled error processing request (Action: ${action}):`, error);
    
    let status = 500;
    let message = 'An unexpected error occurred while processing the media request.';
    let details: string | undefined = undefined;

    // Check for our structured error first
    if (typeof error === 'object' && error !== null && 'status' in error && 'message' in error) {
         status = typeof error.status === 'number' ? error.status : 500;
         message = typeof error.message === 'string' ? error.message : message;
         // Extract details if they were passed up
         if ('details' in error && typeof error.details === 'string') {
             details = error.details;
         }
    } else {
        // Fallback: Try using the Piko error mapper for raw PikoApiErrors or others
        const mappedError = mapPikoErrorResponse(error); // This primarily gets message/status
        status = mappedError.status;
        message = mappedError.message;
        // If the original error was a PikoApiError, try to get more details
        if (error instanceof piko.PikoApiError) {
            details = error.errorString || error.message; // Prefer errorString if available
        }
    }

    // Return the structured error response
    return NextResponse.json(
        { 
            error: message, // Keep the main error message
            details: details // Add the specific details field
        }, 
        { status: status } 
    );
  }
}
