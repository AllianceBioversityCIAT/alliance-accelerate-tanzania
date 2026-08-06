/**
 * Unit tests for getConsentPolicy() — T-18
 *
 * Covers:
 *   - Returns a typed ConsentPolicy on HTTP 200 with valid JSON
 *   - Calls the public endpoint with NO Authorization header (public, no token)
 *   - Returns null on network error (NFR-5 / DD-6)
 *   - Returns null on non-OK response (NFR-5 / DD-6)
 *   - Returns null when the response body is unparseable
 *   - Returns null when NEXT_PUBLIC_API_BASE_URL is missing
 *   - Never throws — resolves to null even on catastrophic fetch failure
 *
 * Unit tests for lookupRegistration() — T-21 (FR-6, design.md §3.1 decision
 * 3-4). The `'emits the request as a POST body' section below is the
 * Disqualifying-clause evidence: it inspects the ACTUAL `fetch` call
 * `apiFetch` makes, not merely `lookupRegistration`'s return value or any
 * rendered output — a regression to a `GET` with `reference`/`email` as
 * query parameters would fail these assertions even if every other test in
 * this file (and every StatusLookupForm test, which mocks this module
 * instead) stayed green.
 */

import { ApiError } from './client';
import { getConsentPolicy, lookupRegistration, type ConsentPolicy } from './registrations';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_POLICY: ConsentPolicy = {
  version: 'v1.0-placeholder',
  sections: [
    { heading: '[PLACEHOLDER] What we collect', body: 'Body text one.' },
    { heading: '[PLACEHOLDER] Why we collect it', body: 'Body text two.' },
    { heading: '[PLACEHOLDER] How it is published', body: 'Body text three.' },
    { heading: '[PLACEHOLDER] Your rights', body: 'Body text four.' },
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

describe('getConsentPolicy()', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetAllMocks();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns a fully-typed ConsentPolicy when fetch resolves HTTP 200 with valid JSON', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchOk(VALID_POLICY);

    const result = await getConsentPolicy();

    expect(result).toEqual(VALID_POLICY);
    expect(result!.sections).toHaveLength(4);
  });

  it('calls the public endpoint with no Authorization header attached', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchOk(VALID_POLICY);

    await getConsentPolicy();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.example.com/api/v1/registrations/consent-policy');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('returns null when fetch rejects with a network error', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchReject(new TypeError('Failed to fetch'));

    const result = await getConsentPolicy();

    expect(result).toBeNull();
  });

  it('returns null when the server responds with HTTP 500 (error envelope)', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = makeFetchNotOk(500, {
      statusCode: 500,
      message: 'Internal Server Error',
      error: 'Internal Server Error',
    });

    const result = await getConsentPolicy();

    expect(result).toBeNull();
  });

  it('returns null when the server responds with a non-JSON error body', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    });

    const result = await getConsentPolicy();

    expect(result).toBeNull();
  });

  it('returns null when NEXT_PUBLIC_API_BASE_URL is not set', async () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    global.fetch = jest.fn();

    const result = await getConsentPolicy();

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('never throws — resolves to null even on catastrophic fetch failure', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    global.fetch = jest.fn().mockImplementation(() => {
      throw new Error('Something went catastrophically wrong');
    });

    await expect(getConsentPolicy()).resolves.toBeNull();
  });
});

describe('lookupRegistration()', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com' };
    jest.resetAllMocks();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('the emitted request — Disqualifying-clause evidence', () => {
    it('sends a POST with reference and email in a JSON body, on a URL with no query string', async () => {
      global.fetch = makeFetchOk({ status: 'PENDING_REVIEW' });

      await lookupRegistration('REG-2026-0184', 'neema@khsc.co.tz');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];

      // The C-11 / Disqualifying-clause check itself: method is POST, the
      // URL carries no query string, and NEITHER input landed on the URL.
      expect(init.method).toBe('POST');
      expect(url).toBe('https://api.example.com/api/v1/registrations/lookup');
      expect(url).not.toContain('?');
      expect(url).not.toContain('reference=');
      expect(url).not.toContain('email=');
      expect(url).not.toContain('neema');

      // The body — not the URL — is where both inputs actually travel.
      expect(typeof init.body).toBe('string');
      expect(JSON.parse(init.body as string)).toEqual({
        reference: 'REG-2026-0184',
        email: 'neema@khsc.co.tz',
      });
    });

    it('attaches no Authorization header — public, tokenless path (T18-A6)', async () => {
      global.fetch = makeFetchOk({ status: 'PENDING_REVIEW' });

      await lookupRegistration('REG-2026-0184', 'neema@khsc.co.tz');

      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    });
  });

  it('resolves the typed { status, reviewNote? } shape on 200', async () => {
    global.fetch = makeFetchOk({ status: 'REJECTED', reviewNote: 'Missing crop detail.' });

    const result = await lookupRegistration('REG-2026-0184', 'neema@khsc.co.tz');

    expect(result).toEqual({ status: 'REJECTED', reviewNote: 'Missing crop detail.' });
  });

  it('omits reviewNote from the result when the server omits it (no fabricated null)', async () => {
    global.fetch = makeFetchOk({ status: 'PENDING_REVIEW' });

    const result = await lookupRegistration('REG-2026-0184', 'neema@khsc.co.tz');

    expect(result).toEqual({ status: 'PENDING_REVIEW' });
    expect('reviewNote' in result).toBe(false);
  });

  it('throws ApiError(404) for the byte-identical "not found" response', async () => {
    global.fetch = makeFetchNotOk(404, {
      statusCode: 404,
      error: 'Not Found',
      message: 'No registration was found matching that reference and email.',
    });

    await expect(lookupRegistration('REG-2026-9999', 'nobody@example.com')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('throws ApiError(429) for the caller-keyed throttler response', async () => {
    global.fetch = makeFetchNotOk(429, {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Too many requests. Please try again later.',
    });

    await expect(lookupRegistration('REG-2026-0184', 'neema@khsc.co.tz')).rejects.toMatchObject({
      status: 429,
    });
  });

  it('throws ApiError(400) for malformed shape, distinctly from the 404 case', async () => {
    global.fetch = makeFetchNotOk(400, {
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      details: [{ field: 'reference', message: 'reference must be shorter than or equal to 40 characters' }],
    });

    await expect(lookupRegistration('x'.repeat(200), 'neema@khsc.co.tz')).rejects.toBeInstanceOf(ApiError);
    await expect(lookupRegistration('x'.repeat(200), 'neema@khsc.co.tz')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('propagates a network failure rather than swallowing it (unlike getConsentPolicy)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(lookupRegistration('REG-2026-0184', 'neema@khsc.co.tz')).rejects.toBeInstanceOf(TypeError);
  });
});
