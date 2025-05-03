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
  const { pathname, origin } = request.nextUrl;

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

  let sessionStatus: SessionCheckResponse = { isAuthenticated: false }; 
  let sessionCheckUrl: URL | null = null;

  // --- Try constructing internal URL using localhost and PORT --- 
  const port = process.env.PORT;
  if (port) {
      try {
          sessionCheckUrl = new URL(`http://localhost:${port}/api/auth/check-session`);
      } catch (e) {
          console.error("[Middleware] Failed to construct URL with localhost:PORT", e);
          // Fallback or handle error - perhaps try origin again or assume unauthenticated?
          // For now, let it proceed to the fetch attempt which will likely fail if URL is null
      }
  } else {
      console.warn("[Middleware] PORT environment variable not found. Falling back to using origin for session check URL.");
      try {
        sessionCheckUrl = new URL('/api/auth/check-session', origin);
      } catch (e) {
          console.error("[Middleware] Failed to construct URL with origin", e);
      }
  }

  if (sessionCheckUrl) {
      console.log(`[Middleware] Attempting to fetch session status from: ${sessionCheckUrl.toString()}`);
      try {
        const response = await fetch(sessionCheckUrl, {
          headers: { 'Cookie': request.headers.get('Cookie') || '' },
          cache: 'no-store',
          // Optionally add a timeout? Be careful with middleware performance.
          // signal: AbortSignal.timeout(2000) // Example: 2 second timeout
        });
        if (response.ok) {
          sessionStatus = await response.json();
        } else {
          console.error(`[Middleware] Check session API fetch failed with status: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.error("[Middleware] Error during fetch to check session API:", error);
        // Ensure sessionStatus remains { isAuthenticated: false } on fetch error
        sessionStatus = { isAuthenticated: false, error: (error instanceof Error) ? error.message : 'Fetch failed' };
      }
  } else {
       console.error("[Middleware] Could not determine a valid URL to fetch check-session API.");
       // Default to unauthenticated if URL construction failed
       sessionStatus = { isAuthenticated: false, error: 'Internal URL configuration error' };
  }

  console.log(
      `[Middleware] Received sessionStatus: isAuthenticated=${sessionStatus.isAuthenticated}${sessionStatus.user ? ', userId=' + sessionStatus.user.id : ''}${sessionStatus.error ? ', error=' + sessionStatus.error : ''}`
  ); // Log selectively

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
    const loginUrl = new URL('/login', origin);
    console.log(`[Middleware] Not authenticated (status reason: ${sessionStatus.error || 'no session'}), redirecting to ${loginUrl.toString()}`);
    return NextResponse.redirect(loginUrl);

  } else {
    // User IS Authenticated
    if (isLoginPage || isSetupPage) { 
      console.log(`[Middleware] Authenticated, redirecting from ${pathname} to /`);
      return NextResponse.redirect(new URL('/', origin));
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