/**
 * Automated accessibility tests for auth surfaces — T-7, NFR-4.
 *
 * Uses jest-axe to assert WCAG 2.1 AA compliance against:
 *   (A) LoginForm — the /login page form component, both the credentials step
 *       and the new-password challenge step (FR-1, NFR-4).
 *   (B) Header — in both auth states: Public (sign-in link) and authenticated
 *       Staff/Admin (user menu + sign-out) (FR-4, NFR-4).
 *
 * Mocks:
 *   - @/lib/auth/auth-client   — signIn / confirmNewPassword (same as LoginForm.test.tsx)
 *   - next/navigation           — useRouter + useSearchParams (LoginForm) +
 *                                 usePathname (Header NavLink)
 *   - @/lib/auth/useSession     — Header AuthSlot session state
 *   - @/lib/auth/useAuth        — Header sign-out control
 *
 * Cases exercised:
 *   LoginForm — credentials step (axe + labeled controls + aria-live error region)
 *   LoginForm — new-password step (axe + labeled control)
 *   Header    — Public state (axe + sign-in link accessible name)
 *   Header    — authenticated Staff state (axe + accessible sign-out button name)
 * All must pass axe with toHaveNoViolations().
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

// Extend jest-dom expect with the jest-axe matcher.
expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Module mocks — declared before any imports that pull them in
// ---------------------------------------------------------------------------

// auth-client — controls signIn / confirmNewPassword for LoginForm tests.
jest.mock('@/lib/auth/auth-client', () => ({
  signIn:             jest.fn(),
  confirmNewPassword: jest.fn(),
}));

// next/navigation — useRouter + useSearchParams (LoginForm) + usePathname (Header).
const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter:       jest.fn(() => ({ push: mockPush })),
  useSearchParams: jest.fn(() => new URLSearchParams()),
  usePathname:     jest.fn(() => '/login'),
}));

// useSession — Header AuthSlot; overridden per describe block.
const mockUseSession = jest.fn();

jest.mock('@/lib/auth/useSession', () => ({
  useSession: () => mockUseSession(),
}));

// useAuth — Header sign-out control.
const mockSignOut = jest.fn();

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => {
    // LoginForm signs in via useAuth().signIn — delegate to the SAME auth-client
    // signIn mock the tests configure (so signIn.mockResolvedValueOnce applies).
    /* eslint-disable */
    const { signIn } = require('@/lib/auth/auth-client') as { signIn: jest.Mock };
    /* eslint-enable */
    return { signOut: mockSignOut, signIn, refresh: jest.fn(), loading: false };
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import LoginForm from './LoginForm';
import Header from '@/components/shell/Header';

/* eslint-disable */
const { signIn, confirmNewPassword } = require('@/lib/auth/auth-client') as {
  signIn:             jest.Mock;
  confirmNewPassword: jest.Mock;
};
const { useSearchParams } = require('next/navigation') as {
  useSearchParams: jest.Mock;
};
/* eslint-enable */

// ---------------------------------------------------------------------------
// Helpers — render wrappers
// ---------------------------------------------------------------------------

/** Render LoginForm inside a <main> landmark so axe can evaluate structure. */
function renderLoginForm() {
  return render(
    <main>
      <LoginForm />
    </main>
  );
}

