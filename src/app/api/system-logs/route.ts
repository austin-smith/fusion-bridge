import { NextRequest } from 'next/server';

// Keep track of console logs
const MAX_LOGS = 1000;
const consoleBuffer: string[] = [];

// Capture console output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

function timestamp(): string {
  return new Date().toISOString();
}

function addToBuffer(type: string, ...args: any[]) {
  const log = `${timestamp()} [${type}] ${args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ')}`;
  
  consoleBuffer.push(log);
  if (consoleBuffer.length > MAX_LOGS) {
    consoleBuffer.shift(); // Remove oldest log if buffer is full
  }
  return log;
}

// Override console methods to capture logs
console.log = (...args) => {
  const log = addToBuffer('LOG', ...args);
  originalConsoleLog.apply(console, [log]);
};

console.error = (...args) => {
  const log = addToBuffer('ERROR', ...args);
  originalConsoleError.apply(console, [log]);
};

console.warn = (...args) => {
  const log = addToBuffer('WARN', ...args);
  originalConsoleWarn.apply(console, [log]);
};

console.info = (...args) => {
  const log = addToBuffer('INFO', ...args);
  originalConsoleInfo.apply(console, [log]);
};

function formatSseMessage(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`;
}

export async function GET(request: NextRequest) {
  console.info('[system-logs] New client connected');
  
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let lastSentIndex = -1;

      // Send initial logs
      const sendInitialLogs = () => {
        const message = formatSseMessage('initial', JSON.stringify(consoleBuffer));
        controller.enqueue(encoder.encode(message));
        lastSentIndex = consoleBuffer.length - 1;
      };

      // Send new logs
      const checkNewLogs = () => {
        if (lastSentIndex < consoleBuffer.length - 1) {
          const newLogs = consoleBuffer.slice(lastSentIndex + 1);
          const message = formatSseMessage('update', JSON.stringify(newLogs));
          controller.enqueue(encoder.encode(message));
          lastSentIndex = consoleBuffer.length - 1;
        }
      };

      // Send initial logs
      sendInitialLogs();

      // Set up interval to check for new logs
      const intervalId = setInterval(checkNewLogs, 1000);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        console.info('[system-logs] Client disconnected');
        clearInterval(intervalId);
        controller.close();
      });
    },

    cancel() {
      console.info('[system-logs] Stream cancelled');
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
} 