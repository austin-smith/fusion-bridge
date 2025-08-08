/*
  Client-side SSE stream helper for realtime events.
  - Manages a single EventSource instance
  - Supports reconnect via native SSE behavior
  - Allows updating server-side filters by restarting the stream
*/

type StreamParams = {
  alarmEventsOnly?: boolean;
};

type StreamHandlers = {
  onEvent?: (data: any) => void;
  onArming?: (data: any) => void;
  onSystem?: (data: any) => void;
  onHeartbeat?: (data: any) => void;
  onConnection?: (data: any) => void;
  onOpen?: () => void;
  onError?: (e: Event) => void;
};

class RealtimeEventStream {
  private eventSource: EventSource | null = null;
  private params: StreamParams | null = null;
  private handlers: StreamHandlers = {};
  private started = false;

  start(params: StreamParams, handlers: StreamHandlers = {}) {
    this.params = { ...params };
    this.handlers = handlers;
    this.open();
  }

  stop() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.started = false;
  }

  update(params: Partial<StreamParams>) {
    if (!this.params) this.params = {};
    this.params = { ...this.params, ...params };
    // Restart stream with new params
    this.restart();
  }

  private restart() {
    this.stop();
    if (this.params) {
      this.open();
    }
  }

  private buildUrl(): string {
    const url = new URL('/api/events/stream', window.location.origin);
    if (this.params?.alarmEventsOnly) {
      url.searchParams.set('alarmEventsOnly', 'true');
    }
    // Intentionally do NOT include thumbnails or eventTypes for stability
    return url.toString();
  }

  private open() {
    if (this.started) return;
    this.started = true;

    const url = this.buildUrl();
    const es = new EventSource(url, { withCredentials: true });
    this.eventSource = es;

    es.addEventListener('open', () => {
      this.handlers.onOpen?.();
    });

    es.addEventListener('event', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        this.handlers.onEvent?.(data);
      } catch (_) {}
    });

    // Some servers may emit default messages without an explicit event name
    es.addEventListener('message', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        this.handlers.onEvent?.(data);
      } catch (_) {}
    });

    es.addEventListener('arming', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        this.handlers.onArming?.(data);
      } catch (_) {}
    });

    es.addEventListener('system', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        this.handlers.onSystem?.(data);
      } catch (_) {}
    });

    es.addEventListener('connection', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        this.handlers.onConnection?.(data);
      } catch (_) {}
    });

    es.addEventListener('heartbeat', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        this.handlers.onHeartbeat?.(data);
      } catch (_) {}
    });

    es.addEventListener('error', (e: Event) => {
      this.handlers.onError?.(e);
      // Let native EventSource handle reconnection; if it permanently errors, callers can stop/start
    });
  }
}

export const realtimeEventStream = new RealtimeEventStream();


