// @sdd-spec admin/user-management (T-10)
/**
 * Unit tests for lib/api/users.ts — T-7 client.
 *
 * Covers (T-10 W-3 gap):
 *   - Each function hits the right URL + method
 *   - Bearer token is attached as Authorization: Bearer <token>
 *   - Correct JSON body is sent for POST/PATCH operations
 *   - deleteUser handles 204 (return void / undefined)
 *   - createUser returns the typed { user, temporaryPassword } body on 201
 *   - resetUserPassword returns the typed { temporaryPassword } body on 200
 *   - Any function throws AuthFailureError on a 401 response
 */

// ---------------------------------------------------------------------------
// Mock aws-amplify/auth (pulled in transitively via apiFetch → client.ts)
// ---------------------------------------------------------------------------

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  setUserRole,
  deleteUser,
  resetUserPassword,
  type AdminUser,
  type ListUsersResult,
} from './users';
import { AuthFailureError } from './client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.example.com';
const TOKEN    = 'test-bearer-token-abc';
const USER_ID  = 'cognito-uuid-001';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_USER: AdminUser = {
  id:        USER_ID,
  email:     'alice@example.com',
  status:    'CONFIRMED',
  enabled:   true,
  roles:     ['admin'],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-06-01T00:00:00.000Z',
};

const LIST_RESULT: ListUsersResult = {
  users:            [ADMIN_USER],
  paginationToken:  'tok-next',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchOk(body: unknown, status = 200): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok:         true,
    status,
    statusText: 'OK',
    json:       () => Promise.resolve(body),
  });
}

function make204(): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok:         true,
    status:     204,
    statusText: 'No Content',
    json:       () => Promise.reject(new SyntaxError('No body')),
  });
}

function make401(): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok:         false,
    status:     401,
    statusText: 'Unauthorized',
    json:       () => Promise.resolve({ statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' }),
  });
}

