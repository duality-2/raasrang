import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { UserRole } from '@/types';

/**
 * Returns the authenticated user, or redirects to /login.
 * Call from Server Components and Server Actions.
 */
export async function requireAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  return user;
}

/**
 * Checks if the given user ID is in the organisers allowlist.
 * Uses the admin client because the organisers table has no
 * browser-accessible RLS policy (intentionally).
 */
export async function isOrganiser(userId: string): Promise<boolean> {
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
