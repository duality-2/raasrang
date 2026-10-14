import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPersistentSessionFromCookies } from '@/lib/session';
import type { UserRole } from '@/types';

/**
 * Returns the authenticated user, or redirects to /login only if genuinely unauthenticated.
 * Call from Server Components and Server Actions.
 * Resilient against high database load, network timeouts, and transient token refresh delays.
 */
export async function requireAuth() {
  const supabase = await createClient();

  // 1. Primary check: Supabase auth getUser()
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!error && user) {
      return user;
    }
  } catch (err) {
    console.warn('requireAuth: Supabase getUser() error, checking fallback session:', err);
  }

  // 2. Fallback check: Direct session from cookies (survives Supabase Auth API rate limit / 5xx)
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      return session.user;
    }
  } catch (err) {
    console.warn('requireAuth: Supabase getSession() error, checking persistent cookie:', err);
  }

  // 3. Fail-safe: Cryptographically verified perpetual session cookie (survives load, offline sleep, token expiry)
  try {
    const cookieStore = await cookies();
    const persistent = await getPersistentSessionFromCookies(cookieStore);
    if (persistent) {

      return {
        id: persistent.userId,
        email: persistent.email,
        app_metadata: { role: persistent.role },
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date(persistent.createdAt || Date.now()).toISOString(),
      } as any;
    }
  } catch (err) {
    console.warn('requireAuth: Persistent cookie check error:', err);
  }

  // 4. Genuinely unauthenticated (user never logged in, or explicitly signed out)
  redirect('/login');
}

/**
 * Checks if the given user ID is in the organisers allowlist.
 * Uses the admin client because the organisers table has no
 * browser-accessible RLS policy (intentionally).
 */
export async function isOrganiser(userId: string): Promise<boolean> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();

    const { data, error } = await admin
      .from('organisers')
      .select('user_id')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Determine the role of an authenticated user.
 * Checks organisers table first (server-authoritative Admin), then app_metadata.
 * Returns null if the user has no recognised role.
 */
export async function getUserRole(userId: string, appMetadata?: Record<string, unknown>): Promise<UserRole | null> {
  // Check organiser table first (server-authoritative Admin)
  if (await isOrganiser(userId)) {
    return 'admin';
  }

  const roleClaim = appMetadata?.role as string | undefined;

  // Check admin / organiser in app_metadata
  if (roleClaim === 'admin' || roleClaim === 'organiser') {
    return 'admin';
  }

  // Check scanner role
  if (roleClaim === 'scanner') {
    return 'scanner';
  }

  // Check ticketer role
  if (roleClaim === 'ticketer') {
    return 'ticketer';
  }

  return null;
}


/**
 * Require auth AND any recognized event staff role (admin, scanner, ticketer, organiser).
 * Used for the top-level /dashboard layout.
 */
export async function requireDashboardUser() {
  const user = await requireAuth();
  const role = await getUserRole(user.id, user.app_metadata);
  const authorized = role !== null;
  return {
    user,
    authorized,
    role,
  };
}

/**
 * Require auth AND admin/organiser role.
 */
export async function requireOrganiser() {
  const user = await requireAuth();
  const role = await getUserRole(user.id, user.app_metadata);
  const authorized = role === 'admin' || role === 'organiser';
  return { user, authorized, role };
}

/**
 * Alias for requireOrganiser
 */
export const requireAdmin = requireOrganiser;

/**
 * Require auth AND (admin OR scanner) role.
 * Used for scanning and entry lists.
 */
export async function requireOrganiserOrScanner() {
  const user = await requireAuth();
  const role = await getUserRole(user.id, user.app_metadata);
  const authorized = role === 'admin' || role === 'organiser' || role === 'scanner';
  return {
    user,
    authorized,
    role,
  };
}

/**
 * Require auth AND (admin OR ticketer) role.
 * Used for pass issuance and own-pass lists.
 */
export async function requireOrganiserOrTicketer() {
  const user = await requireAuth();
  const role = await getUserRole(user.id, user.app_metadata);
  const authorized = role === 'admin' || role === 'organiser' || role === 'ticketer';
  return {
    user,
    authorized,
    role,
  };
}

/**
 * Require auth AND specifically the organiser/admin role.
 * Blocks scanners and ticketers from admin-only routes.
 */
export async function requireOrganiserOnly() {
  const user = await requireAuth();
  const role = await getUserRole(user.id, user.app_metadata);
  const isOrg = role === 'admin' || role === 'organiser';
  return {
    user,
    authorized: isOrg,
    role: isOrg ? ('admin' as const) : null,
  };
}
