/**
 * Unit tests for ForgotPasswordForm — T-2 (auth/self-service-password-reset)
 *
 * Covers (requirements.md FR-2, FR-3, FR-4, FR-5; design.md §5.2, §5.4):
 *   (a) request→submit: resetPassword → code_sent shows the neutral notice,
 *       advances to the submit step with email pre-filled + code/new-password fields
 *   (b) success: confirmResetPassword → done REPLACES to '/login?reset=success'
 *   (c) invalid/expired code: error shown in alert region, stays on submit step
 *   (d) weak password: error shown in alert region
 *   (e) aria-busy: submit button is aria-busy + disabled while in-flight
 *
 * Mocks: auth-client (resetPassword, confirmResetPassword), next/navigation.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Module mocks — declared before any imports that pull them in
// ---------------------------------------------------------------------------

const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ replace: mockReplace })),
}));

jest.mock('@/lib/auth/auth-client', () => ({
  resetPassword: jest.fn(),
  confirmResetPassword: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import ForgotPasswordForm from './ForgotPasswordForm';

/* eslint-disable */
const { resetPassword, confirmResetPassword } = require('@/lib/auth/auth-client') as {
  resetPassword: jest.Mock;
  confirmResetPassword: jest.Mock;
};
/* eslint-enable */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderForm() {
  return render(<ForgotPasswordForm />);
}

/** Fills the request-step email and submits → resolves resetPassword. */
function requestReset(email = 'staff@example.com') {
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole('button', { name: /send reset code/i }));
}

/** Advances to the submit step (assumes resetPassword resolves code_sent). */
async function advanceToSubmitStep(email = 'staff@example.com') {
  resetPassword.mockResolvedValueOnce({ status: 'code_sent' });
  requestReset(email);
  await waitFor(() =>
    expect(screen.getByLabelText(/reset code/i)).toBeInTheDocument()
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReplace.mockClear();
    resetPassword.mockReset();
    confirmResetPassword.mockReset();
  });

  // ── (a) request → submit ────────────────────────────────────────────────────

  it('shows the neutral notice and code/new-password fields with email pre-filled after code_sent', async () => {
    resetPassword.mockResolvedValueOnce({ status: 'code_sent' });

    renderForm();
    requestReset('staff@example.com');

    await waitFor(() => {
      expect(resetPassword).toHaveBeenCalledWith('staff@example.com');
    });

    // Neutral, enumeration-safe notice.
    expect(
      screen.getByText(/if an account exists, a reset code has been sent/i)
    ).toBeInTheDocument();

    // Submit-step fields render.
    expect(screen.getByLabelText(/reset code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();

    // Email pre-filled and editable (FR-4).
    const emailInput = screen.getByLabelText(/email address/i) as HTMLInputElement;
    expect(emailInput.value).toBe('staff@example.com');
    expect(emailInput).not.toBeDisabled();
  });

  it('surfaces an inline error and does not call resetPassword for an invalid email', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset code/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/valid email address/i);
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('shows the request error in the alert region and stays on the request step', async () => {
    resetPassword.mockResolvedValueOnce({
      status: 'error',
      message: 'Too many attempts. Please wait a few minutes and try again.',
    });

    renderForm();
    requestReset();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/too many attempts/i);
    });
    // Still on the request step — no reset-code field.
    expect(screen.queryByLabelText(/reset code/i)).not.toBeInTheDocument();
  });

  // ── (b) success → routes to /login?reset=success ────────────────────────────

  it('replaces to /login?reset=success when confirmResetPassword succeeds', async () => {
    renderForm();
    await advanceToSubmitStep('staff@example.com');

    confirmResetPassword.mockResolvedValueOnce({ status: 'done' });

    fireEvent.change(screen.getByLabelText(/reset code/i), {
      target: { value: '123456' },
    });
    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: 'NewPassword1!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

    await waitFor(() => {
      expect(confirmResetPassword).toHaveBeenCalledWith({
        username: 'staff@example.com',
        code: '123456',
        newPassword: 'NewPassword1!',
      });
      expect(mockReplace).toHaveBeenCalledWith('/login?reset=success');
    });
  });

  // ── (c) invalid / expired code — error shown, stays on submit step ──────────

  it('shows an expired-code error in the alert region and stays on the submit step', async () => {
    renderForm();
    await advanceToSubmitStep();

    confirmResetPassword.mockResolvedValueOnce({
      status: 'error',
      message: 'That code has expired. Request a new one and try again.',
    });

    fireEvent.change(screen.getByLabelText(/reset code/i), {
      target: { value: '000000' },
    });
    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: 'NewPassword1!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/that code has expired/i);
    });

    // Still on the submit step — the code field remains present.
    expect(screen.getByLabelText(/reset code/i)).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // ── (d) weak password — error shown ─────────────────────────────────────────

  it('shows a weak-password error in the alert region', async () => {
    renderForm();
    await advanceToSubmitStep();

    confirmResetPassword.mockResolvedValueOnce({
      status: 'error',
      message: "That password doesn't meet the requirements. Try a stronger one.",
    });

    fireEvent.change(screen.getByLabelText(/reset code/i), {
      target: { value: '123456' },
    });
    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: 'weak' },
    });
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/doesn't meet the requirements/i);
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // ── (e) aria-busy while a submit is in flight ───────────────────────────────

  it('marks the submit button aria-busy and disabled while confirmResetPassword is in flight', async () => {
    renderForm();
    await advanceToSubmitStep();

    // A pending promise that never resolves during the assertion window.
    let resolve!: (v: { status: 'done' }) => void;
    confirmResetPassword.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      })
    );

    fireEvent.change(screen.getByLabelText(/reset code/i), {
      target: { value: '123456' },
    });
    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: 'NewPassword1!' },
    });

    const button = screen.getByRole('button', { name: /set new password/i });
    fireEvent.click(button);

    await waitFor(() => {
      const busyButton = screen.getByRole('button', { name: /setting password/i });
      expect(busyButton).toHaveAttribute('aria-busy', 'true');
      expect(busyButton).toBeDisabled();
    });

    // Clean up the pending promise.
    resolve({ status: 'done' });
  });
});
