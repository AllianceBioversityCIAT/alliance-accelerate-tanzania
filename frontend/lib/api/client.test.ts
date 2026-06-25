/**
 * Unit tests for apiGet and apiGetAuthed — T-5
 *
 * Covers (FR-9, NFR-7):
 *   apiGet (public — tokenless):
 *     - Makes request with no Authorization header (public calls stay tokenless — FR-8)
 *     - Returns parsed JSON on HTTP 200
 *     - Throws plain Error on non-OK status
 *
 *   apiGetAuthed (authenticated transport):
 *     - Attaches Authorization: Bearer <token> header
 *     - Returns parsed JSON on HTTP 200
 *     - Throws AuthFailureError (typed, status 401) on HTTP 401 (NFR-7 / FR-9)
 *     - Throws AuthFailureError when no active session (no access token)
 *     - Throws plain Error on other non-OK statuses (mirrors apiGet pattern)
 */

// ---------------------------------------------------------------------------
// Mock aws-amplify/auth before any imports that pull it in
// ---------------------------------------------------------------------------

const mockFetchAuthSession = jest.fn();

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: (...args: unknown[]) => mockFetchAuthSession(...args),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { apiGet, apiGetAuthed, AuthFailureError } from './client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchOk(body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  });
}

function makeFetchNotOk(status: number, statusText: string, envelope: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve(envelope),
  });
}

/** A fake Amplify session with a valid access token. */
function makeAuthSession(token = 'test-access-token') {
  return {
    tokens: {
      accessToken: { toString: () => token },
    },
  };
}

/** A fake Amplify session with no access token (unauthenticated). */
function makeEmptyAuthSession() {
  return { tokens: {} };
}

// ---------------------------------------------------------------------------
// apiGet — public, tokenless
// ---------------------------------------------------------------------------

describe('apiGet() — public, tokenless', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetAllMocks();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('makes the request with no Authorization header (public calls stay tokenless — FR-8)', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchOk({ ok: true });

    await apiGet('/api/v1/metrics');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
    expect((init.headers as Record<string, string>)['Accept']).toBe('application/json');
  });

  it('returns parsed JSON on HTTP 200', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchOk({ actorsMapped: 42 });

    const result = await apiGet<{ actorsMapped: number }>('/api/v1/metrics');

    expect(result).toEqual({ actorsMapped: 42 });
  });

  it('throws a plain Error on non-OK status (not AuthFailureError)', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchNotOk(500, 'Internal Server Error', {
      statusCode: 500,
      message: 'Something broke',
      error: 'Internal Server Error',
    });

    await expect(apiGet('/api/v1/metrics')).rejects.toThrow('Something broke');
    await expect(apiGet('/api/v1/metrics')).rejects.not.toThrow(AuthFailureError);
  });

  it('does NOT call fetchAuthSession (no Amplify dependency for public calls)', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchOk({});

    await apiGet('/api/v1/metrics');

    expect(mockFetchAuthSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// apiGetAuthed — attaches bearer token, AuthFailureError on 401
// ---------------------------------------------------------------------------

describe('apiGetAuthed() — authenticated transport', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetAllMocks();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // ── Bearer header attachment ──────────────────────────────────────────────

  it('attaches Authorization: Bearer <token> header (FR-9)', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    mockFetchAuthSession.mockResolvedValue(makeAuthSession('my-jwt-token'));
    global.fetch = makeFetchOk({ sub: 'u-001', role: 'Staff' });

    await apiGetAuthed('/api/v1/auth/me');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer my-jwt-token');
  });

  it('also sends Accept: application/json alongside the bearer header', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    mockFetchAuthSession.mockResolvedValue(makeAuthSession('tok'));
    global.fetch = makeFetchOk({});

    await apiGetAuthed('/api/v1/auth/me');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Accept']).toBe('application/json');
  });

  it('calls the correct URL with the base URL prefix', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    mockFetchAuthSession.mockResolvedValue(makeAuthSession());
    global.fetch = makeFetchOk({});

    await apiGetAuthed('/api/v1/auth/me');

    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/api/v1/auth/me');
  });

  it('returns parsed JSON on HTTP 200', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    mockFetchAuthSession.mockResolvedValue(makeAuthSession());
    global.fetch = makeFetchOk({ sub: 'u-001', role: 'Admin' });

    const result = await apiGetAuthed<{ sub: string; role: string }>('/api/v1/auth/me');

    expect(result).toEqual({ sub: 'u-001', role: 'Admin' });
  });

  // ── 401 → AuthFailureError ────────────────────────────────────────────────

  it('throws AuthFailureError (typed, status 401) on HTTP 401 (FR-9/NFR-7)', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    mockFetchAuthSession.mockResolvedValue(makeAuthSession());
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' }),
    });

    await expect(apiGetAuthed('/api/v1/auth/me')).rejects.toThrow(AuthFailureError);
  });

  it('the AuthFailureError has status 401', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    mockFetchAuthSession.mockResolvedValue(makeAuthSession());
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({}),
    });

    let caught: unknown;
    try {
      await apiGetAuthed('/api/v1/auth/me');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AuthFailureError);
    expect((caught as AuthFailureError).status).toBe(401);
    expect((caught as AuthFailureError).name).toBe('AuthFailureError');
  });

  // ── No active session → AuthFailureError ─────────────────────────────────

  it('throws AuthFailureError when no access token is in the Amplify session', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    mockFetchAuthSession.mockResolvedValue(makeEmptyAuthSession());
    global.fetch = jest.fn();

    await expect(apiGetAuthed('/api/v1/auth/me')).rejects.toThrow(AuthFailureError);
    // fetch should never have been called — we short-circuit before making the request
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws AuthFailureError when fetchAuthSession throws (unauthenticated)', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    mockFetchAuthSession.mockRejectedValue(new Error('No current user'));
    global.fetch = jest.fn();

    await expect(apiGetAuthed('/api/v1/auth/me')).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ── Other non-OK statuses → plain Error ──────────────────────────────────

  it('throws a plain Error (not AuthFailureError) on HTTP 403', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    mockFetchAuthSession.mockResolvedValue(makeAuthSession());
    global.fetch = makeFetchNotOk(403, 'Forbidden', {
      statusCode: 403,
      message: 'Forbidden',
      error: 'Forbidden',
    });

    await expect(apiGetAuthed('/api/v1/auth/protected')).rejects.toThrow('Forbidden');
    await expect(apiGetAuthed('/api/v1/auth/protected')).rejects.not.toThrow(AuthFailureError);
  });

  it('throws a plain Error on HTTP 500', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    mockFetchAuthSession.mockResolvedValue(makeAuthSession());
    global.fetch = makeFetchNotOk(500, 'Internal Server Error', {
      statusCode: 500,
      message: 'Server error',
      error: 'Internal Server Error',
    });

    await expect(apiGetAuthed('/api/v1/auth/me')).rejects.toThrow('Server error');
  });

  // ── Missing base URL ──────────────────────────────────────────────────────

  it('throws when NEXT_PUBLIC_API_BASE_URL is not set', async () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    mockFetchAuthSession.mockResolvedValue(makeAuthSession());
    global.fetch = jest.fn();

    await expect(apiGetAuthed('/api/v1/auth/me')).rejects.toThrow('NEXT_PUBLIC_API_BASE_URL');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
