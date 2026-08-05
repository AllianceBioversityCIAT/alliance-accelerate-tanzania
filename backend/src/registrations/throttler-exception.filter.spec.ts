// @sdd-spec actors/public-self-registration (T-5)
/**
 * `ThrottlerExceptionFilter` unit tests (FR-7, DC-26, A21).
 *
 * Drives `catch()` directly with a mocked `ArgumentsHost`/response — the
 * cheapest place to pin the EXACT envelope byte-for-byte (statusCode 429,
 * `error: 'Too Many Requests'`, an applicant-facing `message` that is NOT
 * the library's raw `"ThrottlerException: Too Many Requests"` string).
 * `registrations-throttle.e2e.spec.ts` proves the same shape again through a
 * real guard-thrown exception over real HTTP — this file isolates the
 * filter's own mapping logic from the guard that triggers it.
 */
import { ThrottlerException } from '@nestjs/throttler';
import { ThrottledResponseBody, ThrottlerExceptionFilter } from './throttler-exception.filter';

/** A response double capturing exactly what `res.status(...).json(...)` was called with. */
function buildResponseMock() {
  const calls: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      calls.status = code;
      return res;
    },
    json(body: unknown) {
      calls.body = body;
      return res;
    },
  };
  return { res, calls };
}

function hostFor(res: unknown) {
  return {
    switchToHttp: () => ({
      getResponse: () => res,
    }),
  } as unknown as Parameters<ThrottlerExceptionFilter['catch']>[1];
}

describe('ThrottlerExceptionFilter', () => {
  it('replies 429 with the exact documented envelope: { statusCode, error, message }', () => {
    const { res, calls } = buildResponseMock();
    const filter = new ThrottlerExceptionFilter();

    filter.catch(new ThrottlerException(), hostFor(res));

    expect(calls.status).toBe(429);
    const body = calls.body as ThrottledResponseBody;
    expect(body).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: expect.any(String),
    });
    // Exactly these three keys — no `details` (this is never a validation error).
    expect(Object.keys(body).sort()).toEqual(['error', 'message', 'statusCode']);
  });

  it(
    'never surfaces the library\'s raw "ThrottlerException: Too Many Requests" string as the ' +
      'user-facing message (A21) — the whole reason this filter exists',
    () => {
      const { res, calls } = buildResponseMock();
      const filter = new ThrottlerExceptionFilter();

      filter.catch(new ThrottlerException(), hostFor(res));

      const body = calls.body as ThrottledResponseBody;
      expect(body.message).not.toMatch(/ThrottlerException/i);
      expect(body.message.length).toBeGreaterThan(0);
    },
  );

  it('replies with the same envelope regardless of the exception\'s own (possibly customised) message', () => {
    const { res, calls } = buildResponseMock();
    const filter = new ThrottlerExceptionFilter();

    // A ThrottlerGuard subclass CAN pass a custom message into the exception;
    // the filter's envelope must not depend on — or leak — whatever that was.
    filter.catch(new ThrottlerException('some other internal detail'), hostFor(res));

    const body = calls.body as ThrottledResponseBody;
    expect(body.message).not.toMatch(/internal detail/i);
    expect(body.error).toBe('Too Many Requests');
    expect(body.statusCode).toBe(429);
  });
});
