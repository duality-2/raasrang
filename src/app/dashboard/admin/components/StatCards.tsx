import React from 'react';

interface StatCardsProps {
  peakDayPeople: number;
  peakDayTitle: string;
  seasonal: { peopleCount: number; passCount: number };
  totalPasses: number;
  totalFootfallCapacity: number;
  totalPeople: number;
  totalCollection: number;
}

export function StatCards({
  peakDayPeople,
  peakDayTitle,
  seasonal,
  totalPasses,
  totalFootfallCapacity,
  totalPeople,
  totalCollection,
}: StatCardsProps) {
  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
  };

  return (
    <div className="analytics-kpi-grid">
      {/* Metric 1: Peak Single-Day Attendance */}
      <div className="kpi-card highlight-purple">
        <div className="kpi-header">
          <span className="kpi-icon">⚡</span>
          <span className="kpi-label">Peak Single-Day Attendance</span>
        </div>
        <div className="kpi-value-row">
          <span className="kpi-value">{peakDayPeople}</span>
          <span className="kpi-unit">People Expected</span>
        </div>
        <div className="kpi-subtext">
          Highest on <strong>{peakDayTitle}</strong> (Single-day tickets generated)
        </div>
      </div>

      {/* Metric 2: Season Passes Attendance */}
      <div className="kpi-card highlight-gold">
        <div className="kpi-header">
          <span className="kpi-icon">👑</span>
          <span className="kpi-label">Season Passes Attendance</span>
        </div>
        <div className="kpi-value-row">
          <span className="kpi-value">{seasonal.peopleCount}</span>
          <span className="kpi-unit">People / Night</span>
        </div>
        <div className="kpi-subtext">
          <strong>{seasonal.passCount}</strong> Season Pass{seasonal.passCount !== 1 ? 'es' : ''} sold • Valid across all 9 festival nights
        </div>
      </div>

      {/* Metric 3: Total Passes Generated */}
      <div className="kpi-card highlight-green">
        <div className="kpi-header">
          <span className="kpi-icon">🎟️</span>
          <span className="kpi-label">Total Passes Generated</span>
        </div>
        <div className="kpi-value-row">
          <span className="kpi-value">{totalPasses}</span>
          <span className="kpi-unit">Passes Issued</span>
        </div>
        <div className="kpi-subtext">
          Live database count across single, group, and seasonal passes
        </div>
      </div>

      {/* Metric 4: 9-Day Total Footfall Capacity */}
      <div className="kpi-card">
        <div className="kpi-header">
          <span className="kpi-icon">📊</span>
          <span className="kpi-label">9-Day Total Footfall Capacity</span>
        </div>
        <div className="kpi-value-row">
          <span className="kpi-value">{totalFootfallCapacity}</span>
          <span className="kpi-unit">Cumulative Attendees</span>
        </div>
        <div className="kpi-subtext">
          Combined sum across all 9 festival evenings ({totalPeople} total people entitled)
        </div>
      </div>

      {/* Metric 5: Total Collection */}
      <div className="kpi-card highlight-blue">
        <div className="kpi-header">
          <span className="kpi-icon">💰</span>
          <span className="kpi-label">Total Collection</span>
        </div>
        <div className="kpi-value-row">
          <span className="kpi-value">{formatCurrency(totalCollection)}</span>
        </div>
        <div className="kpi-subtext">
          Total amount received from all passes (online + cash)
        </div>
      </div>
    </div>
  );
}
