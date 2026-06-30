// @sdd-spec admin/user-management (T-8)
'use client';

/**
 * AdminShell layout — wraps all (admin) routes.
 *
 * Guards:
 *   - <RequireRole allow={['Admin']}> redirects non-Admin users to /login
 *     before any content is rendered (client-side, static-export safe).
 *
 * Structure:
 *   - Persistent <aside> with <AdminSidebar> (left column on md+; stacked on mobile).
 *   - Top bar with brand mark, "View public site" link, and user identity slot.
 *   - <main> content region rendering {children}.
 *
 * Semantic landmarks: <aside>, <main>, <nav> (inside AdminSidebar).
 * Tokens only — no hardcoded colors/geometry (system-design §7).
 * WCAG 2.1 AA: labeled controls, visible focus ring, keyboard-navigable.
 *
 * Distinct from the public top-nav (system-design §5, DD-5).
 */

import Link from 'next/link';
import Image from 'next/image';

import { RequireRole }   from '@/lib/auth/RequireRole';
import { useSession }    from '@/lib/auth/useSession';
import { useAuth }       from '@/lib/auth/useAuth';
import { AdminSidebar }  from '@/components/admin/AdminSidebar';

// ---------------------------------------------------------------------------
// Top-bar user identity + sign-out slot
// ---------------------------------------------------------------------------

function AdminTopBarUserSlot() {
  const { role, user } = useSession();
  const { signOut }    = useAuth();

  if (!user) return null;

  return (
    <div className="flex items-center gap-3">
      {/* User email / role identity */}
      <span className="hidden sm:block text-sm text-muted">
        {user.name}
      </span>
      <span className="inline-flex items-center rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
        {role}
      </span>
      {/* Sign-out */}
      <button
        type="button"
        onClick={() => void signOut()}
        className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-border hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        aria-label="Sign out of admin"
      >
        Sign out
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdminShell — layout component
// ---------------------------------------------------------------------------

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireRole allow={['Admin']}>
      <div className="min-h-screen bg-surface flex flex-col">

        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-40 bg-surface border-b border-border shadow-sm">
          <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">

            {/* Brand mark */}
            <Link
              href="/admin"
              className="flex items-center gap-2.5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm"
              aria-label="ACCELERATE Tanzania — Admin console"
            >
              <Image
                src="/brand/accelerate-logo-color.png"
                width={867}
                height={194}
                alt=""
                priority
                className="h-8 w-auto sm:h-9"
              />
              <span className="hidden sm:block border-l border-border pl-2.5 text-xs font-medium uppercase tracking-wider text-muted">
                Admin
              </span>
            </Link>

            {/* Right: public-site link + user slot */}
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="hidden sm:inline-flex items-center text-sm font-medium text-muted hover:text-fg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm"
              >
                View public site
                <svg
                  aria-hidden="true"
                  className="ml-1 h-3.5 w-3.5"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.636 3.5a.5.5 0 00-.5-.5H1.5A1.5 1.5 0 000 4.5v10A1.5 1.5 0 001.5 16h10a1.5 1.5 0 001.5-1.5V7.864a.5.5 0 00-1 0V14.5a.5.5 0 01-.5.5h-10a.5.5 0 01-.5-.5v-10a.5.5 0 01.5-.5h6.636a.5.5 0 00.5-.5z"
                    clipRule="evenodd"
                  />
                  <path
                    fillRule="evenodd"
                    d="M16 .5a.5.5 0 00-.5-.5h-5a.5.5 0 000 1h3.793L6.146 9.146a.5.5 0 10.708.708L15 1.707V5.5a.5.5 0 001 0v-5z"
                    clipRule="evenodd"
                  />
                </svg>
              </Link>
              <AdminTopBarUserSlot />
            </div>
          </div>
        </header>

        {/* ── Body: sidebar + main ─────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left sidebar — visible on md+; stacked above main on mobile */}
          <aside
            aria-label="Admin sidebar"
            className="w-full md:w-56 lg:w-64 shrink-0 bg-surface border-b md:border-b-0 md:border-r border-border"
          >
            <AdminSidebar />
          </aside>

          {/* Content region */}
          <main
            id="main-content"
            className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8"
          >
            {children}
          </main>
        </div>
      </div>
    </RequireRole>
  );
}
