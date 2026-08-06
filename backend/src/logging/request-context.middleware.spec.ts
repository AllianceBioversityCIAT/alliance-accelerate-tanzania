// @sdd-spec actors/public-self-registration (T-4)
/**
 * `RequestContextMiddleware` unit tests (design.md §4.10, NFR-8, DC-14, DC-22).
 *
 * Attempt 2: these tests absorb the emission-behaviour coverage that
 * previously lived in the now-deleted `structured-log.interceptor.spec.ts`,
 * since `RequestContextMiddleware` is now the sole place that both attaches
 * the request id and emits the structured log line (see
 * `request-context.middleware.ts` for why emission moved here).
 *
 * **Disqualifying-clause ordering, followed literally in every PII/OTP test
 * below:** first assert a line WAS emitted (an empty log stream would
 * otherwise pass a naive "no PII in logs" check vacuously — exactly the trap
 * the task names), THEN assert what it does not contain. If no line is
 * captured the result is inconclusive, not a pass — so the emission
 * assertion always runs and always fails loudly on its own if the
 * middleware stops logging.
 */
import { Logger } from '@nestjs/common';
import { RequestContextMiddleware, StructuredLogLine } from './request-context.middleware';
import { RequestWithId } from './request-context.types';
import { AuthUser } from '../auth/auth.types';

/** A response double supporting the one thing the middleware needs: `on('finish', ...)`. */
function buildResponseMock(statusCode: number) {
  const finishHandlers: Array<() => void> = [];
  return {
    statusCode,
    on(event: string, cb: () => void) {
      if (event === 'finish') finishHandlers.push(cb);
    },
    emitFinish() {
      finishHandlers.forEach((cb) => cb());
    },
  };
}

describe('RequestContextMiddleware', () => {
  describe('request id', () => {
    it('attaches a requestId and calls next()', () => {
      const middleware = new RequestContextMiddleware();
      const req = { path: '/x', method: 'GET' } as RequestWithId;
      const res = buildResponseMock(200) as never;
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(typeof req.requestId).toBe('string');
      expect(req.requestId).not.toHaveLength(0);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('generates a different id on every request — never reused across requests', () => {
      const middleware = new RequestContextMiddleware();
      const reqA = { path: '/x', method: 'GET' } as RequestWithId;
      const reqB = { path: '/x', method: 'GET' } as RequestWithId;

      middleware.use(reqA, buildResponseMock(200) as never, jest.fn());
      middleware.use(reqB, buildResponseMock(200) as never, jest.fn());

      expect(reqA.requestId).not.toEqual(reqB.requestId);
    });

    it('never trusts a caller-supplied id — always overwrites whatever was already on the request', () => {
      const middleware = new RequestContextMiddleware();
      const req = { path: '/x', method: 'GET', requestId: 'attacker-supplied-id' } as RequestWithId;

      middleware.use(req, buildResponseMock(200) as never, jest.fn());

      expect(req.requestId).not.toEqual('attacker-supplied-id');
    });
  });

  describe('structured log emission', () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
      logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    it('captures one line carrying all six required fields, with correct values', () => {
      const req: Partial<RequestWithId> = { path: '/registrations/verify', method: 'POST' };
      const res = buildResponseMock(202);
      const middleware = new RequestContextMiddleware();

      middleware.use(req as RequestWithId & { user?: AuthUser }, res as never, jest.fn());
      res.emitFinish();

      // Emission proven first.
      expect(logSpy.mock.calls.length).toBeGreaterThan(0);

      const line = JSON.parse(logSpy.mock.calls[0][0] as string) as StructuredLogLine;
      expect(line.requestId).toBe(req.requestId);
      expect(line.route).toBe('/registrations/verify');
      expect(line.method).toBe('POST');
      expect(line.status).toBe(202);
      expect(line.role).toBe('Public');
      expect(typeof line.latencyMs).toBe('number');
      expect(line.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('reads role="Public" for an anonymous caller (no req.user — this module\'s routes run behind no guard)', () => {
      const req: Partial<RequestWithId & { user?: AuthUser }> = {
        path: '/registrations/consent-policy',
        method: 'GET',
        user: undefined,
      };
      const res = buildResponseMock(200);

      new RequestContextMiddleware().use(
        req as RequestWithId & { user?: AuthUser },
        res as never,
        jest.fn(),
      );
      res.emitFinish();

      expect(logSpy.mock.calls.length).toBeGreaterThan(0);
      const line = JSON.parse(logSpy.mock.calls[0][0] as string) as StructuredLogLine;
      expect(line.role).toBe('Public');
    });

    it('reads the real role off req.user when one is present (forward-compatible with a future guarded route)', () => {
      const req: Partial<RequestWithId & { user?: AuthUser }> = {
        path: '/admin/registrations',
        method: 'GET',
        user: { sub: 's', username: 'u', groups: ['admin'], role: 'Admin' },
      };
      const res = buildResponseMock(200);

      new RequestContextMiddleware().use(
        req as RequestWithId & { user?: AuthUser },
        res as never,
        jest.fn(),
      );
      res.emitFinish();

      const line = JSON.parse(logSpy.mock.calls[0][0] as string) as StructuredLogLine;
      expect(line.role).toBe('Admin');
    });

    it(
      'never emits an OTP code or PII fixture values, even when they are present on the request — ' +
        'proven emission-first, per the Disqualifying clause',
      () => {
        const fixtureEmail = 'applicant-secret@example.org';
        const fixturePhone = '+255700000999';
        const fixtureOtp = '482913';

        const req: Partial<RequestWithId & { body?: unknown; query?: unknown }> = {
          path: '/registrations',
          method: 'POST',
          // The middleware must never read these — present here to prove it doesn't.
          body: { email: fixtureEmail, phone: fixturePhone, code: fixtureOtp },
          query: { code: fixtureOtp },
        };
        const res = buildResponseMock(400);

        new RequestContextMiddleware().use(
          req as RequestWithId & { user?: AuthUser },
          res as never,
          jest.fn(),
        );
        res.emitFinish();

        // 1. A line WAS emitted — the precondition the Disqualifying clause requires
        //    before any absence claim means anything.
        const totalCalls = logSpy.mock.calls.length;
        expect(totalCalls).toBeGreaterThan(0);

        // 2. NOW check what it does not contain.
        const emitted = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(emitted).not.toContain(fixtureEmail);
        expect(emitted).not.toContain(fixturePhone);
        expect(emitted).not.toContain(fixtureOtp);
      },
    );

    it(
      "the logged route cannot carry an email address or any query-string value — " +
        "'route' is req.path, which is a disjoint parse from req.query/req.url",
      () => {
        const fixtureEmail = 'leak-attempt@example.org';
        const req: Partial<RequestWithId & { query?: unknown; originalUrl?: string; url?: string }> = {
          path: '/registrations/lookup',
          method: 'POST',
          query: { email: fixtureEmail },
          originalUrl: `/registrations/lookup?email=${encodeURIComponent(fixtureEmail)}`,
          url: `/registrations/lookup?email=${encodeURIComponent(fixtureEmail)}`,
        };
        const res = buildResponseMock(404);

        new RequestContextMiddleware().use(
          req as RequestWithId & { user?: AuthUser },
          res as never,
          jest.fn(),
        );
        res.emitFinish();

        expect(logSpy.mock.calls.length).toBeGreaterThan(0);

        const line = JSON.parse(logSpy.mock.calls[0][0] as string) as StructuredLogLine;
        expect(line.route).toBe('/registrations/lookup');
        expect(line.route).not.toContain(fixtureEmail);
        expect(line.route).not.toContain('?');
      },
    );
  });
});
