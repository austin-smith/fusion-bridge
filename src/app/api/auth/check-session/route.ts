import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/server';

// This route handler runs in the Node.js runtime by default

export async function GET(request: NextRequest) {
  try {
    // Forward necessary headers (especially Cookie) to getSession
    const session = await auth.api.getSession({ headers: request.headers });

    // --- Reverted Check: Check for session and user --- 
    if (session && session.user) { 
      // User is fully authenticated, return minimal info
      return NextResponse.json({
        isAuthenticated: true, 
        user: { // Return only the user ID
          id: session.user.id,
        },
      }, { status: 200 });
    } else {
      // User has no session or session lacks user (treat as unauthenticated)
      return NextResponse.json({ isAuthenticated: false }, { status: 200 });
    }
  } catch (error) {
    console.error("[Check Session API] Error fetching session:", error);
    // Return an error state
    return NextResponse.json({ isAuthenticated: false, error: "Failed to check session" }, { status: 500 });
  }
} 