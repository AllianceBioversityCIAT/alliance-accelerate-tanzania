// @sdd-spec actors/public-self-registration (T-6)
// @sdd-spec contact/contact-channels (T-4)
/**
 * T-6 — Unit-level, per-clause proof of `registrationsPayloadCapMiddleware`
 * (FR-7 scenario 2, NFR-4, design.md §4.4 P-1…P-3).
 *
 * These tests drive the exported middleware function directly against
 * constructed req/res/next doubles — fast and deterministic for each
 * individual clause. They are NOT the release evidence for "rejection
 * happens before parsing on the real Lambda entrypoint" or for the
 * `429`-through-the-real-handler obligation; that proof can only come from
 * `lambda-handler.e2e.spec.ts`, which drives the actual `lambda.ts` handler
 * (KZ-002 — a unit-level presence assertion here does not substitute for
 * that). What THIS suite proves precisely: P-1's wiring call, P-2's exact
 * path-matching rule (including the un-prefixed-path failure mode RA8
 * describes, AND the case-sensitivity bypass a 2026-08-05 review found —
 * Express routes case-insensitively by default, so a case-sensitive matcher
 * here is narrower than the route set it exists to cover), and every branch
 * of P-3's "declares no length" rule.
 *
 * **T-4 extension (contact/contact-channels), restructured 2026-08-31.** T-4
 * generalised `isRegistrationsPath` into `isCappedPath` over
 * `CAPPED_PATH_PREFIXES`, so the contract is no longer "registrations is
 * capped" but **"every prefix in that array behaves identically"**. The
 * P-2/P-3 cases below are therefore driven by `describe.each` over the
 * REAL exported array, not over a copy: adding a third prefix extends this
 * suite automatically, where the previous copy-pasted contact block would
 * have said nothing about it. The parameterisation is the assertion.
 */
import { PayloadTooLargeException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  CAPPED_PATH_PREFIXES,
  REGISTRATIONS_PAYLOAD_CAP_BYTES,
  configurePayloadCap,
  registrationsPayloadCapMiddleware,
} from './payload-cap.config';

function fakeReq(overrides: {
  path: string;
  method?: string;
  headers?: Record<string, string>;
}): Request {
  return {
    path: overrides.path,
    method: overrides.method ?? 'POST',
    headers: overrides.headers ?? {},
  } as unknown as Request;
}

const fakeRes = {} as Response;

