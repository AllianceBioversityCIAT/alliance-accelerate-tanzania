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
  adminListActors,
  createActor,
  updateActor,
  deleteActor,
  getActorHistory,
  importActors,
  type AdminActor,
  type AdminActorCreateInput,
  type AdminActorUpdateInput,
  type AuditEntry,
  type ActorHistoryList,
  type ActorDeleteResult,
  type ImportReport,
} from './actors-admin';
import { ApiError, AuthFailureError } from './client';

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
  registrationSource: 'TEAM_MANAGED',
  consentMethod: 'SIGNED_FORM',
  consentObtainedAt: '2024-01-01T00:00:00.000Z',
  consentReference: 'Form #001',
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

// Fixed payload whose UTF-8 bytes (65, 66, 67) base64-encode to a known constant.
const IMPORT_CONTENT = 'ABC';
const IMPORT_BASE64 = 'QUJD';

const IMPORT_REPORT: ImportReport = {
  mode: 'preview',
  templateVersionDetected: 'v1',
  totals: { rows: 2, toCreate: 1, created: 0, skipped: 1, failed: 0, warnings: 0 },
  rows: [
    { rowNumber: 1, traderId: 'T-100', traderName: 'New Trader', outcome: 'create' },
    {
      rowNumber: 2,
      traderId: 'T-001',
      traderName: 'Mbeya Seeds Ltd',
      outcome: 'skipped-exists',
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a File with the given content, name, and (optional) forced size. */
function makeFile(
  content: string,
  name: string,
  sizeOverride?: number,
): File {
  const file = new File([content], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  if (sizeOverride !== undefined) {
    Object.defineProperty(file, 'size', { value: sizeOverride });
  }
  return file;
}

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
// adminListActors — T-8 (registration-source-and-consent)
// ---------------------------------------------------------------------------

describe('adminListActors()', () => {
  const LIST_RESPONSE = { data: [ADMIN_ACTOR], page: 1, pageSize: 25, total: 1 };

  it('hits GET /api/v1/admin/actors with no querystring when no query is supplied', async () => {
    global.fetch = makeFetchOk(LIST_RESPONSE);

    await adminListActors(undefined, TOKEN);

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/admin/actors`);
    expect(callInit().method).toBe('GET');
  });

  it('builds a querystring from region, traderType, and consentStatus', async () => {
    global.fetch = makeFetchOk(LIST_RESPONSE);

    await adminListActors(
      { region: 'Mbeya', traderType: 'seed_company', consentStatus: 'GRANTED' },
      TOKEN,
    );

    const url = new URL(callUrl());
    expect(url.searchParams.get('region')).toBe('Mbeya');
    expect(url.searchParams.get('traderType')).toBe('seed_company');
    expect(url.searchParams.get('consentStatus')).toBe('GRANTED');
  });

  it('sends registrationSource and consentMethod as query params (FR-6)', async () => {
    global.fetch = makeFetchOk(LIST_RESPONSE);

    await adminListActors(
      { registrationSource: 'TEAM_MANAGED', consentMethod: 'NOT_RECORDED' },
      TOKEN,
    );

    const url = new URL(callUrl());
    expect(url.searchParams.get('registrationSource')).toBe('TEAM_MANAGED');
    expect(url.searchParams.get('consentMethod')).toBe('NOT_RECORDED');
  });

  it('combines consentStatus=GRANTED and consentMethod=NOT_RECORDED as an AND (FR-9 enumeration)', async () => {
    global.fetch = makeFetchOk(LIST_RESPONSE);

    await adminListActors(
      { consentStatus: 'GRANTED', consentMethod: 'NOT_RECORDED' },
      TOKEN,
    );

    const url = new URL(callUrl());
    // Both params present on the SAME request — this is what makes the
    // combination an AND once the backend's `where` clause filters on them
    // (see the {@link AdminActorListQuery} doc comment).
    expect(url.searchParams.get('consentStatus')).toBe('GRANTED');
    expect(url.searchParams.get('consentMethod')).toBe('NOT_RECORDED');
  });

  it('omits registrationSource/consentMethod from the querystring when not supplied', async () => {
    global.fetch = makeFetchOk(LIST_RESPONSE);

    await adminListActors({ region: 'Mbeya' }, TOKEN);

    const url = new URL(callUrl());
    expect(url.searchParams.has('registrationSource')).toBe(false);
    expect(url.searchParams.has('consentMethod')).toBe(false);
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk(LIST_RESPONSE);

    await adminListActors({}, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('returns the parsed AdminActorList, including the four provenance fields', async () => {
    global.fetch = makeFetchOk(LIST_RESPONSE);

    const result = await adminListActors({}, TOKEN);

    expect(result).toEqual(LIST_RESPONSE);
    expect(result.data[0].registrationSource).toBe('TEAM_MANAGED');
    expect(result.data[0].consentMethod).toBe('SIGNED_FORM');
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(adminListActors({}, TOKEN)).rejects.toThrow(AuthFailureError);
  });
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
// importActors
// ---------------------------------------------------------------------------

describe('importActors()', () => {
  it('POSTs to /api/v1/admin/actors/import', async () => {
    global.fetch = makeFetchOk(IMPORT_REPORT);

    await importActors(makeFile(IMPORT_CONTENT, 'actors.xlsx'), 'preview', TOKEN);

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/admin/actors/import`);
    expect(callInit().method).toBe('POST');
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk(IMPORT_REPORT);

    await importActors(makeFile(IMPORT_CONTENT, 'actors.xlsx'), 'preview', TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('sends fileName, base64-encoded content, and mode in the body', async () => {
    global.fetch = makeFetchOk(IMPORT_REPORT);

    await importActors(makeFile(IMPORT_CONTENT, 'actors.xlsx'), 'preview', TOKEN);

    const body = JSON.parse(callInit().body as string);
    expect(body.fileName).toBe('actors.xlsx');
    expect(body.fileBase64).toBe(IMPORT_BASE64);
    expect(body.mode).toBe('preview');
  });

  it('omits acknowledged when it is not passed', async () => {
    global.fetch = makeFetchOk(IMPORT_REPORT);

    await importActors(makeFile(IMPORT_CONTENT, 'actors.xlsx'), 'commit', TOKEN);

    const body = JSON.parse(callInit().body as string);
    expect('acknowledged' in body).toBe(false);
  });

  it('includes acknowledged: true when passed', async () => {
    global.fetch = makeFetchOk({ ...IMPORT_REPORT, mode: 'commit' });

    await importActors(makeFile(IMPORT_CONTENT, 'actors.xlsx'), 'commit', TOKEN, true);

    const body = JSON.parse(callInit().body as string);
    expect(body.acknowledged).toBe(true);
    expect(body.mode).toBe('commit');
  });

  it('includes acknowledged: false when explicitly passed false', async () => {
    global.fetch = makeFetchOk({ ...IMPORT_REPORT, mode: 'commit' });

    await importActors(makeFile(IMPORT_CONTENT, 'actors.xlsx'), 'commit', TOKEN, false);

    const body = JSON.parse(callInit().body as string);
    expect(body.acknowledged).toBe(false);
  });

  it('returns the parsed ImportReport', async () => {
    global.fetch = makeFetchOk(IMPORT_REPORT);

    const result = await importActors(makeFile(IMPORT_CONTENT, 'actors.xlsx'), 'preview', TOKEN);

    expect(result).toEqual(IMPORT_REPORT);
    expect(result.totals.toCreate).toBe(1);
    expect(result.rows[1].outcome).toBe('skipped-exists');
  });

  it('accepts an uppercase .XLSX extension (case-insensitive)', async () => {
    global.fetch = makeFetchOk(IMPORT_REPORT);

    await importActors(makeFile(IMPORT_CONTENT, 'ACTORS.XLSX'), 'preview', TOKEN);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-.xlsx file with a plain Error and never calls fetch', async () => {
    global.fetch = jest.fn();

    await expect(
      importActors(makeFile(IMPORT_CONTENT, 'actors.csv'), 'preview', TOKEN),
    ).rejects.toThrow(/\.xlsx/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not throw ApiError for a non-.xlsx file (plain Error only)', async () => {
    global.fetch = jest.fn();

    await expect(
      importActors(makeFile(IMPORT_CONTENT, 'actors.csv'), 'preview', TOKEN),
    ).rejects.not.toBeInstanceOf(ApiError);
  });

  it('rejects an oversized file (> 4 MB) with a plain Error and never calls fetch', async () => {
    global.fetch = jest.fn();
    const oversized = makeFile(IMPORT_CONTENT, 'actors.xlsx', 4 * 1024 * 1024 + 1);

    await expect(importActors(oversized, 'preview', TOKEN)).rejects.toThrow(/4 MB/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('accepts a file at exactly the 4 MB boundary', async () => {
    global.fetch = makeFetchOk(IMPORT_REPORT);
    const atLimit = makeFile(IMPORT_CONTENT, 'actors.xlsx', 4 * 1024 * 1024);

    await importActors(atLimit, 'preview', TOKEN);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws ApiError with field details on a 400 response', async () => {
    global.fetch = makeFetchNotOk(400, {
      statusCode: 400,
      message: 'File is not a valid .xlsx workbook',
      error: 'Bad Request',
      details: [{ field: 'fileBase64', message: 'Unable to parse workbook' }],
    });

    const attempt = importActors(makeFile(IMPORT_CONTENT, 'actors.xlsx'), 'preview', TOKEN);

    await expect(attempt).rejects.toThrow('File is not a valid .xlsx workbook');
    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.status).toBe(400);
      expect(err.details).toEqual([
        { field: 'fileBase64', message: 'Unable to parse workbook' },
      ]);
    });
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(
      importActors(makeFile(IMPORT_CONTENT, 'actors.xlsx'), 'preview', TOKEN),
    ).rejects.toThrow(AuthFailureError);
  });

  it('throws ApiError on 403', async () => {
    global.fetch = makeFetchNotOk(403, {
      statusCode: 403,
      message: 'Forbidden',
      error: 'Forbidden',
    });

    await expect(
      importActors(makeFile(IMPORT_CONTENT, 'actors.xlsx'), 'preview', TOKEN),
    ).rejects.toBeInstanceOf(ApiError);
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
