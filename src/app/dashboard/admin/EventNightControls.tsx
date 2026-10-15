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
      <div className="event-night-banner">
        <h3 className="event-night-banner-title">🌟 Event Days & Seasonal Pass Replenishment</h3>
        <p className="event-night-banner-text">
          When you click <strong>Start Day</strong>, that day becomes active immediately. Only tickets for that day and seasonal passes can be admitted (e.g. Day 3 tickets will be rejected if Day 1 is active).
          When you click <strong>End Day</strong>, gate scanning is paused. Switching to a new day automatically <strong>replenishes all seasonal passes</strong> for the new day!
        </p>
      </div>

      <div className="event-nights-list">
        {nights.length === 0 ? (
          <div className="event-nights-empty">
            <h4>No Event Nights Found</h4>
            <p>
              Your database schedule is currently empty. Initialize the 9-day schedule to start managing event nights.
            </p>
            <button
              onClick={handleSeed}
              disabled={loadingId === 'seed'}
              className="btn btn-primary"
            >
              {loadingId === 'seed' ? 'Initializing...' : 'Initialize 9-Day Schedule'}
            </button>
          </div>
        ) : nights.map((night) => (
          <div 
            key={night.id} 
            className={`event-night-row ${night.is_active ? 'active' : ''}`}
          >
            <div className="event-night-info">
              <div className="event-night-title-row">
                <h4 className="event-night-title">{night.title}</h4>
                {night.is_active && (
                  <span className="badge-active-night">ACTIVE NOW</span>
                )}
              </div>
              <div className="event-night-desc">
                {night.is_active ? '● Active — Only this day\'s tickets and seasonal passes can enter' : '○ Inactive — Tickets for this day cannot be scanned'}
              </div>
            </div>

            <button
              onClick={() => handleToggle(night.id, night.is_active)}
              disabled={loadingId === night.id}
              className={`btn ${night.is_active ? 'btn-danger-outline' : 'btn-primary'} event-night-btn`}
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
