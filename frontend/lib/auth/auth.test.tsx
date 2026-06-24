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

const mockFetchAuthSession = jest.fn();
const mockAmplifySignIn    = jest.fn();
const mockAmplifySignOut   = jest.fn();
const mockConfirmSignIn    = jest.fn();

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: (...args: unknown[]) => mockFetchAuthSession(...args),
  signIn:           (...args: unknown[]) => mockAmplifySignIn(...args),
  signOut:          (...args: unknown[]) => mockAmplifySignOut(...args),
  confirmSignIn:    (...args: unknown[]) => mockConfirmSignIn(...args),
}));

// Mock Amplify.configure so it never actually tries to reach Cognito
jest.mock('aws-amplify', () => ({
  Amplify: { configure: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are in place)
// ---------------------------------------------------------------------------

import { roleFromGroups, getSession } from './auth-client';
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
