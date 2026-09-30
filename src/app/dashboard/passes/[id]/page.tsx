import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Pass, PassCategory, PassStatus, DeliveryStatus } from '@/types';
import { CATEGORY_LABELS, STATUS_LABELS, DELIVERY_LABELS } from '@/types';
import { formatDate } from '@/lib/utils';

interface PassDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PassDetailPage({ params }: PassDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: pass, error } = await supabase
    .from('passes')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !pass) {
    notFound();
  }

  const p = pass as Pass;

  return (
    <div className="page">
      <Link href="/dashboard" className="back-link">
        ← Back to attendees
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">{p.name}</h1>
          <p className="page-subtitle">Pass Details</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span className={`badge badge-${p.category}`}>
            {CATEGORY_LABELS[p.category as PassCategory]}
          </span>
          <span className={`badge badge-${p.status}`}>
            {STATUS_LABELS[p.status as PassStatus]}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="detail-grid">
          <div className="detail-item">
            <div className="detail-label">Name</div>
            <div className="detail-value">{p.name}</div>
          </div>

          <div className="detail-item">
            <div className="detail-label">Category</div>
            <div className="detail-value">
              {CATEGORY_LABELS[p.category as PassCategory]}
            </div>
          </div>

          <div className="detail-item">
            <div className="detail-label">Email</div>
            <div className="detail-value">{p.email || '—'}</div>
          </div>

          <div className="detail-item">
            <div className="detail-label">Phone</div>
            <div className="detail-value">{p.phone || '—'}</div>
          </div>

          <div className="detail-item">
            <div className="detail-label">Status</div>
            <div className="detail-value">
              <span className={`badge badge-${p.status}`}>
                {STATUS_LABELS[p.status as PassStatus]}
              </span>
            </div>
          </div>

          <div className="detail-item">
            <div className="detail-label">Delivery Status</div>
            <div className="detail-value">
              <span className={`badge badge-${p.delivery_status}`}>
                {DELIVERY_LABELS[p.delivery_status as DeliveryStatus]}
              </span>
            </div>
          </div>

          <div className="detail-item">
            <div className="detail-label">Created At</div>
            <div className="detail-value">{formatDate(p.created_at)}</div>
          </div>

          <div className="detail-item">
            <div className="detail-label">Used At</div>
            <div className="detail-value">
              {p.used_at ? formatDate(p.used_at) : '—'}
            </div>
          </div>

          {/* Token — full token shown ONLY in this authorised detail view */}
          <div className="detail-item detail-full-width">
            <div className="detail-label">Pass Token (Secret)</div>
            <div className="detail-token">{p.token}</div>
          </div>

          {/* QR Code placeholder for future phase */}
          <div className="detail-item detail-full-width">
            <div className="detail-label">QR Code</div>
            <div className="qr-placeholder">
              QR generation will be added in Phase 2
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-6">
        <div className="card-header">
          <div className="card-title">Pass ID</div>
        </div>
        <code style={{ fontSize: '0.8rem', color: 'var(--muted)', wordBreak: 'break-all' }}>
          {p.id}
        </code>
      </div>
    </div>
  );
}
