// @sdd-spec admin/user-management (T-10)
/**
 * Unit tests for /admin/users page (UsersPage).
 *
 * Covers:
 *   - loading → skeleton; populated state renders user rows
 *   - empty state when listUsers returns zero users
 *   - error banner when listUsers rejects
 *   - opening CreateUserDialog and submitting calls createUser
 *   - delete flow: opens ConfirmDialog, calls deleteUser on confirm
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------

const mockRouterPush    = jest.fn();
const mockRouterReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

// ---------------------------------------------------------------------------
// Mock next/image
// ---------------------------------------------------------------------------

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img alt={alt} {...rest} />
  ),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/auth/auth-client (getSession)
// ---------------------------------------------------------------------------

const mockGetSession = jest.fn();

jest.mock('@/lib/auth/auth-client', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/api/users
// ---------------------------------------------------------------------------

const mockListUsers   = jest.fn();
const mockCreateUser  = jest.fn();
const mockDeleteUser  = jest.fn();
const mockUpdateUser  = jest.fn();
const mockSetUserRole = jest.fn();
const mockResetPwd    = jest.fn();

jest.mock('@/lib/api/users', () => ({
  listUsers:         (...args: unknown[]) => mockListUsers(...args),
  createUser:        (...args: unknown[]) => mockCreateUser(...args),
  deleteUser:        (...args: unknown[]) => mockDeleteUser(...args),
  updateUser:        (...args: unknown[]) => mockUpdateUser(...args),
  setUserRole:       (...args: unknown[]) => mockSetUserRole(...args),
  resetUserPassword: (...args: unknown[]) => mockResetPwd(...args),
}));

// ---------------------------------------------------------------------------
// Mock AuthFailureError (keep real class behaviour for instanceof checks)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Import page under test (after all mocks)
// ---------------------------------------------------------------------------

import UsersPage from './page';
import { AuthFailureError } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOKEN = 'test-access-token';

const FAKE_SESSION = {
  role:        'Admin' as const,
  user:        { name: 'Alice', role: 'Admin' as const },
  accessToken: TOKEN,
};

import type { AdminUser, ListUsersResult } from '@/lib/api/users';

const USER_A: AdminUser = {
  id:        'u-001',
  email:     'alice@example.com',
  status:    'CONFIRMED',
  enabled:   true,
  roles:     ['admin'],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-06-01T00:00:00.000Z',
};

const USER_B: AdminUser = {
  id:        'u-002',
  email:     'bob@example.com',
  status:    'FORCE_CHANGE_PASSWORD',
  enabled:   true,
  roles:     ['staff'],
  createdAt: '2024-02-01T00:00:00.000Z',
  updatedAt: '2024-06-01T00:00:00.000Z',
};

const LIST_WITH_USERS: ListUsersResult = { users: [USER_A, USER_B] };
const LIST_EMPTY: ListUsersResult      = { users: [] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(<UsersPage />);
}

/** Arrange-only: authenticate + stub the populated user list + render — the
 * identical setup several tests below need before their own distinctive
 * action (delete, reset, create). Every `waitFor`/`expect` that follows a
 * call to this helper stays inline in its own test. */
function renderAuthedWithUsers(): void {
  mockGetSession.mockResolvedValue(FAKE_SESSION);
  mockListUsers.mockResolvedValue(LIST_WITH_USERS);
  renderPage();
}

/**
 * Stubs `resetUserPassword`'s resolved value. `emailSent` has NO default
 * and is REQUIRED — see the identical rationale on `CreateUserDialog.test.tsx`'s
 * `mockCreateUserResolves`: a silently-defaulted `emailSent` could render the
 * not-sent branch while a test's name and assertions say "sent".
 */
function mockResetPasswordResolves(temporaryPassword: string, emailSent: boolean): void {
  mockResetPwd.mockResolvedValue({ temporaryPassword, emailSent });
}

/** Clicks the first (desktop-table) "Delete alice@example.com" button — the
 * row action renders twice (desktop + mobile cards). */
function openDeleteConfirmForAlice(): void {
  fireEvent.click(
    screen.getAllByRole('button', { name: /delete alice@example\.com/i })[0],
  );
}

/** Clicks the ConfirmDialog's "Delete user" button. */
function confirmDeleteUser(): void {
  fireEvent.click(screen.getByRole('button', { name: /^delete user$/i }));
}

/** Opens the reset-password confirm dialog for alice and confirms it —
 * shared arrange for all three reset-password-flow tests below. */
