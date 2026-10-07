// @sdd-spec actors/consent-intake/consent-request-email (T-9)
/** Wire-shape tests for lib/api/consent-requests-admin.ts: URL, method, body, bearer token. */

jest.mock('aws-amplify/auth', () => ({ fetchAuthSession: jest.fn() }));

import {
  dispatchConsentRequests,
  enqueueConsentRequests,
  getConsentQueue,
  previewConsentRequests,
  retryConsentRequests,
} from './consent-requests-admin';
import { AuthFailureError } from './client';

const BASE_URL = 'https://api.example.com';
const TOKEN = 'tok';
const originalFetch = global.fetch;
const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;

function mockFetch(status: number, body: unknown) {
  const fn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'x',
    json: async () => body,
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = BASE_URL;
});
afterEach(() => {
  global.fetch = originalFetch;
  process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
});

const SKIPPED = { no_email: 1, granted: 0, pending_request: 0, declined: 0 };

describe('consent-requests-admin wire shapes', () => {
  it('preview POSTs { target, scope } to /preview with the bearer token', async () => {
    const fetchMock = mockFetch(200, { total: 3, toSend: 2, skipped: SKIPPED });
    const body = { target: { kind: 'ids' as const, ids: ['a', 'b', 'c'] }, scope: 'bulk' as const };
    await expect(previewConsentRequests(body, TOKEN)).resolves.toEqual({ total: 3, toSend: 2, skipped: SKIPPED });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/v1/admin/consent-requests/preview`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it('enqueue POSTs a filter target to the collection route', async () => {
    const fetchMock = mockFetch(201, { batchId: 'b1', queued: 2, skipped: SKIPPED });
    const body = {
      target: { kind: 'filter' as const, filter: { region: 'Arusha', consentStatus: 'UNKNOWN' as const } },
      scope: 'bulk' as const,
    };
    await expect(enqueueConsentRequests(body, TOKEN)).resolves.toMatchObject({ batchId: 'b1', queued: 2 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/v1/admin/consent-requests`);
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it('dispatch and retry POST an optional batchId', async () => {
    const dispatchFetch = mockFetch(200, { sent: 1, failed: 0, remaining: 0 });
    await dispatchConsentRequests({ batchId: 'b1' }, TOKEN);
    expect(dispatchFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/v1/admin/consent-requests/dispatch`);
    expect(JSON.parse(dispatchFetch.mock.calls[0][1].body)).toEqual({ batchId: 'b1' });

    const retryFetch = mockFetch(200, { queued: 3 });
    await expect(retryConsentRequests({}, TOKEN)).resolves.toEqual({ queued: 3 });
    expect(retryFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/v1/admin/consent-requests/retry`);
    expect(JSON.parse(retryFetch.mock.calls[0][1].body)).toEqual({});
  });

  it('getConsentQueue GETs /queue', async () => {
    const fetchMock = mockFetch(200, { queued: 4, failed: 1 });
    await expect(getConsentQueue(TOKEN)).resolves.toEqual({ queued: 4, failed: 1 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE_URL}/api/v1/admin/consent-requests/queue`);
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  });

  it('maps 401 to AuthFailureError', async () => {
    mockFetch(401, {});
    await expect(getConsentQueue(TOKEN)).rejects.toBeInstanceOf(AuthFailureError);
  });
});
