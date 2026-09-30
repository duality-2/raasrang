import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Pass, PassCategory, PassStatus } from '@/types';
import { CATEGORY_LABELS, STATUS_LABELS } from '@/types';
import { formatDate } from '@/lib/utils';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import PrintTicketButton from '@/components/PrintTicketButton';
import PhysicalTicketCard from '@/components/PhysicalTicketCard';

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
  const displayName = p.name || 'Unassigned Ticket';

  return (
    <div className="page pass-detail-page">
      <div className="no-print">
        <Link href="/dashboard" className="back-link">
          ← Back to attendees
        </Link>

        <div className="page-header">
          <div>
            <h1 className="page-title">{displayName}</h1>
            <p className="page-subtitle">Pass Details & Physical Ticket</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span className={`badge badge-${p.category}`}>
              {CATEGORY_LABELS[p.category as PassCategory]}
            </span>
            <span className={`badge badge-${p.status}`}>
              {STATUS_LABELS[p.status as PassStatus]}
            </span>
            <PrintTicketButton />
          </div>
        </div>

        {/* Physical Ticket Preview Card */}
        <div className="card mb-6">
          <div className="card-header">
            <h2 className="card-title">Physical Ticket Card</h2>
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>
              Optimised for printing
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
            <PhysicalTicketCard pass={p} />
          </div>
        </div>

        {/* Full Details Grid */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Pass Metadata</h2>
          </div>
          <div className="detail-grid">
            <div className="detail-item">
              <div className="detail-label">Attendee Name</div>
              <div className="detail-value">{p.name || 'Unassigned Ticket'}</div>
            </div>

            <div className="detail-item">
              <div className="detail-label">Category</div>
              <div className="detail-value">
                {CATEGORY_LABELS[p.category as PassCategory]}
              </div>
            </div>

            <div className="detail-item">
              <div className="detail-label">Manual Entry Code</div>
              <div className="detail-value" style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.05em' }}>
                {p.manual_code || '—'}
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
              <div className="detail-label">Created At</div>
              <div className="detail-value">{formatDate(p.created_at)}</div>
            </div>

            <div className="detail-item">
              <div className="detail-label">Used At</div>
              <div className="detail-value">
                {p.used_at ? formatDate(p.used_at) : '—'}
              </div>
            </div>

            {/* Local QR Code */}
            <div className="detail-item">
              <div className="detail-label">Local QR Code (Gate Payload)</div>
              <div style={{ marginTop: '8px' }}>
                <QRCodeDisplay payload={p.token} size={140} />
              </div>
            </div>

            {/* Secret Token */}
            <div className="detail-item detail-full-width">
              <div className="detail-label">QR Token Secret (64-character payload)</div>
              <div className="detail-token">{p.token}</div>
            </div>
          </div>
        </div>

        <div className="card mt-6">
          <div className="card-header">
            <div className="card-title">Internal Pass ID (Database UUID)</div>
          </div>
          <code style={{ fontSize: '0.8rem', color: 'var(--muted)', wordBreak: 'break-all' }}>
            {p.id}
          </code>
        </div>
      </div>

      {/* Printable Area (visible only in print) */}
      <div className="print-only">
        <PhysicalTicketCard pass={p} />
      </div>
    </div>
  );
}
