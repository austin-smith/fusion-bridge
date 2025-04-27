import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { sql, eq } from 'drizzle-orm';
import crypto from 'crypto'; // Import crypto
import { Buffer } from 'buffer'; // Needed for raw body handling

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
  // Type params as a Promise containing the expected object
  { params }: { params: Promise<{ webhookId: string }> } 
) {
  // Await the params Promise before destructuring
  const { webhookId } = await params;
  
  if (!webhookId) {
    return NextResponse.json({ success: false, error: 'Webhook ID missing' }, { status: 400 });
  }

  // --- 1. Read Raw Body --- 
  let rawBodyBuffer: Buffer;
  try {
    // Efficiently get the raw body as a buffer
    rawBodyBuffer = Buffer.from(await request.arrayBuffer()); 
  } catch (error) {
    console.error(`Webhook ${webhookId}: Failed to read raw request body`, error);
    return NextResponse.json({ success: false, error: 'Failed to read request body' }, { status: 500 });
  }
  
  // --- 2. Fetch Connector, Config, and Secret --- 
  let connectorSecret: string | undefined;
  let connectorInfo: { id: string; name: string; category: string } | undefined;
  let parsedConfig: Record<string, any> | undefined;

  try {
    const connectorResult = await db.select({
        id: connectors.id,
        name: connectors.name,
        category: connectors.category,
        config: connectors.cfg_enc
    })
    .from(connectors)
    // Use the webhookId directly from the path parameters
    // Updated query to correctly use JSON operator ->>
    .where(sql`${connectors.cfg_enc}->>'webhookId' = ${webhookId}`)
    .limit(1);

    if (!connectorResult || connectorResult.length === 0) {
      console.warn(`Webhook received for unknown ID: ${webhookId}`);
      // Don't reveal if ID exists, standard 401 for security
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    connectorInfo = {
        id: connectorResult[0].id,
        name: connectorResult[0].name,
        category: connectorResult[0].category,
    };

    try {
      parsedConfig = JSON.parse(connectorResult[0].config || '{}');
      connectorSecret = parsedConfig?.webhookSecret;
      // Secret is required for both NetBox and Genea webhook validation
      if (!connectorSecret || typeof connectorSecret !== 'string') {
        console.error(`Webhook ${webhookId}: Missing or invalid secret in config for connector ${connectorInfo.id}`);
        // Treat missing internal config as an authentication failure from the client's perspective
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
  const signatureHeader = connectorInfo.category === 'genea' 
    ? request.headers.get(GENEA_SIGNATURE_HEADER)
    : request.headers.get(NETBOX_SIGNATURE_HEADER); // Default or NetBox

  if (!verifySignature(connectorSecret, rawBodyBuffer, signatureHeader, connectorInfo.category)) {
    console.warn(`Webhook ${webhookId}: Invalid signature received for connector ${connectorInfo.id}. Header: ${signatureHeader}`);
    return NextResponse.json({ success: false, error: 'Unauthorized: Invalid signature' }, { status: 401 });
  }

  // --- 4. Parse JSON Body (Now that signature is verified) --- 
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

    // ---------
    // TODO: Add actual event processing logic here based on connectorInfo.category and requestBody
    // Example: if (connectorInfo.category === 'genea') { handleGeneaEvent(requestBody); }
    // ---------

    return NextResponse.json({ success: true, message: 'Webhook received and verified' });

  } catch (error) {
    console.error(`Webhook ${webhookId}: Error processing verified webhook:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: `Failed to process webhook: ${errorMessage}` }, { status: 500 });
  }
} 