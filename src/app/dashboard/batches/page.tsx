import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { TicketBatch, PassCategory } from '@/types';
import { CATEGORY_LABELS } from '@/types';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function BatchesPage() {
  const supabase = await createClient();

  const { data: batches, error } = await supabase
    .from('ticket_batches')
    .select('*')
    .order('batch_number', { ascending: false });

  if (error) {
    return (
      <div className="page">
        <div className="alert alert-error">
          <span>⚠</span>
          <span>Failed to load ticket batches: {error.message}</span>
        </div>
      </div>
    );
  }

  const batchList: TicketBatch[] = (batches ?? []) as TicketBatch[];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Ticket Batches</h1>
          <p className="page-subtitle">Manage and print physical ticket allocations</p>
        </div>
        <Link href="/dashboard/batches/new" className="btn btn-primary">
          + Create Ticket Batch
        </Link>
      </div>

      {batchList.length === 0 ? (
        <div className="card text-center" style={{ padding: '48px 24px' }}>
          <p className="text-muted" style={{ marginBottom: '16px' }}>
            No physical ticket batches created yet.
          </p>
          <Link href="/dashboard/batches/new" className="btn btn-primary">
            Create First Batch
          </Link>
        </div>
      ) : (
        <div className="card">
          {/* Mobile Card View (< 768px) */}
          <div className="batch-mobile-cards mobile-only">
            {batchList.map((batch) => (
              <div key={batch.id} className="batch-card">
                <div className="batch-card-header">
                  <div>
                    <span className="batch-card-badge">Batch #{batch.batch_number}</span>
                    <h3 className="batch-card-name">{batch.name}</h3>
                  </div>
                  <span className={`badge badge-${batch.category}`}>
                    {CATEGORY_LABELS[batch.category as PassCategory]}
                  </span>
                </div>
                <div className="batch-card-meta">
                  <div className="batch-meta-item">
                    <span className="batch-meta-label">Allocation</span>
                    <span className="batch-meta-val">{batch.total_count} passes</span>
                  </div>
                  <div className="batch-meta-item">
                    <span className="batch-meta-label">Created</span>
                    <span className="batch-meta-val">{formatDate(batch.created_at)}</span>
                  </div>
                </div>
                <div className="batch-card-actions">
                  <Link
                    href={`/dashboard/batches/${batch.id}`}
                    className="btn btn-secondary btn-sm"
                  >
                    View Passes
                  </Link>
                  <Link
                    href={`/dashboard/batches/${batch.id}/print`}
                    className="btn btn-primary btn-sm"
                  >
                    🖨 Print Batch
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View (>= 768px) */}
          <div className="table-wrapper desktop-only">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Batch #</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Total Tickets</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {batchList.map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      <strong>#{batch.batch_number}</strong>
                    </td>
                    <td>{batch.name}</td>
                    <td>
                      <span className={`badge badge-${batch.category}`}>
                        {CATEGORY_LABELS[batch.category as PassCategory]}
                      </span>
                    </td>
                    <td>{batch.total_count} passes</td>
                    <td>{formatDate(batch.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Link
                          href={`/dashboard/batches/${batch.id}`}
                          className="btn btn-secondary btn-sm"
                        >
                          View Passes
                        </Link>
                        <Link
                          href={`/dashboard/batches/${batch.id}/print`}
                          className="btn btn-primary btn-sm"
                        >
                          🖨 Print Batch
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
