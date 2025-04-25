import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { sql, eq } from 'drizzle-orm';
import crypto from 'crypto'; // Import crypto
import { Buffer } from 'buffer'; // Needed for raw body handling

// Expected header name (adjust if NetBox/Agent uses a different one)
const SIGNATURE_HEADER = 'x-hub-signature-256'; 

/**
 * Verifies the HMAC signature of the request body.
 */
function verifySignature(secret: string, body: Buffer | string, signatureHeader: string | null): boolean {
  if (!signatureHeader) {
    console.error('Webhook verification failed: Signature header missing');
    return false;
  }

  const signatureParts = signatureHeader.split('=');
  if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
    console.error('Webhook verification failed: Invalid signature format', signatureHeader);
    return false;
  }
  const providedSignature = signatureParts[1];

  const calculatedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  // Use crypto.timingSafeEqual for security
  try {
    return crypto.timingSafeEqual(Buffer.from(calculatedSignature, 'hex'), Buffer.from(providedSignature, 'hex'));
  } catch (error) {
    // Handles cases where buffers have different lengths
    console.error('Webhook verification failed: Error during timingSafeEqual', error);
    return false;
  }
}

export async function POST(
  request: NextRequest,
  // Type params as a Promise containing the expected object
  { params }: { params: Promise<{ webhookId: string }> } 
) {
  // Await the params Promise before destructuring
  const { webhookId } = await params;
  
  /* 
  // --- Remove the temporary code ---
  console.log("Received webhook for ID:", webhookId);
  return NextResponse.json({ success: true, message: "Webhook received" });
  */

  // --- Restore original body --- 
  const signatureHeader = request.headers.get(SIGNATURE_HEADER);

  if (!webhookId) {
    return NextResponse.json({ success: false, error: 'Webhook ID missing' }, { status: 400 });
  }

  // --- 1. Read Raw Body --- 
  let rawBodyBuffer: Buffer;
  try {
    const chunks: Uint8Array[] = [];
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Request body is not readable');
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }
    rawBodyBuffer = Buffer.concat(chunks);
  } catch (error) {
    console.error(`Webhook ${webhookId}: Failed to read raw request body`, error);
    return NextResponse.json({ success: false, error: 'Failed to read request body' }, { status: 500 });
  }
  
  // --- 2. Fetch Connector and Secret --- 
  let connectorSecret: string | undefined;
  let connectorInfo: { id: string; name: string; category: string } | undefined;
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
      console.warn(`Webhook received for unknown ID: ${webhookId}`);
      return NextResponse.json({ success: false, error: 'Webhook ID not found' }, { status: 404 });
    }

    connectorInfo = {
        id: connectorResult[0].id,
        name: connectorResult[0].name,
        category: connectorResult[0].category,
    };

    try {
      const config = JSON.parse(connectorResult[0].config || '{}');
      connectorSecret = config.webhookSecret;
      if (!connectorSecret || typeof connectorSecret !== 'string') {
        console.error(`Webhook ${webhookId}: Missing or invalid secret in config for connector ${connectorInfo.id}`);
        return NextResponse.json({ success: false, error: 'Internal configuration error: Secret missing' }, { status: 500 });
      }
    } catch(e) {
        console.error(`Webhook ${webhookId}: Failed to parse config for connector ${connectorInfo.id}`, e);
        return NextResponse.json({ success: false, error: 'Internal configuration error: Cannot parse config' }, { status: 500 });
    }

  } catch (dbError) {
    console.error(`Webhook ${webhookId}: Database error fetching connector`, dbError);
    return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
  }

  // --- 3. Verify Signature --- 
  if (!verifySignature(connectorSecret, rawBodyBuffer, signatureHeader)) {
    console.warn(`Webhook ${webhookId}: Invalid signature received for connector ${connectorInfo.id}. Header: ${signatureHeader}`);
    return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 });
  }

  // --- 4. Parse JSON Body --- 
  let requestBody: any;
  try {
    requestBody = JSON.parse(rawBodyBuffer.toString('utf-8'));
  } catch (error) {
    console.error(`Webhook ${webhookId}: Failed to parse JSON body after signature verification`, error);
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  // --- 5. Process Verified Request --- 
  try {
    console.log(`Webhook received and verified for ${connectorInfo.category} connector '${connectorInfo.name}' (ID: ${connectorInfo.id}, WebhookID: ${webhookId})`);
    console.log('Webhook Body:', JSON.stringify(requestBody, null, 2));
    return NextResponse.json({ success: true, message: 'Webhook received and verified' });

  } catch (error) {
    console.error(`Webhook ${webhookId}: Error processing verified webhook:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: `Failed to process webhook: ${errorMessage}` }, { status: 500 });
  }
  // --- End of restored body ---
} 