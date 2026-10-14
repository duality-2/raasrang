import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { PERPETUAL_COOKIE_MAX_AGE } from '@/lib/session-constants';

export async function createClient() {

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        maxAge: PERPETUAL_COOKIE_MAX_AGE,
        path: '/',
        sameSite: 'lax',
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const isDelete = options?.maxAge === 0;
              cookieStore.set(name, value, {
                ...options,
                maxAge: isDelete ? 0 : PERPETUAL_COOKIE_MAX_AGE,
                path: '/',
                sameSite: 'lax',
              });
            });
          } catch {
            // The `setAll` method is called from a Server Component where
            // cookies cannot be set. This is fine — the middleware will
            // refresh the session.
          }
        },
      },
    }
  );
}

