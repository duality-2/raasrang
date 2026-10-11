import React from 'react';

import type { DayCandle } from '@/actions/attendance-metrics';

interface DayBreakdownGridProps {
  days: DayCandle[];
  seasonal: { peopleCount: number; passCount: number; collection: number };
}

export function DayBreakdownGrid({ days, seasonal }: DayBreakdownGridProps) {
  return (
    <div className="day-breakdown-section">
      <h3 className="section-title">
        📅 Detailed Generated Passes by Festival Day
      </h3>

      <div className="days-cards-grid">
        {days.map((night) => {
          const isToday = night.isActive;

          return (
            <div
              key={night.nightId}
              className={`day-card ${isToday ? 'day-card-active' : ''}`}
            >
              <div className="day-card-header">
                <div>
                  <h4 className="day-card-title">{night.title}</h4>
                  <span className="day-card-date">{night.eventDate}</span>
                </div>

                {isToday ? (
                  <span className="badge-active-day">● ACTIVE NOW</span>
                ) : (
                  <span className="badge-scheduled-day">Day {night.nightNumber}</span>
                )}
              </div>

              <div className="day-card-total-box">
                <div className="total-people-headline">
                  <span className="total-people-num">{night.peopleCount}</span>
                  <span className="total-people-label">Single Day Attendees</span>
                </div>

                <div className="day-math-formula">
                  <div className="formula-line">
                    <span className="formula-tag day-tag">Single Passes:</span>{' '}
                    <strong>{night.passCount}</strong> ticket{night.passCount !== 1 ? 's' : ''}{' '}
                    covering <strong>{night.peopleCount}</strong> {night.peopleCount === 1 ? 'person' : 'people'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Dedicated Seasonal Pass Card */}
        <div
          className="day-card"
          style={{
            borderColor: '#fde68a',
            background: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)',
          }}
        >
          <div className="day-card-header">
            <div>
              <h4 className="day-card-title" style={{ color: '#b45309' }}>👑 Season Passes</h4>
              <span className="day-card-date">All 9 Festival Nights</span>
            </div>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: '#ffffff',
                background: '#f59e0b',
                padding: '3px 8px',
                borderRadius: '9999px',
              }}
            >
              FULL ACCESS
            </span>
          </div>

          <div className="day-card-total-box">
            <div className="total-people-headline">
              <span className="total-people-num" style={{ color: '#b45309' }}>
                {seasonal.peopleCount}
              </span>
              <span className="total-people-label">People / Night</span>
            </div>

            <div className="day-math-formula">
              <div className="formula-line">
                <span className="formula-tag" style={{ background: '#fef3c7', color: '#b45309' }}>
                  Season Pass:
                </span>{' '}
                <strong>{seasonal.passCount}</strong> pass covering{' '}
                <strong>{seasonal.peopleCount}</strong> people admitted every night
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
