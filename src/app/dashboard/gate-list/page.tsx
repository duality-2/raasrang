import Link from 'next/link';
import { requireOrganiserOrScanner } from '@/lib/auth';
import { getPassCounts } from '@/actions/gate-list';
import GatePassList from '@/components/GatePassList';
import AccessDenied from '@/components/AccessDenied';

export const dynamic = 'force-dynamic';

export default async function GateListPage() {
  const { authorized, role } = await requireOrganiserOrScanner();

  if (!authorized || !role) {
    return <AccessDenied />;
  }

  const counts = await getPassCounts();

  return (
    <div className="gate-page-container gate-list-page">
      {/* Compact Bar */}
      <div className="gate-top-bar">
        {role === 'organiser' ? (
          <Link href="/dashboard" className="gate-back-btn" aria-label="Back to dashboard">
            ← Dashboard
          </Link>
        ) : (
          <Link href="/dashboard/verify" className="gate-back-btn" aria-label="Back to scanner">
            ← Scanner
          </Link>
        )}
        <span className="gate-title-badge">📋 Pass Lists</span>
      </div>

      <main className="gate-main-content">
        <GatePassList initialCounts={counts} userRole={role} />
      </main>
    </div>
  );
}
