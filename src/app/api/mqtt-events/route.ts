import { NextResponse } from 'next/server';
import { 
  getMqttClientState, 
  subscribeToMqttState,
  MqttClientState 
} from '@/services/mqtt-service';

export const dynamic = 'force-dynamic'; // Ensure this route is handled dynamically

export async function GET(request: Request) {
  // Check if ReadableStream is supported (should be in modern environments)
  if (!global.ReadableStream) {
    return new NextResponse('ReadableStream not supported', { status: 500 });
  }

  const stream = new ReadableStream({
    start(controller) {
      // Function to send state updates to the client
      const sendState = (state: MqttClientState, homeId: string) => {
        try {
          const payload = { ...state, homeId };
          const message = `event: status\ndata: ${JSON.stringify(payload)}\n\n`;
          controller.enqueue(new TextEncoder().encode(message));
          console.log('SSE: Sent status update');
        } catch {
          console.error("SSE: Error sending state");
          // Potentially close the stream if encoding fails badly
        }
      };

      // Subscribe to MQTT state changes
      console.log('SSE: Client connected, subscribing to MQTT state');
      const unsubscribe = subscribeToMqttState(sendState);

      // Send the initial state immediately
      const initialState = getMqttClientState();
      sendState(initialState, initialState.homeId ?? '');
      console.log('SSE: Sent initial state');

      // Handle client disconnect
      // Note: Detecting disconnects in Next.js Edge/Node streams can be tricky.
      // The 'cancel' method might not fire reliably depending on deployment environment.
      // A heartbeat mechanism might be needed for robust disconnect detection.
      request.signal.addEventListener('abort', () => {
        console.log('SSE: Client disconnected, unsubscribing');
        unsubscribe();
        try {
          controller.close(); 
        } catch {
          // Ignore errors trying to close already closed controller
        }
      });
    },
    cancel(reason) {
      // This might be called if the stream is cancelled prematurely.
      console.log('SSE: Stream cancelled', reason);
      // Ensure cleanup happens, though 'abort' is usually the primary signal
      // We rely on the unsubscribe logic within the 'abort' listener setup in start()
    }
  });

  // Return the stream response with appropriate headers
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
} 