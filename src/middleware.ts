import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// Remove direct auth import
// import { auth } from '@/lib/auth/server'; 

// Remove runtime export - run on Edge
// export const runtime = 'nodejs';

// Define SessionCheckResponse type again
interface SessionCheckResponse {
  isAuthenticated: boolean;
  user?: { id: string };
  error?: string;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip checks for API routes, static files, etc. - relying on matcher mostly
  const isApiAuthRoute = pathname.startsWith('/api/auth');
  const isStaticAsset = pathname.startsWith('/_next/') || pathname.includes('.');
  if (isApiAuthRoute || isStaticAsset) { 
    // Don't run session check for auth API routes or static assets
    // Exception: Don't skip our own check-session route if called directly
    if (pathname !== '/api/auth/check-session') {
        return NextResponse.next();
    }
  }

  // Fetch session status from the internal API route
  let sessionStatus: SessionCheckResponse = { isAuthenticated: false }; 
  try {
    const sessionCheckUrl = new URL('/api/auth/check-session', request.url);
    const response = await fetch(sessionCheckUrl, {
      headers: {
        'Cookie': request.headers.get('Cookie') || '',
      },
      cache: 'no-store', 
    });

    if (response.ok) {
      sessionStatus = await response.json();
    } else {
      console.error(`[Middleware] Check session API failed with status: ${response.status}`);
    }
  } catch (error) {
    console.error("[Middleware] Error fetching check session API:", error);
  }

  const isAuthenticated = sessionStatus.isAuthenticated;
  const isLoginPage = pathname === '/login';
  const isSetupPage = pathname === '/setup';

  // If user is not logged in
  if (!isAuthenticated) {
    // Allow access to login OR setup page
    if (isLoginPage || isSetupPage) { 
      return NextResponse.next();
    }
    // Otherwise, redirect to login
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If user IS logged in
  if (isAuthenticated) {
    // If trying to access login OR setup page, redirect to dashboard
    if (isLoginPage || isSetupPage) { 
      return NextResponse.redirect(new URL('/', request.url));
    }
    // Allow access to all other routes if logged in
    return NextResponse.next();
  }

  // Default fallback 
  return NextResponse.next();
}

// Configuration for the middleware
export const config = {
  matcher: [
    // Exclude specific API routes (auth, webhooks) and static assets
    '/((?!api/auth|api/webhooks|_next/static|_next/image|favicon.ico).*)',
  ],
}; 