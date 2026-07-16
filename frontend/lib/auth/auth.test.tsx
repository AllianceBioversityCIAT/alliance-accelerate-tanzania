/**
 * Unit tests for auth-wiring frontend layer — T-3
 *
 * Covers (design.md §5, requirements.md FR-2/FR-3, NFR-7):
 *   - roleFromGroups maps admin / staff / no-group / undefined (FR-2)
 *   - getSession returns a mapped AuthSession from a fake fetchAuthSession payload
 *   - getSession returns null when unauthenticated / Amplify throws
 *   - SessionProvider + useSession: resolves to signed-in role
 *   - SessionProvider + useSession: resolves to Public when unauthenticated
 *   - sign-out transitions session to Public (FR-3)
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock aws-amplify/auth before any imports that pull it in
// ---------------------------------------------------------------------------

const mockFetchAuthSession        = jest.fn();
const mockAmplifySignIn           = jest.fn();
const mockAmplifySignOut          = jest.fn();
const mockConfirmSignIn           = jest.fn();
const mockAmplifyResetPassword    = jest.fn();
const mockAmplifyConfirmResetPassword = jest.fn();

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession:     (...args: unknown[]) => mockFetchAuthSession(...args),
  signIn:               (...args: unknown[]) => mockAmplifySignIn(...args),
  signOut:              (...args: unknown[]) => mockAmplifySignOut(...args),
  confirmSignIn:        (...args: unknown[]) => mockConfirmSignIn(...args),
  resetPassword:        (...args: unknown[]) => mockAmplifyResetPassword(...args),
  confirmResetPassword: (...args: unknown[]) => mockAmplifyConfirmResetPassword(...args),
}));

// Mock Amplify.configure so it never actually tries to reach Cognito
jest.mock('aws-amplify', () => ({
  Amplify: { configure: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are in place)
// ---------------------------------------------------------------------------

import {
  roleFromGroups,
  getSession,
  resetPassword,
  confirmResetPassword,
} from './auth-client';
import { SessionProvider, useSessionContext } from './SessionProvider';
import { useSession }                         from './useSession';
import { _resetAmplifyConfig }                from './amplify-config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wraps children in SessionProvider for renderHook. */
function makeWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <SessionProvider>{children}</SessionProvider>;
  };
}

/** Builds a fake fetchAuthSession payload. */
function makeFakeSession(groups: string[] | undefined, name = 'Alice') {
  /* eslint-disable-next-line */
  const idPayload: Record<string, any> = { sub: 'u-001', name };
  if (groups !== undefined) idPayload['cognito:groups'] = groups;

  return {
    tokens: {
      accessToken: { toString: () => 'fake-access-token' },
      idToken:     { payload: idPayload },
    },
  };
}

// ---------------------------------------------------------------------------
// roleFromGroups
// ---------------------------------------------------------------------------

describe('roleFromGroups()', () => {
  it('returns Admin when groups includes "admin"', () => {
    expect(roleFromGroups(['admin'])).toBe('Admin');
  });

  it('returns Admin when groups includes both "admin" and "staff"', () => {
    expect(roleFromGroups(['admin', 'staff'])).toBe('Admin');
  });

  it('returns Staff when groups includes "staff" only', () => {
    expect(roleFromGroups(['staff'])).toBe('Staff');
  });

  it('returns Public when groups is an empty array', () => {
    expect(roleFromGroups([])).toBe('Public');
  });

  it('returns Public when groups is undefined', () => {
    expect(roleFromGroups(undefined)).toBe('Public');
  });

  it('returns Public for an unrecognised group', () => {
    expect(roleFromGroups(['some-other-group'])).toBe('Public');
  });
});

// ---------------------------------------------------------------------------
// getSession()
// ---------------------------------------------------------------------------

