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
 */

import { getConsentPolicy, type ConsentPolicy } from './registrations';

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
