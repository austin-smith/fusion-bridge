import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPushoverConfiguration } from '@/data/repositories/service-configurations';
import { sendPushoverNotification } from '@/services/drivers/pushover';
import type { ResolvedPushoverMessageParams } from '@/types/pushover-types';

// Define the expected request body schema, extending with all new optional fields
const TestPayloadSchema = z.object({
  title: z.string().optional(),
  message: z.string().min(1, 'Message is required'),
  attachment_base64: z.string().optional(),
  attachment_type: z.string().optional(),
  device: z.string().optional(),
  priority: z.union([
    z.literal(-2),
    z.literal(-1),
    z.literal(0),
    z.literal(1),
    z.literal(2)
  ]).optional(),
  retry: z.number().int().min(30).optional(), // Validated on frontend, but good to have schema consistency
  expire: z.number().int().min(1).max(10800).optional(), // Validated on frontend
  html: z.literal(1).optional(), // Only send 1 if true
  monospace: z.literal(1).optional(), // Only send 1 if true
  url: z.string().url().optional(),
  urlTitle: z.string().optional(),
  timestamp: z.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const config = await getPushoverConfiguration();

    if (!config || !config.apiToken || !config.groupKey) {
      return NextResponse.json(
        { success: false, error: 'Pushover configuration not found or incomplete.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validation = TestPayloadSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: validation.error.errors },
        { status: 400 }
      );
    }

    const {
      title,
        message,
      attachment_base64,
      attachment_type,
      device,
      priority,
      retry,
      expire,
      html,
      monospace,
      url,
      urlTitle,
      timestamp
    } = validation.data;

    // Basic validation for attachment data coherence
    if ((attachment_base64 && !attachment_type) || (!attachment_base64 && attachment_type)) {
      return NextResponse.json(
        { success: false, error: 'Both attachment_base64 and attachment_type must be provided together.' },
        { status: 400 }
      );
    }

    // Construct the parameters for the service call
    const pushoverParams: ResolvedPushoverMessageParams = {
      message,
      ...(title && { title: title || 'Fusion Test' }), // Default title if not provided
      ...(attachment_base64 && { attachment_base64 }),
      ...(attachment_type && { attachment_type }),
      ...(device && { device }),
      ...(priority !== undefined && { priority }), // Pass priority if defined
      ...(retry && priority === 2 && { retry }), // Only pass retry if priority is 2
      ...(expire && priority === 2 && { expire }), // Only pass expire if priority is 2
      ...(html && { html }),
      ...(monospace && { monospace }),
      ...(url && { url }),
      ...(urlTitle && url && { urlTitle }), // Only pass urlTitle if url is also present
      ...(timestamp && { timestamp }),
    };

    const result = await sendPushoverNotification(config.apiToken, config.groupKey, pushoverParams);

    if (result.success) {
      return NextResponse.json({ success: true, requestId: result.pushoverRequestId });
    } else {
      return NextResponse.json(
        { success: false, error: result.errorMessage || 'Failed to send notification', details: result.errors },
        { status: 500 } // Or determine appropriate status based on Pushover error
      );
    }
  } catch (error) {
    console.error('[API /services/pushover/test] Error:', error);
    let errorMessage = 'Internal Server Error';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    // Check if the error is due to JSON parsing
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
        errorMessage = 'Invalid JSON format in request body.';
        return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
    }
    
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
} 