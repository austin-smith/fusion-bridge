import { NextResponse } from 'next/server';

/**
 * GET handler for startup initialization
 * A simple endpoint that returns a success response
 */
export async function GET() {
  try {
    console.log('[Startup API] Server initialization request received');
    
    // We could add more initialization here if needed in the future
    
    return NextResponse.json({
      success: true,
      message: 'Server initialized successfully'
    });
  } catch (error) {
    console.error('[Startup API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Server initialization failed' },
      { status: 500 }
    );
  }
} 