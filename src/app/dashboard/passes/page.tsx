import Link from 'next/link';
import { requireOrganiserOrTicketer } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PassListItem } from '@/types';
import AccessDenied from '@/components/AccessDenied';

export const dynamic = 'force-dynamic';

export default async function IssuedPassesPage() {
  const { user, authorized, role } = await requireOrganiserOrTicketer();
  if (!authorized || !user) {
    return <AccessDenied />;
  }

  const admin = createAdminClient();
  const isTicketer = role === 'ticketer';

  let query = admin
    .from('passes')
    .select('*')
    .order('created_at', { ascending: false });

  // Ticketer data isolation: Only see passes created by this ticketer
  if (isTicketer) {
    query = query.eq('created_by', user.id);
  }

  const { data: passes, error } = await query;
  const passList: PassListItem[] = (passes ?? []).map((row) => ({
    ...row,
    ticket_type: (row.ticket_type as 'single' | 'seasonal') || 'single',
    party_size: row.party_size || 1,
  })) as PassListItem[];

  return (
    <div className="page">
      <div className="dashboard-top-section">
        <div>
          <h1 className="page-title">{isTicketer ? 'My Issued Tickets' : 'Issued Passes'}</h1>
          <p className="page-subtitle">
            {isTicketer
              ? `Tickets issued by your account (${passList.length} total)`
              : `All issued tickets across the event (${passList.length} total)`}
          </p>
        </div>

        <div className="dashboard-action-group">
          <Link href="/dashboard/add" className="btn btn-primary">
            Issue New Ticket
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <span>⚠</span>
          <span>Failed to load tickets: {error.message}</span>
        </div>
      )}

      {passList.length === 0 ? (
        <div className="card empty-state" style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>Tickets</div>
          <h3>No tickets issued yet</h3>
          <p style={{ color: '#6b7280', margin: '8px 0 20px' }}>
            {isTicketer
              ? "You haven't issued any tickets yet. Tap below to issue your first ticket."
              : 'No passes have been issued in the system yet.'}
          </p>
          <Link href="/dashboard/add" className="btn btn-primary">
            Issue Ticket
          </Link>
        </div>
      ) : (
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px' }}>Attendee</th>
                  <th style={{ padding: '12px 16px' }}>Type & Party</th>
                  <th style={{ padding: '12px 16px' }}>Entry Code</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px' }}>Delivery</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {passList.map((pass) => (
                  <tr key={pass.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600 }}>{pass.name || 'Unassigned Ticket'}</div>
                      {pass.phone && (
                        <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>{pass.phone}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                        {pass.ticket_type === 'seasonal' ? 'Seasonal' : 'Single'}
                      </span>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        Party of {pass.party_size || 1}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 700 }}>
                      {pass.manual_code}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={`badge badge-${pass.status}`} style={{ fontSize: '0.75rem' }}>
                        {pass.status === 'used' ? 'Used' : 'Unused'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        className={`badge badge-${pass.delivery_status || 'ready_to_share'}`}
                        style={{ fontSize: '0.75rem' }}
                      >
                        {pass.delivery_status === 'manually_shared' ? '✓ Sent' : 'Ready to Share'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <Link
                          href={`/dashboard/passes/${pass.id}`}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.78rem' }}
                        >
                          View / Share
                        </Link>
                        <a
                          href={`/api/passes/${pass.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '0.78rem' }}
                        >
                          PDF
                        </a>
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
