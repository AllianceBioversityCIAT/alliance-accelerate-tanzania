/**
 * Unit tests for LoginForm — T-4 + bugfix/auth-session-ui
 *
 * Covers (requirements.md FR-1, FR-2, FR-4, NFR-4, NFR-7; design.md §5):
 *   (a) successful sign-in: provider signIn called + router REPLACES to '/'
 *   (b) successful sign-in with ?redirect param: router replaces to param
 *   (c) invalid credentials: error message shown, no navigation
 *   (d) NEW_PASSWORD_REQUIRED challenge: new-password field appears
 *   (e) confirmNewPassword called on step-2 submit → refresh() then routes onward
 *   (f) confirmNewPassword failure shows error, no navigation
 *   (g) already-authenticated visitor is redirected away from /login (bugfix)
 *
 * LoginForm now signs in THROUGH the provider (useAuth) so the shared session
 * refreshes and the header reflects the logged-in state; useSession gates the
 * already-authenticated redirect. Mocks: useAuth, useSession, auth-client
 * (confirmNewPassword), next/navigation.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Module mocks — declared before any imports that pull them in
// ---------------------------------------------------------------------------

const mockReplace = jest.fn();
const mockSignIn  = jest.fn();
const mockRefresh = jest.fn();
let mockSession: { role: string; user: { name: string; role: string } | null } = {
  role: 'Public',
  user: null,
};
let mockLoading = false;

jest.mock('next/navigation', () => ({
  useRouter:       jest.fn(() => ({ replace: mockReplace })),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: jest.fn(() => ({
    signIn:  mockSignIn,
    signOut: jest.fn(),
    refresh: mockRefresh,
    loading: mockLoading,
  })),
}));

jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn(() => mockSession),
}));

// confirmNewPassword still runs directly against the auth-client.
jest.mock('@/lib/auth/auth-client', () => ({
  confirmNewPassword: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import LoginForm from './LoginForm';

/* eslint-disable */
const { confirmNewPassword } = require('@/lib/auth/auth-client') as {
  confirmNewPassword: jest.Mock;
};
const { useSearchParams } = require('next/navigation') as {
  useSearchParams: jest.Mock;
};
/* eslint-enable */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderForm() {
  return render(<LoginForm />);
}

function fillAndSubmitCredentials(
  email    = 'staff@example.com',
  password = 'Password1!'
) {
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(/^password/i), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoginForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReplace.mockClear();
    mockSignIn.mockReset();
    mockRefresh.mockReset().mockResolvedValue(undefined);
    mockSession = { role: 'Public', user: null };
    mockLoading = false;
    useSearchParams.mockReturnValue(new URLSearchParams());
  });

  // ── (a) Successful sign-in routes to '/' ────────────────────────────────────

  it('calls the provider signIn and REPLACES to "/" on success', async () => {
    mockSignIn.mockResolvedValueOnce({ status: 'authenticated' });

    renderForm();
    fillAndSubmitCredentials();

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith({
        username: 'staff@example.com',
        password: 'Password1!',
      });
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  // ── (b) Successful sign-in honours ?redirect ────────────────────────────────

  it('routes to the ?redirect query param on success', async () => {
    mockSignIn.mockResolvedValueOnce({ status: 'authenticated' });
    useSearchParams.mockReturnValue(new URLSearchParams('redirect=/map'));

    renderForm();
    fillAndSubmitCredentials();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/map');
    });
  });

  // ── (c) Invalid credentials — error shown, no navigation ────────────────────

  it('displays the error message inside the alert region and does not navigate', async () => {
    mockSignIn.mockResolvedValueOnce({
      status:  'error',
      message: 'Incorrect username or password.',
    });

    renderForm();
    fillAndSubmitCredentials();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/incorrect username or password/i);
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  // ── (d) NEW_PASSWORD_REQUIRED — new-password field appears ──────────────────

  it('shows the new-password field when signIn returns new_password_required', async () => {
    mockSignIn.mockResolvedValueOnce({ status: 'new_password_required' });

    renderForm();
    fillAndSubmitCredentials();

    await waitFor(() => {
      expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
    });

    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
  });

  it('shows the challenge heading when the new-password step is active', async () => {
    mockSignIn.mockResolvedValueOnce({ status: 'new_password_required' });

    renderForm();
    fillAndSubmitCredentials();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /set your new password/i })
      ).toBeInTheDocument();
    });
  });

  // ── (e) confirmNewPassword → refresh() then routes ──────────────────────────

  it('calls confirmNewPassword, refreshes the session, and routes onward', async () => {
    mockSignIn.mockResolvedValueOnce({ status: 'new_password_required' });
    confirmNewPassword.mockResolvedValueOnce({ status: 'authenticated' });

    renderForm();
    fillAndSubmitCredentials();

    await waitFor(() =>
      expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'NewPassword1!' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /set password and sign in/i })
    );

    await waitFor(() => {
      expect(confirmNewPassword).toHaveBeenCalledWith('NewPassword1!');
      expect(mockRefresh).toHaveBeenCalled();      // session refreshed → header updates
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  // ── (f) confirmNewPassword failure — error shown, no navigation ──────────────

  it('shows the error message when confirmNewPassword fails and does not navigate', async () => {
    mockSignIn.mockResolvedValueOnce({ status: 'new_password_required' });
    confirmNewPassword.mockResolvedValueOnce({
      status:  'error',
      message: 'Password does not meet requirements.',
    });

    renderForm();
    fillAndSubmitCredentials();

    await waitFor(() =>
      expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'weak' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /set password and sign in/i })
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/password does not meet requirements/i);
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  // ── (g) already-authenticated visitor redirected away (bugfix) ──────────────

  it('redirects an already-authenticated visitor away from /login', async () => {
    mockSession = { role: 'Admin', user: { name: 'j.cadavid@cgiar.org', role: 'Admin' } };
    mockLoading = false;

    renderForm();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    // signIn is never invoked — no "already signed in user" error path.
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('does not redirect while the session is still loading', async () => {
    mockSession = { role: 'Public', user: null };
    mockLoading = true;

    renderForm();

    // No premature redirect during the initial loading state.
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // ── (h) Forgot-password entry link on the credentials step (FR-1) ───────────

  it('renders a "Forgot password?" link to /forgot-password on the credentials step', () => {
    renderForm();

    const link = screen.getByRole('link', { name: /forgot password/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/forgot-password');
  });

  // ── (i) ?reset=success post-reset confirmation banner (FR-3) ────────────────

  it('shows the post-reset success banner when ?reset=success is present', () => {
    useSearchParams.mockReturnValue(new URLSearchParams('reset=success'));

    renderForm();

    expect(screen.getByText(/your password was reset/i)).toBeInTheDocument();
  });

  it('does not show the post-reset banner without the ?reset=success param', () => {
    renderForm();

    expect(screen.queryByText(/your password was reset/i)).not.toBeInTheDocument();
  });
});
