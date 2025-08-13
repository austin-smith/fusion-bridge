import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

// Helper function to add CORS headers to a response
function addCorsHeaders(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-yolink-action');
  response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours

  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  console.log(`[Middleware] Processing path: ${pathname}`);

  // Handle preflight OPTIONS requests for CORS
  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    console.log(`[Middleware] Handling CORS preflight for: ${pathname}`);
    const response = new NextResponse(null, { status: 200 });
    return addCorsHeaders(response);
  }

  const loginUrl = new URL('/login', request.url);
  const homeUrl = new URL('/', request.url);

  // Handle API routes first
  if (pathname.startsWith('/api/')) {
    console.log(`[Middleware] Processing API route: ${pathname}`);
    
    // Allow truly public API routes that handle their own authentication
    if (pathname.startsWith('/api/auth/') || 
        pathname.startsWith('/api/webhooks/') || 
        pathname.startsWith('/api/startup')) {
      console.log(`[Middleware] Allowing public API route: ${pathname}`);
      const response = NextResponse.next();
      return addCorsHeaders(response);
    }
    
    // Allow routes that already have their own authentication wrappers
    // These routes use withApiRouteAuth and handle both session + API key auth
    if (pathname.startsWith('/api/admin/') ||
        pathname.startsWith('/api/alarm') ||
        pathname.startsWith('/api/alarm-zones') ||
        pathname.startsWith('/api/devices') ||
        pathname.startsWith('/api/events') ||
        pathname.startsWith('/api/locations') ||
        pathname.startsWith('/api/spaces') ||
        pathname.startsWith('/api/alarm/') ||
        pathname.startsWith('/api/piko/webrtc')) {
      console.log(`[Middleware] Allowing route with own auth wrapper: ${pathname}`);
      const response = NextResponse.next();
      return addCorsHeaders(response);
    }
    
    // All other API routes require session authentication
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      console.log(`[Middleware] Blocking unauthenticated API request to: ${pathname}`);
      const response = NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      return addCorsHeaders(response);
    }
    
    console.log(`[Middleware] Allowing authenticated API request to: ${pathname}`);
    const response = NextResponse.next();
    return addCorsHeaders(response);
  }

  // Handle page routes (existing logic)
  const sessionCookie = getSessionCookie(request);
  const isAuthenticated = !!sessionCookie;

  console.log(`[Middleware] Auth check for path: ${pathname}, Authenticated: ${isAuthenticated}`);
  
  const isLoginPage = pathname === '/login';
  const isSetupPage = pathname === '/setup';
  const isVerify2faPage = pathname === '/verify-2fa';

  if (!isAuthenticated) {
    if (isLoginPage || isSetupPage || isVerify2faPage) {
      console.log(`[Middleware] Not authenticated, allowing access to public/auth path: ${pathname}`);
      return NextResponse.next();
    }
    console.log(`[Middleware] Not authenticated, redirecting non-public path to ${loginUrl.toString()}`);
    return NextResponse.redirect(loginUrl);
  } else {
    if (isLoginPage || isSetupPage) {
      console.log(`[Middleware] Authenticated, redirecting from auth page ${pathname} to ${homeUrl.toString()}`);
      return NextResponse.redirect(homeUrl);
    }
    console.log(`[Middleware] Authenticated, allowing access to protected path: ${pathname}`);
    return NextResponse.next();
  }
}

// Configuration for the middleware
export const config = {
  /*
   * Match all request paths except for static assets.
   * Now includes API routes for authentication checking.
   * 
   * Excludes:
   * - _next/static (static files)
   * - _next/image (image optimization files) 
   * - /icons/ (custom icons folder)
   * - favicon.ico (favicon file)
   * - opengraph-image.png (Open Graph image)
   * - manifest.json (web app manifest file)
   */
  matcher: [
    // This regex excludes static assets from middleware processing
    '/((?!_next/static|_next/image|icons/|favicon\\.ico|opengraph-image\\.png|manifest\\.json|email-header-logo\\.png|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)',
  ],
};
