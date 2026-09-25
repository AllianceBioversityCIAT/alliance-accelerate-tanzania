// @sdd-spec admin/user-management (T-9)
/**
 * Unit tests for EditUserDialog — the email-change confirmation step.
 *
 * Covers:
 *   - Submitting a CHANGED email shows the confirmation step (large address)
 *     and does NOT call updateUser yet.
 *   - Submitting an UNCHANGED email (only `enabled` edited) skips the
 *     confirmation step and calls updateUser directly.
 *   - Cancelling the confirmation step (Back) never calls updateUser.
 *   - Confirming calls updateUser with the confirmed address.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRouterPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

const mockUpdateUser = jest.fn();
jest.mock('@/lib/api/users', () => ({
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
}));

jest.mock('@/lib/api/client', () => {
  class AuthFailureError extends Error {
    readonly status = 401;
    constructor(msg = 'Session expired') {
      super(msg);
      this.name = 'AuthFailureError';
    }
  }
  return { AuthFailureError };
});

import { EditUserDialog } from './EditUserDialog';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOKEN = 'test-access-token';

const USER = {
  id:        'u-1',
  email:     'old@example.com',
  status:    'CONFIRMED',
  enabled:   true,
  roles:     ['staff'] as ('admin' | 'staff')[],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function setup(overrides: Partial<React.ComponentProps<typeof EditUserDialog>> = {}) {
  const onSuccess = jest.fn();
  const onCancel  = jest.fn();
  render(
    <EditUserDialog
      open
      user={USER}
      token={TOKEN}
      onSuccess={onSuccess}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onSuccess, onCancel };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateUser.mockResolvedValue({ ...USER, email: 'new@example.com' });
});

/** Types a new email value into the form and submits it. */
function fillEmailAndSubmit(email: string): void {
  fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole('button', { name: /^save changes$/i }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EditUserDialog — email-change confirmation', () => {
  it('shows the confirmation step with the new address, and does NOT save yet', async () => {
    const { onSuccess } = setup();

    fillEmailAndSubmit('new@example.com');

    await waitFor(() =>
      expect(screen.getByText(/confirm new email address/i)).toBeInTheDocument(),
    );
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('skips confirmation when the email is unchanged — saves directly', async () => {
    const { onSuccess } = setup();

    // Only toggle `enabled`; email stays the same as USER.email.
    fireEvent.click(screen.getByRole('checkbox', { name: /account enabled/i }));
    fireEvent.click(screen.getByRole('button', { name: /^save changes$/i }));

    expect(screen.queryByText(/confirm new email address/i)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mockUpdateUser).toHaveBeenCalledWith(
        USER.id,
        { email: USER.email, enabled: false },
        TOKEN,
      ),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('Back returns to the form and never calls updateUser', async () => {
    setup();

    fillEmailAndSubmit('new@example.com');

    await waitFor(() =>
      expect(screen.getByText(/confirm new email address/i)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));

    expect(screen.getByRole('heading', { name: /^edit user$/i })).toBeInTheDocument();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('Confirm and save calls updateUser with the confirmed address', async () => {
    const { onSuccess } = setup();

    fillEmailAndSubmit('new@example.com');

    await waitFor(() =>
      expect(screen.getByText(/confirm new email address/i)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /^confirm and save$/i }));

    await waitFor(() =>
      expect(mockUpdateUser).toHaveBeenCalledWith(
        USER.id,
        { email: 'new@example.com', enabled: true },
        TOKEN,
      ),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });
});
