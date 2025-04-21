import { useState, useEffect, useRef, useCallback } from 'react';
import { YolinkEvent } from '@/services/mqtt-service'; // Assuming YolinkEvent is exported

// Define the structure for the status event data
interface MqttStatusEvent {
  homeId: string | null;
  connected: boolean;
  lastEvent: { time: number; count: number } | null;
  error: string | null;
  reconnecting: boolean;
  disabled: boolean;
}

interface UseMqttSseOptions {
  onMessage?: (event: YolinkEvent) => void;
  onStatus?: (status: MqttStatusEvent) => void;
  onError?: (error: Event) => void;
}

interface UseMqttSseReturn {
  isConnected: boolean;
  error: Event | null;
  lastMessage: YolinkEvent | null;
  lastStatus: MqttStatusEvent | null;
  connect: () => void;
  disconnect: () => void;
}

const SSE_ENDPOINT = '/api/mqtt-events';

export function useMqttSse({
  onMessage,
  onStatus,
  onError,
}: UseMqttSseOptions = {}): UseMqttSseReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Event | null>(null);
  const [lastMessage, setLastMessage] = useState<YolinkEvent | null>(null);
  const [lastStatus, setLastStatus] = useState<MqttStatusEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      console.log('[SSE Hook] Disconnecting from SSE');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    // Disconnect if already connected
    disconnect();

    console.log(`[SSE Hook] Connecting to ${SSE_ENDPOINT}...`);
    const es = new EventSource(SSE_ENDPOINT);
    eventSourceRef.current = es;

    es.onopen = () => {
      console.log('[SSE Hook] SSE connection opened');
      setIsConnected(true);
      setError(null);
      // Clear any pending reconnect timeouts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    es.addEventListener('message', (event) => {
      try {
        const messageData = JSON.parse(event.data) as YolinkEvent;
        // console.log('[SSE Hook] Received message event:', messageData);
        setLastMessage(messageData);
        if (onMessage) {
          onMessage(messageData);
        }
      } catch (err) {
        console.error('[SSE Hook] Failed to parse message event:', err, 'Data:', event.data);
      }
    });

    es.addEventListener('status', (event) => {
      try {
        const statusData = JSON.parse(event.data) as MqttStatusEvent;
        // console.log('[SSE Hook] Received status event:', statusData);
        setLastStatus(statusData);
        if (onStatus) {
          onStatus(statusData);
        }
      } catch (err) {
        console.error('[SSE Hook] Failed to parse status event:', err, 'Data:', event.data);
      }
    });

    es.onerror = (errEvent) => {
      console.error('[SSE Hook] SSE connection error:', errEvent);
      setError(errEvent);
      setIsConnected(false);
      es.close(); // Ensure the connection is closed before attempting to reconnect

      // Schedule reconnect with backoff (e.g., 5 seconds)
      if (!reconnectTimeoutRef.current) {
        console.log('[SSE Hook] Scheduling SSE reconnect in 5s...');
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null; // Clear ref before attempting connect
          connect(); // Attempt to reconnect
        }, 5000);
      }

      if (onError) {
        onError(errEvent);
      }
    };
  }, [disconnect, onMessage, onStatus, onError]);

  // Connect on mount and disconnect on unmount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return { isConnected, error, lastMessage, lastStatus, connect, disconnect };
} 