'use client';

import { useState } from 'react';
import type { EventNight } from '@/actions/event-nights';
import { toggleEventNightStatus, seedEventNights } from '@/actions/event-nights';

interface EventNightControlsProps {
  nights: EventNight[];
}

export default function EventNightControls({ nights }: EventNightControlsProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleToggle = async (id: string, currentlyActive: boolean) => {
    setLoadingId(id);
    const result = await toggleEventNightStatus(id, !currentlyActive);
    if (!result.success) {
      alert(`Failed to update: ${result.error}`);
    }
    setLoadingId(null);
  };

  const activeNight = nights.find(n => n.is_active);

  const handleSeed = async () => {
    setLoadingId('seed');
    const result = await seedEventNights();
    if (!result.success) {
      alert(`Failed to initialize: ${result.error}`);
    }
    setLoadingId(null);
  };

  return (
    <div className="event-night-controls">
      <div style={{ marginBottom: '20px', padding: '16px', background: 'rgba(4, 120, 87, 0.05)', borderRadius: '8px', border: '1px solid rgba(4, 120, 87, 0.2)' }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#047857' }}>🌟 Seasonal Passes Replenishment</h3>
        <p style={{ margin: '0', fontSize: '0.9rem', color: '#374151', lineHeight: '1.5' }}>
          Seasonal passes automatically replenish for scanning whenever a <strong>new event night is started</strong>. 
          Currently, <strong>{activeNight ? activeNight.title : 'no night'}</strong> is active. 
          When you stop the current night and start the next one, all seasonal passes will immediately become valid again for that new night.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {nights.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed #e5e7eb', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>No Event Nights Found</h4>
            <p style={{ margin: '0 0 20px 0', color: '#6b7280', fontSize: '0.9rem' }}>
              Your database schedule is currently empty. Initialize the 9-day schedule to start managing event nights.
            </p>
            <button
              onClick={handleSeed}
              disabled={loadingId === 'seed'}
              style={{
                padding: '10px 24px',
                background: '#047857',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: loadingId === 'seed' ? 'not-allowed' : 'pointer',
                opacity: loadingId === 'seed' ? 0.7 : 1
              }}
            >
              {loadingId === 'seed' ? 'Initializing...' : 'Initialize 9-Day Schedule'}
            </button>
          </div>
        ) : nights.map((night) => (
          <div 
            key={night.id} 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              padding: '16px',
              border: `2px solid ${night.is_active ? '#047857' : '#e5e7eb'}`,
              borderRadius: '8px',
              background: night.is_active ? '#ecfdf5' : '#ffffff'
            }}
          >
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', color: night.is_active ? '#065f46' : '#111827' }}>
                {night.title} 
                {night.is_active && (
                  <span style={{ marginLeft: '8px', fontSize: '0.75rem', background: '#047857', color: 'white', padding: '2px 8px', borderRadius: '12px' }}>
                    ACTIVE NOW
                  </span>
                )}
              </h4>
              <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                {night.event_date} | {night.start_time} - {night.end_time}
              </div>
            </div>

            <button
              onClick={() => handleToggle(night.id, night.is_active)}
              disabled={loadingId === night.id}
              className={`btn ${night.is_active ? 'btn-secondary' : 'btn-primary'}`}
              style={{
                width: '120px',
                fontWeight: 600,
                ...(night.is_active 
                  ? { background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' } 
                  : { background: '#047857', borderColor: '#047857', color: 'white' })
              }}
            >
              {loadingId === night.id 
                ? 'Updating...' 
                : night.is_active ? 'End Day' : 'Start Day'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
