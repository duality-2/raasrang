import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  PERPETUAL_COOKIE_MAX_AGE,
  getPersistentSessionFromCookies,
} from '@/lib/session';

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
      cookieOptions: {
        maxAge: PERPETUAL_COOKIE_MAX_AGE,
        path: '/',
        sameSite: 'lax',
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            const isDelete = options?.maxAge === 0;
            supabaseResponse.cookies.set(name, value, {
              ...options,
              maxAge: isDelete ? 0 : PERPETUAL_COOKIE_MAX_AGE,
              path: '/',
              sameSite: 'lax',
            });
          });
        },
      },
    }
  );

  // Resilient user resolution — never kick active users out on load, network blip, or token refresh delay
  let user: { id: string; email?: string; app_metadata: Record<string, unknown> } | null = null;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) {
      user = data.user;
    }
  } catch (err) {
    console.warn('Middleware getUser error, checking fallback session:', err);
  }

  // Fallback 1: Check session directly from cookies (avoids failing on Supabase Auth API rate limit / 5xx)
  if (!user) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        user = data.session.user;
      }
    } catch {
      // Ignore and proceed to persistent session check
    }
  }

  // Fallback 2: Check cryptographic persistent session cookie (fail-safe for high load/offline/idle)
  if (!user) {
    const persistent = await getPersistentSessionFromCookies(request.cookies);
    if (persistent) {
      user = {
        id: persistent.userId,
        email: persistent.email,
        app_metadata: { role: persistent.role },
      };
    }
  }


  const redirectWithCookies = (url: URL) => {
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  };

  // Protected routes: redirect to /login ONLY if genuinely unauthenticated
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
