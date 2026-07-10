// @sdd-spec admin/user-management (T-8)
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// ---------------------------------------------------------------------------
// Nav item shape
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  href: string;
  enabled: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Users',   href: '/admin/users',  enabled: true  },
  { label: 'Actors',  href: '/admin/actors', enabled: true  },
];

// ---------------------------------------------------------------------------
// AdminSidebar
// ---------------------------------------------------------------------------

/**
 * AdminSidebar — persistent left navigation for the admin shell.
 *
 * Active item: marked with aria-current="page" based on the current route.
 * Enabled items: Users, Actors. (The former Import/Export "soon" placeholders
 * were removed 2026-07-10 at the user's request: actor import shipped inside
 * the Actors console at /admin/actors/import, and export has no spec yet. The
 * disabled-item rendering branch below is kept for future placeholders.)
 *
 * Tokens only; no hardcoded colors/geometry.
 */
export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin navigation"
      className="flex flex-col gap-1 py-4 px-3"
    >
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.enabled &&
          (item.href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(item.href));

        if (!item.enabled) {
          return (
            <span
              key={item.label}
              role="link"
              aria-disabled="true"
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-muted cursor-not-allowed select-none opacity-50"
            >
              {item.label}
              <span
                aria-label="coming soon"
                className="ml-2 inline-flex items-center rounded-full bg-border px-2 py-0.5 text-xs text-muted"
              >
                soon
              </span>
            </span>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={[
              'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              isActive
                ? 'bg-primary-soft text-primary font-semibold'
                : 'text-muted hover:bg-border hover:text-fg',
            ].join(' ')}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
