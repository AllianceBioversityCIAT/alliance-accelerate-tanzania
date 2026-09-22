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
// Arrange helpers (no assertions live here — every expect() stays in its
// own test body below).
// ---------------------------------------------------------------------------

/**
 * Stubs `createUser`'s resolved value. `emailSent` has NO default and is
 * REQUIRED (a plain positional argument, not an options object with a
 * fallback) — a fixture that silently defaulted it could render the
 * not-sent branch while a test's name and assertions say "sent", and the
 * suite would stay green. The branch each test drives must stay visible
 * at its call site, e.g. `mockCreateUserResolves('Tmp!Handoff-3', false)`.
 */
function mockCreateUserResolves(temporaryPassword: string, emailSent: boolean): void {
  mockCreateUser.mockResolvedValue({ user: NEW_USER, temporaryPassword, emailSent });
}

/** Types the email into the form and submits it — the identical arrange
 * sequence every test below drives before its own distinctive assertions. */
function fillEmailAndSubmit(email: string): void {
  fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole('button', { name: /^create user$/i }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateUserDialog — temp-password handoff', () => {
  it('calls createUser and then shows the one-time temporary password (email sent branch)', async () => {
    mockCreateUserResolves('Tmp!Handoff-1', true);
    const { onSuccess } = setup();

    fillEmailAndSubmit('new@example.com');

    await waitFor(() =>
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com' }),
        TOKEN,
      ),
    );

    // Handoff view shows the temp password + the persistent note; onSuccess not called yet.
    await waitFor(() =>
      expect(screen.getByText('Tmp!Handoff-1')).toBeInTheDocument(),
    );
    expect(screen.getByText(/shown only once/i)).toBeInTheDocument();
    // FR-3 sent scenario: states the invitation was emailed.
    expect(screen.getByText(/was sent to the user/i)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('fires onSuccess when Done is clicked in the handoff view (email sent branch)', async () => {
    mockCreateUserResolves('Tmp!Handoff-2', true);
    const { onSuccess } = setup();

    fillEmailAndSubmit('new@example.com');

    await waitFor(() =>
      expect(screen.getByText('Tmp!Handoff-2')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('still shows the temporary password when the invite email failed to send (email NOT sent branch)', async () => {
    mockCreateUserResolves('Tmp!Handoff-3', false);
    const { onSuccess } = setup();

    fillEmailAndSubmit('new@example.com');

    await waitFor(() =>
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com' }),
        TOKEN,
      ),
    );

    // FR-2: the password is shown even though the email was not sent.
    await waitFor(() =>
      expect(screen.getByText('Tmp!Handoff-3')).toBeInTheDocument(),
    );
    // FR-3 not-sent scenario: states the failure and the direct-share instruction.
    expect(screen.getByText(/could not be sent/i)).toBeInTheDocument();
    expect(screen.getByText(/share this password with the user directly/i)).toBeInTheDocument();
    // FR-3's negative clause: must not read as a failure to create the user.
    expect(screen.queryByText(/failed to create/i)).not.toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