/** Render Header in a minimal page shell with a <main> landmark. */
function renderHeader() {
  return render(
    <div>
      <Header />
      <main><p>Page content</p></main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Part A: LoginForm — axe accessibility
// ---------------------------------------------------------------------------

describe('LoginForm — axe accessibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    useSearchParams.mockReturnValue(new URLSearchParams());
    // Public session for LoginForm context (Header not rendered here)
    mockUseSession.mockReturnValue({ role: 'Public', user: null });
  });

  // ── Credentials step (default) ───────────────────────────────────────────

  it('has no axe violations on the credentials step (email + password)', async () => {
    const { container } = renderLoginForm();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  // ── New-password step (after new_password_required challenge) ────────────

  it('has no axe violations on the new-password step', async () => {
    signIn.mockResolvedValueOnce({ status: 'new_password_required' });

    const { container } = renderLoginForm();

    // Trigger the challenge to advance to step 2
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'staff@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'OldPass1!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// Part A: LoginForm — labeled controls, aria-live error region (NFR-4)
// ---------------------------------------------------------------------------

describe('LoginForm — labeled controls and accessible error region (NFR-4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSearchParams.mockReturnValue(new URLSearchParams());
    mockUseSession.mockReturnValue({ role: 'Public', user: null });
  });

  it('renders a labeled email input on the credentials step', () => {
    renderLoginForm();

    // <Label htmlFor="email"> wraps a visible label; Input id="email"
    const emailInput = screen.getByLabelText(/email address/i);
    expect(emailInput).toBeInTheDocument();
    expect(emailInput).toHaveAttribute('type', 'email');
  });

  it('renders a labeled password input on the credentials step', () => {
    renderLoginForm();

    const passwordInput = screen.getByLabelText(/^password/i);
    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('renders an aria-live="assertive" error region that is always present in the DOM', () => {
    renderLoginForm();

    // The error region is always rendered (empty until an error occurs) so
    // aria-live fires correctly when error text is injected (NFR-4 / WCAG 4.1.3).
    const alertRegion = screen.getByRole('alert');
    expect(alertRegion).toBeInTheDocument();
    expect(alertRegion).toHaveAttribute('aria-live', 'assertive');
    expect(alertRegion).toHaveAttribute('aria-atomic', 'true');
  });

  it('populates the aria-live error region with the error message on failure', async () => {
    signIn.mockResolvedValueOnce({
      status:  'error',
      message: 'Incorrect username or password.',
    });

    renderLoginForm();

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'staff@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'WrongPass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/incorrect username or password/i)
    );
  });

  it('renders a labeled new-password input on the challenge step', async () => {
    signIn.mockResolvedValueOnce({ status: 'new_password_required' });

    renderLoginForm();

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'staff@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'OldPass1!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
    );

    const newPassInput = screen.getByLabelText(/new password/i);
    expect(newPassInput).toHaveAttribute('type', 'password');
  });
});

// ---------------------------------------------------------------------------
// Part B: Header — axe accessibility (Public and authenticated states)
// ---------------------------------------------------------------------------

describe('Header — axe accessibility (Public state)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({ role: 'Public', user: null });
  });

  it('has no axe violations in the Public (unauthenticated) state', async () => {
    const { container } = renderHeader();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });
});

describe('Header — axe accessibility (authenticated state)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({
      role: 'Staff',
      user: { name: 'Alice Mwangi', role: 'Staff' as const },
    });
  });

  it('has no axe violations in the authenticated (Staff) state', async () => {
    const { container } = renderHeader();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// Part B: Header — accessible names for auth controls (NFR-4)
// ---------------------------------------------------------------------------

describe('Header — accessible auth control names (NFR-4)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders a "Staff sign-in" link with an accessible name in the Public state', () => {
    mockUseSession.mockReturnValue({ role: 'Public', user: null });
    renderHeader();

    // The sign-in link must be reachable by accessible name for SR users (FR-4 / NFR-4)
    const signInLink = screen.getByRole('link', { name: /staff sign-in/i });
    expect(signInLink).toBeInTheDocument();
    expect(signInLink).toHaveAttribute('href', '/login');
  });

  it('exposes a sign-out control with an accessible name in the authenticated state', () => {
    mockUseSession.mockReturnValue({
      role: 'Staff',
      user: { name: 'Alice Mwangi', role: 'Staff' as const },
    });
    renderHeader();

    // The account trigger is reachable by accessible name (FR-4/NFR-4); sign-out
    // lives in its dropdown as a menuitem reachable by accessible name (FR-3).
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
  });

  it('exposes a sign-out control with an accessible name for the Admin role', () => {
    mockUseSession.mockReturnValue({
      role: 'Admin',
      user: { name: 'Bob Kariuki', role: 'Admin' as const },
    });
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
  });
});
