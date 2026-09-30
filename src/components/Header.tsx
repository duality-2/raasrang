'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/actions/auth';

export default function Header({ email }: { email?: string }) {
  const pathname = usePathname();

  return (
    <header className="header no-print">
      <div className="header-inner">
        <div className="header-brand">
          <Link href="/dashboard" className="header-logo">
            RAAS RANG<span>2026</span>
          </Link>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="header-nav-links desktop-only">
          <Link
            href="/dashboard"
            className={`nav-link ${pathname === '/dashboard' ? 'active' : ''}`}
          >
            Attendees
          </Link>
          <Link
            href="/dashboard/batches"
            className={`nav-link ${pathname.startsWith('/dashboard/batches') ? 'active' : ''}`}
          >
            Ticket Batches
          </Link>
        </nav>

        {/* Prominent Verify Entry Button (Visible on ALL devices) */}
        <div className="header-cta">
          <Link
            href="/dashboard/verify"
            className={`btn btn-primary btn-sm verify-nav-btn ${pathname === '/dashboard/verify' ? 'active' : ''}`}
          >
            🔍 Verify Entry
          </Link>
        </div>

        <div className="header-nav">
          {email && <span className="header-user desktop-only">{email}</span>}
          <form action={signOut}>
            <button type="submit" className="btn btn-ghost btn-sm">
              Sign Out
            </button>
          </form>
        </div>
      </div>

      {/* Mobile Sub-Navigation Bar */}
      <div className="mobile-nav-bar mobile-only">
        <Link
          href="/dashboard"
          className={`mobile-nav-item ${pathname === '/dashboard' ? 'active' : ''}`}
        >
          📋 Attendees
        </Link>
        <Link
          href="/dashboard/batches"
          className={`mobile-nav-item ${pathname.startsWith('/dashboard/batches') ? 'active' : ''}`}
        >
          📦 Batches
        </Link>
        <Link
          href="/dashboard/verify"
          className={`mobile-nav-item ${pathname === '/dashboard/verify' ? 'active' : ''}`}
        >
          🔍 Verify Entry
        </Link>
      </div>
    </header>
  );
}
