/**
 * Unit tests for submitContact() — T-9 (FR-2, FR-5, NFR-7, design.md §3, §5.1).
 *
 * Covers the Disqualifying-clause evidence at this layer — the ACTUAL
 * `fetch` call `apiFetch` makes — mirroring `registrations.test.ts`'s
 * "emits the request as a POST body" section:
 *   - POST to `/api/v1/contact`, JSON body carrying every DTO field
 *   - no Authorization header (public, tokenless path)
 *   - a `202` empty-body success resolves with NO thrown parse error, and
 *     WITHOUT ever calling `response.json()` — proving `expectEmpty: true`
 *     is actually wired, not merely present in the source (a regression
 *     here would surface as `apiFetch` throwing on the very success path
 *     FR-2 requires to be silent)
 *   - non-OK responses reject with a typed `ApiError` carrying `status` and
 *     `details`, letting the caller (`ContactForm`) apply FR-5's partition —
 *     this file does not assert what gets RENDERED for any of them; that
 *     evidence lives in `ContactForm.test.tsx`
 */

import { ApiError } from './client';
import { submitContact, CONTACT_CATEGORIES, type ContactSubmission } from './contact';

function makeFetchAccepted(): jest.Mock {
  // Deliberately carries NO `json` method — if `submitContact` ever called
  // `response.json()` on the success path, this mock would throw
  // "response.json is not a function" and the test would fail loudly.
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 202,
    statusText: 'Accepted',
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

const VALID_SUBMISSION: ContactSubmission = {
  name: 'Neema Mrema',
  email: 'neema@khsc.co.tz',
  organization: 'Kibaigwa Highland Seed Co.',
  category: 'General inquiry',
  subject: 'Question about listing',
  message: 'How do we get listed in the directory?',
  privacyAcknowledged: true,
};

describe('submitContact()', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com' };
    jest.resetAllMocks();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('has all eight fixed categories, verbatim, transcribed from FR-2', () => {
    expect(CONTACT_CATEGORIES).toEqual([
      'General inquiry',
      'Join the registry',
      'Update or correct actor information',
      'Privacy or consent request',
      'Technical support',
      'Partnership or collaboration',
      'Feedback or suggestion',
      'Other',
    ]);
  });

  describe('the emitted request — Disqualifying-clause evidence', () => {
    it('sends a POST to /api/v1/contact with every field in a JSON body', async () => {
      global.fetch = makeFetchAccepted();

      await submitContact(VALID_SUBMISSION);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];

      expect(url).toBe('https://api.example.com/api/v1/contact');
      expect(init.method).toBe('POST');
      expect(typeof init.body).toBe('string');
      expect(JSON.parse(init.body as string)).toEqual(VALID_SUBMISSION);
    });

    it('attaches no Authorization header — public, tokenless path', async () => {
      global.fetch = makeFetchAccepted();

      await submitContact(VALID_SUBMISSION);

      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    });
  });

  it('resolves with no thrown error on a 202 with an empty body (expectEmpty wired)', async () => {
    global.fetch = makeFetchAccepted();

    await expect(submitContact(VALID_SUBMISSION)).resolves.toBeUndefined();
  });

  it('rejects with a typed ApiError carrying status and details on a 400', async () => {
    global.fetch = makeFetchNotOk(400, 'Bad Request', {
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      details: [{ field: 'email', message: 'email must be an email' }],
    });

    await expect(submitContact(VALID_SUBMISSION)).rejects.toBeInstanceOf(ApiError);
    try {
      await submitContact(VALID_SUBMISSION);
      throw new Error('expected submitContact to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(400);
      expect((err as ApiError).details).toEqual([{ field: 'email', message: 'email must be an email' }]);
    }
  });

  it('rejects with a typed ApiError on a 502 transport rejection', async () => {
    global.fetch = makeFetchNotOk(502, 'Bad Gateway', {
      statusCode: 502,
      error: 'Bad Gateway',
      message: 'Bad Gateway',
    });

    await expect(submitContact(VALID_SUBMISSION)).rejects.toMatchObject({ status: 502 });
  });

  it('rejects (does not swallow) on a network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(submitContact(VALID_SUBMISSION)).rejects.toThrow();
  });
});