function openAndConfirmResetPasswordForAlice(): void {
  fireEvent.click(
    screen.getAllByRole('button', { name: /reset password for alice@example\.com/i })[0],
  );
  fireEvent.click(screen.getByRole('button', { name: /^reset password$/i }));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests — Loading → Populated
// ---------------------------------------------------------------------------

describe('UsersPage — list renders rows for returned users', () => {
  it('shows a loading skeleton while data is being fetched', async () => {
    // Hold the promise so the component stays in loading state
    let resolveList!: (r: ListUsersResult) => void;
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    mockListUsers.mockReturnValue(new Promise<ListUsersResult>((res) => { resolveList = res; }));

    renderPage();

    // Loading skeleton has aria-label "Loading users"
    expect(screen.getByRole('status', { name: /loading users/i })).toBeInTheDocument();

    // Cleanup — resolve so no pending promises leak
    await act(async () => resolveList(LIST_WITH_USERS));
  });

  it('renders a row for each user after loading completes', async () => {
    renderAuthedWithUsers();

    // UsersTable renders desktop table + mobile cards; email appears twice
    await waitFor(() =>
      expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText('bob@example.com').length).toBeGreaterThan(0);
  });

  it('hides the loading skeleton after data loads', async () => {
    renderAuthedWithUsers();

    await waitFor(() =>
      expect(screen.queryByRole('status', { name: /loading users/i })).not.toBeInTheDocument(),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — Empty state
// ---------------------------------------------------------------------------

describe('UsersPage — empty state', () => {
  it('shows "No users yet" when listUsers returns an empty array', async () => {
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    mockListUsers.mockResolvedValue(LIST_EMPTY);

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/no users yet/i)).toBeInTheDocument(),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — Error banner
// ---------------------------------------------------------------------------

describe('UsersPage — error banner on rejected list', () => {
  it('shows an error banner when listUsers rejects', async () => {
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    mockListUsers.mockRejectedValue(new Error('Network timeout'));

    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument(),
    );
    expect(screen.getByText(/could not load users/i)).toBeInTheDocument();
    expect(screen.getByText('Network timeout')).toBeInTheDocument();
  });

  it('routes to /login when listUsers throws AuthFailureError', async () => {
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    mockListUsers.mockRejectedValue(new AuthFailureError());

    renderPage();

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/login'),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — Create user flow
// ---------------------------------------------------------------------------

describe('UsersPage — create user flow', () => {
  it('opens CreateUserDialog when "+ Create user" is clicked', async () => {
    renderAuthedWithUsers();

    // Wait for the page to be in populated state (button enabled)
    await waitFor(() =>
      expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByRole('button', { name: /\+ create user/i }));

    // Dialog appears (role="dialog")
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /create user/i })).toBeInTheDocument();
  });

  it('calls createUser then shows the temp password handoff (email sent branch); Done refetches', async () => {
    const NEW_USER: AdminUser = { ...USER_A, id: 'u-new', email: 'new@example.com' };
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    // first call: initial load; second call after Done: refetch
    mockListUsers
      .mockResolvedValueOnce(LIST_WITH_USERS)
      .mockResolvedValueOnce({ users: [USER_A, USER_B, NEW_USER] });
    mockCreateUser.mockResolvedValue({
      user: NEW_USER,
      temporaryPassword: 'Tmp!Create-9',
      emailSent: true,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0),
    );

    // Open dialog
    fireEvent.click(screen.getByRole('button', { name: /\+ create user/i }));

    // Fill in the email field inside the dialog
    const emailInput = screen.getByRole('textbox', { name: /email address/i });
    fireEvent.change(emailInput, { target: { value: 'new@example.com' } });

    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /^create user$/i }));

    await waitFor(() =>
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com' }),
        TOKEN,
      ),
    );

    // Handoff view shows the one-time temp password (list not yet refetched)
    await waitFor(() =>
      expect(screen.getByText('Tmp!Create-9')).toBeInTheDocument(),
    );
    expect(mockListUsers).toHaveBeenCalledTimes(1);

    // Done → refetch + success banner
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));

    await waitFor(() =>
      expect(mockListUsers).toHaveBeenCalledTimes(2),
    );
    expect(screen.getByRole('status')).toHaveTextContent(/user created successfully/i);
  });
});

// ---------------------------------------------------------------------------
// Tests — Delete flow
// ---------------------------------------------------------------------------

describe('UsersPage — delete flow', () => {
  it('opens ConfirmDialog when a Delete button is clicked', async () => {
    renderAuthedWithUsers();

    // UsersTable renders desktop + mobile; wait for any occurrence
    await waitFor(() =>
      expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0),
    );

    // There are two Delete buttons for alice (desktop + mobile), click the first
    openDeleteConfirmForAlice();

    // ConfirmDialog appears
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/delete alice@example\.com\?/i)).toBeInTheDocument();
  });

  it('calls deleteUser with the user id and token when Confirm is clicked', async () => {
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    mockListUsers
      .mockResolvedValueOnce(LIST_WITH_USERS)
      .mockResolvedValueOnce({ users: [USER_B] }); // refetch after delete
    mockDeleteUser.mockResolvedValue(undefined);

    renderPage();

    await waitFor(() =>
      expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0),
    );

    // Open delete confirm dialog for alice (first button = desktop table)
    openDeleteConfirmForAlice();

    // Confirm the deletion (button label is "Delete user")
    confirmDeleteUser();

    await waitFor(() =>
      expect(mockDeleteUser).toHaveBeenCalledWith(USER_A.id, TOKEN),
    );
  });

  it('shows a success banner after deleting a user', async () => {
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    mockListUsers
      .mockResolvedValueOnce(LIST_WITH_USERS)
      .mockResolvedValueOnce({ users: [USER_B] });
    mockDeleteUser.mockResolvedValue(undefined);

    renderPage();

    await waitFor(() =>
      expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0),
    );

    openDeleteConfirmForAlice();
    confirmDeleteUser();

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/user deleted/i),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — Reset password flow (temp-password handoff)
// ---------------------------------------------------------------------------

