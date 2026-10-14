'use client';

import { createBrowserClient } from '@supabase/ssr';
import { PERPETUAL_COOKIE_MAX_AGE } from '@/lib/session-constants';

export function createClient() {

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        maxAge: PERPETUAL_COOKIE_MAX_AGE,
        path: '/',
        sameSite: 'lax',
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );
}

