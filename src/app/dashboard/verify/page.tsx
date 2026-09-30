import Link from 'next/link';
import { requireOrganiser } from '@/lib/auth';
import { getVerificationDiagnostics } from '@/actions/verify';
import EntryScanner from '@/components/EntryScanner';
import AccessDenied from '@/components/AccessDenied';

export const dynamic = 'force-dynamic';

export default async function VerifyPage() {
  const { authorized } = await requireOrganiser();

  if (!authorized) {
    return <AccessDenied />;
  }

  const diagnostic = await getVerificationDiagnostics();

  return (
    <div className="page">
      <Link href="/dashboard" className="back-link">
        ← Back to attendees
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">Gate Verification & Entry</h1>
          <p className="page-subtitle">
            Scan physical ticket QR or enter manual code to authorise entry
          </p>
        </div>
      </div>

      <EntryScanner />

      {/* Safe Diagnostic Panel (requirement 6) */}
      <div className="card mt-6" style={{ padding: '16px 20px', background: '#0e0b09', border: '1px solid #27272a' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--muted)' }}>
            🛡 Session Diagnostics
          </div>
          <div style={{ fontSize: '0.78rem', color: '#71717a' }}>
            Request ID: <code>{diagnostic.request_id}</code>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '10px', fontSize: '0.82rem' }}>
          <div>
            <span style={{ color: 'var(--muted)' }}>Session: </span>
            <strong style={{ color: diagnostic.session_exists ? '#22c55e' : '#ef4444' }}>
              {diagnostic.session_exists ? 'Active' : 'Missing'}
            </strong>
          </div>
          <div>
            <span style={{ color: 'var(--muted)' }}>Organiser Allowlist: </span>
            <strong style={{ color: diagnostic.organiser_row_exists ? '#22c55e' : '#ef4444' }}>
              {diagnostic.organiser_row_exists ? 'Verified' : 'Not Found'}
            </strong>
          </div>
          <div>
            <span style={{ color: 'var(--muted)' }}>User ID: </span>
            <code style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>{diagnostic.user_id}</code>
          </div>
        </div>
      </div>
    </div>
  );
}
