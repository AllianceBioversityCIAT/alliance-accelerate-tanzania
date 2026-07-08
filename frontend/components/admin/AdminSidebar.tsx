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
  { label: 'Import',  href: '/admin/import', enabled: false },
  { label: 'Export',  href: '/admin/export', enabled: false },
];

// ---------------------------------------------------------------------------
// AdminSidebar
// ---------------------------------------------------------------------------

/**
 * AdminSidebar — persistent left navigation for the admin shell.
 *
 * Active item: marked with aria-current="page" based on the current route.
 * Enabled items: Users, Actors.
 * Disabled items: Import, Export — rendered as non-interactive spans with
 * aria-disabled="true" and a "soon" badge so they seed future modules without
 * creating dead links.
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