describe('UsersPage — reset password flow', () => {
  it('shows the temp-password handoff after resetUserPassword resolves (email sent branch)', async () => {
    mockResetPasswordResolves('Tmp!Reset-7', true);
    renderAuthedWithUsers();

    await waitFor(() =>
      expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0),
    );

    openAndConfirmResetPasswordForAlice();

    // Confirm → API called with the user id + token
    await waitFor(() =>
      expect(mockResetPwd).toHaveBeenCalledWith(USER_A.id, TOKEN),
    );

    // Handoff dialog shows the new temporary password + the once-only note
    await waitFor(() =>
      expect(screen.getByText('Tmp!Reset-7')).toBeInTheDocument(),
    );
    expect(screen.getByText(/shown only once/i)).toBeInTheDocument();
    // FR-3 sent scenario: states the reset email was sent.
    expect(screen.getByText(/was sent to the user/i)).toBeInTheDocument();

    // Done → subtle confirmation banner
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/password reset\./i),
    );
  });

  it('still shows the new temporary password when the reset email failed to send (email NOT sent branch)', async () => {
    mockResetPasswordResolves('Tmp!Reset-8', false);
    renderAuthedWithUsers();

    await waitFor(() =>
      expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0),
    );

    openAndConfirmResetPasswordForAlice();

    await waitFor(() =>
      expect(mockResetPwd).toHaveBeenCalledWith(USER_A.id, TOKEN),
    );

    // FR-2: the password is shown even though the email was not sent.
    await waitFor(() =>
      expect(screen.getByText('Tmp!Reset-8')).toBeInTheDocument(),
    );
    // FR-3 not-sent scenario: states the failure and the direct-share instruction.
    expect(screen.getByText(/could not be sent/i)).toBeInTheDocument();
    expect(screen.getByText(/share this password with the user directly/i)).toBeInTheDocument();
    // FR-3's negative clause: must not read as a failure to reset the password.
    expect(screen.queryByText(/failed to reset/i)).not.toBeInTheDocument();
    // This is the RESET path — no invitation email is ever attempted here,
    // so the failure line must never name "invitation" (that noun belongs
    // only to the create path). Falsifier: restoring the word "invitation"
    // to the not-sent copy must redden this assertion.
    expect(screen.queryByText(/invitation/i)).not.toBeInTheDocument();
  });

  it('renders the ApiError message in the dialog (not a generic error) on a 409 rejection', async () => {
    const CONFLICT_MSG =
      'This user is not in a state where that action is allowed. Try again once the account is confirmed.';
    mockResetPwd.mockRejectedValue(Object.assign(new Error(CONFLICT_MSG), { status: 409 }));
    renderAuthedWithUsers();

    await waitFor(() =>
      expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0),
    );

    openAndConfirmResetPasswordForAlice();

    await waitFor(() =>
      expect(screen.getByText(CONFLICT_MSG)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/unexpected error/i)).not.toBeInTheDocument();
    // Dialog stays open on error
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
