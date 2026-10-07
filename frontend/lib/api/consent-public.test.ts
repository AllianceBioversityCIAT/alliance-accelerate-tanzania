import { viewConsentRequest, respondToConsentRequest } from './consent-public';
import { ApiError } from './client';

const BASE = 'http://api.test';
let fetchMock: jest.Mock;

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = BASE;
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

describe('consent-public API client (P-26)', () => {
  it('view POSTs the token in the JSON body, never the URL, with no Authorization header', async () => {
    fetchMock.mockResolvedValue(ok({ organization: 'Acme' }));
    await viewConsentRequest('tok_123');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/consent/view`);
    expect(url).not.toContain('tok_123');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ token: 'tok_123' });
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('respond (accept) POSTs token + decision + respondent + accepted with no Authorization header', async () => {
    fetchMock.mockResolvedValue(ok({ decision: 'ACCEPT' }));
    const respondent = { name: 'A', position: 'B', email: 'a@b.co', phone: '1' };
    await respondToConsentRequest('tok_123', { decision: 'ACCEPT', respondent, accepted: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/consent/respond`);
    expect(JSON.parse(init.body)).toEqual({
      token: 'tok_123',
      decision: 'ACCEPT',
      respondent,
      accepted: true,
    });
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('respond (decline) sends no identity', async () => {
    fetchMock.mockResolvedValue(ok({ decision: 'DECLINE' }));
    await respondToConsentRequest('tok_123', { decision: 'DECLINE' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      token: 'tok_123',
      decision: 'DECLINE',
    });
  });

  it('surfaces the status of a non-OK response as an ApiError (not swallowed)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ statusCode: 404, message: 'This consent link is no longer valid.' }),
    });
    await expect(viewConsentRequest('x')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
    });
    await expect(viewConsentRequest('x')).rejects.toBeInstanceOf(ApiError);
  });
});
