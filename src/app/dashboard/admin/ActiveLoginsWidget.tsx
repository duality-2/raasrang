'use client';

import { usePresence } from '@/components/PresenceTracker';

export default function ActiveLoginsWidget() {
  const activeCounts = usePresence();

  return (
    <div style={{ 
      marginTop: '2rem',
      padding: '0.75rem', 
      display: 'flex', 
      justifyContent: 'center', 
      gap: '1.5rem',
      fontSize: '0.75rem',
      color: '#94a3b8', // subtle slate color
      borderTop: '1px solid #f1f5f9',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: activeCounts.admin + activeCounts.organiser > 0 ? '#10b981' : '#cbd5e1' }} />
        <span>Organisers: {activeCounts.organiser + activeCounts.admin}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: activeCounts.scanner > 0 ? '#10b981' : '#cbd5e1' }} />
        <span>Scanners: {activeCounts.scanner}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: activeCounts.ticketer > 0 ? '#10b981' : '#cbd5e1' }} />
        <span>Ticketers: {activeCounts.ticketer}</span>
      </div>
    </div>
  );
}
