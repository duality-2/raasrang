import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { TicketBatch, Pass, PassCategory, PassStatus } from '@/types';
import { CATEGORY_LABELS, STATUS_LABELS } from '@/types';
import { formatDate } from '@/lib/utils';

interface BatchDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function BatchDetailPage({ params }: BatchDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: batch, error: batchError } = await supabase
    .from('ticket_batches')
    .select('*')
    .eq('id', id)
    .single();

  if (batchError || !batch) {
    notFound();
  }

  const b = batch as TicketBatch;

  const { data: passes, error: passesError } = await supabase
    .from('passes')
    .select('id, name, manual_code, category, status, created_at, used_at')
    .eq('batch_id', id)
    .order('created_at', { ascending: true });

  const passList: Partial<Pass>[] = passes ?? [];
  const unusedCount = passList.filter((p) => p.status === 'unused').length;
  const usedCount = passList.filter((p) => p.status === 'used').length;

  return (
    <div className="page">
      <Link href="/dashboard/batches" className="back-link">
        ← Back to batches
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">Batch #{b.batch_number}: {b.name}</h1>
          <p className="page-subtitle">
            {b.total_count} tickets allocated on {formatDate(b.created_at)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link
            href={`/dashboard/batches/${b.id}/print`}
            className="btn btn-primary"
          >
            🖨 Print Batch Tickets
          </Link>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{b.total_count}</div>
          <div className="stat-label">Total Allocated</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{unusedCount}</div>
          <div className="stat-label">Unused</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{usedCount}</div>
          <div className="stat-label">Redeemed</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Tickets in Batch</h2>
          <span className="badge badge-primary">
            {CATEGORY_LABELS[b.category as PassCategory]}
          </span>
        </div>

        {passesError ? (
          <div className="alert alert-error">Failed to load batch tickets</div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Attendee</th>
                  <th>Manual Code</th>
                  <th>Status</th>
                  <th>Redeemed At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {passList.map((p, idx) => (
                  <tr key={p.id}>
                    <td><strong>{idx + 1}</strong></td>
                    <td>{p.name || 'Unassigned Ticket'}</td>
                    <td>
                      <code style={{ fontWeight: 700 }}>{p.manual_code}</code>
                    </td>
                    <td>
                      <span className={`badge badge-${p.status}`}>
                        {STATUS_LABELS[p.status as PassStatus]}
                      </span>
                    </td>
                    <td>{p.used_at ? formatDate(p.used_at) : '—'}</td>
                    <td>
                      <Link
                        href={`/dashboard/passes/${p.id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        Pass Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
