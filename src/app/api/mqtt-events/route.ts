import { NextResponse, NextRequest } from 'next/server';
import { 
  getMqttClientState, 
  subscribeToMqttState,
  MqttClientState,
  mqttServiceEmitter
} from '@/services/mqtt-service';
import { YolinkEvent } from '@/services/mqtt-service';

export const dynamic = 'force-dynamic'; // Ensure this route is always dynamic

export async function GET(request: NextRequest) {
  const signal = request.signal;

  // Initialize the SSE stream
  const stream = new ReadableStream({
    start(controller) {
      console.log('[SSE Route] Client connected');
      
      // Function to send data to the client
      const sendEvent = (event: string, data: any) => {
        if (signal.aborted) {
          console.log(`[SSE Route] Attempted to send ${event} but client disconnected.`);
          return;
        }
        try {
          controller.enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (e) {
          console.error(`[SSE Route] Error enqueueing ${event} event:`, e);
          cleanup();
        }
      };
      
      // Send initial states for all connections
      // Note: This needs refinement if we want to send state per connection
      //       Currently, it just sends the overall state or the first active one.
      const initialOverallState = getMqttClientState(); // Assuming this returns a general state
      sendEvent('status', initialOverallState);

      // Listener for MQTT state changes
      const handleStateChange = (state: MqttClientState, homeId: string) => {
        // console.log(`[SSE Route] Sending status update for ${homeId}`);
        sendEvent('status', state);
      };

      // Listener for new MQTT messages
      const handleNewMessage = (event: YolinkEvent) => {
        // Only send message events if the client is meant to receive them
        // For now, send all messages to all clients.
        // console.log(`[SSE Route] Sending message event ${event.msgid}`);
        sendEvent('message', event);
      };

      // Subscribe to MQTT status updates
      const unsubscribe = subscribeToMqttState(handleStateChange);
      console.log('[SSE Route] Subscribed to MQTT state changes');
      
      // Subscribe to new MQTT messages
      mqttServiceEmitter.on('newMessage', handleNewMessage);
      console.log('[SSE Route] Subscribed to new MQTT messages');

      // Cleanup function
      const cleanup = () => {
        console.log('[SSE Route] Cleaning up SSE resources');
        unsubscribe();
        mqttServiceEmitter.off('newMessage', handleNewMessage);
      };

      // Use the request's signal for cleanup
      signal.addEventListener('abort', () => {
        console.log('[SSE Route] Client disconnected via signal, cleaning up');
        cleanup();
      });
    },
    cancel(reason) {
      console.log('[SSE Route] Stream cancelled by client or server:', reason);
    },
  });

  // Return the stream response
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}

// Optional: Add a POST handler if needed, e.g., for initialization
// export async function POST() {
//   // ... initialization logic ...
//   return NextResponse.json({ success: true });
// } 