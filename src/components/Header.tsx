'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/actions/auth';
import type { UserRole } from '@/types';

interface HeaderProps {
  email?: string;
  userRole: UserRole | null;
}

export default function Header({ email, userRole }: HeaderProps) {
  const pathname = usePathname();
  const isScanner = userRole === 'scanner';
  const isTicketer = userRole === 'ticketer';
  const isAdmin = !isScanner && !isTicketer;

  // Determine home link based on role
  let homeHref = '/dashboard';
  if (isScanner) homeHref = '/dashboard/verify';
  else if (isTicketer) homeHref = '/dashboard/add';

  return (
    <header className="header no-print">
      <div className="header-inner">
        <div className="header-brand">
          <Link
            href={homeHref}
            className="header-logo"
            aria-label="Raas Rang 2026 Home"
          >
            RAAS RANG<span>2026</span>
          </Link>
        </div>

        {/* Desktop Navigation Links — role-aware */}
        <nav className="header-nav-links desktop-only" aria-label="Main Navigation">
          {isAdmin && (
            <>
              <Link
                href="/dashboard"
                className={`nav-link ${pathname === '/dashboard' ? 'active' : ''}`}
              >
                📋 Attendees & Passes
              </Link>
              <Link
                href="/dashboard/add"
                className={`nav-link ${pathname === '/dashboard/add' ? 'active' : ''}`}
              >
                🎟️ Issue Ticket
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
                🎪 Scanner
              </Link>
              <Link
                href="/dashboard/gate-list"
                className={`nav-link ${pathname === '/dashboard/gate-list' ? 'active' : ''}`}
              >
                📋 Entry Lists
              </Link>
              <Link
                href="/dashboard/admin"
                className={`nav-link ${pathname === '/dashboard/admin' ? 'active' : ''}`}
              >
                ⚙️ Event Settings
              </Link>
            </>
          )}

          {isTicketer && (
            <>
              <Link
                href="/dashboard/add"
                className={`nav-link ${pathname === '/dashboard/add' ? 'active' : ''}`}
              >
                🎟️ Issue Ticket
              </Link>
              <Link
                href="/dashboard/passes"
                className={`nav-link ${pathname === '/dashboard/passes' ? 'active' : ''}`}
              >
                📋 My Issued Tickets
              </Link>
            </>
          )}

          {isScanner && (
            <>
              <Link
                href="/dashboard/verify"
                className={`nav-link ${pathname === '/dashboard/verify' ? 'active' : ''}`}
              >
                🎪 Scanner
              </Link>
              <Link
                href="/dashboard/gate-list"
                className={`nav-link ${pathname === '/dashboard/gate-list' ? 'active' : ''}`}
              >
                📋 Entry Lists
              </Link>
            </>
          )}
        </nav>

        {/* Desktop CTA Button */}
        <div className="header-cta desktop-only">
          {isScanner && (
            <Link
              href="/dashboard/verify"
              className={`btn btn-primary btn-sm verify-nav-btn ${pathname === '/dashboard/verify' ? 'active' : ''}`}
            >
              ⚡ Scanner
            </Link>
          )}
          {isTicketer && (
            <Link
              href="/dashboard/add"
              className={`btn btn-primary btn-sm verify-nav-btn ${pathname === '/dashboard/add' ? 'active' : ''}`}
            >
              🎟️ Issue Ticket
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/dashboard/verify"
              className={`btn btn-primary btn-sm verify-nav-btn ${pathname === '/dashboard/verify' ? 'active' : ''}`}
            >
              ⚡ Verify Entry
            </Link>
          )}
        </div>

        {/* User Session & Sign Out */}
        <div className="header-nav">
          {email && <span className="header-user desktop-only">{email}</span>}
          {isScanner && (
            <span className="badge badge-scanner desktop-only">Scanner</span>
          )}
          {isTicketer && (
            <span className="badge badge-ticketer desktop-only" style={{ background: 'var(--primary)', color: 'var(--white)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>Ticketer</span>
          )}
          {isAdmin && (
            <span className="badge badge-admin desktop-only" style={{ background: 'var(--charcoal)', color: 'var(--white)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>Admin</span>
          )}
          <form action={signOut}>
            <button type="submit" className="btn btn-ghost btn-sm" aria-label="Sign out">
              Sign Out
            </button>
          </form>
        </div>
      </div>

      {/* Mobile-First Navigation Bar — role-aware */}
      <nav className="mobile-nav-bar mobile-only" aria-label="Mobile Navigation">
        {isAdmin && (
          <>
            <Link
              href="/dashboard"
              className={`mobile-nav-item ${pathname === '/dashboard' ? 'active' : ''}`}
              aria-current={pathname === '/dashboard' ? 'page' : undefined}
            >
              <span className="mobile-nav-icon">📋</span>
              <span className="mobile-nav-text">Attendees</span>
            </Link>
            <Link
              href="/dashboard/verify"
              className={`mobile-nav-item mobile-nav-verify ${pathname === '/dashboard/verify' ? 'active' : ''}`}
              aria-current={pathname === '/dashboard/verify' ? 'page' : undefined}
            >
              <span className="mobile-nav-icon">🎪</span>
              <span className="mobile-nav-text">Scanner</span>
            </Link>
            <Link
              href="/dashboard/gate-list"
              className={`mobile-nav-item ${pathname === '/dashboard/gate-list' ? 'active' : ''}`}
              aria-current={pathname === '/dashboard/gate-list' ? 'page' : undefined}
            >
              <span className="mobile-nav-icon">📋</span>
              <span className="mobile-nav-text">Lists</span>
            </Link>
            <Link
              href="/dashboard/batches"
              className={`mobile-nav-item ${pathname.startsWith('/dashboard/batches') ? 'active' : ''}`}
              aria-current={pathname.startsWith('/dashboard/batches') ? 'page' : undefined}
            >
              <span className="mobile-nav-icon">📦</span>
              <span className="mobile-nav-text">Batches</span>
            </Link>
          </>
        )}

        {isTicketer && (
          <>
            <Link
              href="/dashboard/add"
              className={`mobile-nav-item mobile-nav-verify ${pathname === '/dashboard/add' ? 'active' : ''}`}
              aria-current={pathname === '/dashboard/add' ? 'page' : undefined}
            >
              <span className="mobile-nav-icon">🎟️</span>
              <span className="mobile-nav-text">Issue</span>
            </Link>
            <Link
              href="/dashboard/passes"
              className={`mobile-nav-item ${pathname === '/dashboard/passes' ? 'active' : ''}`}
              aria-current={pathname === '/dashboard/passes' ? 'page' : undefined}
            >
              <span className="mobile-nav-icon">📋</span>
              <span className="mobile-nav-text">My Passes</span>
            </Link>
          </>
        )}

        {isScanner && (
          <>
            <Link
              href="/dashboard/verify"
              className={`mobile-nav-item mobile-nav-verify ${pathname === '/dashboard/verify' ? 'active' : ''}`}
              aria-current={pathname === '/dashboard/verify' ? 'page' : undefined}
            >
              <span className="mobile-nav-icon">🎪</span>
              <span className="mobile-nav-text">Scanner</span>
            </Link>
            <Link
              href="/dashboard/gate-list"
              className={`mobile-nav-item ${pathname === '/dashboard/gate-list' ? 'active' : ''}`}
              aria-current={pathname === '/dashboard/gate-list' ? 'page' : undefined}
            >
              <span className="mobile-nav-icon">📋</span>
              <span className="mobile-nav-text">Lists</span>
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
