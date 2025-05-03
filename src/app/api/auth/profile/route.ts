import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/server';

// This route handler provides detailed profile information for the authenticated user.
export async function GET(request: NextRequest) {
  try {
    // Forward necessary headers (especially Cookie) to getSession
    const session = await auth.api.getSession({ headers: request.headers });

    if (session && session.user) {
      // User is authenticated, return full profile details
      return NextResponse.json({
        id: session.user.id,
        email: session.user.email ?? null,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
        twoFactorEnabled: session.user.twoFactorEnabled ?? false,
      }, { status: 200 });
    } else {
      // User is not authenticated
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch (error) {
    console.error("[Profile API] Error fetching session:", error);
    // Return an internal server error state
    return NextResponse.json({ error: "Failed to retrieve profile" }, { status: 500 });
  }
} 