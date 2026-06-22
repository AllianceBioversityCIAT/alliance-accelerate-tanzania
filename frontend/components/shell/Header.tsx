'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useSession } from '@/lib/auth/useSession';
import type { Role } from '@/lib/auth/useSession';

// ---------------------------------------------------------------------------
// Nav links
// ---------------------------------------------------------------------------
const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Discovery Map', href: '/map' },
  { label: 'Directory', href: '/directory' },
] as const;

// ---------------------------------------------------------------------------
// Role badge pill — used inside the authenticated user slot
// ---------------------------------------------------------------------------
function RoleBadge({ role }: { role: Role }) {
  const colorMap: Record<Role, string> = {
    Public:  'bg-border text-fg',
    Staff:   'bg-primary text-primary-fg',
    Admin:   'bg-accent text-primary-fg',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[role]}`}
    >
      {role}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Avatar initials circle
// ---------------------------------------------------------------------------
function AvatarCircle({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-fg text-xs font-semibold select-none"
    >
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Auth slot — sign-in (Public) or compact user menu (authenticated)
// ---------------------------------------------------------------------------
function AuthSlot() {
  const { role, user } = useSession();

  if (!user || role === 'Public') {
    return (
      <Link
        href="/login"
        className="inline-flex items-center rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <AvatarCircle name={user.name} />
      <span className="hidden sm:block text-sm font-medium text-fg">{user.name}</span>
      <RoleBadge role={user.role} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// NavLink — active state via usePathname
// ---------------------------------------------------------------------------
function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  // Exact match for "/" to avoid marking it active on every page
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={[
        'text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm px-1 py-0.5',
        isActive
          ? 'text-primary underline underline-offset-4 decoration-2 decoration-primary'
          : 'text-muted hover:text-fg',
      ].join(' ')}
    >
      {label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-surface border-b border-border shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between gap-4">

          {/* Brand lockup */}
          <Link
            href="/"
            className="flex items-center gap-2.5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm"
            aria-label="ACCELERATE Tanzania Seed Registry — home"
          >
            {/* Circular brand mark — pure CSS, no image asset */}
            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg font-bold text-xs select-none"
            >
              A
            </span>

            {/* Two-line wordmark */}
            <span className="flex flex-col leading-none">
              <span className="text-sm font-bold tracking-widest uppercase text-primary">
                ACCELERATE
              </span>
              <span className="text-xs font-medium tracking-wider uppercase text-muted">
                Tanzania Seed Registry
              </span>
            </span>
          </Link>

          {/* Primary nav — desktop (md+) */}
          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-6"
          >
            {NAV_LINKS.map((link) => (
              <NavLink key={link.href} href={link.href} label={link.label} />
            ))}
          </nav>

          {/* Right-hand side: auth slot + hamburger */}
          <div className="flex items-center gap-3">
            <AuthSlot />

            {/* Hamburger — mobile only */}
            <button
              type="button"
              aria-controls="mobile-menu"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              onClick={() => setMenuOpen((prev) => !prev)}
              className="inline-flex md:hidden items-center justify-center rounded-md p-2 text-muted hover:bg-border hover:text-fg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {/* Accessible icon: two states, animated respectfully */}
              <span aria-hidden="true" className="block h-5 w-5 relative">
                <span
                  className={[
                    'absolute inset-0 transition-opacity motion-reduce:transition-none',
                    menuOpen ? 'opacity-100' : 'opacity-0',
                  ].join(' ')}
                >
                  {/* Close (X) icon */}
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    />
                  </svg>
                </span>
                <span
                  className={[
                    'absolute inset-0 transition-opacity motion-reduce:transition-none',
                    menuOpen ? 'opacity-0' : 'opacity-100',
                  ].join(' ')}
                >
                  {/* Hamburger icon */}
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                    />
                  </svg>
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu panel */}
      <div
        id="mobile-menu"
        hidden={!menuOpen}
        className="md:hidden border-t border-border bg-surface"
      >
        <nav aria-label="Primary mobile" className="flex flex-col px-4 py-3 gap-1">
          {NAV_LINKS.map((link) => (
            <MobileNavLink
              key={link.href}
              href={link.href}
              label={link.label}
              onNavigate={() => setMenuOpen(false)}
            />
          ))}
        </nav>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// MobileNavLink — closes the menu on navigation
// ---------------------------------------------------------------------------
function MobileNavLink({
  href,
  label,
  onNavigate,
}: {
  href: string;
  label: string;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      onClick={onNavigate}
      className={[
        'block rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
        isActive
          ? 'bg-border text-primary font-semibold'
          : 'text-muted hover:bg-border hover:text-fg',
      ].join(' ')}
    >
      {label}
    </Link>
  );
}
