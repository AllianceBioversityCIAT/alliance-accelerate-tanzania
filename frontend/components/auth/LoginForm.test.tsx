/**
 * Unit tests for LoginForm — T-4
 *
 * Covers (requirements.md FR-1, NFR-4, NFR-7; design.md §5):
 *   (a) successful sign-in: signIn called + router navigates to '/'
 *   (b) successful sign-in with ?redirect param: router navigates to param
 *   (c) invalid credentials: error message shown, no navigation
 *   (d) NEW_PASSWORD_REQUIRED challenge: new-password field appears
 *   (e) confirmNewPassword called on step-2 submit, success routes onward
 *   (f) confirmNewPassword failure shows error, no navigation
 *
 * Mocking style mirrors DirectoryView.test.tsx (module-level jest.mock) and
 * auth.test.tsx (aws-amplify mocks). next/navigation router mock mirrors
 * DirectoryView.test.tsx useRouter pattern. Input interaction uses RTL
 * fireEvent.change (no userEvent dependency, mirrors existing test suite).
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Module mocks — declared before any imports that pull them in
// ---------------------------------------------------------------------------

// Mock auth-client at the module level so tests control signIn + confirmNewPassword.
jest.mock('@/lib/auth/auth-client', () => ({
  signIn:             jest.fn(),
  confirmNewPassword: jest.fn(),
}));

// Mock next/navigation so LoginForm can useRouter and useSearchParams safely
// in a jsdom environment (same pattern as DirectoryView.test.tsx).
const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter:       jest.fn(() => ({ push: mockPush })),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import LoginForm from './LoginForm';

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
// Helpers
// ---------------------------------------------------------------------------

function renderForm() {
  return render(<LoginForm />);
}

/** Fills the credential step inputs and clicks Sign in. */
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
    mockPush.mockClear();
    // Default: empty URLSearchParams → redirect goes to '/'.
    useSearchParams.mockReturnValue(new URLSearchParams());
  });

  // ── (a) Successful sign-in routes to '/' ────────────────────────────────────

  it('calls signIn with email+password and routes to "/" on success', async () => {
    signIn.mockResolvedValueOnce({ status: 'authenticated' });

    renderForm();
    fillAndSubmitCredentials();

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith({
        username: 'staff@example.com',
        password: 'Password1!',
      });
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  // ── (b) Successful sign-in honours ?redirect ────────────────────────────────

  it('routes to the ?redirect query param on success', async () => {
    signIn.mockResolvedValueOnce({ status: 'authenticated' });
    useSearchParams.mockReturnValue(new URLSearchParams('redirect=/map'));

    renderForm();
    fillAndSubmitCredentials();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/map');
    });
  });

  // ── (c) Invalid credentials — error shown, no navigation ────────────────────

  it('displays the error message inside the alert region and does not navigate', async () => {
    signIn.mockResolvedValueOnce({
      status:  'error',
      message: 'Incorrect username or password.',
    });

    renderForm();
    fillAndSubmitCredentials();

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/incorrect username or password/i);
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── (d) NEW_PASSWORD_REQUIRED — new-password field appears ──────────────────

  it('shows the new-password field when signIn returns new_password_required', async () => {
    signIn.mockResolvedValueOnce({ status: 'new_password_required' });

    renderForm();
    fillAndSubmitCredentials();

    await waitFor(() => {
      expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
    });

    // The original email/password step should no longer be visible.
    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
  });

  it('shows the challenge heading when the new-password step is active', async () => {
    signIn.mockResolvedValueOnce({ status: 'new_password_required' });

    renderForm();
    fillAndSubmitCredentials();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /set your new password/i })
      ).toBeInTheDocument();
    });
  });

  // ── (e) confirmNewPassword called on step-2 submit, success routes ───────────

  it('calls confirmNewPassword and routes onward after setting a new password', async () => {
    signIn.mockResolvedValueOnce({ status: 'new_password_required' });
    confirmNewPassword.mockResolvedValueOnce({ status: 'authenticated' });

    renderForm();

    // Step 1 — trigger the challenge
    fillAndSubmitCredentials();

    await waitFor(() =>
      expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
    );

    // Step 2 — fill the new-password field and submit
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'NewPassword1!' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /set password and sign in/i })
    );

    await waitFor(() => {
      expect(confirmNewPassword).toHaveBeenCalledWith('NewPassword1!');
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  // ── (f) confirmNewPassword failure — error shown, no navigation ──────────────

  it('shows the error message when confirmNewPassword fails and does not navigate', async () => {
    signIn.mockResolvedValueOnce({ status: 'new_password_required' });
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
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/password does not meet requirements/i);
    });

    expect(mockPush).not.toHaveBeenCalled();
  });
});
