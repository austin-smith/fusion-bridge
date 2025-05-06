import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
// Remove direct auth import
// import { auth } from '@/lib/auth/server'; 

// Define SessionCheckResponse type (reverted)
// interface SessionCheckResponse {
//   isAuthenticated: boolean;
//   user?: { id: string };
//   error?: string;
// }

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const loginUrl = new URL('/login', request.url);
  const homeUrl = new URL('/', request.url);

  // Check for the session cookie directly
  const sessionCookie = getSessionCookie(request);
  const isAuthenticated = !!sessionCookie;

  console.log(`[Middleware] Path: ${pathname}, Authenticated: ${isAuthenticated}`);
  
  const isLoginPage = pathname === '/login';
  const isSetupPage = pathname === '/setup';
  const isVerify2faPage = pathname === '/verify-2fa';

  if (!isAuthenticated) {
    // User is NOT Authenticated
    // Allow access to login, setup, AND the verify-2fa page
    if (isLoginPage || isSetupPage || isVerify2faPage) {
      console.log(`[Middleware] Not authenticated, allowing access to public/auth path: ${pathname}`);
      return NextResponse.next();
    }
    // Redirect all other paths to login
    console.log(`[Middleware] Not authenticated, redirecting non-public path to ${loginUrl.toString()}`);
    return NextResponse.redirect(loginUrl);
  } else {
    // User IS Authenticated
    // If trying to access login or setup page, redirect to home
    if (isLoginPage || isSetupPage) {
      console.log(`[Middleware] Authenticated, redirecting from auth page ${pathname} to ${homeUrl.toString()}`);
      return NextResponse.redirect(homeUrl);
    }
    // Allow access to all other protected pages (including /verify-2fa if needed, though unlikely to hit here)
    console.log(`[Middleware] Authenticated, allowing access to protected path: ${pathname}`);
    return NextResponse.next();
  }
}

// Configuration for the middleware
export const config = {
  /*
   * Match all request paths except for the ones starting with:
   * - api/auth (better-auth routes)
   * - api/webhooks (webhook handlers)
   * - api/startup (initial setup check route)
   * - _next/static (static files)
   * - _next/image (image optimization files)
   * - favicon.ico (favicon file)
   * - Any paths with a file extension (e.g., .png, .jpg)
   * - The root path '/' IF it should be public (optional)
   *
   * Adjust the negative lookaheads as needed.
   * If the root path ('/') should be protected, remove it from matcher or handle in middleware logic.
   */
  matcher: [
    '/((?!api/auth|api/webhooks|api/startup|_next/static|_next/image|favicon.ico|.*\.\w+).*)',
  ],
}; 