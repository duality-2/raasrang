import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import type { PassListItem } from '@/types';
import PassList from '@/components/PassList';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: passes, error } = await supabase
    .from('passes')
    .select('id, name, category, email, phone, status, created_at, used_at, created_by, delivery_status, delivered_at')
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
          <h1 className="page-title">Attendees</h1>
          <p className="page-subtitle">Manage passes for RAAS RANG 2026</p>
        </div>
        <Link href="/dashboard/add" className="btn btn-primary">
          + Add Attendee
        </Link>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{total}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{unused}</div>
          <div className="stat-label">Unused</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{used}</div>
          <div className="stat-label">Used</div>
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
