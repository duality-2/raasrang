'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { UserRole } from '@/types';

type ActiveCounts = {
  organiser: number;
  scanner: number;
  ticketer: number;
  admin: number;
};

const PresenceContext = createContext<ActiveCounts>({
  organiser: 0,
  scanner: 0,
  ticketer: 0,
  admin: 0,
});

export function usePresence() {
  return useContext(PresenceContext);
}

export default function PresenceTracker({ 
  userId, 
  role, 
  children 
}: { 
  userId: string, 
  role: UserRole | null,
  children?: React.ReactNode 
}) {
  const [activeCounts, setActiveCounts] = useState<ActiveCounts>({
    organiser: 0,
    scanner: 0,
    ticketer: 0,
    admin: 0,
  });
  
  // Generate a stable unique key for each distinct device / tab session
  const [sessionKey] = useState(() => `${userId}_${Math.random().toString(36).substring(2, 9)}`);
  
  useEffect(() => {
    if (!userId || !role) return;

    const supabase = createClient();

    // Track each device/session uniquely in the online-users channel
    const channel = supabase.channel('online-users', {
      config: {
        presence: {
          key: sessionKey,
        },
      },
    });

    const updateCounts = () => {
      const newState = channel.presenceState();
      
      let orgs = 0, scans = 0, ticks = 0, admins = 0;

      // Iterate through all connected device sessions
      for (const presenceId in newState) {
        const presences = newState[presenceId];
        if (presences && presences.length > 0) {
          for (const item of presences) {
            const state = item as unknown as { role: UserRole };
            if (state.role === 'organiser') orgs++;
            if (state.role === 'scanner') scans++;
            if (state.role === 'ticketer') ticks++;
            if (state.role === 'admin') admins++;
          }
        }
      }

      setActiveCounts({
        organiser: orgs,
        scanner: scans,
        ticketer: ticks,
        admin: admins,
      });
    };

    channel
      .on('presence', { event: 'sync' }, updateCounts)
      .on('presence', { event: 'join' }, updateCounts)
      .on('presence', { event: 'leave' }, updateCounts);

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: userId,
          role: role,
          device_id: sessionKey,
          online_at: new Date().toISOString(),
        });
      }
    });

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [userId, role, sessionKey]);

  return (
    <PresenceContext.Provider value={activeCounts}>
      {children}
    </PresenceContext.Provider>
  );
}
