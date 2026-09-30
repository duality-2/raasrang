import Link from 'next/link';
import { requireOrganiser } from '@/lib/auth';
import EntryScanner from '@/components/EntryScanner';
import AccessDenied from '@/components/AccessDenied';

export const dynamic = 'force-dynamic';

export default async function VerifyPage() {
  const { authorized } = await requireOrganiser();

  if (!authorized) {
    return <AccessDenied />;
  }

  return (
    <div className="gate-page-container">
      {/* Compact Gate Bar */}
      <div className="gate-top-bar">
        <Link href="/dashboard" className="gate-back-btn" aria-label="Back to dashboard">
          ← Dashboard
        </Link>
        <span className="gate-title-badge">🎪 Gate 1 — Entry Scanner</span>
      </div>

      {/* Main Single-Purpose Verification Interface */}
      <main className="gate-main-content">
        <EntryScanner />
      </main>
    </div>
  );
}
