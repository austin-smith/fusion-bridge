import { NextRequest, NextResponse } from 'next/server';
import * as pikoDriver from '@/services/drivers/piko';
import { mapPikoErrorResponse } from '@/lib/api-utils';

// --- Main GET Handler ---
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'getInfo';
  const connectorId = searchParams.get('connectorId');
  const cameraId = searchParams.get('cameraId');
  const positionMsStr = searchParams.get('positionMs');

  if (!connectorId || !cameraId) {
    console.error("Piko media request: Missing required query parameters (connectorId, cameraId).");
    return NextResponse.json({ error: 'Missing required query parameters: connectorId, cameraId' }, { status: 400 });
  }

  let positionMs: number | null = null;
  if (positionMsStr) {
      positionMs = parseInt(positionMsStr, 10);
      if (isNaN(positionMs)) {
          console.error("Piko media request: Invalid positionMs parameter.");
          return NextResponse.json({ error: 'Invalid positionMs parameter, must be a number.' }, { status: 400 });
      }
  }

  console.log(`Piko media request: Action=${action}, C:${connectorId}, Cam:${cameraId}, Pos:${positionMs === null ? 'LIVE' : positionMs}`);

  try {
    // --- Get Config and Token using Helper from piko.ts ---
    const { config, token } = await pikoDriver.getTokenAndConfig(connectorId);
    const accessToken = token.accessToken;

    // --- Fetch Device Details ---
    const deviceDetails = await pikoDriver.getSystemDeviceById(
        config,
        accessToken,
        cameraId
    );
    if (!deviceDetails) {
        console.error(`Piko media request: Camera device ${cameraId} not found in system associated with connector ${connectorId}.`);
        return NextResponse.json({ error: `Camera device not found: ${cameraId}` }, { status: 404 });
    }

    // --- Determine Transport Type ---
    let determinedMediaType: 'hls' | 'webm' | 'mp4';
    if (config.type === 'local') {
        // Local Connector
        // No live format needed here now as play button is disabled
        // Defaulting recorded local to WebM
        determinedMediaType = 'webm'; 
        if (positionMs === null) {
            console.log(`[API Media] Connector type is local, positionMs is null. (Live view disabled in UI, defaulting type to WebM for consistency)`);
        } else {
             console.log(`[API Media] Connector type is local, positionMs is ${positionMs}. Forcing media type to WebM.`);
        }
    } else {
        // Cloud Connector (HLS for live, HLS/WebM for recorded)
        if (positionMs === null) {
            determinedMediaType = 'hls';
            console.log(`[API Media] Cloud connector, positionMs is null. Forcing media type to HLS.`);
        } else {
             // Cloud Recorded -> Check capabilities
            let useHls = false;
            if (deviceDetails.mediaStreams && Array.isArray(deviceDetails.mediaStreams)) {
                const streamConfig = deviceDetails.mediaStreams[0];
                if (streamConfig) {
                    useHls = streamConfig.transports?.includes('hls') ?? false;
                }
                console.log(`[API Media] Cloud connector with positionMs=${positionMs}. HLS available: ${useHls}`);
            } else {
                console.warn(`[API Media] Cloud connector with positionMs=${positionMs} - mediaStreams data missing. Defaulting to WebM.`);
            }
            determinedMediaType = useHls ? 'hls' : 'webm';
        }
    }

    // --- Execute Action --- 
    if (action === 'getInfo') {
        // --- Action: getInfo ---
        console.log(`[API Media/getInfo] Determined type: ${determinedMediaType}`);
        
        // Construct the URL for the getStream action
        const streamUrl = new URL(request.url);
        streamUrl.searchParams.set('action', 'getStream'); 
        
        return NextResponse.json({ 
            mediaType: determinedMediaType, 
            streamUrl: streamUrl.pathname + streamUrl.search, // Return relative path + params
        });

    } else if (action === 'getStream') {
        // --- Action: getStream ---
        console.log(`[API Media/getStream] Proceeding with type: ${determinedMediaType}`);
        
        let pikoResponse: Response;
        let finalContentType: string;

        if (determinedMediaType === 'hls') {
            // Get HLS Stream
            console.log(`[API Media/getStream/HLS] Calling getPikoHlsStream`);
            pikoResponse = await pikoDriver.getPikoHlsStream(config, accessToken, cameraId);
            finalContentType = pikoResponse.headers.get('Content-Type') || 'application/vnd.apple.mpegurl';
        } else {
            if (positionMs === null) {
                // Safeguard: Should not happen for WebM based on logic above
                console.error("[API Media/WebM] Inconsistency: Reached WebM case with null positionMs.");
                throw { status: 500, message: "Internal logic error determining media type for WebM." };
            }
            console.log(`[API Media/getStream/WebM] Preparing WebM stream request (Recorded).`);
            const serverId = deviceDetails.serverId;
            console.log(`[API Media/WebM] Associated Server ID: ${serverId || 'Not Found'}`);
            try {
                 let streamToken: string | undefined = accessToken;
                 let streamServerId: string | undefined = undefined;
                 let streamTicket: string | undefined = undefined;
                 if (serverId) {
                     console.log(`[API Media/WebM] Attempting login ticket generation for server ${serverId}...`);
                     try {
                         streamTicket = await pikoDriver.createPikoLoginTicket(config, accessToken, serverId);
                         streamToken = undefined;
                         streamServerId = serverId;
                         console.log(`[API Media/WebM] Login ticket obtained successfully.`);
                     } catch(ticketGenError) {
                         console.warn(`[API Media/WebM] Failed ticket gen (ServerId: ${serverId}). Fallback to Bearer. Error:`, ticketGenError);
                         streamToken = accessToken;
                         streamTicket = undefined;
                         streamServerId = undefined;
                     }
                 } else {
                     console.log(`[API Media/WebM] No ServerID. Using Bearer token.`);
                     streamToken = accessToken;
                 }
                 console.log(`[API Media/WebM] Calling getPikoMediaStream using: ${streamTicket ? 'Ticket Auth' : 'Bearer Auth'}`);
                 pikoResponse = await pikoDriver.getPikoMediaStream(
                     config,
                     streamToken,
                     cameraId,
                     positionMs,
                     'webm',
                     streamTicket,
                     streamServerId
                 );
                 console.log(`[API Media/WebM] getPikoMediaStream call successful. Status: ${pikoResponse.status}`);
                 finalContentType = 'video/webm';
             } catch (streamError: unknown) {
                 console.error(`[API Media/WebM] Error during stream initiation/fetch:`, streamError);
                 const { status, message } = mapPikoErrorResponse(streamError);
                 throw { status: status, message: `Failed to retrieve Piko WebM stream`, details: message };
             }
        }

        // --- Stream Piko Response Back (Add Content-Type check specific to finalContentType) ---
        if (!pikoResponse.ok || !pikoResponse.body) {
             console.error(`[API Media/getStream] Failed Piko response (Status: ${pikoResponse.status}) for type ${determinedMediaType}`);
             const errorMessage = `Failed to get media stream from Piko (Type: ${determinedMediaType})`;
             let errorDetails = `Piko API returned status ${pikoResponse.status}`;
             try { 
                 const errorText = await pikoResponse.text();
                 errorDetails = errorText.substring(0, 500);
                 try { const errorJson = JSON.parse(errorText); errorDetails = errorJson.errorString || errorJson.message || errorDetails; } catch {}
             } catch {} 
             throw { status: pikoResponse.status || 502, message: errorMessage, details: errorDetails };
        }
        
        const responseContentType = pikoResponse.headers.get('Content-Type');
        const expectedContentTypePrefix = finalContentType.startsWith('video/') 
                                          ? 'video' 
                                          : (finalContentType.startsWith('application/') ? 'application' : ''); // Handle HLS

        // Check if received type starts with the expected prefix (video/ or application/ for HLS)
        if (!expectedContentTypePrefix || !responseContentType || !responseContentType.startsWith(`${expectedContentTypePrefix}/`)) {
             console.error(`[API Media/getStream] Piko API returned unexpected Content-Type: ${responseContentType}. Expected type like '${finalContentType}'.`);
             let errorBody = 'Unknown content';
             try {
                 errorBody = (await pikoResponse.text()).substring(0, 500);
             } catch { /* Ignore read error */ }
             throw { 
                 status: 502, 
                 message: `Piko device returned unexpected content for ${determinedMediaType} stream.`,
                 details: `Expected Content-Type like '${finalContentType}', received ${responseContentType}. Body: ${errorBody}` 
             };
        }

        // Stream back the response
        const headers = new Headers();
        headers.set('Content-Type', responseContentType); // Use actual type from Piko
        const contentLength = pikoResponse.headers.get('Content-Length');
        if (contentLength) headers.set('Content-Length', contentLength);
        headers.set('Cache-Control', 'no-cache');
        headers.set('Connection', 'keep-alive'); 
        console.log(`[API Media/getStream] Streaming response with Content-Type: ${responseContentType}`);
        return new NextResponse(pikoResponse.body, { 
            status: pikoResponse.status, 
            statusText: pikoResponse.statusText, 
            headers: headers 
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
         if ('details' in error && typeof error.details === 'string') {
             details = error.details;
         }
    } else {
        const mappedError = mapPikoErrorResponse(error);
        status = mappedError.status;
        message = mappedError.message;
        if (error instanceof pikoDriver.PikoApiError) {
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
