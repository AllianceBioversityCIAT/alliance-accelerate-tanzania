// @sdd-spec admin/user-management (T-10)
/**
 * Unit tests for the (admin) layout — AdminLayout + RequireRole guard.
 *
 * Verifies:
 *   - Non-Admin roles (Public / Staff / unauthenticated) are redirected to /login
 *     and admin shell content is NOT rendered.
 *   - An Admin session sees the shell (sidebar nav + main region).
 *   - While the session is still loading no redirect fires (NFR-7).
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------

const mockRouterReplace = jest.fn();
const mockRouterPush    = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter:   () => ({ replace: mockRouterReplace, push: mockRouterPush }),
  usePathname: () => '/admin/users',
}));

// ---------------------------------------------------------------------------
// Mock next/image — layout renders an <Image> (brand logo)
// ---------------------------------------------------------------------------

jest.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  __esModule: true,
  default: ({ alt, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img alt={alt} {...rest} />
  ),
}));

// ---------------------------------------------------------------------------
// Mock useSession and useAuth (consumed by AdminTopBarUserSlot)
// ---------------------------------------------------------------------------

const mockUseSession = jest.fn();
const mockSignOut    = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/auth/useSession', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ signOut: mockSignOut, signIn: jest.fn(), refresh: jest.fn(), loading: false }),
}));

// ---------------------------------------------------------------------------
// Mock SessionProvider context — RequireRole reads useSessionContext()
// ---------------------------------------------------------------------------

import { SessionContext } from '@/lib/auth/SessionProvider';
import type { SessionContextValue } from '@/lib/auth/SessionProvider';
import type { Session } from '@/lib/auth/useSession';

const PUBLIC_SESSION: Session = { role: 'Public', user: null };
const STAFF_SESSION:  Session = { role: 'Staff',  user: { name: 'Bob', role: 'Staff' } };
const ADMIN_SESSION:  Session = { role: 'Admin',  user: { name: 'Alice', role: 'Admin' } };

function renderWithSession(
  ui: React.ReactElement,
  session: Session,
  loading = false,
) {
  const value: SessionContextValue = {
    session,
    loading,
    signIn:  async () => ({ status: 'error', message: '' }),
    signOut: async () => {},
    refresh: async () => {},
  };
  return render(
    <SessionContext.Provider value={value}>{ui}</SessionContext.Provider>,
  );
}

// ---------------------------------------------------------------------------
// Import component under test (after all mocks)
// ---------------------------------------------------------------------------

import AdminLayout from './layout';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderAdminLayout(session: Session, loading = false) {
  mockUseSession.mockReturnValue(session);
  return renderWithSession(
    <AdminLayout>
      <div data-testid="admin-children">Admin page content</div>
    </AdminLayout>,
    session,
    loading,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AdminLayout — role guard (RequireRole allow=[Admin])', () => {
  // ── Public (unauthenticated) ────────────────────────────────────────────────

  it('redirects a Public (unauthenticated) visitor to /login', async () => {
    renderAdminLayout(PUBLIC_SESSION);

    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenCalledWith('/login'),
    );
  });

  it('does not render admin children when role is Public', () => {
    renderAdminLayout(PUBLIC_SESSION);

    expect(screen.queryByTestId('admin-children')).not.toBeInTheDocument();
  });

  // ── Staff ──────────────────────────────────────────────────────────────────

  it('redirects a Staff user to /login (Staff is not Admin)', async () => {
    renderAdminLayout(STAFF_SESSION);

    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenCalledWith('/login'),
    );
  });

  it('does not render admin children when role is Staff', () => {
    renderAdminLayout(STAFF_SESSION);

    expect(screen.queryByTestId('admin-children')).not.toBeInTheDocument();
  });

  // ── Admin ──────────────────────────────────────────────────────────────────

  it('renders admin children when role is Admin', () => {
    renderAdminLayout(ADMIN_SESSION);

    expect(screen.getByTestId('admin-children')).toBeInTheDocument();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('renders the admin sidebar navigation when role is Admin', () => {
    renderAdminLayout(ADMIN_SESSION);

    expect(screen.getByRole('navigation', { name: /admin navigation/i })).toBeInTheDocument();
  });

  it('renders the main content region when role is Admin', () => {
    renderAdminLayout(ADMIN_SESSION);

    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('does not redirect when role is Admin', async () => {
    renderAdminLayout(ADMIN_SESSION);

    // Give any async redirect a chance to fire
    await new Promise((r) => setTimeout(r, 50));
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  // ── Shell chrome: brand link + mobile menu toggle ─────────────────────────

  it('brand mark links to /admin/actors (there is no /admin index page)', () => {
    renderAdminLayout(ADMIN_SESSION);

    const brand = screen.getByRole('link', {
      name: /accelerate tanzania — admin console/i,
    });
    expect(brand).toHaveAttribute('href', '/admin/actors');
  });

  it('renders the mobile menu toggle collapsed and expands it on click', () => {
    renderAdminLayout(ADMIN_SESSION);

    const toggle = screen.getByRole('button', { name: /open admin menu/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'admin-sidebar');

    fireEvent.click(toggle);

    const openToggle = screen.getByRole('button', { name: /close admin menu/i });
    expect(openToggle).toHaveAttribute('aria-expanded', 'true');
    // The sidebar container is the element the toggle controls.
    const aside = document.getElementById('admin-sidebar');
    expect(aside).not.toBeNull();
    expect(aside!.className).toContain('block');
    expect(aside!.className).not.toMatch(/(?:^|\s)hidden(?:\s|$)/);
  });

  it('the expanded mobile menu offers a "View public site" link', () => {
    renderAdminLayout(ADMIN_SESSION);

    fireEvent.click(screen.getByRole('button', { name: /open admin menu/i }));

    const aside = document.getElementById('admin-sidebar');
    const links = Array.from(aside!.querySelectorAll('a')).map((a) => ({
      text: a.textContent,
      href: a.getAttribute('href'),
    }));
    expect(links).toContainEqual(
      expect.objectContaining({ href: '/' }),
    );
  });

  // ── Loading — no premature redirect (NFR-7) ────────────────────────────────

  it('renders nothing and does not redirect while session is loading', () => {
    renderAdminLayout(PUBLIC_SESSION, /* loading= */ true);

    expect(screen.queryByTestId('admin-children')).not.toBeInTheDocument();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
