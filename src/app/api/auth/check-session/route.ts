import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/server';

// This route handler runs in the Node.js runtime by default

export async function GET(request: NextRequest) {
  try {
    // Forward necessary headers (especially Cookie) to getSession
    const session = await auth.api.getSession({ headers: request.headers });

    if (session && session.user) {
      // User is authenticated, return relevant (non-sensitive) data
      return NextResponse.json({
        isAuthenticated: true,
        user: {
          id: session.user.id,
          // Include other fields needed for settings page
          email: session.user.email ?? null, // Use nullish coalescing
          name: session.user.name ?? null,
          image: session.user.image ?? null,
        },
      }, { status: 200 });
    } else {
      // User is not authenticated
      return NextResponse.json({ isAuthenticated: false }, { status: 200 }); // Still 200 OK, just indicates no session
    }
  } catch (error) {
    console.error("[Check Session API] Error fetching session:", error);
    // Return an error state
    return NextResponse.json({ isAuthenticated: false, error: "Failed to check session" }, { status: 500 });
  }
} 