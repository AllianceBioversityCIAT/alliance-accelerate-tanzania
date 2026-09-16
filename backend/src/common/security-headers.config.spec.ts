/**
 * ATP-33 — behaviour of the security-header middleware.
 *
 * The `preload` case is the one worth reading twice: it is not testing that a
 * string is well-formed, it is pinning a decision. `preload` on a shared,
 * AWS-owned domain is effectively irreversible, so a future edit that adds it
 * must fail here rather than reach a deploy.
 */
import { securityHeadersMiddleware, SECURITY_HEADERS, HSTS_MAX_AGE_SECONDS } from './security-headers.config';
import type { NextFunction, Request, Response } from 'express';

function fakeResponse(): { res: Response; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const res = {
    setHeader(name: string, value: string): void {
      headers[name] = value;
    },
  } as unknown as Response;
  return { res, headers };
}

describe('securityHeadersMiddleware', () => {
  it('sets every header declared in SECURITY_HEADERS', () => {
    const { res, headers } = fakeResponse();
    const next = jest.fn() as unknown as NextFunction;

    securityHeadersMiddleware({} as Request, res, next);

    expect(headers).toEqual({ ...SECURITY_HEADERS });
  });

  it('passes the request on', () => {
    const { res } = fakeResponse();
    const next = jest.fn();

    securityHeadersMiddleware({} as Request, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('declares nosniff, which the CSV export paths depend on', () => {
    expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
  });

  it('declares an HSTS max-age of one year, with subdomains', () => {
    expect(HSTS_MAX_AGE_SECONDS).toBe(31_536_000);
    expect(SECURITY_HEADERS['Strict-Transport-Security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
  });

  it('does NOT declare HSTS preload — a deliberate decision, not an omission', () => {
    expect(SECURITY_HEADERS['Strict-Transport-Security']).not.toContain('preload');
  });
});