describe('registrationsPayloadCapMiddleware', () => {
  /** Drives the middleware and returns the single argument `next` received. */
  function run(req: Request): unknown[] {
    const next = jest.fn() as unknown as NextFunction;
    registrationsPayloadCapMiddleware(req, fakeRes, next);
    expect(next).toHaveBeenCalledTimes(1);
    return (next as jest.Mock).mock.calls[0] as unknown[];
  }

  const expectCapped = (req: Request) =>
    expect(run(req)[0]).toBeInstanceOf(PayloadTooLargeException);
  /** `next()` with NO argument — the request was let through untouched. */
  const expectPassed = (req: Request) => expect(run(req)).toHaveLength(0);

  const OVER = String(REGISTRATIONS_PAYLOAD_CAP_BYTES + 1);

  describe('P-1 — registered through the shared configure* helper', () => {
    it('configurePayloadCap wires the middleware onto the app via app.use', () => {
      const use = jest.fn();
      const app = { use } as unknown as Parameters<typeof configurePayloadCap>[0];

      configurePayloadCap(app);

      expect(use).toHaveBeenCalledTimes(1);
      expect(use).toHaveBeenCalledWith(registrationsPayloadCapMiddleware);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // The shared contract, run once per REAL capped prefix (T-4).
  // ───────────────────────────────────────────────────────────────────────────
  describe.each(CAPPED_PATH_PREFIXES)('capped prefix %s', (prefix) => {
    const unprefixed = prefix.replace('/api/v1', '');

    describe('P-2 — path matching accounts for the api/v1 global prefix', () => {
      it('caps an oversized body on the PREFIXED path', () => {
        expectCapped(fakeReq({ path: prefix, headers: { 'content-length': OVER } }));
      });

      it(
        `does NOT cap the same oversized body on the UN-PREFIXED path (${unprefixed}) — a test ` +
          'written against the un-prefixed path would wrongly read as covered while the real ' +
          '(prefixed) route sailed through uncapped (RA8) if this middleware matched the wrong string',
        () => {
          expectPassed(fakeReq({ path: unprefixed, headers: { 'content-length': OVER } }));
        },
      );

      it(`does not treat "${prefix}X" as a capped path (segment-boundary match)`, () => {
        expectPassed(fakeReq({ path: `${prefix}X`, headers: { 'content-length': OVER } }));
      });

      it(
        'caps an oversized body on an UPPERCASE/mixed-case path — Express routes ' +
          'case-insensitively by default, so a case-sensitive matcher here would be bypassed by ' +
          'a caller who merely shifts one character to uppercase (2026-08-05 review finding)',
        () => {
          expectCapped(
            fakeReq({ path: prefix.toUpperCase(), headers: { 'content-length': OVER } }),
          );
        },
      );

      it('also catches the chunked/no-length bypass on a mixed-case path (same defect, P-3 axis)', () => {
        expectCapped(
          fakeReq({
            path: prefix.toUpperCase(),
            method: 'POST',
            headers: { 'transfer-encoding': 'chunked' },
          }),
        );
      });
    });

    describe('P-3 — a request declaring no length cannot bypass the cap', () => {
      it('rejects a chunked request with NO Content-Length at all', () => {
        expectCapped(
          fakeReq({ path: prefix, method: 'POST', headers: { 'transfer-encoding': 'chunked' } }),
        );
      });

      it('rejects a POST with no Content-Length header and no Transfer-Encoding either', () => {
        expectCapped(fakeReq({ path: prefix, method: 'POST', headers: {} }));
      });

      it.each(['not-a-number', '+100', '0x20', ' 100 ', '', '1.5', '-1'])(
        'rejects a Content-Length header of %j — a shape Number(...) would silently accept but ' +
          "this middleware's stricter digits-only rule does not rest on Node's parser never " +
          'producing it',
        (contentLength) => {
          expectCapped(
            fakeReq({ path: prefix, method: 'POST', headers: { 'content-length': contentLength } }),
          );
        },
      );

      it(
        'does NOT reject a bodyless GET carrying neither header — GET routes under a capped ' +
          'prefix (e.g. GET /api/v1/registrations/consent-policy, the one such route shipped ' +
          'today) must keep working',
        () => {
          expectPassed(fakeReq({ path: prefix, method: 'GET', headers: {} }));
        },
      );

      it('passes a request with a valid Content-Length AT the cap', () => {
        expectPassed(
          fakeReq({
            path: prefix,
            method: 'POST',
            headers: { 'content-length': String(REGISTRATIONS_PAYLOAD_CAP_BYTES) },
          }),
        );
      });

      it('rejects a request with a valid Content-Length one byte OVER the cap', () => {
        expectCapped(
          fakeReq({ path: prefix, method: 'POST', headers: { 'content-length': OVER } }),
        );
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Membership pin. WITHOUT this, `describe.each` above is a gate that cannot
  // fail in one direction: deleting a prefix from CAPPED_PATH_PREFIXES does not
  // redden anything, it silently deletes that prefix's cases and the suite goes
  // green with fewer tests. Demonstrated 2026-08-31 — removing the contact
  // prefix took the suite from 36 passing to 19 passing, with zero failures
  // (KZ-002: a gate that cannot fail is not a gate).
  // `arrayContaining` on purpose: ADDING a prefix must stay free, since the
  // parameterisation then covers it automatically. Only REMOVAL fails here.
  // ───────────────────────────────────────────────────────────────────────────
  it('pins the capped prefixes — removing one fails HERE rather than shrinking the suite above', () => {
    expect(CAPPED_PATH_PREFIXES).toEqual(
      expect.arrayContaining(['/api/v1/registrations', '/api/v1/contact']),
    );
  });

  describe('paths outside CAPPED_PATH_PREFIXES are never capped', () => {
    it('leaves an unrelated path uncapped regardless of size', () => {
      expectPassed(
        fakeReq({
          path: '/api/v1/admin/actors/import',
          headers: { 'content-length': String(REGISTRATIONS_PAYLOAD_CAP_BYTES * 100) },
        }),
      );
    });
  });
});
