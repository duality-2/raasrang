import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireOrganiserOrTicketer } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Pass, PassStatus } from '@/types';
import { STATUS_LABELS } from '@/types';
import { formatDate } from '@/lib/utils';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import PrintTicketButton from '@/components/PrintTicketButton';
import PhysicalTicketCard from '@/components/PhysicalTicketCard';
import ShareTicketActions from '@/components/ShareTicketActions';
import PassManagementActions from '@/components/PassManagementActions';
import { buildTicketMessage } from '@/lib/delivery-utils';
import { getEventNights } from '@/actions/event-nights';

interface PassDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PassDetailPage({ params }: PassDetailPageProps) {
  const { id } = await params;
  const { user, authorized, role } = await requireOrganiserOrTicketer();
  if (!authorized || !user) {
    notFound();
  }

  const admin = createAdminClient();
  let query = admin
    .from('passes')
    .select('*')
    .eq('id', id);

  if (role === 'ticketer') {
    query = query.eq('created_by', user.id);
  }

  const { data: pass, error } = await query.maybeSingle();

  if (error || !pass) {
    notFound();
  }

  const p = pass as Pass;
  const displayName = p.name || 'Unassigned Ticket';
  const maskedToken = `${p.token.slice(0, 8)}••••••••••••••••••••••••${p.token.slice(-8)}`;
  
  let night = null;
  if (p.ticket_type === 'single' && p.valid_night_id) {
    const nights = await getEventNights();
    night = nights.find(n => n.id === p.valid_night_id) || null;
  }
  const shareText = buildTicketMessage(p, night);

  // Check for admission history
  const { count: admissionCount } = await admin
    .from('admissions')
    .select('id', { count: 'exact', head: true })
    .eq('pass_id', p.id);
  const hasAdmissions = (admissionCount || 0) > 0;

  return (
    <div className="page pass-detail-page">
      <div className="no-print">
        <Link
          href={role === 'ticketer' ? '/dashboard/passes' : '/dashboard'}
          className="back-link"
        >
          {role === 'ticketer' ? '← Back to My Issued Tickets' : '← Back to attendees'}
        </Link>

        <div className="page-header">
          <div>
            <h1 className="page-title">{displayName}</h1>
            <p className="page-subtitle">Pass Details & Physical Ticket</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <span className={`badge badge-${p.status}`}>
              {STATUS_LABELS[p.status as PassStatus]}
            </span>
            <ShareTicketActions pass={p} shareText={shareText} />
            <PrintTicketButton />
          </div>
        </div>

        {/* Physical Ticket Preview Card */}
        <div className="card mb-6">
          <div className="card-header">
            <h2 className="card-title">Physical Ticket Preview</h2>
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>
              Standard card layout for print and PDF export
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
            <PhysicalTicketCard pass={p} night={night} />
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
              <div className="detail-label">Ticket Type</div>
              <div className="detail-value">
                <span className={p.ticket_type === 'seasonal' ? 'badge-seasonal' : 'badge-single'}>
                  {p.ticket_type === 'seasonal' ? 'Seasonal Pass' : 'Single Ticket'}
                </span>
              </div>
            </div>

            <div className="detail-item">
              <div className="detail-label">Party Size</div>
              <div className="detail-value" style={{ fontWeight: 700 }}>
                {p.party_size || 1} Person{(p.party_size || 1) > 1 ? 's' : ''}
              </div>
            </div>

            {p.ticket_type === 'seasonal' && (
              <div className="detail-item">
                <div className="detail-label">Eligible Nights</div>
                <div className="detail-value">
                  {p.seasonal_nights_count ? `${p.seasonal_nights_count} Consecutive Nights` : 'All 9 Nights'}
                </div>
              </div>
            )}

            <div className="detail-item">
              <div className="detail-label">Gate Manual Code</div>
              <div className="detail-value" style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.08em' }}>
                {p.manual_code || '—'}
              </div>
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
              <div className="detail-label">Email</div>
              <div className="detail-value">{p.email || '—'}</div>
            </div>

            <div className="detail-item">
              <div className="detail-label">Phone</div>
              <div className="detail-value">{p.phone || '—'}</div>
            </div>

            <div className="detail-item">
              <div className="detail-label">Created At</div>
              <div className="detail-value">{formatDate(p.created_at)}</div>
            </div>

            <div className="detail-item">
              <div className="detail-label">Used At</div>
              <div className="detail-value">
                {p.used_at ? formatDate(p.used_at) : 'Not yet redeemed'}
              </div>
            </div>

            {/* Local QR Code Display */}
            <div className="detail-item">
              <div className="detail-label">QR Code Payload</div>
              <div style={{ marginTop: '8px' }}>
                <QRCodeDisplay payload={p.token} size={140} />
              </div>
            </div>

            {/* Masked Secret Token */}
            <div className="detail-item">
              <div className="detail-label">QR Payload Token (Masked)</div>
              <code style={{ fontSize: '0.8rem', color: 'var(--muted)', wordBreak: 'break-all' }}>
                {maskedToken}
              </code>
            </div>
          </div>

          <PassManagementActions 
            passId={p.id} 
            hasAdmissions={hasAdmissions} 
            currentStatus={p.status} 
          />
        </div>
      </div>

      {/* Printable Area (visible only in print) */}
      <div className="print-only">
        <PhysicalTicketCard pass={p} night={night} />
      </div>
    </div>
  );
}
