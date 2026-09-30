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
          <Link href="/dashboard" className="header-logo" aria-label="Raas Rang 2026 Home">
            RAAS RANG<span>2026</span>
          </Link>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="header-nav-links desktop-only" aria-label="Main Navigation">
          <Link
            href="/dashboard"
            className={`nav-link ${pathname === '/dashboard' ? 'active' : ''}`}
          >
            📋 Attendees & Passes
          </Link>
          <Link
            href="/dashboard/batches"
            className={`nav-link ${pathname.startsWith('/dashboard/batches') ? 'active' : ''}`}
          >
            📦 Ticket Batches
          </Link>
          <Link
            href="/dashboard/verify"
            className={`nav-link ${pathname === '/dashboard/verify' ? 'active' : ''}`}
          >
            🎪 Gate Verification
          </Link>
        </nav>

        {/* Desktop CTA Button */}
        <div className="header-cta desktop-only">
          <Link
            href="/dashboard/verify"
            className={`btn btn-primary btn-sm verify-nav-btn ${pathname === '/dashboard/verify' ? 'active' : ''}`}
          >
            ⚡ Verify Entry
          </Link>
        </div>

        {/* User Session & Sign Out */}
        <div className="header-nav">
          {email && <span className="header-user desktop-only">{email}</span>}
          <form action={signOut}>
            <button type="submit" className="btn btn-ghost btn-sm" aria-label="Sign out">
              Sign Out
            </button>
          </form>
        </div>
      </div>

      {/* Mobile-First High-Contrast Navigation Bar */}
      <nav className="mobile-nav-bar mobile-only" aria-label="Mobile Navigation">
        <Link
          href="/dashboard"
          className={`mobile-nav-item ${pathname === '/dashboard' ? 'active' : ''}`}
          aria-current={pathname === '/dashboard' ? 'page' : undefined}
        >
          <span className="mobile-nav-icon">📋</span>
          <span className="mobile-nav-text">Attendees</span>
        </Link>
        <Link
          href="/dashboard/batches"
          className={`mobile-nav-item ${pathname.startsWith('/dashboard/batches') ? 'active' : ''}`}
          aria-current={pathname.startsWith('/dashboard/batches') ? 'page' : undefined}
        >
          <span className="mobile-nav-icon">📦</span>
          <span className="mobile-nav-text">Batches</span>
        </Link>
        <Link
          href="/dashboard/verify"
          className={`mobile-nav-item mobile-nav-verify ${pathname === '/dashboard/verify' ? 'active' : ''}`}
          aria-current={pathname === '/dashboard/verify' ? 'page' : undefined}
        >
          <span className="mobile-nav-icon">🎪</span>
          <span className="mobile-nav-text">Verify Entry</span>
        </Link>
      </nav>
    </header>
  );
}
