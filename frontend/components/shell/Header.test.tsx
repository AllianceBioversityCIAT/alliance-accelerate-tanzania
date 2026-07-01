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
