import Link from 'next/link';
import { requireOrganiserOrScanner } from '@/lib/auth';
import EntryScanner from '@/components/EntryScanner';
import AccessDenied from '@/components/AccessDenied';

export const dynamic = 'force-dynamic';

export default async function VerifyPage() {
  const { authorized, role } = await requireOrganiserOrScanner();

  if (!authorized || !role) {
    return <AccessDenied />;
  }

  return (
    <div className="gate-page-container">
      {/* Compact Bar */}
      <div className="gate-top-bar">
        {role === 'organiser' ? (
          <Link href="/dashboard" className="gate-back-btn" aria-label="Back to dashboard">
            ← Dashboard
          </Link>
        ) : (
          <span className="gate-back-btn-placeholder" />
        )}
        <span className="gate-title-badge">Entry Scanner</span>
        <Link href="/dashboard/gate-list" className="gate-list-link" aria-label="View pass lists">
          Lists
        </Link>
      </div>

      {/* Main Single-Purpose Verification Interface */}
      <main className="gate-main-content">
        <EntryScanner userRole={role} />
      </main>
    </div>
  );
}