describe('getSession()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an AuthSession with role Admin when cognito:groups contains "admin"', async () => {
    mockFetchAuthSession.mockResolvedValueOnce(makeFakeSession(['admin'], 'Alice Admin'));

    const session = await getSession();

    expect(session).not.toBeNull();
    expect(session!.role).toBe('Admin');
    expect(session!.user.name).toBe('Alice Admin');
    expect(session!.accessToken).toBe('fake-access-token');
  });

  it('returns an AuthSession with role Staff when cognito:groups contains "staff"', async () => {
    mockFetchAuthSession.mockResolvedValueOnce(makeFakeSession(['staff'], 'Bob Staff'));

    const session = await getSession();

    expect(session!.role).toBe('Staff');
    expect(session!.user.name).toBe('Bob Staff');
  });

  it('returns an AuthSession with role Public when cognito:groups is empty', async () => {
    mockFetchAuthSession.mockResolvedValueOnce(makeFakeSession([], 'Carol'));

    const session = await getSession();

    expect(session!.role).toBe('Public');
  });

  it('returns null when fetchAuthSession throws (unauthenticated / no session)', async () => {
    mockFetchAuthSession.mockRejectedValueOnce(new Error('No current user'));

    const session = await getSession();

    expect(session).toBeNull();
  });

  it('returns null when accessToken is missing from the session', async () => {
    mockFetchAuthSession.mockResolvedValueOnce({ tokens: {} });

    const session = await getSession();

    expect(session).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SessionProvider + useSession
// ---------------------------------------------------------------------------

describe('SessionProvider + useSession()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the configure-once guard so each test gets a clean slate.
    _resetAmplifyConfig();
  });

  it('resolves to the signed-in role (Admin) after mount', async () => {
    mockFetchAuthSession.mockResolvedValue(makeFakeSession(['admin'], 'Alice'));

    const { result } = renderHook(() => useSession(), { wrapper: makeWrapper() });

    // Initially loading — session is Public (safe default)
    expect(result.current.role).toBe('Public');

    await waitFor(() => expect(result.current.role).toBe('Admin'));
    expect(result.current.user?.name).toBe('Alice');
  });

  it('resolves to Public when unauthenticated (fetchAuthSession throws)', async () => {
    mockFetchAuthSession.mockRejectedValue(new Error('No current user'));

    const { result } = renderHook(() => useSession(), { wrapper: makeWrapper() });

    // Wait for loading to settle (loading goes false after init)
    const { result: ctxResult } = renderHook(() => useSessionContext(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(ctxResult.current.loading).toBe(false));

    expect(result.current.role).toBe('Public');
    expect(result.current.user).toBeNull();
  });

  it('transitions to Public after sign-out (FR-3)', async () => {
    // Start signed in as Staff
    mockFetchAuthSession.mockResolvedValue(makeFakeSession(['staff'], 'Bob'));
    mockAmplifySignOut.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSessionContext(), { wrapper: makeWrapper() });

    // Wait for initial session to resolve
    await waitFor(() => expect(result.current.session.role).toBe('Staff'));

    // Sign out
    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.session.role).toBe('Public');
    expect(result.current.session.user).toBeNull();
  });

  it('useSession() returns Public default when called outside provider (no crash)', () => {
    // Render without a provider wrapper — should return the safe default
    const { result } = renderHook(() => useSession());

    expect(result.current.role).toBe('Public');
    expect(result.current.user).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resetPassword() — FR-5 (account-enumeration safe, never throws, NFR-4)
// ---------------------------------------------------------------------------

describe('resetPassword()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns { status: "code_sent" } when Amplify resolves', async () => {
    mockAmplifyResetPassword.mockResolvedValueOnce({});

    await expect(resetPassword('alice@example.com')).resolves.toEqual({ status: 'code_sent' });
    expect(mockAmplifyResetPassword).toHaveBeenCalledWith({ username: 'alice@example.com' });
  });

  it('treats UserNotFoundException as code_sent (no account enumeration)', async () => {
    mockAmplifyResetPassword.mockRejectedValueOnce({ name: 'UserNotFoundException' });

    await expect(resetPassword('ghost@example.com')).resolves.toEqual({ status: 'code_sent' });
  });

  it('maps LimitExceededException to a safe error without leaking the raw name', async () => {
    mockAmplifyResetPassword.mockRejectedValueOnce({
      name: 'LimitExceededException',
      message: 'raw internal detail',
    });

    const result = await resetPassword('alice@example.com');

    expect(result.status).toBe('error');
    const message = result.status === 'error' ? result.message : '';
    expect(message).toBe('Too many attempts. Please wait a few minutes and try again.');
    expect(message).not.toContain('LimitExceededException');
    expect(message).not.toContain('raw internal detail');
  });

  it('never throws even when Amplify rejects with a non-Error value', async () => {
    mockAmplifyResetPassword.mockRejectedValueOnce('boom');

    await expect(resetPassword('alice@example.com')).resolves.toEqual({
      status: 'error',
      message: 'Something went wrong. Please try again.',
    });
  });
});

// ---------------------------------------------------------------------------
// confirmResetPassword() — FR-6 (never throws, safe error mapping, NFR-4)
// ---------------------------------------------------------------------------

describe('confirmResetPassword()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns { status: "done" } when Amplify resolves', async () => {
    mockAmplifyConfirmResetPassword.mockResolvedValueOnce(undefined);

    await expect(
      confirmResetPassword({ username: 'alice@example.com', code: '123456', newPassword: 'Str0ngP@ss!' }),
    ).resolves.toEqual({ status: 'done' });

    expect(mockAmplifyConfirmResetPassword).toHaveBeenCalledWith({
      username: 'alice@example.com',
      confirmationCode: '123456',
      newPassword: 'Str0ngP@ss!',
    });
  });

  it('maps CodeMismatchException to its specific message', async () => {
    mockAmplifyConfirmResetPassword.mockRejectedValueOnce({ name: 'CodeMismatchException' });

    const result = await confirmResetPassword({
      username: 'alice@example.com',
      code: 'wrong',
      newPassword: 'Str0ngP@ss!',
    });

    expect(result).toEqual({
      status: 'error',
      message: "That code isn't correct. Check the code from your email, or request a new one.",
    });
  });

  it('maps ExpiredCodeException to its specific message', async () => {
    mockAmplifyConfirmResetPassword.mockRejectedValueOnce({ name: 'ExpiredCodeException' });

    const result = await confirmResetPassword({
      username: 'alice@example.com',
      code: '123456',
      newPassword: 'Str0ngP@ss!',
    });

    expect(result).toEqual({
      status: 'error',
      message: 'That code has expired. Request a new one and try again.',
    });
  });

  it('maps InvalidPasswordException to its specific message', async () => {
    mockAmplifyConfirmResetPassword.mockRejectedValueOnce({ name: 'InvalidPasswordException' });

    const result = await confirmResetPassword({
      username: 'alice@example.com',
      code: '123456',
      newPassword: 'weak',
    });

    expect(result).toEqual({
      status: 'error',
      message: "That password doesn't meet the requirements. Try a stronger one.",
    });
  });

  it('never leaks the raw error name/message and never throws on unknown errors', async () => {
    mockAmplifyConfirmResetPassword.mockRejectedValueOnce({
      name: 'SomeInternalException',
      message: 'stack trace detail',
    });

    const result = await confirmResetPassword({
      username: 'alice@example.com',
      code: '123456',
      newPassword: 'Str0ngP@ss!',
    });

    expect(result.status).toBe('error');
    const message = result.status === 'error' ? result.message : '';
    expect(message).toBe('Something went wrong. Please try again.');
    expect(message).not.toContain('SomeInternalException');
    expect(message).not.toContain('stack trace detail');
  });
});
