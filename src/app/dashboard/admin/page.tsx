import { requireOrganiser } from '@/lib/auth';
import { getEventNights } from '@/actions/event-nights';
import { getAttendanceMetrics } from '@/actions/attendance-metrics';
import EventNightControls from './EventNightControls';
import AttendanceAnalytics from './AttendanceAnalytics';
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
    <div className="container" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '1.85rem', fontWeight: 800, margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>
          ⚙️ Event Admin & Attendance Operations
        </h1>
        <p style={{ color: '#64748b', margin: 0, fontSize: '0.95rem' }}>
          Official administrator dashboard for RAAS RANG 2026. Real-time footfall analytics, ticket party capacity, and day control.
        </p>
      </header>

      {/* ── Real-Time Attendance Analytics & Capacity Visuals (Admin Profile Only) ── */}
      {metrics && (
        <section style={{ marginBottom: '36px' }}>
          <AttendanceAnalytics initialData={metrics} />
        </section>
      )}

      {/* ── Event Nights & Day Activation Controls ── */}
      <section className="card">
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 20px 0', borderBottom: '1px solid #eee', paddingBottom: '12px' }}>
          🌟 Event Nights & Gate Day Activation
        </h2>
        <EventNightControls nights={nights} />
      </section>
    </div>
  );
}
