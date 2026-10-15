import { requireOrganiser } from '@/lib/auth';
import { getEventNights } from '@/actions/event-nights';
import { getAttendanceMetrics } from '@/actions/attendance-metrics';
import EventNightControls from './EventNightControls';
import AttendanceAnalytics from './AttendanceAnalytics';
import ActiveLoginsWidget from './ActiveLoginsWidget';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const { authorized } = await requireOrganiser();

  if (!authorized) {
    redirect('/dashboard');
  }

  const [nights, metrics] = await Promise.all([
    getEventNights(),
    getAttendanceMetrics(),
  ]);

  return (
    <div className="page admin-page">
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">⚙️ Event Admin & Attendance Operations</h1>
          <p className="page-subtitle">
            Official administrator dashboard for RAAS RANG 2026. Real-time footfall analytics, ticket party capacity, and day control.
          </p>
        </div>
      </div>

      {/* ── Real-Time Attendance Analytics & Capacity Visuals (Admin Profile Only) ── */}
      <section style={{ marginBottom: '32px' }}>
        <AttendanceAnalytics initialData={metrics} />
      </section>

      {/* ── Event Nights & Day Activation Controls ── */}
      <section className="card" style={{ marginBottom: '32px' }}>
        <div className="card-header" style={{ marginBottom: '16px' }}>
          <h2 className="card-title">🌟 Event Nights & Gate Day Activation</h2>
          <span className="text-muted" style={{ fontSize: '0.85rem' }}>
            Schedule controls & seasonal pass replenishment
          </span>
        </div>
        <EventNightControls nights={nights} />
      </section>

      {/* ── Real-Time Active Logins (Moved to bottom) ── */}
      <section>
        <ActiveLoginsWidget />
      </section>
    </div>
  );
}
