/**
 * Unit tests for getMetrics() — T-5
 *
 * Covers:
 *   - Returns a fully-typed Metrics object on HTTP 200 with valid JSON (FR-3)
 *   - Returns null on network error (NFR-5 / DD-3)
 *   - Returns null on non-OK response (e.g. 500 with error envelope) (NFR-5 / DD-3)
 *   - Returns null when NEXT_PUBLIC_API_BASE_URL is missing (DD-3)
 */

import { getMetrics, type Metrics } from './metrics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_METRICS: Metrics = {
  actorsMapped: 342,
  cropsTracked: 3,
  regionsCovered: 7,
  actorTypes: 4,
  crops: [
    { slug: 'sorghum', mappedActors: 120 },
    { slug: 'common_bean', mappedActors: 145 },
    { slug: 'groundnut', mappedActors: 77 },
  ],
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

describe('getMetrics()', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    // Reset env before each test so tests are isolated
    process.env = { ...ORIGINAL_ENV };
    jest.resetAllMocks();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // ── Success path ──────────────────────────────────────────────────────────

  it('returns a fully-typed Metrics object when fetch resolves HTTP 200 with valid JSON', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchOk(VALID_METRICS);

    const result = await getMetrics();

    expect(result).not.toBeNull();
    expect(result).toEqual(VALID_METRICS);

    // Type-level shape assertions
    expect(typeof result!.actorsMapped).toBe('number');
    expect(typeof result!.cropsTracked).toBe('number');
    expect(typeof result!.regionsCovered).toBe('number');
    expect(typeof result!.actorTypes).toBe('number');
    expect(Array.isArray(result!.crops)).toBe(true);
    expect(result!.crops[0].slug).toBe('sorghum');
    expect(typeof result!.crops[0].mappedActors).toBe('number');
  });

  it('calls fetch with the correct URL and Accept header', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchOk(VALID_METRICS);

    await getMetrics();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/api/v1/metrics', {
      headers: { Accept: 'application/json' },
    });
  });

  // ── Failure paths (DD-3 / NFR-5: MUST return null, never throw) ──────────

  it('returns null when fetch rejects with a network error', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchReject(new TypeError('Failed to fetch'));

    const result = await getMetrics();

    expect(result).toBeNull();
  });

  it('returns null when the server responds with HTTP 500 (error envelope)', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchNotOk(500, {
      statusCode: 500,
      message: 'Internal Server Error',
      error: 'Internal Server Error',
    });

    const result = await getMetrics();

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

    const result = await getMetrics();

    expect(result).toBeNull();
  });

  it('returns null when NEXT_PUBLIC_API_BASE_URL is not set', async () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    global.fetch = jest.fn(); // should not be called

    const result = await getMetrics();

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns null when NEXT_PUBLIC_API_BASE_URL is an empty string', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = '';
    global.fetch = jest.fn();

    const result = await getMetrics();

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ── Never-throws contract ─────────────────────────────────────────────────

  it('never throws — resolves to null even on catastrophic fetch failure', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = jest.fn().mockImplementation(() => {
      throw new Error('Something went catastrophically wrong');
    });

    // If this rejects, the test will fail — confirming getMetrics() must not throw
    await expect(getMetrics()).resolves.toBeNull();
  });
});
