// @sdd-spec actors/public-self-registration (T-6)
// @sdd-spec contact/contact-channels (T-4)
/**
 * T-6 — Request-size cap for every public registration route (FR-7 scenario
 * 2, NFR-4, `design.md` §4.4's P-1…P-3), registered through a single
 * `common/` helper and called from BOTH bootstraps (`main.ts`, `lambda.ts`)
 * IMMEDIATELY BEFORE `configureBodyParser(app)` — never after.
 *
 * **T-4 extension (contact/contact-channels).** Without an explicit path
 * scope, `/api/v1/contact` would inherit the global 8 MB `JSON_BODY_LIMIT`
 * (`common/body-parser.config.ts`) and parse it into Lambda memory BEFORE the
 * throttle guard runs — guards are Nest-level, this middleware is Express-
 * level and runs ahead of Nest's router (`design.md` §4.1.1, NFR-2). Rather
 * than adding a second, parallel middleware, `CAPPED_PATH_PREFIXES` below now
 * lists both routes against the SAME `REGISTRATIONS_PAYLOAD_CAP_BYTES` value
 * (both specs independently land on 32 KB), so P-1's "one source of truth"
 * still holds — now for two routes instead of one. Every P-2/P-3 rule this
 * header documents (prefix matching incl. the global `api/v1` prefix,
 * case-insensitivity, the chunked/malformed-`Content-Length` bypass) applies
 * identically to the contact route; nothing about the mechanism changed,
 * only the set of paths it is scoped to.
 *
 * Why this cannot be a `MiddlewareConsumer`-registered Nest module middleware
 * (`design.md` §4.4, C-2): Nest module middleware registers during
 * `app.init()`, which always runs AFTER whatever `app.use()` calls the
 * bootstrap function has already made — the same reasoning
 * `body-parser.config.ts`'s header records for the parser itself. Because
 * `configureBodyParser(app)` is itself `app.useBodyParser(...)` +
 * `app.use(...)` registered at call time (`body-parser.config.ts:123-126`),
 * calling THIS helper earlier in the same bootstrap function guarantees it
 * runs upstream of the parser — the ordering FR-7 depends on ("rejected
 * before it is parsed").
 *
 * P-1 — single source of truth. Both `main.ts` and `lambda.ts` MUST call
 * `configurePayloadCap(app)` from this file; two independently hand-written
 * `app.use` blocks would let the local and deployed limits drift apart,
 * exactly the failure `body-parser.config.ts`'s header warns against (RA9).
 *
 * P-2 — path matching accounts for the global prefix. `app.setGlobalPrefix
 * ('api/v1')` is a Nest routing concern; this is raw Express middleware
 * registered ahead of Nest's own router, so it sees the FULL path
 * (`/api/v1/registrations/...`), never the un-prefixed form Nest controllers
 * are decorated with. Matching against the un-prefixed path here would
 * silently scope this cap to nothing — every real request would fail the
 * prefix check and sail through uncapped (RA8's failure mode) while every
 * test written against the un-prefixed path kept passing.
 *
 * P-3 — a request that declares no length must not bypass the cap. A
 * `Content-Length`-only check is defeated by `Transfer-Encoding: chunked`,
 * which carries no `Content-Length` at all and would otherwise fall through
 * uncapped to the global 8 MB `JSON_BODY_LIMIT`. See {@link declaresNoLength}
 * for the exact rule, and why a bodyless `GET` (which legitimately carries
 * NEITHER header) must NOT be rejected by it — `GET
 * /api/v1/registrations/consent-policy` is the one route this module ships
 * today, and it must keep working. The unconditional `chunked` rejection
 * relies on nothing between the client and this middleware rewriting or
 * stripping a `transfer-encoding` header before it reaches Express — true of
 * both the local Express path and the deployed Lambda path today (API
 * Gateway/`serverless-http` forward `event.headers` verbatim), but worth
 * re-checking if an intermediary is ever introduced.
 *
 * **Rework — case sensitivity (2026-08-05 review).** The path match below
 * MUST lower-case before comparing. Express's router matches routes
 * case-INSENSITIVELY by default (`caseSensitive` is off unless
 * `app.set('case sensitive routing', true)` is called, which nothing in this
 * codebase does), so `POST /API/V1/REGISTRATIONS` reaches
 * `RegistrationsController` while a case-sensitive string comparison here
 * would miss it — silently disabling both P-2 and P-3 for any caller who
 * shifts one character to uppercase. Forcing Express into case-sensitive
 * routing instead was considered and rejected: that is a global
 * routing-behaviour change affecting every existing endpoint, for a problem
 * this middleware can fix locally.
 */