/** Extracts the parsed request init from global.fetch call #0. */
function callInit(): RequestInit {
  return (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
}

function callUrl(): string {
  return (global.fetch as jest.Mock).mock.calls[0][0] as string;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_API_BASE_URL: BASE_URL };
  jest.resetAllMocks();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

// ---------------------------------------------------------------------------
// listUsers
// ---------------------------------------------------------------------------

describe('listUsers()', () => {
  it('hits GET /api/v1/users with no query when no params supplied', async () => {
    global.fetch = makeFetchOk(LIST_RESULT);

    await listUsers(undefined, TOKEN);

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/users`);
    expect(callInit().method).toBe('GET');
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk(LIST_RESULT);

    await listUsers(undefined, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('appends limit and paginationToken as querystring params', async () => {
    global.fetch = makeFetchOk(LIST_RESULT);

    await listUsers({ limit: 20, paginationToken: 'cursor-xyz' }, TOKEN);

    const url = new URL(callUrl());
    expect(url.pathname).toBe('/api/v1/users');
    expect(url.searchParams.get('limit')).toBe('20');
    expect(url.searchParams.get('paginationToken')).toBe('cursor-xyz');
  });

  it('returns the parsed ListUsersResult', async () => {
    global.fetch = makeFetchOk(LIST_RESULT);

    const result = await listUsers(undefined, TOKEN);

    expect(result).toEqual(LIST_RESULT);
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(listUsers(undefined, TOKEN)).rejects.toThrow(AuthFailureError);
  });
});

// ---------------------------------------------------------------------------
// getUser
// ---------------------------------------------------------------------------

describe('getUser()', () => {
  it('hits GET /api/v1/users/:id', async () => {
    global.fetch = makeFetchOk(ADMIN_USER);

    await getUser(USER_ID, TOKEN);

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/users/${USER_ID}`);
    expect(callInit().method).toBe('GET');
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk(ADMIN_USER);

    await getUser(USER_ID, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('returns the parsed AdminUser', async () => {
    global.fetch = makeFetchOk(ADMIN_USER);

    const result = await getUser(USER_ID, TOKEN);

    expect(result).toEqual(ADMIN_USER);
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(getUser(USER_ID, TOKEN)).rejects.toThrow(AuthFailureError);
  });
});

// ---------------------------------------------------------------------------
// createUser
// ---------------------------------------------------------------------------

describe('createUser()', () => {
  const CREATE_RESULT = { user: ADMIN_USER, temporaryPassword: 'Temp!Pass-01' };

  it('hits POST /api/v1/users', async () => {
    global.fetch = makeFetchOk(CREATE_RESULT, 201);

    await createUser({ email: 'alice@example.com', role: 'admin' }, TOKEN);

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/users`);
    expect(callInit().method).toBe('POST');
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk(CREATE_RESULT, 201);

    await createUser({ email: 'alice@example.com' }, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('sends the correct JSON body', async () => {
    global.fetch = makeFetchOk(CREATE_RESULT, 201);

    await createUser({ email: 'alice@example.com', role: 'staff' }, TOKEN);

    const body = JSON.parse(callInit().body as string);
    expect(body).toEqual({ email: 'alice@example.com', role: 'staff' });
  });

  it('sends Content-Type: application/json', async () => {
    global.fetch = makeFetchOk(CREATE_RESULT, 201);

    await createUser({ email: 'alice@example.com' }, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('resolves to { user, temporaryPassword } on a 201 body', async () => {
    global.fetch = makeFetchOk(CREATE_RESULT, 201);

    const result = await createUser({ email: 'alice@example.com' }, TOKEN);

    expect(result).toEqual(CREATE_RESULT);
    expect(result.temporaryPassword).toBe('Temp!Pass-01');
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(createUser({ email: 'alice@example.com' }, TOKEN)).rejects.toThrow(AuthFailureError);
  });
});

// ---------------------------------------------------------------------------
// updateUser
// ---------------------------------------------------------------------------

describe('updateUser()', () => {
  it('hits PATCH /api/v1/users/:id', async () => {
    global.fetch = makeFetchOk(ADMIN_USER);

    await updateUser(USER_ID, { email: 'new@example.com' }, TOKEN);

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/users/${USER_ID}`);
    expect(callInit().method).toBe('PATCH');
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk(ADMIN_USER);

    await updateUser(USER_ID, { enabled: false }, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('sends the correct JSON body', async () => {
    global.fetch = makeFetchOk(ADMIN_USER);

    await updateUser(USER_ID, { email: 'new@example.com', enabled: false }, TOKEN);

    const body = JSON.parse(callInit().body as string);
    expect(body).toEqual({ email: 'new@example.com', enabled: false });
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(updateUser(USER_ID, { email: 'x@y.com' }, TOKEN)).rejects.toThrow(AuthFailureError);
  });
});

// ---------------------------------------------------------------------------
// setUserRole
// ---------------------------------------------------------------------------

describe('setUserRole()', () => {
  it('hits PATCH /api/v1/users/:id/role', async () => {
    global.fetch = makeFetchOk(ADMIN_USER);

    await setUserRole(USER_ID, { role: 'staff' }, TOKEN);

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/users/${USER_ID}/role`);
    expect(callInit().method).toBe('PATCH');
  });

  it('sends the correct JSON body', async () => {
    global.fetch = makeFetchOk(ADMIN_USER);

    await setUserRole(USER_ID, { role: 'none' }, TOKEN);

    const body = JSON.parse(callInit().body as string);
    expect(body).toEqual({ role: 'none' });
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk(ADMIN_USER);

    await setUserRole(USER_ID, { role: 'admin' }, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(setUserRole(USER_ID, { role: 'staff' }, TOKEN)).rejects.toThrow(AuthFailureError);
  });
});

// ---------------------------------------------------------------------------
// deleteUser — 204 No Content → void
// ---------------------------------------------------------------------------

describe('deleteUser()', () => {
  it('hits DELETE /api/v1/users/:id', async () => {
    global.fetch = make204();

    await deleteUser(USER_ID, TOKEN);

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/users/${USER_ID}`);
    expect(callInit().method).toBe('DELETE');
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = make204();

    await deleteUser(USER_ID, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('resolves to undefined (void) on 204', async () => {
    global.fetch = make204();

    const result = await deleteUser(USER_ID, TOKEN);

    expect(result).toBeUndefined();
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(deleteUser(USER_ID, TOKEN)).rejects.toThrow(AuthFailureError);
  });
});

// ---------------------------------------------------------------------------
// resetUserPassword — 200 { temporaryPassword } (design.md §5.1, FR-6)
// ---------------------------------------------------------------------------

describe('resetUserPassword()', () => {
  it('hits POST /api/v1/users/:id/password', async () => {
    global.fetch = makeFetchOk({ temporaryPassword: 'Temp!Pass-02' });

    await resetUserPassword(USER_ID, TOKEN);

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/users/${USER_ID}/password`);
    expect(callInit().method).toBe('POST');
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk({ temporaryPassword: 'Temp!Pass-02' });

    await resetUserPassword(USER_ID, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('resolves to { temporaryPassword } on a 200 body', async () => {
    global.fetch = makeFetchOk({ temporaryPassword: 'Temp!Pass-02' });

    const result = await resetUserPassword(USER_ID, TOKEN);

    expect(result).toEqual({ temporaryPassword: 'Temp!Pass-02' });
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(resetUserPassword(USER_ID, TOKEN)).rejects.toThrow(AuthFailureError);
  });
});
