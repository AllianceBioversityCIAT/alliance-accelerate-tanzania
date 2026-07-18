// @sdd-spec admin/user-management (T-9)
/**
 * Unit tests for CreateUserDialog — the temp-password handoff after create.
 *
 * Covers:
 *   - Submitting a valid form calls createUser(input, token).
 *   - On success the dialog switches to the CredentialHandoff view showing the
 *     one-time temporary password (onSuccess is NOT called yet).
 *   - Clicking Done fires onSuccess (parent refreshes the list).
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

const mockCreateUser = jest.fn();
jest.mock('@/lib/api/users', () => ({
  createUser: (...args: unknown[]) => mockCreateUser(...args),
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

import { CreateUserDialog } from './CreateUserDialog';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOKEN = 'test-access-token';

const NEW_USER = {
  id:        'u-new',
  email:     'new@example.com',
  status:    'FORCE_CHANGE_PASSWORD',
  enabled:   true,
  roles:     ['staff'] as ('admin' | 'staff')[],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function setup(overrides: Partial<React.ComponentProps<typeof CreateUserDialog>> = {}) {
  const onSuccess = jest.fn();
  const onCancel  = jest.fn();
  render(
    <CreateUserDialog
      open
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
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateUserDialog — temp-password handoff', () => {
  it('calls createUser and then shows the one-time temporary password', async () => {
    mockCreateUser.mockResolvedValue({ user: NEW_USER, temporaryPassword: 'Tmp!Handoff-1' });
    const { onSuccess } = setup();

    fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), {
      target: { value: 'new@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^create user$/i }));

    await waitFor(() =>
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com' }),
        TOKEN,
      ),
    );

    // Handoff view shows the temp password + warning; onSuccess not called yet.
    await waitFor(() =>
      expect(screen.getByText('Tmp!Handoff-1')).toBeInTheDocument(),
    );
    expect(screen.getByText(/shown only once/i)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('fires onSuccess when Done is clicked in the handoff view', async () => {
    mockCreateUser.mockResolvedValue({ user: NEW_USER, temporaryPassword: 'Tmp!Handoff-2' });
    const { onSuccess } = setup();

    fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), {
      target: { value: 'new@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^create user$/i }));

    await waitFor(() =>
      expect(screen.getByText('Tmp!Handoff-2')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
