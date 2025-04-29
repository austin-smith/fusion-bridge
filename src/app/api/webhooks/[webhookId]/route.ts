import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/data/db';
import { connectors, devices } from '@/data/db/schema';
import { sql, eq } from 'drizzle-orm';
import crypto from 'crypto'; // Import crypto
import { Buffer } from 'buffer'; // Needed for raw body handling
import type { NetBoxWebhookPayload, NetBoxDeviceWebhookPayload, NetBoxEventWebhookPayload } from '@/types/netbox'; // Import the types
import { parseNetboxEvent } from '@/lib/event-parsers/netbox'; // Import the NetBox parser
import { storeStandardizedEvent } from '@/data/repositories/events'; // Import the event storage function
import { useFusionStore } from '@/stores/store'; // Import Zustand store if needed for real-time updates
import { recordWebhookActivity } from '@/services/webhook-service'; // <-- Import the new function
import { getDeviceTypeInfo } from '@/lib/mappings/identification';

// Header names
const NETBOX_SIGNATURE_HEADER = 'x-hub-signature-256'; 
const GENEA_SIGNATURE_HEADER = 'x-sequr-signature'; // Genea specific header

/**
 * Verifies the HMAC signature of the request body.
 * Adapts to different algorithms and header formats.
 */
function verifySignature(
    secret: string, 
    body: Buffer, 
    signatureHeader: string | null, 
    category: string // Add category to determine logic
): boolean {
  if (!signatureHeader) {
    console.error('Webhook verification failed: Signature header missing');
    return false;
  }

  let expectedPrefix: string;
  let algorithm: string;
  const encoding: crypto.BinaryToTextEncoding = 'hex';

  if (category === 'genea') {
      expectedPrefix = 'sha1=';
      algorithm = 'sha1';
  } else if (category === 'netbox') {
      expectedPrefix = 'sha256=';
      algorithm = 'sha256';
  } else {
      console.error(`Webhook verification failed: Unsupported category '${category}' for signature verification.`);
      return false;
  }

  if (!signatureHeader.startsWith(expectedPrefix)) {
      console.error(`Webhook verification failed: Signature header missing prefix '${expectedPrefix}'. Header: ${signatureHeader}`);
      return false;
  }

  const providedSignature = signatureHeader.substring(expectedPrefix.length);

  try {
    const calculatedSignature = crypto
      .createHmac(algorithm, secret)
      .update(body)
      .digest(encoding);

    // Use crypto.timingSafeEqual for security
    const providedBuf = Buffer.from(providedSignature, encoding);
    const calculatedBuf = Buffer.from(calculatedSignature, encoding);

    // timingSafeEqual requires buffers of the same length
    if (providedBuf.length !== calculatedBuf.length) {
        console.error('Webhook verification failed: Signature length mismatch.');
        return false;
    }

    return crypto.timingSafeEqual(calculatedBuf, providedBuf);
  } catch (error) {
    // Handles cases like invalid encoding in provided signature
    console.error(`Webhook verification failed: Error during signature calculation or comparison for ${category}`, error);
    return false;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  const { webhookId } = await params;
  
  console.log(`[Webhook ${webhookId}] Received request`);

  // --- 1. Read Raw Body --- 
  let rawBodyBuffer: Buffer;
  try {
    rawBodyBuffer = Buffer.from(await request.arrayBuffer()); 
  } catch (error) {
    console.error(`Webhook ${webhookId}: Failed to read raw request body`, error);
    return NextResponse.json({ success: false, error: 'Failed to read request body' }, { status: 500 });
  }
  
  // --- 2. Fetch Connector, Config, and Secret (using the webhookId from the config) --- 
  let connectorSecret: string | undefined;
  let connectorInfo: { id: string; name: string; category: string } | undefined;
  let parsedConfig: Record<string, any> | undefined;
  let connectorId: string;

  try {
    const connectorResult = await db.select({
        id: connectors.id,
        name: connectors.name,
        category: connectors.category,
        config: connectors.cfg_enc
    })
    .from(connectors)
    .where(sql`${connectors.cfg_enc}->>'webhookId' = ${webhookId}`)
    .limit(1);

    if (!connectorResult || connectorResult.length === 0) {
      console.warn(`Webhook received for unknown or mismatched webhook ID: ${webhookId}`);
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    connectorId = connectorResult[0].id; 
    connectorInfo = {
        id: connectorId,
        name: connectorResult[0].name,
        category: connectorResult[0].category,
    };

    try {
      parsedConfig = JSON.parse(connectorResult[0].config || '{}');
      connectorSecret = parsedConfig?.webhookSecret;
      if (!connectorSecret || typeof connectorSecret !== 'string') {
        console.error(`Webhook ${webhookId}: Missing or invalid secret in config for connector ${connectorInfo.id}`);
        return NextResponse.json({ success: false, error: 'Unauthorized: Configuration error' }, { status: 401 });
      }
    } catch(e) {
        console.error(`Webhook ${webhookId}: Failed to parse config for connector ${connectorInfo.id}`, e);
        return NextResponse.json({ success: false, error: 'Unauthorized: Cannot parse config' }, { status: 401 });
    }

  } catch (dbError) {
    console.error(`Webhook ${webhookId}: Database error fetching connector`, dbError);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }

  // --- 3. Verify Signature (using category-specific header) --- 

  // >>> Add Debug Logging START
  // Log raw body for all webhook requests
  console.log(`[Webhook ${webhookId}] Raw request body:`, rawBodyBuffer.toString('utf-8'));
  // >>> Add Debug Logging END

  const signatureHeader = connectorInfo.category === 'genea' 
    ? request.headers.get(GENEA_SIGNATURE_HEADER)
    : request.headers.get(NETBOX_SIGNATURE_HEADER); 

  if (!verifySignature(connectorSecret, rawBodyBuffer, signatureHeader, connectorInfo.category)) {
    console.warn(`Webhook ${webhookId}: Invalid signature received for connector ${connectorInfo.id}. Header: ${signatureHeader}`);
    return NextResponse.json({ success: false, error: 'Unauthorized: Invalid signature' }, { status: 401 });
  }

  // --- Signature is Verified --- 
  console.log(`Webhook received and verified for ${connectorInfo.category} connector '${connectorInfo.name}' (ID: ${connectorInfo.id}, WebhookID: ${webhookId})`);

  // Variable to hold the parsed payload
  let payload: NetBoxWebhookPayload | Record<string, any>; // Allow generic for non-NetBox parsing attempt
  let rawBodyString: string;

  // --- Parse JSON Body (Only after signature is verified) --- 
  try {
    rawBodyString = rawBodyBuffer.toString('utf-8'); 
    payload = JSON.parse(rawBodyString) as NetBoxWebhookPayload; 
    console.log(`[Webhook ${connectorId}] Parsed payload for ${connectorInfo.category}. Type field: ${payload?.Type}`);

  } catch (error) {
    console.error(`[Webhook ${connectorId}] Error parsing JSON payload:`, error);
    // Still record activity even if JSON parsing fails but signature was okay?
    // Let's record *after* successful processing instead.
    return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
  }

  // --- Process Payload based on Type --- 
  try {
    if (payload.Type === 'Device' && connectorInfo.category === 'netbox') {
      const devicePayload = payload as NetBoxDeviceWebhookPayload;
      const devicesToUpsert: (typeof devices.$inferInsert)[] = [];

      console.log(`[Webhook ${connectorId}] Processing NetBox 'Device' type payload.`);

      for (const portal of devicePayload.Portals) {
        for (const reader of portal.Readers) {
          // --- Get Standardized Type Info --- 
          const rawDeviceType = 'NetBoxReader'; // NetBox reader type is fixed
          const stdTypeInfo = getDeviceTypeInfo('netbox', rawDeviceType);
          // --- End Get Standardized Type Info --- 
          
          devicesToUpsert.push({
            deviceId: reader.ReaderKey.toString(),
            connectorId: connectorId, 
            name: reader.Name,
            type: rawDeviceType, // Keep raw type
            // --- Add Standardized Types --- 
            standardizedDeviceType: stdTypeInfo.type,
            standardizedDeviceSubtype: stdTypeInfo.subtype ?? null,
            // --- End Add Standardized Types --- 
            vendor: 'NetBox',
            model: 'Reader',
            status: 'Unknown',
            updatedAt: new Date(),
          });
        }
      }

      if (devicesToUpsert.length > 0) {
        console.log(`[Webhook ${connectorId}] Upserting ${devicesToUpsert.length} NetBox readers.`);
        await db.insert(devices)
          .values(devicesToUpsert)
          .onConflictDoUpdate({
            target: [devices.connectorId, devices.deviceId],
            set: {
              name: sql`excluded.name`,
              type: sql`excluded.type`,
              // --- Add Standardized Types to Update Set --- 
              standardizedDeviceType: sql`excluded.standardized_device_type`,
              standardizedDeviceSubtype: sql`excluded.standardized_device_subtype`,
              // --- End Add Standardized Types --- 
              vendor: sql`excluded.vendor`,
              model: sql`excluded.model`,
              status: sql`excluded.status`,
              updatedAt: new Date(),
            }
          });
        console.log(`[Webhook ${connectorId}] Upsert complete.`);
      } else {
        console.log(`[Webhook ${connectorId}] No readers found in NetBox 'Device' payload to upsert.`);
      }
      
      recordWebhookActivity(connectorId);
      return NextResponse.json({ success: true, message: 'NetBox Device webhook processed' }, { status: 200 });

    } else if (payload.Type === 'Event' && connectorInfo.category === 'netbox') {
      // Handle NetBox Event payload
      const eventPayload = payload as NetBoxEventWebhookPayload; // Type assertion
      console.log(`[Webhook ${connectorId}] Received NetBox 'Event' type payload: ${eventPayload.Descname} (ID: ${eventPayload.Activityid})`);
      
      // Parse the NetBox event
      const standardizedEvent = parseNetboxEvent(eventPayload, connectorId);

      if (standardizedEvent) {
        console.log(`[Webhook ${connectorId}] Parsed NetBox event into StandardizedEvent: ${standardizedEvent.eventId}`);
        
        // Store the standardized event in the database
        await storeStandardizedEvent(standardizedEvent);
        
        // Optional: Notify frontend via Zustand store (uncomment if needed)
        // useFusionStore.getState().processStandardizedEvent(standardizedEvent);

        // Record activity after successful processing
        recordWebhookActivity(connectorId);
        return NextResponse.json({ success: true, message: 'NetBox Event processed' }, { status: 200 });
      } else {
        // Parser returned null (e.g., unmapped Descname we decided to ignore)
        console.log(`[Webhook ${connectorId}] NetBox event not processed (parser returned null). Descname: ${eventPayload.Descname}`);
        return NextResponse.json({ success: true, message: 'NetBox Event received but not processed (unmapped/irrelevant)' }, { status: 200 });
      }

    } else {
      console.warn(`[Webhook ${connectorId}] Received unhandled payload type '${payload.Type}' or category '${connectorInfo.category}'.`);
      return NextResponse.json({ success: true, message: 'Webhook received but not processed' }, { status: 200 });
    }
  } catch (error) {
      console.error(`[Webhook ${connectorId}] Error processing webhook payload:`, error);
      const message = error instanceof Error ? error.message : 'Unknown processing error';
      return NextResponse.json({ success: false, error: `Failed to process webhook: ${message}` }, { status: 500 });
  }
} 