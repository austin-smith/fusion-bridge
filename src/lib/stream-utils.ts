import { Readable } from 'stream';

export interface StreamConversionError extends Error {
  name: 'StreamConversionError';
  streamType: string;
}

/**
 * Convert various stream types to Web ReadableStream for use with NextResponse
 * Handles both Node.js Readable streams and Web ReadableStreams
 */
export function convertToWebStream(stream: unknown): ReadableStream<Uint8Array> {
  // Check if it's already a Web ReadableStream
  if (typeof (stream as any)?.getReader === 'function') {
    return stream as ReadableStream<Uint8Array>;
  }
  
  // Check if it's a Node.js Readable stream
  if (stream instanceof Readable) {
    // Use Node.js built-in conversion if available
    if (typeof Readable.toWeb === 'function') {
      return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
    }
    
    // Fallback manual conversion for older Node.js versions
    return new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        
        stream.on('end', () => {
          controller.close();
        });
        
        stream.on('error', (error) => {
          controller.error(error);
        });
      }
    });
  }
  
  // Unknown stream type
  const error = new Error(
    `Unsupported stream type. Expected Node.js Readable or Web ReadableStream, got: ${typeof stream}`
  ) as StreamConversionError;
  
  error.name = 'StreamConversionError';
  error.streamType = typeof stream;
  
  throw error;
}

/**
 * Type guard to check if an object is a Web ReadableStream
 */
export function isWebReadableStream(obj: unknown): obj is ReadableStream<Uint8Array> {
  return typeof (obj as any)?.getReader === 'function';
}

/**
 * Type guard to check if an object is a Node.js Readable stream
 */
export function isNodeReadableStream(obj: unknown): obj is Readable {
  return obj instanceof Readable;
}