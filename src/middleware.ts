import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Routes that scanner role CAN access */
const SCANNER_ALLOWED_PATHS = [
  '/dashboard/verify',
  '/dashboard/gate-list',
];

/** Routes that ticketer role CAN access */
const TICKETER_ALLOWED_PATHS = [
  '/dashboard',
  '/dashboard/passes',
  '/dashboard/add',
];

/** Check if a path is allowed for scanner role */
function isScannerAllowed(pathname: string): boolean {
  return SCANNER_ALLOWED_PATHS.some(
    (allowed) => pathname === allowed || pathname.startsWith(allowed + '/')
  );
}

/** Check if a path is allowed for ticketer role */
function isTicketerAllowed(pathname: string): boolean {
  return TICKETER_ALLOWED_PATHS.some(
    (allowed) => pathname === allowed || pathname.startsWith(allowed + '/')
  );
}

export async function middleware(request: NextRequest) {
  // Graceful fallback when Supabase is not yet configured
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    // Without Supabase, protect dashboard and allow /login to render
    if (request.nextUrl.pathname.startsWith('/dashboard')) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh auth token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectWithCookies = (url: URL) => {
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  };

  // Protected routes: redirect to /login if not authenticated
  if (
    !user &&
    request.nextUrl.pathname.startsWith('/dashboard')
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return redirectWithCookies(url);
  }

  // If logged in and visiting /login, redirect to role home
  if (user && request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone();
    const role = user.app_metadata?.role;
    if (role === 'scanner') {
      url.pathname = '/dashboard/verify';
    } else if (role === 'ticketer') {
      url.pathname = '/dashboard/add';
    } else {
      url.pathname = '/dashboard';
    }
    return redirectWithCookies(url);
  }

  // Scanner route protection (middleware-level — server actions enforce separately)
  if (
    user &&
    request.nextUrl.pathname.startsWith('/dashboard') &&
    user.app_metadata?.role === 'scanner'
  ) {
    if (!isScannerAllowed(request.nextUrl.pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard/verify';
      return redirectWithCookies(url);
    }
  }

  // Ticketer route protection (middleware-level — server actions enforce separately)
  if (
    user &&
    request.nextUrl.pathname.startsWith('/dashboard') &&
    user.app_metadata?.role === 'ticketer'
  ) {
    if (!isTicketerAllowed(request.nextUrl.pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard/add';
      return redirectWithCookies(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public files (svg, png, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
