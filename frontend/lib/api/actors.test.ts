/**
 * Unit tests for getActors() — T-1
 *
 * Covers:
 *   - Returns a fully-typed PublicActorList on HTTP 200 with valid JSON (NFR-1)
 *   - Returns null on network error (NFR-5 / DD-6)
 *   - Returns null on non-OK response (NFR-5 / DD-6)
 *   - Returns null when NEXT_PUBLIC_API_BASE_URL is missing (DD-6)
 *   - Returns null when response JSON is unparseable (NFR-5)
 *   - Builds the querystring correctly from ActorsQuery filters
 *   - Omits undefined query fields from the querystring
 *   - Calls bare /api/v1/actors when no query is provided
 */

import { getActors, type PublicActor, type PublicActorList } from './actors';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_ACTOR: PublicActor = {
  id: 'actor-1',
  traderName: 'Mbeya Seeds Ltd',
  region: 'Mbeya',
  district: 'Mbeya Urban',
  traderType: 'seed_company',
  capacityTons: 500,
  crops: ['sorghum', 'common_bean'],
  gps: { lat: -8.9, long: 33.46 },
};

const VALID_LIST: PublicActorList = {
  data: [VALID_ACTOR],
  page: 1,
  pageSize: 20,
  total: 1,
};

function makeFetchOk(body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  });
}

function makeFetchNotOk(status: number, envelope: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: 'Internal Server Error',
    json: () => Promise.resolve(envelope),
  });
}

function makeFetchReject(error: Error): jest.Mock {
  return jest.fn().mockRejectedValue(error);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getActors()', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetAllMocks();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // ── Success path ──────────────────────────────────────────────────────────

  it('returns a fully-typed PublicActorList when fetch resolves HTTP 200 with valid JSON', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchOk(VALID_LIST);

    const result = await getActors();

    expect(result).not.toBeNull();
    expect(result).toEqual(VALID_LIST);

    expect(typeof result!.page).toBe('number');
    expect(typeof result!.pageSize).toBe('number');
    expect(typeof result!.total).toBe('number');
    expect(Array.isArray(result!.data)).toBe(true);
    expect(result!.data[0].id).toBe('actor-1');
    expect(result!.data[0].traderType).toBe('seed_company');
  });

  it('calls bare /api/v1/actors when no query is provided', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchOk(VALID_LIST);

    await getActors();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/actors',
      { headers: { Accept: 'application/json' } }
    );
  });

  it('calls bare /api/v1/actors when an empty query object is provided', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchOk(VALID_LIST);

    await getActors({});

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/actors',
      { headers: { Accept: 'application/json' } }
    );
  });

  // ── Querystring construction ──────────────────────────────────────────────

  it('appends all provided query fields to the URL', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchOk(VALID_LIST);

    await getActors({ crop: 'sorghum', region: 'Mbeya', role: 'seed_company', page: 2, pageSize: 10 });

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    const url = new URL(calledUrl);

    expect(url.pathname).toBe('/api/v1/actors');
    expect(url.searchParams.get('crop')).toBe('sorghum');
    expect(url.searchParams.get('region')).toBe('Mbeya');
    expect(url.searchParams.get('role')).toBe('seed_company');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('pageSize')).toBe('10');
  });

  it('omits undefined query fields from the querystring', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchOk(VALID_LIST);

    await getActors({ crop: 'groundnut' });

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    const url = new URL(calledUrl);

    expect(url.searchParams.get('crop')).toBe('groundnut');
    expect(url.searchParams.has('region')).toBe(false);
    expect(url.searchParams.has('role')).toBe(false);
    expect(url.searchParams.has('page')).toBe(false);
    expect(url.searchParams.has('pageSize')).toBe(false);
  });

  // ── Failure paths (DD-6 / NFR-5: MUST return null, never throw) ──────────

  it('returns null when fetch rejects with a network error', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchReject(new TypeError('Failed to fetch'));

    const result = await getActors();

    expect(result).toBeNull();
  });

  it('returns null when the server responds with HTTP 500 (error envelope)', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchNotOk(500, {
      statusCode: 500,
      message: 'Internal Server Error',
      error: 'Internal Server Error',
    });

    const result = await getActors();

    expect(result).toBeNull();
  });

  it('returns null when the server responds with HTTP 503 (non-JSON body)', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    });

    const result = await getActors();

    expect(result).toBeNull();
  });

  it('returns null when NEXT_PUBLIC_API_BASE_URL is not set', async () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    global.fetch = jest.fn();

    const result = await getActors();

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns null when NEXT_PUBLIC_API_BASE_URL is an empty string', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = '';
    global.fetch = jest.fn();

    const result = await getActors();

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ── Never-throws contract ─────────────────────────────────────────────────

  it('never throws — resolves to null even on catastrophic fetch failure', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = jest.fn().mockImplementation(() => {
      throw new Error('Something went catastrophically wrong');
    });

    await expect(getActors()).resolves.toBeNull();
  });
});
