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
  
  const supabase = createClient();

  useEffect(() => {
    if (!userId || !role) return;

    // Track the user in the online-users channel
    const channel = supabase.channel('online-users', {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const newState = channel.presenceState();
      
      let orgs = 0, scans = 0, ticks = 0, admins = 0;

      for (const presenceId in newState) {
        const presences = newState[presenceId];
        if (presences && presences.length > 0) {
          const state = presences[0] as unknown as { role: UserRole };
          if (state.role === 'organiser') orgs++;
          if (state.role === 'scanner') scans++;
          if (state.role === 'ticketer') ticks++;
          if (state.role === 'admin') admins++;
        }
      }

      setActiveCounts({
        organiser: orgs,
        scanner: scans,
        ticketer: ticks,
        admin: admins,
      });
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: userId,
          role: role,
          online_at: new Date().toISOString(),
        });
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, role, supabase]);

  return (
    <PresenceContext.Provider value={activeCounts}>
      {children}
    </PresenceContext.Provider>
  );
}
