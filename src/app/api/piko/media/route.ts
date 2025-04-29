import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import * as piko from '@/services/drivers/piko';
import { mapPikoErrorResponse } from '@/lib/api-utils';

// MODIFIED: Helper function now takes only connectorId and returns full config + token
async function getPikoConfigAndToken(connectorId: string): Promise<{ config: piko.PikoConfig; accessToken: string }> {
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
    // Validate based on type
    if (!config.type || !config.username || !config.password) {
        throw new Error("Parsed configuration is missing type, username, or password.");
    }
    if (config.type === 'cloud' && !config.selectedSystem) {
        throw new Error("Cloud configuration missing selectedSystem.");
    }
    if (config.type === 'local' && (!config.host || !config.port)) {
        throw new Error("Local configuration missing host or port.");
    }
  } catch (e) {
    const parseErrorMsg = e instanceof Error ? e.message : 'Unknown parsing error';
    console.error(`Piko media request: Failed to parse configuration for connector ${connectorId}: ${parseErrorMsg}`);
    throw { status: 500, message: 'Failed to process connector configuration (invalid JSON or structure)' };
  }

  // Use generic getToken
  const tokenResponse = await piko.getToken(config);
  
  return { config, accessToken: tokenResponse.accessToken };
}

// --- Main GET Handler ---
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'getInfo';
  const connectorId = searchParams.get('connectorId');
  const cameraId = searchParams.get('cameraId');
  const positionMsStr = searchParams.get('positionMs');

  if (!connectorId || !cameraId || !positionMsStr) {
    console.error("Piko media request: Missing required query parameters (connectorId, cameraId, positionMs).");
    return NextResponse.json({ error: 'Missing required query parameters: connectorId, cameraId, positionMs' }, { status: 400 });
  }
  const positionMs = parseInt(positionMsStr, 10);
  if (isNaN(positionMs)) {
    console.error("Piko media request: Invalid positionMs parameter.");
    return NextResponse.json({ error: 'Invalid positionMs parameter, must be a number.' }, { status: 400 });
  }

  console.log(`Piko media request: Action=${action}, C:${connectorId}, Cam:${cameraId}, Pos:${positionMs}`);

  try {
    // --- 2. Get Config and Token --- 
    const { config, accessToken } = await getPikoConfigAndToken(connectorId);

    // --- 3. Fetch Device Details --- 
    const deviceDetails = await piko.getSystemDeviceById(
        config, 
        accessToken,
        cameraId
    );
    if (!deviceDetails) {
        console.error(`Piko media request: Camera device ${cameraId} not found in system associated with connector ${connectorId}.`);
        return NextResponse.json({ error: `Camera device not found: ${cameraId}` }, { status: 404 });
    }

    // --- 4. Determine Transport Type (MODIFIED) --- 
    let determinedMediaType: 'hls' | 'webm';
    
    if (config.type === 'local') {
        // --- Always use WebM for local connectors --- 
        determinedMediaType = 'webm';
        console.log(`Piko media request: Connector type is local. Forcing media type to WebM.`);
    } else {
        // --- Cloud connector: Check for HLS support --- 
        let useHls = false;
        if (deviceDetails.mediaStreams && Array.isArray(deviceDetails.mediaStreams)) {
            const streamConfig = deviceDetails.mediaStreams[0]; 
            if (streamConfig) {
                useHls = streamConfig.transports?.includes('hls') ?? false;
            }
            console.log(`Piko media request: Cloud connector. HLS available: ${useHls}`); 
        } else {
            console.warn(`Piko media request: Cloud connector - mediaStreams data missing or invalid for camera ${cameraId}. Defaulting to WebM.`);
        }
        determinedMediaType = useHls ? 'hls' : 'webm';
    }
    // --- End Transport Type Determination --- 

    // --- 5. Execute Action --- 
    if (action === 'getInfo') {
        // --- Action: getInfo ---
        console.log(`Piko media request [getInfo]: Determined type: ${determinedMediaType}`);
        
        // Construct the URL for the getStream action
        const streamUrl = new URL(request.url);
        streamUrl.searchParams.set('action', 'getStream'); 
        
        return NextResponse.json({ 
            mediaType: determinedMediaType, 
            streamUrl: streamUrl.pathname + streamUrl.search, // Return relative path + params
        });

    } else if (action === 'getStream') {
        // --- Action: getStream ---
        console.log(`Piko media request [getStream]: Proceeding with type: ${determinedMediaType}`);
        
        let pikoResponse: Response;
        let finalContentType: string;

        if (determinedMediaType === 'hls') {
            // Get HLS Stream (only reachable if config.type was 'cloud')
            console.log(`Piko media request [getStream/HLS]: Calling getPikoHlsStream`);
            pikoResponse = await piko.getPikoHlsStream(config, accessToken, cameraId);
            finalContentType = pikoResponse.headers.get('Content-Type') || 'application/vnd.apple.mpegurl';
        } else {
            // Get WebM Stream (used for local OR cloud if HLS not supported/found)
            console.log(`Piko media request [getStream/WebM]: Attempting Login Ticket auth.`);
            const serverId = deviceDetails.serverId; 
            if (!serverId && config.type === 'cloud') { // Only throw error if serverId is missing for cloud where it's expected
                throw { status: 500, message: `Configuration error: Server ID missing for camera ${cameraId} on cloud connector. Cannot generate media ticket.` };
            }
            // For local, serverId might be null, attempt ticket creation anyway if needed, 
            // but the driver might handle this appropriately or fail gracefully if tickets require serverId.
            // OR: We could potentially bypass ticket auth for local WebM if direct token auth works for media.

            try {
                let streamToken: string | undefined = accessToken;
                let streamServerId: string | undefined = undefined;
                let streamTicket: string | undefined = undefined;

                // Attempt ticket auth primarily for cloud, maybe for local if serverId exists?
                if (serverId) { 
                    try {
                        streamTicket = await piko.createPikoLoginTicket(config, accessToken, serverId);
                        streamToken = undefined; // Prefer ticket if available
                        streamServerId = serverId; // Needed for ticket request
                        console.log(`Piko media request [getStream/WebM]: Login ticket obtained. Requesting stream.`);
                    } catch(ticketGenError) {
                        console.warn(`Piko media request [getStream/WebM]: Failed to generate login ticket (ServerId: ${serverId}, Type: ${config.type}). Falling back to Bearer token. Error:`, ticketGenError);
                        // Fallback to using Bearer token if ticket fails
                        streamToken = accessToken;
                        streamTicket = undefined;
                        streamServerId = undefined;
                    }
                }
                // If no serverId (likely local), just use Bearer token
                else {
                    console.log(`Piko media request [getStream/WebM]: No ServerID found (likely local). Using Bearer token directly.`);
                    streamToken = accessToken;
                }

                pikoResponse = await piko.getPikoMediaStream(
                    config, 
                    streamToken, // Use Bearer token OR undefined if ticket was obtained
                    cameraId,
                    positionMs,
                    'webm', 
                    streamTicket, // Pass ticket if obtained
                    streamServerId // Pass serverId only if using ticket
                );
                finalContentType = 'video/webm'; 
            
            } catch (streamError: unknown) { // Catch errors from either ticket or stream fetch
                console.error(`Piko media request [getStream/WebM]: Failed to get stream:`, streamError);
                const { status, message } = mapPikoErrorResponse(streamError); 
                throw { status: status, message: `Failed to retrieve Piko WebM stream`, details: message };
            }
        }

        // --- Stream Piko Response Back --- 
        if (!pikoResponse.ok || !pikoResponse.body) {
            console.error(`Piko media request [getStream]: Failed to get valid media stream from Piko API (Status: ${pikoResponse.status}). Body is null: ${!pikoResponse.body}`);
            const errorMessage = 'Failed to get media stream from Piko';
            let errorDetails = `Piko API returned status ${pikoResponse.status}`;
            try { 
                const errorText = await pikoResponse.text();
                errorDetails = errorText.substring(0, 300);
                try { const errorJson = JSON.parse(errorText); errorDetails = errorJson.errorString || errorJson.message || errorDetails; } catch {}
            } catch {}
            throw { status: pikoResponse.status || 502, message: errorMessage, details: errorDetails };
        }
        const headers = new Headers();
        headers.set('Content-Type', finalContentType); 
        const contentLength = pikoResponse.headers.get('Content-Length');
        if (contentLength) headers.set('Content-Length', contentLength);
        headers.set('Cache-Control', 'no-cache');
        console.log(`Piko media request [getStream]: Streaming response with Content-Type: ${finalContentType}`);
        return new NextResponse(pikoResponse.body, { status: pikoResponse.status, statusText: pikoResponse.statusText, headers: headers });

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
         if ('details' in error && typeof error.details === 'string') {
             details = error.details;
         }
    } else {
        const mappedError = mapPikoErrorResponse(error);
        status = mappedError.status;
        message = mappedError.message;
        if (error instanceof piko.PikoApiError) {
            details = error.errorString || error.message;
        }
    }

    return NextResponse.json(
        { 
            error: message,
            details: details
        }, 
        { status: status } 
    );
  }
}
