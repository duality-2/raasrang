'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import type { OverallAttendanceMetrics } from '@/actions/attendance-metrics';
import { getAttendanceMetrics } from '@/actions/attendance-metrics';
import { createClient } from '@/lib/supabase/client';

interface AttendanceAnalyticsProps {
  initialData: OverallAttendanceMetrics | null;
}

export default function AttendanceAnalytics({ initialData }: AttendanceAnalyticsProps) {
  const [data, setData] = useState<OverallAttendanceMetrics | null>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [selectedNightId, setSelectedNightId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [lastRefreshedTime, setLastRefreshedTime] = useState<string>('Just now');
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);

  // Fetch latest metrics from server action
  const fetchLatestMetrics = useCallback(async () => {
    try {
      const fresh = await getAttendanceMetrics();
      if (fresh) {
        setData(fresh);
        setError(null);
        setLastRefreshedTime(
          new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );
      } else {
        if (!data) {
          setError('Failed to load attendance metrics. Please retry.');
        }
      }
    } catch (err: unknown) {
      console.error('Error fetching metrics:', err);
      if (!data) {
        setError('Network error loading metrics. Please retry.');
      }
    }
  }, [data]);

  // Manual refresh handler
  const handleRefresh = () => {
    startTransition(async () => {
      await fetchLatestMetrics();
    });
  };

  // 1. Supabase Realtime channel subscription on passes table
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('passes-live-metrics-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'passes' },
        () => {
          fetchLatestMetrics();
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLatestMetrics]);

  // 2. Active 5-second Polling Fallback (ensures live updates without page refresh)
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchLatestMetrics();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [fetchLatestMetrics]);

  // ── ERROR STATE (Never show stale zeros if initial load or fetch failed) ──
  if (error && !data) {
    return (
      <div className="attendance-analytics-container">
        <div
          className="alert alert-error"
          role="alert"
          style={{
            padding: '24px',
            borderRadius: '12px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: '4px' }}>
                ⚠️ Attendance Metrics Unavailable
              </div>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#b91c1c' }}>
                {error}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isPending}
              className="btn btn-secondary btn-sm"
              style={{ fontWeight: 700 }}
            >
              {isPending ? 'Retrying…' : '↻ Retry Now'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── LOADING STATE ──
  if (!data) {
    return (
      <div className="attendance-analytics-container">
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>⏳</div>
          <div style={{ fontWeight: 700, color: '#334155', fontSize: '1rem' }}>
            Loading Live Attendance Metrics…
          </div>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
            Fetching generated pass totals from database
          </p>
        </div>
      </div>
    );
  }

  // ── EMPTY STATE ──
  if (data.totalPasses === 0) {
    return (
      <div className="attendance-analytics-container">
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🎟️</div>
          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.15rem' }}>
            No Passes Generated Yet
          </div>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '6px 0 0 0' }}>
            Issue single-day or seasonal passes in Attendee Management to view live attendance candles.
          </p>
        </div>
      </div>
    );
  }

  const {
    days,
    seasonal,
    unassigned,
    totalPasses,
    totalPeople,
    peakDayTitle,
    peakDayPeople,
    totalFootfallCapacity,
    syncSource,
  } = data;

  // Max value across all 10 candles (9 days + 1 seasonal) for visual chart scaling
  const maxCandlePeople = Math.max(
    1,
    ...days.map((d) => d.peopleCount),
    seasonal.peopleCount
  );

  const selectedDay = selectedNightId
    ? days.find((d) => d.nightId === selectedNightId) || null
    : null;

  return (
    <div className="attendance-analytics-container">
      {/* ── Header with Live Polling / Realtime Pulse ── */}
      <div className="analytics-header">
        <div>
          <div className="analytics-eyebrow">
            <span className="realtime-pulse-dot pulse-green" />
            <span>
              {realtimeConnected
                ? 'Live Realtime Sync + 5s Polling'
                : 'Live 5s Polling Active'}
            </span>
            <span className="last-sync-time">• Synced {lastRefreshedTime}</span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: '#475569',
                background: '#e2e8f0',
                padding: '1px 6px',
                borderRadius: '4px',
                marginLeft: '4px',
              }}
            >
              {syncSource === 'database_rpc' ? 'DB RPC' : 'DB LIVE'}
            </span>
          </div>
          <h2 className="analytics-title">👥 Total People Attending & Capacity</h2>
          <p className="analytics-subtitle">
            Calculated footfall per day computed from <strong>tickets generated</strong> (the passes table), accounting for single tickets, group party sizes, and seasonal passes.
          </p>
        </div>

        <div className="analytics-actions">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isPending}
            className="btn btn-secondary btn-sm refresh-btn"
            title="Refresh latest numbers from database"
          >
            {isPending ? '↻ Syncing…' : '↻ Refresh Now'}
          </button>
        </div>
      </div>

      {/* ── Top Level Stat KPI Cards (Generated Passes Data) ── */}
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
      </div>

      {/* ── Interactive Visual Chart: 9 Day Candles + 1 Seasonal Candle ── */}
      <div className="analytics-chart-card">
        <div className="chart-header">
          <div>
            <h3 className="chart-title">
              📊 Generated Attendance Candles (Single Days + Season Pass)
            </h3>
            <p className="chart-subtitle">
              9 Day Candles (SUM of party_size for Single passes) + 1 Dedicated Seasonal Pass Candle.
            </p>
          </div>

          <div className="chart-legend">
            <span className="legend-item">
              <span className="legend-color day-tickets-color" />
              <span>Day Candle (Single Tickets)</span>
            </span>
            <span className="legend-item">
              <span className="legend-color season-tickets-color" />
              <span>Seasonal Candle (All Nights)</span>
            </span>
            <span className="legend-item">
              <span className="legend-color" style={{ background: '#10b981' }} />
              <span>Active Night</span>
            </span>
          </div>
        </div>

        {/* SVG Interactive Chart with 10 Candles */}
        <div className="svg-chart-wrapper">
          <svg className="attendance-svg-chart" viewBox="0 0 1020 250" preserveAspectRatio="none">
            {/* Horizontal guide lines */}
            <line x1="30" y1="35" x2="1000" y2="35" stroke="#f1f5f9" strokeDasharray="4 4" />
            <line x1="30" y1="90" x2="1000" y2="90" stroke="#f1f5f9" strokeDasharray="4 4" />
            <line x1="30" y1="145" x2="1000" y2="145" stroke="#f1f5f9" strokeDasharray="4 4" />
            <line x1="30" y1="200" x2="1000" y2="200" stroke="#e2e8f0" strokeWidth="1.5" />

            {/* Subtle Divider between 9 Days and Seasonal Candle */}
            <line x1="865" y1="20" x2="865" y2="235" stroke="#e2e8f0" strokeDasharray="3 3" strokeWidth="1.5" />

            {/* ── 9 Day Candles ── */}
            {days.map((night, idx) => {
              const candleWidth = 58;
              const spacing = 90;
              const x = 40 + idx * spacing;
              const chartHeight = 155;
              const yBase = 200;

              // Candle height proportional to max, minimum 4px baseline bar
              const ratio = night.peopleCount / maxCandlePeople;
              const candleHeight = night.peopleCount > 0
                ? Math.max(12, ratio * chartHeight)
                : 4;
              const yTop = yBase - candleHeight;

              const isSelected = selectedNightId === night.nightId;
              const isToday = night.isActive;

              return (
                <g
                  key={night.nightId}
                  className={`chart-bar-group ${isSelected ? 'selected' : ''}`}
                  onClick={() =>
                    setSelectedNightId(
                      selectedNightId === night.nightId ? null : night.nightId
                    )
                  }
                  style={{ cursor: 'pointer' }}
                >
                  {/* Active night background highlight */}
                  {isToday && (
                    <rect
                      x={x - 6}
                      y={20}
                      width={candleWidth + 12}
                      height={190}
                      rx="8"
                      fill="rgba(16, 185, 129, 0.08)"
                      stroke="#10b981"
                      strokeWidth="1.5"
                      strokeDasharray="4 2"
                    />
                  )}

                  {/* Day Candle Body */}
                  <rect
                    x={x}
                    y={yTop}
                    width={candleWidth}
                    height={candleHeight}
                    rx="5"
                    fill={isToday ? '#059669' : '#4c1d95'}
                    opacity={isSelected || !selectedNightId ? 1 : 0.4}
                  />

                  {/* Candle Value Text on Top */}
                  <text
                    x={x + candleWidth / 2}
                    y={yTop - 8}
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="800"
                    fill={isToday ? '#047857' : '#1e1b4b'}
                  >
                    {night.peopleCount}
                  </text>

                  {/* Day Title Label */}
                  <text
                    x={x + candleWidth / 2}
                    y="218"
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight={isToday ? '800' : '600'}
                    fill={isToday ? '#047857' : '#334155'}
                  >
                    {night.title}
                  </text>

                  {/* Date / Active Tag */}
                  <text
                    x={x + candleWidth / 2}
                    y="233"
                    textAnchor="middle"
                    fontSize="10"
                    fill={isToday ? '#10b981' : '#94a3b8'}
                    fontWeight={isToday ? '700' : '500'}
                  >
                    {isToday ? '● ACTIVE' : night.eventDate ? night.eventDate.slice(5) : ''}
                  </text>
                </g>
              );
            })}

            {/* ── 1 Seasonal Candle ── */}
            {(() => {
              const candleWidth = 62;
              const x = 890;
              const chartHeight = 155;
              const yBase = 200;

              const ratio = seasonal.peopleCount / maxCandlePeople;
              const candleHeight = seasonal.peopleCount > 0
                ? Math.max(12, ratio * chartHeight)
                : 4;
              const yTop = yBase - candleHeight;
              const isSelected = selectedNightId === 'seasonal_candle';

              return (
                <g
                  key="seasonal_candle"
                  className={`chart-bar-group ${isSelected ? 'selected' : ''}`}
                  onClick={() =>
                    setSelectedNightId(
                      selectedNightId === 'seasonal_candle' ? null : 'seasonal_candle'
                    )
                  }
                  style={{ cursor: 'pointer' }}
                >
                  {/* Seasonal Candle Body */}
                  <rect
                    x={x}
                    y={yTop}
                    width={candleWidth}
                    height={candleHeight}
                    rx="5"
                    fill="#f59e0b"
                    opacity={isSelected || !selectedNightId ? 1 : 0.4}
                  />

                  {/* Seasonal Value Text on Top */}
                  <text
                    x={x + candleWidth / 2}
                    y={yTop - 8}
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="800"
                    fill="#b45309"
                  >
                    {seasonal.peopleCount}
                  </text>

                  {/* Seasonal Label */}
                  <text
                    x={x + candleWidth / 2}
                    y="218"
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="800"
                    fill="#b45309"
                  >
                    Seasonal
                  </text>

                  {/* Subtitle */}
                  <text
                    x={x + candleWidth / 2}
                    y="233"
                    textAnchor="middle"
                    fontSize="10"
                    fill="#d97706"
                    fontWeight="600"
                  >
                    All 9 Nights
                  </text>
                </g>
              );
            })()}
          </svg>
        </div>

        {/* Selected Candle Inspection Detail Card */}
        {selectedNightId && (
          <div
            style={{
              marginTop: '16px',
              padding: '14px 18px',
              borderRadius: '10px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              {selectedNightId === 'seasonal_candle' ? (
                <>
                  <strong style={{ color: '#b45309' }}>👑 Seasonal Passes:</strong>{' '}
                  <span>
                    <strong>{seasonal.peopleCount} people</strong> across{' '}
                    <strong>{seasonal.passCount} pass</strong>. Seasonal passes are valid for admission across all 9 festival nights and are not added into individual day candles.
                  </span>
                </>
              ) : selectedDay ? (
                <>
                  <strong style={{ color: '#4c1d95' }}>📅 {selectedDay.title} ({selectedDay.eventDate}):</strong>{' '}
                  <span>
                    <strong>{selectedDay.peopleCount} people</strong> across{' '}
                    <strong>{selectedDay.passCount} single pass{selectedDay.passCount !== 1 ? 'es' : ''}</strong>.
                    {selectedDay.peopleCount === 0 && ' (No passes issued for this day yet)'}
                  </span>
                </>
              ) : null}
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedNightId(null)}
              style={{ fontSize: '0.82rem' }}
            >
              ✕ Clear Selection
            </button>
          </div>
        )}
      </div>

      {/* ── Day-by-Day Cards Breakdown Grid ── */}
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

      {/* ── Unassigned Legacy Passes Note (if present) ── */}
      {unassigned.passCount > 0 && (
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '0.88rem',
            color: '#475569',
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>ℹ️</span>
          <div>
            <strong>Flexible / Legacy Passes ({unassigned.passCount} tickets • {unassigned.peopleCount} people):</strong>{' '}
            Pre-existing passes issued before day-specific assignment. Can be used on any active event night.
          </div>
        </div>
      )}
    </div>
  );
}
