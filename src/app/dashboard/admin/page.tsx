import { requireOrganiser } from '@/lib/auth';
import { getEventNights } from '@/actions/event-nights';
import EventNightControls from './EventNightControls';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const { authorized } = await requireOrganiser();

  if (!authorized) {
    redirect('/dashboard');
  }

  const nights = await getEventNights();

  return (
    <div className="container" style={{ padding: '24px' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0 0 8px 0' }}>⚙️ Event Settings</h1>
        <p style={{ color: '#6b7280', margin: 0 }}>
          Manage event days, toggle active status, and monitor ticket replenishment.
        </p>
      </header>

      <section className="card">
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 20px 0', borderBottom: '1px solid #eee', paddingBottom: '12px' }}>
          Event Nights & Seasonal Replenishment
        </h2>
        <EventNightControls nights={nights} />
      </section>
    </div>
  );
}
