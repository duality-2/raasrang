import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

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
 * Uses the authenticated (RLS) client — the organisers table has
 * NO select policy for authenticated users, so we use the admin client.
 */
export async function isOrganiser(userId: string): Promise<boolean> {
  // We use the admin client because the organisers table has no
  // browser-accessible RLS policy (intentionally).
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
 * Combined: require auth AND organiser role.
 * Redirects to /login if not authenticated.
 * Returns { user, authorized: false } if authenticated but not an organiser.
 */
export async function requireOrganiser() {
  const user = await requireAuth();
  const authorized = await isOrganiser(user.id);
  return { user, authorized };
}
