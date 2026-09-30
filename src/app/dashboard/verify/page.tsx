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
    </div>
  );
}