import { NestExpressApplication } from '@nestjs/platform-express';
import { PayloadTooLargeException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Maximum request body size for every route listed in
 * {@link CAPPED_PATH_PREFIXES} (registrations AND, as of T-4, contact).
 * Deliberately far below the global 8 MB `JSON_BODY_LIMIT`
 * (`../common/body-parser.config`), which serves the admin import path and is
 * untouched by either spec (`design.md` §4.4 here; contact/contact-channels
 * `design.md` §4.1.1/§4.2 there). `RegistrationCreateDto`'s largest realistic
 * body — every bounded string field at its `@MaxLength`, GPS, up to nine
 * crops — is well under 2 KB, and `ContactCreateDto`'s is smaller still; 32 KB
 * leaves generous headroom for JSON/whitespace overhead and future fields
 * while staying roughly 250x smaller than the import limit, so even a flood
 * of maximally-sized bodies cannot approach the connection pressure NFR-4
 * (registrations) / NFR-2 (contact) exist to prevent. Retains its
 * registrations-only name for backward compatibility — `lambda-handler.e2e
 * .spec.ts` (owned by actors/public-self-registration) imports it by this
 * name — but the VALUE now governs both routes identically.
 */
export const REGISTRATIONS_PAYLOAD_CAP_BYTES = 32 * 1024;

/**
 * Every route this module adds is exercised under this prefix, INCLUDING the
 * `api/v1` global prefix (P-2). Matched on a path-segment boundary so
 * `/api/v1/registrations` and `/api/v1/registrations/verify` both match, and
 * a hypothetical unrelated `/api/v1/registrationsX` route would not.
 */
const REGISTRATIONS_PATH_PREFIX = '/api/v1/registrations';

/**
 * T-4 (contact/contact-channels): the public contact endpoint, capped at the
 * same 32 KB figure for the same "declared before parsed" reason — see the
 * file header's "T-4 extension" note.
 */
const CONTACT_PATH_PREFIX = '/api/v1/contact';

/**
 * Every path prefix this middleware caps. Adding a route here is the ONLY
 * change needed to bring a new public endpoint under the cap — the matching
 * rule, the case-insensitivity, and the P-3 "declares no length" logic below
 * apply uniformly to every entry.
 */
const CAPPED_PATH_PREFIXES = [REGISTRATIONS_PATH_PREFIX, CONTACT_PATH_PREFIX];

/**
 * Case-insensitive on purpose: Express's router matches routes
 * case-insensitively by default, so a case-sensitive comparison here would be
 * NARROWER than the route set it exists to cover — a request whose path
 * merely differs in case would reach the controller while this check waved
 * it through uncapped. Lower-casing before comparing keeps the two in
 * agreement without touching global routing behaviour.
 */
function isCappedPath(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return CAPPED_PATH_PREFIXES.some(
    (prefix) => lowerPath === prefix || lowerPath.startsWith(`${prefix}/`),
  );
}

/** HTTP methods that legitimately carry no body, and so no length header at all. */
const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'DELETE', 'OPTIONS']);

/**
 * A `Content-Length` value this middleware trusts: a string of one or more
 * ASCII digits (no sign, no leading/trailing whitespace, no hex, no decimal).
 * Deliberately stricter than `Number(...)`, which happily accepts `'+100'`,
 * `'0x20'`, `' 100 '`, and `''` (→ `0`) — none reachable through Node's HTTP
 * parser today, but a regex that states the trusted shape outright does not
 * rest on that being true forever.
 */
const VALID_CONTENT_LENGTH = /^\d+$/;

/**
 * True when a request declares a body whose length this middleware cannot
 * trust:
 *
 * - `Transfer-Encoding: chunked` — a chunked request carries no
 *   `Content-Length` by definition, so its true size is unknown until the
 *   whole stream has been read. Rejecting outright (rather than reading to
 *   find out) is what keeps rejection ahead of parsing (P-3).
 * - A `Content-Length` header that is present but does not match
 *   {@link VALID_CONTENT_LENGTH} — untrustworthy in the same way, treated the
 *   same way.
 *
 * A bodyless method (`GET`/`HEAD`/`DELETE`/`OPTIONS`) that carries NEITHER
 * header is declaring no BODY, which is not the same thing, and must return
 * `false` here — otherwise every plain `GET
 * /api/v1/registrations/consent-policy` would be rejected as if it were an
 * oversized POST.
 */
function declaresNoLength(req: Request): boolean {
  const transferEncoding = req.headers['transfer-encoding'];
  if (typeof transferEncoding === 'string' && /chunked/i.test(transferEncoding)) {
    return true;
  }

  const contentLength = req.headers['content-length'];
  if (contentLength === undefined) {
    return !BODYLESS_METHODS.has(req.method.toUpperCase());
  }

  return !VALID_CONTENT_LENGTH.test(contentLength);
}

/**
 * The cap middleware itself — exported (not only the `configure*` wrapper)
 * so `payload-cap.config.spec.ts` can drive it directly against constructed
 * req/res/next doubles for fast, deterministic per-clause (P-1/P-2/P-3)
 * proofs, alongside the real-handler proofs in `lambda-handler.e2e.spec.ts`
 * (P-2, and the P-3 sub-cases reachable there: chunked-header-forwarded and
 * malformed-`Content-Length`) and `payload-cap.e2e.spec.ts` (the P-3
 * sub-case NOT reachable via the Lambda harness: an absent `Content-Length`
 * over a genuinely streamed, local connection — see that file's header for
 * why).
 */
export function registrationsPayloadCapMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!isCappedPath(req.path)) {
    next();
    return;
  }

  if (declaresNoLength(req)) {
    next(
      new PayloadTooLargeException(
        'Request body must declare a valid Content-Length, and chunked transfer encoding is not accepted on this endpoint.',
      ),
    );
    return;
  }

  const declaredLength = Number(req.headers['content-length']);
  if (declaredLength > REGISTRATIONS_PAYLOAD_CAP_BYTES) {
    next(
      new PayloadTooLargeException(
        `Request body exceeds the ${REGISTRATIONS_PAYLOAD_CAP_BYTES}-byte limit for this endpoint.`,
      ),
    );
    return;
  }

  next();
}

/**
 * Apply the payload cap (registrations AND contact — {@link
 * CAPPED_PATH_PREFIXES}) to a Nest Express application. Call this from EVERY
 * bootstrap (`main.ts`, `lambda.ts`) BEFORE `configureBodyParser(app)` — see
 * this file's header for why the ordering is load-bearing.
 */
export function configurePayloadCap(app: NestExpressApplication): void {
  app.use(registrationsPayloadCapMiddleware);
}
