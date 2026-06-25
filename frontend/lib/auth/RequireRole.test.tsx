/**
 * Unit tests for RequireRole — auth-wiring spec, design.md §5, T-6.
 *
 * Covers:
 *   - Allowed role → renders children (Staff satisfies allow:['Staff'])
 *   - Public/disallowed role → calls router.replace('/login'), no children
 *   - Admin satisfies allow:['Staff'] (Admin ≥ Staff — FR-6)
 *   - loading=true → renders nothing, no redirect (no premature redirect — NFR-7)
 *   - Custom redirectTo is forwarded to router.replace
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock next/navigation before any imports that pull it in
// ---------------------------------------------------------------------------

const mockRouterReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}));

// ---------------------------------------------------------------------------
// Mock SessionProvider so we can control session + loading state
// ---------------------------------------------------------------------------

import { SessionContext } from './SessionProvider';
import type { SessionContextValue } from './SessionProvider';
import type { Session } from './useSession';

const PUBLIC_SESSION:  Session = { role: 'Public',  user: null };
const STAFF_SESSION:   Session = { role: 'Staff',   user: { name: 'Bob',   role: 'Staff' } };
const ADMIN_SESSION:   Session = { role: 'Admin',   user: { name: 'Alice', role: 'Admin' } };

/** Wraps children in a SessionContext with a controllable value. */
function renderWithSession(
  ui: React.ReactElement,
  contextValue: Partial<SessionContextValue> = {},
) {
  const value: SessionContextValue = {
    session: PUBLIC_SESSION,
    loading:  false,
    signIn:   async () => ({ status: 'error', message: 'not mounted' }),
    signOut:  async () => {},
    refresh:  async () => {},
    ...contextValue,
  };

  return render(
    <SessionContext.Provider value={value}>{ui}</SessionContext.Provider>,
  );
}

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------

import { RequireRole } from './RequireRole';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RequireRole', () => {
  // ── Allowed ────────────────────────────────────────────────────────────────

  it('renders children when role is Staff and allow includes Staff', () => {
    renderWithSession(
      <RequireRole allow={['Staff']}>
        <span>protected content</span>
      </RequireRole>,
      { session: STAFF_SESSION },
    );

    expect(screen.getByText('protected content')).toBeInTheDocument();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('renders children when role is Admin and allow includes Admin', () => {
    renderWithSession(
      <RequireRole allow={['Admin']}>
        <span>admin content</span>
      </RequireRole>,
      { session: ADMIN_SESSION },
    );

    expect(screen.getByText('admin content')).toBeInTheDocument();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  // ── Admin ≥ Staff (FR-6) ───────────────────────────────────────────────────

  it('renders children when role is Admin and allow is [Staff] (Admin ≥ Staff)', () => {
    renderWithSession(
      <RequireRole allow={['Staff']}>
        <span>staff-or-admin content</span>
      </RequireRole>,
      { session: ADMIN_SESSION },
    );

    expect(screen.getByText('staff-or-admin content')).toBeInTheDocument();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  // ── Disallowed ─────────────────────────────────────────────────────────────

  it('does not render children and redirects to /login when role is Public', async () => {
    renderWithSession(
      <RequireRole allow={['Staff', 'Admin']}>
        <span>secret</span>
      </RequireRole>,
      { session: PUBLIC_SESSION },
    );

    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/login'));
  });

  it('does not render children and redirects to /login when role is Staff but allow is [Admin]', async () => {
    renderWithSession(
      <RequireRole allow={['Admin']}>
        <span>admin only</span>
      </RequireRole>,
      { session: STAFF_SESSION },
    );

    expect(screen.queryByText('admin only')).not.toBeInTheDocument();
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/login'));
  });

  // ── Custom redirectTo ──────────────────────────────────────────────────────

  it('redirects to the custom redirectTo when provided and role is denied', async () => {
    renderWithSession(
      <RequireRole allow={['Admin']} redirectTo="/unauthorized">
        <span>nope</span>
      </RequireRole>,
      { session: PUBLIC_SESSION },
    );

    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenCalledWith('/unauthorized'),
    );
  });

  // ── Loading state — no premature redirect (NFR-7) ─────────────────────────

  it('renders nothing and does not redirect while loading is true', () => {
    const { container } = renderWithSession(
      <RequireRole allow={['Staff']}>
        <span>loading guard</span>
      </RequireRole>,
      { session: PUBLIC_SESSION, loading: true },
    );

    // No children and no redirect while session is still resolving
    expect(screen.queryByText('loading guard')).not.toBeInTheDocument();
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(container.firstChild).toBeNull();
  });
});
