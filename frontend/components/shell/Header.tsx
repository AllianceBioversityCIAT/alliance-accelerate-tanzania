'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/auth/useSession';
import { useAuth } from '@/lib/auth/useAuth';
import type { Role } from '@/lib/auth/useSession';

// ---------------------------------------------------------------------------
// Nav links
// ---------------------------------------------------------------------------
const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Discovery Map', href: '/map' },
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Directory', href: '/directory' },
  { label: 'About', href: '/about' },
] as const;

// ---------------------------------------------------------------------------
// Role badge pill — used inside the authenticated user slot
// ---------------------------------------------------------------------------
function RoleBadge({ role }: { role: Role }) {
  const colorMap: Record<Role, string> = {
    Public:  'bg-border text-fg',
    Staff:   'bg-primary text-primary-fg',
    Admin:   'bg-primary text-primary-fg',
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
// Auth slot — sign-in (Public) or a compact user-menu dropdown (authenticated).
// The dropdown keeps the top bar uncluttered: the avatar+role button collapses
// the long email, role, admin console link, and sign-out into a popover, so the
// primary nav links never get squeezed into wrapping (UX: overflow/no-wrap).
// ---------------------------------------------------------------------------
function AuthSlot() {
  const { role, user } = useSession();
  const { signOut }    = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside-click and on Escape (a11y: keyboard-dismissable popover).
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user || role === 'Public') {
    return (
      <Link
        href="/login"
        className="inline-flex items-center whitespace-nowrap rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        Staff sign-in
      </Link>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger — avatar + role badge + chevron; collapses the identity block. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        className="inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 cursor-pointer"
      >
        <AvatarCircle name={user.name} />
        <RoleBadge role={user.role} />
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={[
            'h-4 w-4 text-muted transition-transform motion-reduce:transition-none',
            open ? 'rotate-180' : '',
          ].join(' ')}
        >
          <path fillRule="evenodd" clipRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
        </svg>
      </button>

      {/* Popover menu */}
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 mt-2 w-64 rounded-md border border-border bg-surface shadow-md z-50 py-1"
        >
          {/* Identity block — the long email lives here, free to wrap. */}
          <div className="flex items-center gap-2.5 px-4 py-3">
            <AvatarCircle name={user.name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg" title={user.name}>{user.name}</p>
              <p className="text-xs text-muted">Signed in · {user.role}</p>
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Admin console — role-scoped, lives in the account menu (off the nav). */}
          {role === 'Admin' && (
            <Link
              href="/admin/users"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:bg-surface-alt"
            >
              Admin console
            </Link>
          )}

          <Link
            href="/"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-muted transition-colors hover:bg-surface-alt hover:text-fg focus-visible:outline-none focus-visible:bg-surface-alt"
          >
            View public site
          </Link>

          <div className="border-t border-border" />

          {/* Sign out — FR-3; accessible menu item with visible focus (NFR-4). */}
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); void signOut(); }}
            className="block w-full px-4 py-2 text-left text-sm font-medium text-danger transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:bg-surface-alt cursor-pointer"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MobileAuth — auth control rendered INSIDE the hamburger menu (mobile).
// Keeps the mobile top bar uncluttered (brand + hamburger only) so the
// "Staff sign-in" button no longer squeezes/wraps next to the brand.
// ---------------------------------------------------------------------------
function MobileAuth({ onNavigate }: { onNavigate: () => void }) {
  const { role, user } = useSession();
  const { signOut }    = useAuth();

  if (!user || role === 'Public') {
    return (
      <Link
        href="/login"
        onClick={onNavigate}
        className="inline-flex w-full items-center justify-center rounded-md border border-primary px-3 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
      >
        Staff sign-in
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2.5">
        <AvatarCircle name={user.name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg" title={user.name}>{user.name}</p>
          <p className="text-xs text-muted">Signed in · {user.role}</p>
        </div>
        <span className="ml-auto shrink-0"><RoleBadge role={user.role} /></span>
      </div>
      {/* Admin console — role-scoped, in the account area (not the content nav). */}
      {role === 'Admin' && (
        <Link
          href="/admin/users"
          onClick={onNavigate}
          className="inline-flex w-full items-center justify-center rounded-md border border-border px-3 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
        >
          Admin console
        </Link>
      )}
      <button
        type="button"
        onClick={() => { onNavigate(); void signOut(); }}
        className="inline-flex w-full items-center justify-center rounded-md border border-border px-3 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
      >
        Sign out
      </button>
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
        'whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm px-1 py-0.5',
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
            {/* Official colour logo — alt="" because the Link aria-label already names it */}
            <Image
              src="/brand/accelerate-logo-color.png"
              width={867}
              height={194}
              alt=""
              priority
              className="h-8 w-auto sm:h-10"
            />

            {/* Platform descriptor — visually separates logo from nav on larger screens */}
            <span className="hidden sm:block border-l border-border pl-2.5 text-xs font-medium uppercase tracking-wider text-muted">
              Tanzania Seed Registry
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

          {/* Right-hand side: auth slot (desktop) + hamburger (mobile) */}
          <div className="flex items-center gap-3">
            {/* Desktop auth — hidden on mobile; the mobile auth lives in the
                hamburger menu below so the top bar stays uncluttered. */}
            <div className="hidden md:flex items-center">
              <AuthSlot />
            </div>

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

        {/* Auth control — moved into the menu on mobile (FR-4). */}
        <div className="border-t border-border px-4 py-3">
          <MobileAuth onNavigate={() => setMenuOpen(false)} />
        </div>
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
