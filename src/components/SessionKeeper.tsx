'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * SessionKeeper: Perpetual Client-Side Keep-Alive & Auto-Refresh
 *
 * Ensures that all logged-in profiles (Admin, Scanner, Ticketer) stay logged in indefinitely.
 * Proactively refreshes auth tokens before they expire:
 * 1. Automatically every 5 minutes while active.
 * 2. Immediately when tab wakes up / screen unlocks (visibilitychange).
 * 3. Immediately when network reconnects (online event).
 * 4. Immediately when window regains focus.
 */
export default function SessionKeeper() {
  const lastRefreshRef = useRef<number>(Date.now());

  useEffect(() => {
    const supabase = createClient();

    const refreshSessionIfNeeded = async (force: boolean = false) => {
      const now = Date.now();
      // Throttle rapid calls (minimum 10 seconds between refresh checks unless forced)
      if (!force && now - lastRefreshRef.current < 10000) {
        return;
      }
      lastRefreshRef.current = now;

      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.debug('[SessionKeeper] Token check notice:', error.message);
        } else if (data?.session) {
          // If token has less than 15 minutes left, proactively refresh it
          const expiresAt = data.session.expires_at;
          if (expiresAt) {
            const timeUntilExpiry = expiresAt * 1000 - Date.now();
            if (timeUntilExpiry < 15 * 60 * 1000) {
              await supabase.auth.refreshSession();
            }
          }
        }
      } catch (err) {
        console.debug('[SessionKeeper] Transient keepalive check:', err);
      }
    };

    // Initial check on mount
    refreshSessionIfNeeded();

    // 1. Recurring background interval: every 5 minutes
    const interval = setInterval(() => {
      refreshSessionIfNeeded(true);
    }, 5 * 60 * 1000);

    // 2. Visibility change: mobile unlock / tab return
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSessionIfNeeded(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 3. Online event: Wi-Fi or cellular reconnection at venue
    const handleOnline = () => {
      refreshSessionIfNeeded(true);
    };
    window.addEventListener('online', handleOnline);

    // 4. Focus event: window click
    const handleFocus = () => {
      refreshSessionIfNeeded(false);
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return null;
}
