/**
 * ATP-33 — Security response headers for the API, registered through a single
 * `common/` helper and called from BOTH bootstraps (`main.ts`, `lambda.ts`),
 * following the precedent `payload-cap.config.ts` sets for shared bootstrap
 * configuration.
 *
 * **Ordering — this MUST be the first `app.use` in either bootstrap.** Express
 * middleware runs in registration order, so registering this ahead of
 * `configurePayloadCap` is what makes the headers present on the cap's own
 * `413` rejection, on a `ValidationPipe` `400`, and on any exception-filter
 * response — not only on successful handler output. Registering it later would
 * leave exactly the error responses uncovered.
 *
 * **Why not `helmet`.** Helmet's defaults are written for HTML documents
 * (`Content-Security-Policy`, `X-Download-Options`, `Origin-Agent-Cluster` and
 * others). This API returns JSON on every route, so those bytes would be paid
 * on every Lambda response to protect a document type this service never
 * serves. The two headers below are the ones that carry meaning for a JSON
 * API; the document-level headers belong on the CloudFront distribution that
 * serves the static frontend (`infra/30-frontend/template.yaml`), where the
 * documents actually are.
 *
 * **`preload` is deliberately absent from the HSTS value.** Preloading is
 * submitted per-domain and is effectively irreversible on the timescale of a
 * browser release. The API is served from an AWS-owned
 * `*.execute-api.<region>.amazonaws.com` host today; committing a shared AWS
 * domain to a preload list is not ours to do. Revisit only if the API moves to
 * a domain this project owns. `security-headers.config.spec.ts` asserts the
 * absence, so the decision fails loudly rather than drifting back in.
 */
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

/** One year, the value HSTS requires for a policy browsers will honour. */
export const HSTS_MAX_AGE_SECONDS = 31_536_000;

/**
 * The full set, as data, so the spec asserts against the same source the
 * middleware writes from rather than restating the strings.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  // Stops a browser from re-interpreting a response as a type other than the
  // one declared. Load-bearing here because the platform serves CSV exports:
  // a sniffed download is the concrete case, not a theoretical one.
  'X-Content-Type-Options': 'nosniff',
  // CloudFront already redirects HTTP → HTTPS, which leaves the FIRST request
  // of a session travelling in the clear. HSTS is what closes that window.
  'Strict-Transport-Security': `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`,
});

/**
 * Express middleware setting every header in {@link SECURITY_HEADERS}.
 * Exported separately from {@link configureSecurityHeaders} so it can be
 * exercised directly in a unit test without bootstrapping Nest.
 */
export function securityHeadersMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
  next();
}

/**
 * Registers {@link securityHeadersMiddleware}. Both `main.ts` and `lambda.ts`
 * MUST call this, and MUST call it before any other `app.use` — see the
 * ordering note in this file's header.
 */
export function configureSecurityHeaders(app: NestExpressApplication): void {
  app.use(securityHeadersMiddleware);
}
