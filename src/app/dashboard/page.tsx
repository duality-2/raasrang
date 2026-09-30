import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import type { PassListItem } from '@/types';
import PassList from '@/components/PassList';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: passes, error } = await supabase
    .from('passes')
    .select('id, name, manual_code, category, email, phone, status, created_at, used_at, created_by, delivery_status, delivered_at')
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <div className="page">
        <div className="alert alert-error">
          <span>⚠</span>
          <span>Failed to load passes: {error.message}</span>
        </div>
      </div>
    );
  }

  const passList: PassListItem[] = (passes ?? []) as PassListItem[];

  // Quick stats
  const total = passList.length;
  const unused = passList.filter((p) => p.status === 'unused').length;
  const used = passList.filter((p) => p.status === 'used').length;
  const delivered = passList.filter((p) => p.delivery_status === 'delivered').length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendees & Physical Passes</h1>
          <p className="page-subtitle">Manage passes for RAAS RANG 2026</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link href="/dashboard/verify" className="btn btn-primary">
            🔍 Verify Entry
          </Link>
          <Link href="/dashboard/batches" className="btn btn-secondary">
            Ticket Batches
          </Link>
          <Link href="/dashboard/add" className="btn btn-secondary">
            + Add Attendee
          </Link>
        </div>
      </div>

      {/* Prominent Gate Entry Card */}
      <div className="card gate-entry-callout mb-6">
        <div className="gate-entry-callout-inner">
          <div>
            <div className="gate-callout-title">🎪 Gate Entry Verification</div>
            <div className="gate-callout-desc">
              Scan physical ticket QR codes with iPhone camera or enter printed manual codes.
            </div>
          </div>
          <Link href="/dashboard/verify" className="btn btn-primary gate-callout-btn">
            Open Gate Scanner →
          </Link>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{total}</div>
          <div className="stat-label">Total Passes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{unused}</div>
          <div className="stat-label">Unused</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{used}</div>
          <div className="stat-label">Redeemed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{delivered}</div>
          <div className="stat-label">Delivered</div>
        </div>
      </div>

      <PassList passes={passList} />
    </div>
  );
}
