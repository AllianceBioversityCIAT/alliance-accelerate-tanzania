/**
 * Unit tests for lib/api/actors-admin.ts — T-7 client extensions.
 *
 * Covers:
 *   - adminGetActor / createActor / updateActor / deleteActor / getActorHistory
 *     hit the correct URL, method, and (for mutating functions) JSON body.
 *   - Bearer token is attached as Authorization: Bearer <token>.
 *   - Successful responses are returned as typed objects.
 *   - 400 field errors, 409 duplicate traderId, 404 not found, and 401 auth
 *     failure (AuthFailureError) are thrown correctly.
 *   - getActorHistory builds the querystring, clamps pageSize to ≤ 100, and
 *     works without a query object.
 *   - Missing NEXT_PUBLIC_API_BASE_URL throws before fetch is called.
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
  adminGetActor,
  createActor,
  updateActor,
  deleteActor,
  getActorHistory,
  type AdminActor,
  type AdminActorCreateInput,
  type AdminActorUpdateInput,
  type AuditEntry,
  type ActorHistoryList,
  type ActorDeleteResult,
} from './actors-admin';
import { AuthFailureError } from './client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.example.com';
const TOKEN = 'test-bearer-token-abc';
const ACTOR_ID = 'actor-cuid-001';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_ACTOR: AdminActor = {
  id: ACTOR_ID,
  traderId: 'T-001',
  traderName: 'Mbeya Seeds Ltd',
  region: 'Mbeya',
  district: 'Mbeya Urban',
  traderType: 'seed_company',
  sex: 'female',
  position: 'manager',
  marketLocation: 'Mbeya Central Market',
  capacityTons: 500,
  technicalSupport: 'extension_officer',
  phone: '+255123456789',
  email: 'info@mbeyaseeds.example',
  gpsLatitude: -8.9,
  gpsLongitude: 33.46,
  gpsAltitude: null,
  gpsAccuracy: null,
  consentStatus: 'GRANTED',
  crops: ['sorghum', 'common_bean'],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-06-01T00:00:00.000Z',
};

const AUDIT_ENTRY: AuditEntry = {
  id: 'audit-cuid-001',
  actorId: ACTOR_ID,
  traderId: 'T-001',
  traderName: 'Mbeya Seeds Ltd',
  action: 'UPDATE',
  actingSub: 'cognito-sub-001',
  actingEmail: 'admin@example.com',
  changes: {
    kind: 'diff',
    fields: {
      phone: { from: '+255000000000', to: '+255123456789' },
    },
  },
  acknowledged: null,
  createdAt: '2024-06-01T00:00:00.000Z',
};

const HISTORY_LIST: ActorHistoryList = {
  data: [AUDIT_ENTRY],
  page: 1,
  pageSize: 20,
  total: 1,
};

const DELETE_RESULT: ActorDeleteResult = {
  deleted: true,
  id: ACTOR_ID,
};

const CREATE_INPUT: AdminActorCreateInput = {
  traderId: 'T-002',
  traderName: 'Iringa Cooperative',
  region: 'Iringa',
  traderType: 'cooperative',
  consentStatus: 'UNKNOWN',
  crops: ['groundnut'],
};

const UPDATE_INPUT: AdminActorUpdateInput = {
  traderName: 'Iringa Cooperative Ltd',
  consentStatus: 'GRANTED',
  acknowledged: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchOk(body: unknown, status = 200): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  });
}

function makeFetchNotOk(status: number, envelope: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: 'Error',
    json: () => Promise.resolve(envelope),
  });
}

function make401(): jest.Mock {
  return makeFetchNotOk(401, {
    statusCode: 401,
    message: 'Unauthorized',
    error: 'Unauthorized',
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
// adminGetActor
// ---------------------------------------------------------------------------

describe('adminGetActor()', () => {
  it('hits GET /api/v1/admin/actors/:id', async () => {
    global.fetch = makeFetchOk(ADMIN_ACTOR);

    await adminGetActor(ACTOR_ID, TOKEN);

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/admin/actors/${ACTOR_ID}`);
    expect(callInit().method).toBe('GET');
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk(ADMIN_ACTOR);

    await adminGetActor(ACTOR_ID, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('returns the parsed AdminActor', async () => {
    global.fetch = makeFetchOk(ADMIN_ACTOR);

    const result = await adminGetActor(ACTOR_ID, TOKEN);

    expect(result).toEqual(ADMIN_ACTOR);
    expect(result.phone).toBe('+255123456789');
    expect(result.crops).toEqual(['sorghum', 'common_bean']);
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(adminGetActor(ACTOR_ID, TOKEN)).rejects.toThrow(AuthFailureError);
  });

  it('throws a plain Error on 404', async () => {
    global.fetch = makeFetchNotOk(404, {
      statusCode: 404,
      message: 'Actor not found',
      error: 'Not Found',
    });

    await expect(adminGetActor(ACTOR_ID, TOKEN)).rejects.toThrow('Actor not found');
  });
});

// ---------------------------------------------------------------------------
// createActor
// ---------------------------------------------------------------------------

describe('createActor()', () => {
  it('hits POST /api/v1/admin/actors', async () => {
    global.fetch = makeFetchOk(ADMIN_ACTOR, 201);

    await createActor(CREATE_INPUT, TOKEN);

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/admin/actors`);
    expect(callInit().method).toBe('POST');
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk(ADMIN_ACTOR, 201);

    await createActor(CREATE_INPUT, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('sends Content-Type: application/json', async () => {
    global.fetch = makeFetchOk(ADMIN_ACTOR, 201);

    await createActor(CREATE_INPUT, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sends the correct JSON body', async () => {
    global.fetch = makeFetchOk(ADMIN_ACTOR, 201);

    await createActor(CREATE_INPUT, TOKEN);

    const body = JSON.parse(callInit().body as string);
    expect(body).toEqual(CREATE_INPUT);
  });

  it('returns the parsed AdminActor on 201', async () => {
    global.fetch = makeFetchOk(ADMIN_ACTOR, 201);

    const result = await createActor(CREATE_INPUT, TOKEN);

    expect(result).toEqual(ADMIN_ACTOR);
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(createActor(CREATE_INPUT, TOKEN)).rejects.toThrow(AuthFailureError);
  });

  it('throws a plain Error with field messages on 400', async () => {
    global.fetch = makeFetchNotOk(400, {
      statusCode: 400,
      message: 'Validation failed',
      error: 'Bad Request',
      details: [{ field: 'traderId', message: 'traderId is required' }],
    });

    await expect(createActor(CREATE_INPUT, TOKEN)).rejects.toThrow('Validation failed');
  });

  it('throws a plain Error on 409 duplicate traderId', async () => {
    global.fetch = makeFetchNotOk(409, {
      statusCode: 409,
      message: 'An actor with this traderId already exists',
      error: 'Conflict',
    });

    await expect(createActor(CREATE_INPUT, TOKEN)).rejects.toThrow(
      'An actor with this traderId already exists',
    );
  });
});

// ---------------------------------------------------------------------------
// updateActor
// ---------------------------------------------------------------------------

describe('updateActor()', () => {
  it('hits PATCH /api/v1/admin/actors/:id', async () => {
    global.fetch = makeFetchOk(ADMIN_ACTOR);

    await updateActor(ACTOR_ID, UPDATE_INPUT, TOKEN);

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/admin/actors/${ACTOR_ID}`);
    expect(callInit().method).toBe('PATCH');
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk(ADMIN_ACTOR);

    await updateActor(ACTOR_ID, UPDATE_INPUT, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('sends the correct JSON body', async () => {
    global.fetch = makeFetchOk(ADMIN_ACTOR);

    await updateActor(ACTOR_ID, UPDATE_INPUT, TOKEN);

    const body = JSON.parse(callInit().body as string);
    expect(body).toEqual(UPDATE_INPUT);
  });

  it('returns the parsed AdminActor', async () => {
    global.fetch = makeFetchOk(ADMIN_ACTOR);

    const result = await updateActor(ACTOR_ID, UPDATE_INPUT, TOKEN);

    expect(result).toEqual(ADMIN_ACTOR);
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(updateActor(ACTOR_ID, UPDATE_INPUT, TOKEN)).rejects.toThrow(AuthFailureError);
  });

  it('throws a plain Error on 400 when consent acknowledgement is missing', async () => {
    global.fetch = makeFetchNotOk(400, {
      statusCode: 400,
      message: 'Consent transition to GRANTED requires acknowledgement',
      error: 'Bad Request',
    });

    await expect(updateActor(ACTOR_ID, UPDATE_INPUT, TOKEN)).rejects.toThrow(
      'Consent transition to GRANTED requires acknowledgement',
    );
  });

  it('throws a plain Error on 404', async () => {
    global.fetch = makeFetchNotOk(404, {
      statusCode: 404,
      message: 'Actor not found',
      error: 'Not Found',
    });

    await expect(updateActor(ACTOR_ID, UPDATE_INPUT, TOKEN)).rejects.toThrow('Actor not found');
  });

  it('throws a plain Error on 409 duplicate traderId', async () => {
    global.fetch = makeFetchNotOk(409, {
      statusCode: 409,
      message: 'An actor with this traderId already exists',
      error: 'Conflict',
    });

    await expect(updateActor(ACTOR_ID, { traderId: 'T-EXISTING' }, TOKEN)).rejects.toThrow(
      'An actor with this traderId already exists',
    );
  });
});

// ---------------------------------------------------------------------------
// deleteActor
// ---------------------------------------------------------------------------

describe('deleteActor()', () => {
  it('hits DELETE /api/v1/admin/actors/:id', async () => {
    global.fetch = makeFetchOk(DELETE_RESULT);

    await deleteActor(ACTOR_ID, TOKEN);

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/admin/actors/${ACTOR_ID}`);
    expect(callInit().method).toBe('DELETE');
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk(DELETE_RESULT);

    await deleteActor(ACTOR_ID, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('returns the parsed ActorDeleteResult', async () => {
    global.fetch = makeFetchOk(DELETE_RESULT);

    const result = await deleteActor(ACTOR_ID, TOKEN);

    expect(result).toEqual(DELETE_RESULT);
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(deleteActor(ACTOR_ID, TOKEN)).rejects.toThrow(AuthFailureError);
  });

  it('throws a plain Error on 404', async () => {
    global.fetch = makeFetchNotOk(404, {
      statusCode: 404,
      message: 'Actor not found',
      error: 'Not Found',
    });

    await expect(deleteActor(ACTOR_ID, TOKEN)).rejects.toThrow('Actor not found');
  });
});

// ---------------------------------------------------------------------------
// getActorHistory
// ---------------------------------------------------------------------------

describe('getActorHistory()', () => {
  it('hits GET /api/v1/admin/actors/:id/history with no query when none supplied', async () => {
    global.fetch = makeFetchOk(HISTORY_LIST);

    await getActorHistory(ACTOR_ID, undefined, TOKEN);

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/admin/actors/${ACTOR_ID}/history`);
    expect(callInit().method).toBe('GET');
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk(HISTORY_LIST);

    await getActorHistory(ACTOR_ID, undefined, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('returns the parsed ActorHistoryList', async () => {
    global.fetch = makeFetchOk(HISTORY_LIST);

    const result = await getActorHistory(ACTOR_ID, undefined, TOKEN);

    expect(result).toEqual(HISTORY_LIST);
    expect(result.data[0].action).toBe('UPDATE');
    expect(result.data[0].actingEmail).toBe('admin@example.com');
  });

  it('appends page and pageSize to the querystring', async () => {
    global.fetch = makeFetchOk(HISTORY_LIST);

    await getActorHistory(ACTOR_ID, { page: 2, pageSize: 50 }, TOKEN);

    const url = new URL(callUrl());
    expect(url.pathname).toBe(`/api/v1/admin/actors/${ACTOR_ID}/history`);
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('pageSize')).toBe('50');
  });

  it('clamps pageSize to 100 client-side', async () => {
    global.fetch = makeFetchOk(HISTORY_LIST);

    await getActorHistory(ACTOR_ID, { page: 1, pageSize: 250 }, TOKEN);

    const url = new URL(callUrl());
    expect(url.searchParams.get('pageSize')).toBe('100');
  });

  it('does not append query params when they are undefined', async () => {
    global.fetch = makeFetchOk(HISTORY_LIST);

    await getActorHistory(ACTOR_ID, {}, TOKEN);

    const url = new URL(callUrl());
    expect(url.searchParams.has('page')).toBe(false);
    expect(url.searchParams.has('pageSize')).toBe(false);
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(getActorHistory(ACTOR_ID, undefined, TOKEN)).rejects.toThrow(AuthFailureError);
  });

  it('throws a plain Error on 404', async () => {
    global.fetch = makeFetchNotOk(404, {
      statusCode: 404,
      message: 'Actor not found',
      error: 'Not Found',
    });

    await expect(getActorHistory(ACTOR_ID, undefined, TOKEN)).rejects.toThrow('Actor not found');
  });
});

// ---------------------------------------------------------------------------
// Shared infrastructure behaviour
// ---------------------------------------------------------------------------

describe('shared infrastructure', () => {
  it('throws when NEXT_PUBLIC_API_BASE_URL is missing and never calls fetch', async () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    global.fetch = jest.fn();

    await expect(adminGetActor(ACTOR_ID, TOKEN)).rejects.toThrow('NEXT_PUBLIC_API_BASE_URL');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws when NEXT_PUBLIC_API_BASE_URL is an empty string', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = '';
    global.fetch = jest.fn();

    await expect(createActor(CREATE_INPUT, TOKEN)).rejects.toThrow('NEXT_PUBLIC_API_BASE_URL');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
