'use client';

import { signOut } from '@/actions/auth';

export default function Header({ email }: { email?: string }) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-brand">
          <div className="header-logo">
            RAAS RANG<span>2026</span>
          </div>
        </div>
        <nav className="header-nav">
          {email && <span className="header-user">{email}</span>}
          <form action={signOut}>
            <button type="submit" className="btn btn-ghost btn-sm">
              Sign Out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
