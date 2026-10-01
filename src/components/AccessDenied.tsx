import Link from 'next/link';
import { signOut } from '@/actions/auth';

export default function AccessDenied() {
  return (
    <div className="access-denied">
      <div className="access-denied-icon">🔒</div>
      <h2>Access Denied</h2>
      <p>
        You are signed in but you do not have permission to view this section.
        <br />
        Contact the event admin to adjust your permissions.
      </p>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px' }}>
        <form action={signOut}>
          <button type="submit" className="btn btn-secondary">
            Sign Out
          </button>
        </form>
        <Link href="/login" className="btn btn-primary">
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}
