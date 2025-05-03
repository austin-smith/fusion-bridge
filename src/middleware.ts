import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// Remove direct auth import
// import { auth } from '@/lib/auth/server'; 

// Define SessionCheckResponse type (reverted)
interface SessionCheckResponse {
  isAuthenticated: boolean;
  user?: { id: string };
  error?: string;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Middleware should not run on API routes, static files, OR the 2FA verification page
  const isApiAuthRoute = pathname.startsWith('/api/auth');
  const isApiEtc = pathname.startsWith('/api/'); // Catch all /api routes
  const isStaticAsset = pathname.startsWith('/_next/') || pathname.includes('.');
  const isVerify2faPage = pathname === '/verify-2fa'; // <-- ADDED check

  // --- Simplified Exclusion Check --- 
  // if (isApiAuthRoute || isStaticAsset || isVerify2faPage) { 
  //   if (pathname !== '/api/auth/check-session') { // Allow check-session to be called
  //       return NextResponse.next();
  //   }
  // }
  // Let the matcher handle exclusions primarily.

  // Fetch session status from the internal API route
  let sessionStatus: SessionCheckResponse = { isAuthenticated: false }; 
  try {
    const sessionCheckUrl = new URL('/api/auth/check-session', request.url);
    const response = await fetch(sessionCheckUrl, {
      headers: { 'Cookie': request.headers.get('Cookie') || '' },
      cache: 'no-store',
    });
    if (response.ok) {
      sessionStatus = await response.json();
    } else {
      console.error(`[Middleware] Check session API failed with status: ${response.status}`);
    }
  } catch (error) {
    console.error("[Middleware] Error fetching check session API:", error);
    sessionStatus = { isAuthenticated: false };
  }

  console.log("[Middleware] Received sessionStatus:", sessionStatus); // Keep log for now

  const isAuthenticated = sessionStatus.isAuthenticated;
  const isLoginPage = pathname === '/login';
  const isSetupPage = pathname === '/setup';

  // --- Reverted Logic --- 

  if (!isAuthenticated) {
    // User is NOT Authenticated
    if (isLoginPage || isSetupPage) { 
      console.log(`[Middleware] Not authenticated, allowing access to ${pathname}`);
      return NextResponse.next();
    }
    const loginUrl = new URL('/login', request.url);
    console.log(`[Middleware] Not authenticated, redirecting to ${loginUrl.toString()}`);
    return NextResponse.redirect(loginUrl);

  } else {
    // User IS Authenticated
    if (isLoginPage || isSetupPage) { 
      console.log(`[Middleware] Authenticated, redirecting from ${pathname} to /`);
      return NextResponse.redirect(new URL('/', request.url));
    }
    console.log(`[Middleware] Authenticated, allowing access to ${pathname}`);
    return NextResponse.next();
  }
}

// Configuration for the middleware
export const config = {
  matcher: [
    // Exclude specific API routes (auth, webhooks, startup), 
    // static assets, AND the /verify-2fa page itself.
    '/((?!api/auth|api/webhooks|api/startup|verify-2fa|_next/static|_next/image|favicon.ico).*)',
  ],
}; 