'use client';

import { useState, useEffect, useTransition } from 'react';
import type { OverallAttendanceMetrics, DayAttendanceMetrics } from '@/actions/attendance-metrics';
import { getAttendanceMetrics } from '@/actions/attendance-metrics';
import { createClient } from '@/lib/supabase/client';

interface AttendanceAnalyticsProps {
  initialData: OverallAttendanceMetrics;
}

export default function AttendanceAnalytics({ initialData }: AttendanceAnalyticsProps) {
  const [data, setData] = useState<OverallAttendanceMetrics>(initialData);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [lastRefreshedTime, setLastRefreshedTime] = useState<string>('Just now');
  const [realtimeActive, setRealtimeActive] = useState<boolean>(true);

  // Manual refresh handler
  const handleRefresh = () => {
    startTransition(async () => {
      const fresh = await getAttendanceMetrics();
      if (fresh) {
        setData(fresh);
        setLastRefreshedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    });
  };

  // Realtime Supabase channel subscription
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('attendance-realtime-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'passes' },
        () => {
          handleRefresh();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admissions' },
        () => {
          handleRefresh();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_nights' },
        () => {
          handleRefresh();
        }
      )
      .subscribe((status) => {
        setRealtimeActive(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const { days, seasonSummary, unassignedPassesCount, unassignedPassesPeople, peakDayTitle, peakDayPeople, totalCapacityAcrossDays, totalAdmittedOverall } = data;

  // Find max people across all days for chart height scaling
  const maxDayPeople = Math.max(1, ...days.map((d) => d.totalPeopleAttending));

  // Filtered day if selected, or all days
  const activeDay = days.find((d) => d.isActive);
  const displayedDays = selectedDayId
    ? days.filter((d) => d.nightId === selectedDayId)
    : days;

  return (
    <div className="attendance-analytics-container">
      {/* ── Header with Live Realtime Pulse ── */}
      <div className="analytics-header">
        <div>
          <div className="analytics-eyebrow">
            <span className={`realtime-pulse-dot ${realtimeActive ? 'pulse-green' : 'pulse-gray'}`} />
            <span>{realtimeActive ? 'Live Realtime Sync' : 'Live Sync Offline'}</span>
            <span className="last-sync-time">• Synced {lastRefreshedTime}</span>
          </div>
          <h2 className="analytics-title">👥 Total People Attending & Capacity</h2>
          <p className="analytics-subtitle">
            Calculated footfall per day accounting for individual tickets, group party sizes, and recurring season passes.
          </p>
        </div>

        <div className="analytics-actions">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isPending}
            className="btn btn-secondary btn-sm refresh-btn"
            title="Refresh latest numbers"
          >
            {isPending ? '↻ Syncing…' : '↻ Refresh Now'}
          </button>
        </div>
      </div>

      {/* ── Top Level Stat KPI Cards ── */}
      <div className="analytics-kpi-grid">
        {/* Metric 1: Peak Day Footfall */}
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
            Highest on <strong>{peakDayTitle}</strong> (Combined tickets + season passes)
          </div>
        </div>

        {/* Metric 2: Season Pass Sold & People Multiplier */}
        <div className="kpi-card highlight-gold">
          <div className="kpi-header">
            <span className="kpi-icon">👑</span>
            <span className="kpi-label">Season Passes Attendance</span>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{seasonSummary.totalPeople}</span>
            <span className="kpi-unit">People / Night</span>
          </div>
          <div className="kpi-subtext">
            <strong>{seasonSummary.totalSold}</strong> Pass{seasonSummary.totalSold !== 1 ? 'es' : ''} sold • Avg{' '}
            <strong>{seasonSummary.avgPartySize}</strong> people per pass (admitted every day)
          </div>
        </div>

        {/* Metric 3: Total Admitted Check-ins so far */}
        <div className="kpi-card highlight-green">
          <div className="kpi-header">
            <span className="kpi-icon">🎪</span>
            <span className="kpi-label">Total People Checked In</span>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{totalAdmittedOverall}</span>
            <span className="kpi-unit">Admitted to Date</span>
          </div>
          <div className="kpi-subtext">
            Live turnstile headcount scanned through gates
          </div>
        </div>

        {/* Metric 4: Total Festival Footfall Capacity */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-icon">📊</span>
            <span className="kpi-label">9-Day Total Footfall Capacity</span>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{totalCapacityAcrossDays}</span>
            <span className="kpi-unit">Cumulative Attendees</span>
          </div>
          <div className="kpi-subtext">
            Combined sum across all 9 festival evenings
          </div>
        </div>
      </div>

      {/* ── Season Pass Multiplier Callout Banner ── */}
      {seasonSummary.totalSold > 0 && (
        <div className="season-multiplier-banner">
          <div className="season-multiplier-badge">🎟️ SEASON PASS MULTIPLIER</div>
          <div className="season-multiplier-content">
            <p>
              <strong>{seasonSummary.totalSold} Season Pass{seasonSummary.totalSold !== 1 ? 'es' : ''}</strong> sold{' '}
              covering a total of <strong>{seasonSummary.totalPeople} People</strong>. Because season passes give access to every festival night, they automatically contribute <strong>+{seasonSummary.totalPeople} attendees</strong> to each day&apos;s attendance capacity.
            </p>
          </div>
        </div>
      )}

      {/* ── Interactive Visual Chart: Day-by-Day People Attending ── */}
      <div className="analytics-chart-card">
        <div className="chart-header">
          <div>
            <h3 className="chart-title">📊 Day-by-Day People Attending (Visual Comparison)</h3>
            <p className="chart-subtitle">
              Visual breakdown of Daily Single/Group Tickets (Purple) + Season Pass People (Gold).
            </p>
          </div>

          <div className="chart-legend">
            <span className="legend-item">
              <span className="legend-color day-tickets-color" />
              <span>Day Tickets People</span>
            </span>
            <span className="legend-item">
              <span className="legend-color season-tickets-color" />
              <span>Season Pass People</span>
            </span>
            <span className="legend-item">
              <span className="legend-color admitted-marker-color" />
              <span>Actual Admitted</span>
            </span>
          </div>
        </div>

        {/* SVG Interactive Chart */}
        <div className="svg-chart-wrapper">
          <svg className="attendance-svg-chart" viewBox="0 0 900 240" preserveAspectRatio="none">
            {/* Horizontal guide lines */}
            <line x1="40" y1="30" x2="880" y2="30" stroke="#f1f5f9" strokeDasharray="4 4" />
            <line x1="40" y1="85" x2="880" y2="85" stroke="#f1f5f9" strokeDasharray="4 4" />
            <line x1="40" y1="140" x2="880" y2="140" stroke="#f1f5f9" strokeDasharray="4 4" />
            <line x1="40" y1="195" x2="880" y2="195" stroke="#e2e8f0" strokeWidth="1.5" />

            {/* Bars for each of the 9 days */}
            {days.map((night, idx) => {
              const barWidth = 60;
              const spacing = 92;
              const x = 50 + idx * spacing;
              const chartHeight = 160;

              // Height calculations
              const totalRatio = night.totalPeopleAttending / maxDayPeople;
              const totalBarHeight = Math.max(8, totalRatio * chartHeight);

              const dayPassRatio = night.dayPassesPeople / maxDayPeople;
              const dayPassHeight = Math.max(0, dayPassRatio * chartHeight);

              const seasonRatio = night.seasonPassesPeople / maxDayPeople;
              const seasonHeight = Math.max(0, seasonRatio * chartHeight);

              const yBase = 195;
              const yTop = yBase - totalBarHeight;

              const isSelected = selectedDayId === night.nightId;
              const isToday = night.isActive;

              return (
                <g
                  key={night.nightId}
                  className={`chart-bar-group ${isSelected ? 'selected' : ''} ${isToday ? 'is-today' : ''}`}
                  onClick={() => setSelectedDayId(selectedDayId === night.nightId ? null : night.nightId)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Active day background highlight */}
                  {isToday && (
                    <rect
                      x={x - 8}
                      y={20}
                      width={barWidth + 16}
                      height={185}
                      rx="8"
                      fill="rgba(16, 185, 129, 0.08)"
                      stroke="#10b981"
                      strokeWidth="1.5"
                      strokeDasharray="4 2"
                    />
                  )}

                  {/* Season pass segment (bottom or top) */}
                  {seasonHeight > 0 && (
                    <rect
                      x={x}
                      y={yBase - seasonHeight}
                      width={barWidth}
                      height={seasonHeight}
                      rx="4"
                      fill="#f59e0b"
                      opacity={isSelected || !selectedDayId ? 1 : 0.45}
                    />
                  )}

                  {/* Day passes segment (stacked on top of season passes) */}
                  {dayPassHeight > 0 && (
                    <rect
                      x={x}
                      y={yBase - seasonHeight - dayPassHeight}
                      width={barWidth}
                      height={dayPassHeight}
                      rx="4"
                      fill="#4c1d95"
                      opacity={isSelected || !selectedDayId ? 1 : 0.45}
                    />
                  )}

                  {/* Total Value text over bar */}
                  <text
                    x={x + barWidth / 2}
                    y={yTop - 8}
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="700"
                    fill={isToday ? '#047857' : '#1e1b4b'}
                  >
                    {night.totalPeopleAttending}
                  </text>

                  {/* Admitted checkmark badge if any admitted */}
                  {night.actualAdmittedPeople > 0 && (
                    <circle
                      cx={x + barWidth - 6}
                      cy={yTop - 6}
                      r="5"
                      fill="#10b981"
                    />
                  )}

                  {/* Day Label */}
                  <text
                    x={x + barWidth / 2}
                    y="214"
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight={isToday ? '800' : '600'}
                    fill={isToday ? '#047857' : '#475569'}
                  >
                    {night.title}
                  </text>

                  {/* Active / Date pill */}
                  <text
                    x={x + barWidth / 2}
                    y="228"
                    textAnchor="middle"
                    fontSize="9.5"
                    fill={isToday ? '#10b981' : '#94a3b8'}
                    fontWeight={isToday ? '700' : '500'}
                  >
                    {isToday ? '● ACTIVE' : night.eventDate.slice(5)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected Day Reset Button */}
        {selectedDayId && (
          <div className="filter-clear-row">
            <span>Showing details for <strong>{days.find((d) => d.nightId === selectedDayId)?.title}</strong></span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedDayId(null)}
            >
              ✕ Show All Days
            </button>
          </div>
        )}
      </div>

      {/* ── Day-by-Day Cards Breakdown Grid ── */}
      <div className="day-breakdown-section">
        <h3 className="section-title">
          📅 Detailed Attendance Breakdown per Day
          {selectedDayId && ` (Filtered to 1 Day)`}
        </h3>

        <div className="days-cards-grid">
          {displayedDays.map((night) => {
            const isToday = night.isActive;

            return (
              <div
                key={night.nightId}
                className={`day-card ${isToday ? 'day-card-active' : ''}`}
              >
                {/* Day Card Header */}
                <div className="day-card-header">
                  <div>
                    <h4 className="day-card-title">{night.title}</h4>
                    <span className="day-card-date">{night.eventDate}</span>
                  </div>

                  {isToday ? (
                    <span className="badge-active-day">● ACTIVE NOW</span>
                  ) : (
                    <span className="badge-scheduled-day">Scheduled</span>
                  )}
                </div>

                {/* Big Total People Attending Stat */}
                <div className="day-card-total-box">
                  <div className="total-people-headline">
                    <span className="total-people-num">{night.totalPeopleAttending}</span>
                    <span className="total-people-label">Total People Attending</span>
                  </div>

                  {/* Math Formula Breakdown (Exactly what user requested) */}
                  <div className="day-math-formula">
                    <div className="formula-line">
                      <span className="formula-tag day-tag">Day Tickets:</span>{' '}
                      <strong>{night.dayPassesCount}</strong> ticket{night.dayPassesCount !== 1 ? 's' : ''}{' '}
                      covering <strong>{night.dayPassesPeople}</strong> people
                      {night.groupPassesCount > 0 && (
                        <span className="formula-subdetail">
                          {' '}(inc. {night.groupPassesCount} group ticket{night.groupPassesCount !== 1 ? 's' : ''} = {night.groupPassesPeople} people)
                        </span>
                      )}
                    </div>

                    <div className="formula-plus">+</div>

                    <div className="formula-line">
                      <span className="formula-tag season-tag">Season Passes:</span>{' '}
                      <strong>{night.seasonPassesCount}</strong> pass{night.seasonPassesCount !== 1 ? 'es' : ''}{' '}
                      covering <strong>{night.seasonPassesPeople}</strong> people
                    </div>
                  </div>
                </div>

                {/* Turnstile Check-in Progress Bar */}
                <div className="turnstile-checkin-row">
                  <div className="checkin-label-row">
                    <span>Gate Check-ins</span>
                    <span className="checkin-numbers">
                      <strong>{night.actualAdmittedPeople}</strong> / {night.totalPeopleAttending} admitted ({night.admissionPercentage}%)
                    </span>
                  </div>
                  <div className="checkin-progress-bar-bg">
                    <div
                      className="checkin-progress-bar-fill"
                      style={{ width: `${Math.min(100, night.admissionPercentage)}%` }}
                    />
                  </div>
                </div>

                {/* Category Tags Breakdown */}
                {Object.keys(night.categoryBreakdown).length > 0 && (
                  <div className="day-category-pills">
                    {Object.entries(night.categoryBreakdown).map(([cat, metric]) => (
                      <span key={cat} className="category-pill">
                        {cat.toUpperCase()}: <strong>{metric.people}p</strong> ({metric.count} tix)
                      </span>
                    ))}
                    {night.seasonPassesPeople > 0 && (
                      <span className="category-pill season-pill">
                        SEASON: <strong>{night.seasonPassesPeople}p</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Season Passes Detailed Registry ── */}
      {seasonSummary.passes.length > 0 && (
        <div className="season-registry-card">
          <h4 className="season-registry-title">
            👑 Active Season Passes Sold ({seasonSummary.totalSold} Passes • {seasonSummary.totalPeople} Total Attendees)
          </h4>
          <p className="season-registry-desc">
            These passes are valid for entry across all eligible festival days.
          </p>

          <div className="season-table-wrapper">
            <table className="season-table">
              <thead>
                <tr>
                  <th>Passholder / Attendee</th>
                  <th>Pass Code</th>
                  <th>Category</th>
                  <th>Party Size</th>
                  <th>Total People Covered</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {seasonSummary.passes.map((sp) => (
                  <tr key={sp.id}>
                    <td>
                      <strong>{sp.name || 'Anonymous Passholder'}</strong>
                    </td>
                    <td>
                      <code>{sp.manualCode}</code>
                    </td>
                    <td>
                      <span className="badge-category">{sp.category.toUpperCase()}</span>
                    </td>
                    <td>
                      <strong>{sp.partySize}</strong> {sp.partySize === 1 ? 'person' : 'people'} / ticket
                    </td>
                    <td className="people-cell">
                      <span className="people-badge">+{sp.partySize} people / day</span>
                    </td>
                    <td>
                      <span className="badge-status-valid">{sp.status.toUpperCase()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Unassigned Legacy Tickets Note (if any exist) ── */}
      {unassignedPassesCount > 0 && (
        <div className="unassigned-note-card">
          <span className="unassigned-icon">ℹ️</span>
          <div>
            <strong>Flexible / Legacy Passes ({unassignedPassesCount} tickets • {unassignedPassesPeople} people):</strong>{' '}
            These pre-existing passes do not have a fixed single day assigned yet, and can be used on any open day.
          </div>
        </div>
      )}
    </div>
  );
}
