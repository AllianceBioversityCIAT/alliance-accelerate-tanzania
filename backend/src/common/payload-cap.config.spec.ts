// @sdd-spec actors/public-self-registration (T-6)
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
 */
import { PayloadTooLargeException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
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
  describe('P-1 — registered through the shared configure* helper', () => {
    it('configurePayloadCap wires the middleware onto the app via app.use', () => {
      const use = jest.fn();
      const app = { use } as unknown as Parameters<typeof configurePayloadCap>[0];

      configurePayloadCap(app);

      expect(use).toHaveBeenCalledTimes(1);
      expect(use).toHaveBeenCalledWith(registrationsPayloadCapMiddleware);
    });
  });

  describe('P-2 — path matching accounts for the api/v1 global prefix', () => {
    it('caps an oversized body on the PREFIXED registrations path', () => {
      const req = fakeReq({
        path: '/api/v1/registrations/verify',
        headers: { 'content-length': String(REGISTRATIONS_PAYLOAD_CAP_BYTES + 1) },
      });
      const next = jest.fn() as unknown as NextFunction;

      registrationsPayloadCapMiddleware(req, fakeRes, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect((next as jest.Mock).mock.calls[0][0]).toBeInstanceOf(PayloadTooLargeException);
    });

    it(
      'does NOT cap the same oversized body on the UN-PREFIXED path — proving a test written ' +
        'against /registrations rather than /api/v1/registrations would wrongly read as covered ' +
        'while the real (prefixed) route sails through uncapped (RA8) if this middleware matched ' +
        'the wrong string',
      () => {
        const req = fakeReq({
          path: '/registrations/verify',
          headers: { 'content-length': String(REGISTRATIONS_PAYLOAD_CAP_BYTES + 1) },
        });
        const next = jest.fn() as unknown as NextFunction;

        registrationsPayloadCapMiddleware(req, fakeRes, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect((next as jest.Mock).mock.calls[0]).toHaveLength(0);
      },
    );

    it('leaves an unrelated, non-registrations path uncapped regardless of size', () => {
      const req = fakeReq({
        path: '/api/v1/admin/actors/import',
        headers: { 'content-length': String(REGISTRATIONS_PAYLOAD_CAP_BYTES * 100) },
      });
      const next = jest.fn() as unknown as NextFunction;

      registrationsPayloadCapMiddleware(req, fakeRes, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('does not treat "/api/v1/registrationsX" as a registrations path (segment-boundary match)', () => {
      const req = fakeReq({
        path: '/api/v1/registrationsX',
        headers: { 'content-length': String(REGISTRATIONS_PAYLOAD_CAP_BYTES + 1) },
      });
      const next = jest.fn() as unknown as NextFunction;

      registrationsPayloadCapMiddleware(req, fakeRes, next);

      expect(next).toHaveBeenCalledWith();
    });

    it(
      'caps an oversized body on an UPPERCASE/mixed-case registrations path — Express routes ' +
        "case-insensitively by default, so a case-sensitive matcher here would be bypassed by a " +
        'caller who merely shifts one character to uppercase (2026-08-05 review finding)',
      () => {
        const req = fakeReq({
          path: '/API/V1/REGISTRATIONS/verify',
          headers: { 'content-length': String(REGISTRATIONS_PAYLOAD_CAP_BYTES + 1) },
        });
        const next = jest.fn() as unknown as NextFunction;

        registrationsPayloadCapMiddleware(req, fakeRes, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect((next as jest.Mock).mock.calls[0][0]).toBeInstanceOf(PayloadTooLargeException);
      },
    );

    it('also catches the chunked/no-length bypass on a mixed-case path (same defect, P-3 axis)', () => {
      const req = fakeReq({
        path: '/Api/V1/Registrations',
        method: 'POST',
        headers: { 'transfer-encoding': 'chunked' },
      });
      const next = jest.fn() as unknown as NextFunction;

      registrationsPayloadCapMiddleware(req, fakeRes, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect((next as jest.Mock).mock.calls[0][0]).toBeInstanceOf(PayloadTooLargeException);
    });
  });

  describe('P-3 — a request declaring no length cannot bypass the cap', () => {
    it('rejects a chunked request with NO Content-Length at all', () => {
      const req = fakeReq({
        path: '/api/v1/registrations',
        method: 'POST',
        headers: { 'transfer-encoding': 'chunked' },
      });
      const next = jest.fn() as unknown as NextFunction;

      registrationsPayloadCapMiddleware(req, fakeRes, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect((next as jest.Mock).mock.calls[0][0]).toBeInstanceOf(PayloadTooLargeException);
    });

    it('rejects a POST with no Content-Length header and no Transfer-Encoding either', () => {
      const req = fakeReq({ path: '/api/v1/registrations/verify', method: 'POST', headers: {} });
      const next = jest.fn() as unknown as NextFunction;

      registrationsPayloadCapMiddleware(req, fakeRes, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect((next as jest.Mock).mock.calls[0][0]).toBeInstanceOf(PayloadTooLargeException);
    });

    it('rejects a request with an unparsable Content-Length header', () => {
      const req = fakeReq({
        path: '/api/v1/registrations',
        method: 'POST',
        headers: { 'content-length': 'not-a-number' },
      });
      const next = jest.fn() as unknown as NextFunction;

      registrationsPayloadCapMiddleware(req, fakeRes, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect((next as jest.Mock).mock.calls[0][0]).toBeInstanceOf(PayloadTooLargeException);
    });

    it.each(['+100', '0x20', ' 100 ', '', '1.5', '-1'])(
      'rejects a Content-Length header of %j — a shape Number(...) would silently accept but ' +
        "this middleware's stricter digits-only rule does not rest on Node's parser never " +
        'producing it',
      (contentLength) => {
        const req = fakeReq({
          path: '/api/v1/registrations',
          method: 'POST',
          headers: { 'content-length': contentLength },
        });
        const next = jest.fn() as unknown as NextFunction;

        registrationsPayloadCapMiddleware(req, fakeRes, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect((next as jest.Mock).mock.calls[0][0]).toBeInstanceOf(PayloadTooLargeException);
      },
    );

    it(
      'does NOT reject a bodyless GET carrying neither header — the one route this module ships ' +
        'today (GET /api/v1/registrations/consent-policy) must keep working',
      () => {
        const req = fakeReq({
          path: '/api/v1/registrations/consent-policy',
          method: 'GET',
          headers: {},
        });
        const next = jest.fn() as unknown as NextFunction;

        registrationsPayloadCapMiddleware(req, fakeRes, next);

        expect(next).toHaveBeenCalledWith();
      },
    );

    it('passes a request with a valid Content-Length AT the cap', () => {
      const req = fakeReq({
        path: '/api/v1/registrations',
        method: 'POST',
        headers: { 'content-length': String(REGISTRATIONS_PAYLOAD_CAP_BYTES) },
      });
      const next = jest.fn() as unknown as NextFunction;

      registrationsPayloadCapMiddleware(req, fakeRes, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('rejects a request with a valid Content-Length one byte OVER the cap', () => {
      const req = fakeReq({
        path: '/api/v1/registrations',
        method: 'POST',
        headers: { 'content-length': String(REGISTRATIONS_PAYLOAD_CAP_BYTES + 1) },
      });
      const next = jest.fn() as unknown as NextFunction;

      registrationsPayloadCapMiddleware(req, fakeRes, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect((next as jest.Mock).mock.calls[0][0]).toBeInstanceOf(PayloadTooLargeException);
    });
  });
});
