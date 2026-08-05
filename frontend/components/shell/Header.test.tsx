/**
 * Unit tests for Header — T-5
 *
 * Covers (FR-3 sign-out, FR-4 header UX, NFR-4 a11y):
 *   - Public: renders "Staff sign-in" link to /login
 *   - Authenticated (Staff): renders the user's name, role chip, and sign-out button
 *   - Authenticated (Admin): renders the user's name, Admin role chip, and sign-out button
 *   - Sign-out button invokes useAuth().signOut()
 *   - Existing nav links are preserved for both roles
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock next/navigation (usePathname) — needed by NavLink + MobileNavLink
// ---------------------------------------------------------------------------

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

// ---------------------------------------------------------------------------
// Mock useSession and useAuth before importing Header
// ---------------------------------------------------------------------------

const mockUseSession = jest.fn();
const mockSignOut    = jest.fn();

jest.mock('@/lib/auth/useSession', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ signOut: mockSignOut, signIn: jest.fn(), refresh: jest.fn(), loading: false }),
}));

// ---------------------------------------------------------------------------
// Import subject under test (after mocks)
// ---------------------------------------------------------------------------

import Header from './Header';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function publicSession() {
  return { role: 'Public' as const, user: null };
}

function staffSession() {
  return { role: 'Staff' as const, user: { name: 'Alice Mwangi', role: 'Staff' as const } };
}

function adminSession() {
  return { role: 'Admin' as const, user: { name: 'Bob Kariuki', role: 'Admin' as const } };
}

function renderHeader() {
  return render(<Header />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Header — Public (unauthenticated)', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue(publicSession());
    mockSignOut.mockClear();
  });

  it('renders a "Staff sign-in" link pointing to /login', () => {
    renderHeader();

    const link = screen.getByRole('link', { name: /staff sign-in/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/login');
  });

  it('does NOT render a sign-out button for Public', () => {
    renderHeader();

    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });

  it('preserves the brand name and primary nav links', () => {
    renderHeader();

    // Brand accessible label
    expect(screen.getByRole('link', { name: /accelerate tanzania seed registry/i })).toBeInTheDocument();

    // Primary nav links (rendered at least once — desktop nav)
    expect(screen.getAllByRole('link', { name: /home/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: /discovery map/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: /directory/i }).length).toBeGreaterThanOrEqual(1);
    // T-15: Dashboard link present in nav (desktop + mobile)
    const dashboardLinks = screen.getAllByRole('link', { name: /^dashboard$/i });
    expect(dashboardLinks.length).toBeGreaterThanOrEqual(1);
    expect(dashboardLinks[0]).toHaveAttribute('href', '/dashboard');
    // FR-9: About link present in nav (desktop + mobile = 2 occurrences)
    const aboutLinks = screen.getAllByRole('link', { name: /^about$/i });
    expect(aboutLinks.length).toBeGreaterThanOrEqual(1);
    expect(aboutLinks[0]).toHaveAttribute('href', '/about');
  });
});

describe('Header — authenticated (Staff)', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue(staffSession());
    mockSignOut.mockClear();
  });

  it('renders the user\'s name', () => {
    renderHeader();

    // The name is visible (hidden on small screens via CSS but in the DOM)
    // Appears in both the desktop auth slot and the mobile menu auth block.
    expect(screen.getAllByText('Alice Mwangi')[0]).toBeInTheDocument();
  });

  it('renders a role chip showing "Staff"', () => {
    renderHeader();

    expect(screen.getAllByText('Staff')[0]).toBeInTheDocument();
  });

  it('renders a sign-out item inside the account menu', () => {
    renderHeader();

    // Sign-out now lives in the account dropdown (opened via the avatar button).
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
  });

  it('calls signOut when the sign-out item is clicked', () => {
    mockSignOut.mockResolvedValue(undefined);
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('does NOT render a "Staff sign-in" link when authenticated', () => {
    renderHeader();

    expect(screen.queryByText(/staff sign-in/i)).not.toBeInTheDocument();
  });

  it('preserves primary nav links when authenticated', () => {
    renderHeader();

    expect(screen.getAllByRole('link', { name: /home/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: /directory/i }).length).toBeGreaterThanOrEqual(1);
    // T-15: Dashboard link present for authenticated users too
    const dashboardLinks = screen.getAllByRole('link', { name: /^dashboard$/i });
    expect(dashboardLinks.length).toBeGreaterThanOrEqual(1);
    expect(dashboardLinks[0]).toHaveAttribute('href', '/dashboard');
    // FR-9: About link present for authenticated users too
    const aboutLinks = screen.getAllByRole('link', { name: /^about$/i });
    expect(aboutLinks.length).toBeGreaterThanOrEqual(1);
    expect(aboutLinks[0]).toHaveAttribute('href', '/about');
  });
});

describe('Header — Register entry (T-15, FR-1 "Nav entry" scenario)', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue(publicSession());
  });

  it('links to /register with an accessible name that reads as an action', () => {
    renderHeader();

    // Testing-Library-assertable half of the scenario's clause: the
    // accessible NAME. Whether it visually "reads as an action, not a
    // destination alone" is a human check at the HITL pause (DC-16) — not
    // recorded as covered here.
    const links = screen.getAllByRole('link', { name: /register your organisation/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    links.forEach((link) => expect(link).toHaveAttribute('href', '/register'));
  });

  it('renders with the primary variant, visually distinct from the default nav-link treatment', () => {
    renderHeader();

    const [desktopLink] = screen.getAllByRole('link', { name: /register your organisation/i });
    // Primary-variant styling (solid token background) — distinct from the
    // plain-text treatment every other nav entry keeps.
    expect(desktopLink.className).toContain('bg-primary');
    expect(desktopLink.className).toContain('text-primary-fg');
  });

  it('carries a visible-focus-ring class (jsdom cannot render focus visibility itself — DC-16)', () => {
    renderHeader();

    const [desktopLink] = screen.getAllByRole('link', { name: /register your organisation/i });
    expect(desktopLink.className).toContain('focus-visible:ring-2');
    expect(desktopLink.className).toContain('focus-visible:ring-primary');
  });

  it('gives the mobile primary variant a focus ring colour that differs from its own bg-primary fill (regression: an inset ring of the same colour as the fill has 1:1 contrast and is invisible)', () => {
    renderHeader();

    // The mobile panel is `hidden={!menuOpen}` until the hamburger is
    // opened — RTL's role queries exclude `hidden` elements by default, so
    // the mobile occurrence is absent from getAllByRole until this click.
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }));

    // [0] = desktop NavLink, [1] = mobile MobileNavLink — the desktop
    // branch uses an offset ring against the surface-coloured header and is
    // correct; this assertion targets the mobile occurrence specifically,
    // which the two tests above do not exercise.
    const [, mobileLink] = screen.getAllByRole('link', { name: /register your organisation/i });
    const classes = mobileLink.className.split(/\s+/);

    expect(classes).toContain('bg-primary');
    // Exact-token comparison: 'focus-visible:ring-primary-fg' contains
    // 'focus-visible:ring-primary' as a text substring, so a substring
    // check here would pass even if the bug were reintroduced.
    expect(classes).not.toContain('focus-visible:ring-primary');
    expect(classes).toContain('focus-visible:ring-primary-fg');
  });

  it('is keyboard reachable as an ordinary tab stop (no tabIndex removal, not disabled)', () => {
    renderHeader();

    const [desktopLink] = screen.getAllByRole('link', { name: /register your organisation/i });
    expect(desktopLink).not.toHaveAttribute('tabindex', '-1');
    expect(desktopLink).not.toHaveAttribute('aria-disabled');
  });

  it('leaves every pre-existing nav entry rendering with the unchanged default treatment', () => {
    renderHeader();

    // Regression for the additive-prop constraint: existing entries must
    // render unchanged. A default-variant link never carries the
    // primary-variant's solid background class.
    for (const name of [/^home$/i, /discovery map/i, /^dashboard$/i, /directory/i, /^about$/i]) {
      const [link] = screen.getAllByRole('link', { name });
      expect(link.className).not.toContain('bg-primary');
      expect(link.className).not.toContain('text-primary-fg');
    }
  });

  it('is absent from the admin sidebar, which is a different mode (DD-5) and a different component', () => {
    // AdminSidebar.tsx is a structurally separate component with its own
    // NAV_ITEMS — the admin shell layout renders <AdminSidebar>, never
    // <Header>. Rendering it directly proves the Register action cannot
    // appear there, without touching AdminSidebar.tsx itself.
    render(<AdminSidebar />);

    expect(screen.queryByRole('link', { name: /register your organisation/i })).not.toBeInTheDocument();
    // The two enabled admin entries stay exactly as they were.
    expect(screen.getByRole('link', { name: /^users$/i })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('link', { name: /^actors$/i })).toHaveAttribute('href', '/admin/actors');
  });
});

describe('Header — authenticated (Admin)', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue(adminSession());
    mockSignOut.mockClear();
  });

  it('renders the Admin user\'s name', () => {
    renderHeader();

    expect(screen.getAllByText('Bob Kariuki')[0]).toBeInTheDocument();
  });

  it('renders a role chip showing "Admin"', () => {
    renderHeader();

    expect(screen.getAllByText('Admin')[0]).toBeInTheDocument();
  });

  it('renders a sign-out item inside the account menu for Admin', () => {
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
  });

  it('exposes the Admin console link inside the account menu', () => {
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    const adminLink = screen.getByRole('menuitem', { name: /admin console/i });
    expect(adminLink).toHaveAttribute('href', '/admin/users');
  });
});
