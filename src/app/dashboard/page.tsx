import { createClient } from '@/lib/supabase/server';
import { requireDashboardUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { PassListItem } from '@/types';
import PassList from '@/components/PassList';
import AccessDenied from '@/components/AccessDenied';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { authorized, role } = await requireDashboardUser();
  if (!authorized || !role) {
    return <AccessDenied />;
  }

  // Seamlessly route dedicated staff to their specific portal
  if (role === 'scanner') {
    redirect('/dashboard/verify');
  }

  if (role === 'ticketer') {
    redirect('/dashboard/add');
  }

  const supabase = await createClient();

  // Fetch all passes
  const { data: passes, error: passesError } = await supabase
    .from('passes')
    .select('id, name, manual_code, category, email, phone, status, created_at, used_at, created_by, delivery_status, delivered_at')
    .order('created_at', { ascending: false });

  // Fetch batch count
  const { count: batchCount } = await supabase
    .from('ticket_batches')
    .select('*', { count: 'exact', head: true });

  if (passesError) {
    return (
      <div className="page">
        <div className="alert alert-error" role="alert">
          <span>⚠</span>
          <span>Failed to load passes: {passesError.message}</span>
        </div>
      </div>
    );
  }

  const passList: PassListItem[] = (passes ?? []) as PassListItem[];

  // Verified real Supabase statistics
  const total = passList.length;
  const unused = passList.filter((p) => p.status === 'unused').length;
  const used = passList.filter((p) => p.status === 'used').length;
  const cancelled = passList.filter((p) => p.status === 'cancelled').length;
  const batches = batchCount ?? 0;

  // Fetch event nights configuration status
  let hasConfiguredNights = false;
  let nightCount = 0;
  try {
    const { data: nights } = await supabase
      .from('event_nights')
      .select('id');
    if (nights && nights.length > 0) {
      hasConfiguredNights = true;
      nightCount = nights.length;
    }
  } catch {
    // Migration 004 pending
  }

  return (
    <div className="page">
      {/* ── Event Nights Schedule Status (if configured) ── */}
      {hasConfiguredNights && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
            padding: '10px 16px',
            marginBottom: '16px',
            fontSize: '0.84rem',
            color: '#166534',
          }}
        >
          <strong>📅 Event Schedule:</strong> {nightCount} Event Night{nightCount > 1 ? 's' : ''} configured.
        </div>
      )}

      {/* ── Clear Organiser Actions Hierarchy ── */}
      <div className="dashboard-top-section">
        <div>
          <h1 className="page-title">Event Overview & Passes</h1>
          <p className="page-subtitle">RAAS RANG 2026 — Physical Pass & Attendee Inventory</p>
        </div>

        <div className="dashboard-action-group">
          <Link href="/dashboard/verify" className="btn btn-primary dashboard-verify-btn">
            Open Scanner
          </Link>
          <Link href="/dashboard/add" className="btn btn-secondary">
            + New Attendee
          </Link>
          <Link href="/dashboard/batches/new" className="btn btn-secondary">
            + Create Batch
          </Link>
        </div>
      </div>

      {/* ── Verified Live Statistics ── */}
      <div className="stats-row" role="region" aria-label="Event Inventory Statistics">
        <div className="stat-card">
          <div className="stat-value">{total}</div>
          <div className="stat-label">Total Passes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>{unused}</div>
          <div className="stat-label">Unused / Valid</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--saffron)' }}>{used}</div>
          <div className="stat-label">Redeemed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--slate)' }}>{cancelled}</div>
          <div className="stat-label">Cancelled</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--violet)' }}>{batches}</div>
          <div className="stat-label">Ticket Batches</div>
        </div>
      </div>

      {/* ── Searchable & Filterable Attendee List ── */}
      <PassList passes={passList} />
    </div>
  );
}
