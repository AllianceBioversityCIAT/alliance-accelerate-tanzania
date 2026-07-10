// @sdd-spec admin/actor-import
/**
 * T-6 — Shared JSON body-parser configuration (design §4/§9, W-1 discipline).
 *
 * The actor-import route (`POST /api/v1/admin/actors/import`) receives the
 * workbook as a base64 JSON body (DR-1). A 1,000-row `.xlsx` base64-encodes to
 * comfortably more than Express's default ~100 kB JSON limit, so the limit must
 * be raised. Both entrypoints — `main.ts` (local) and `lambda.ts` (serverless) —
 * MUST configure the parser through THIS single helper so the deployed limit and
 * the tested limit can never drift (the same shared-factory rule as the
 * ValidationPipe in `validation-pipe.ts`).
 *
 * Two things are wired here, both applied identically to both entrypoints:
 *
 * 1. `app.useBodyParser('json', { limit })` — the raised JSON limit for the LOCAL
 *    HTTP path (`main.ts`), where Express streams the request and body-parser
 *    reads it normally.
 *
 * 2. A serverless JSON normalizer (`normalizeServerlessJsonBody`) — the fix for a
 *    `serverless-http` × body-parser 2.x incompatibility (below) that only bites
 *    on the deployed Lambda path.
 *
 * Why the serverless path needs (2): under `serverless-http`, the synthetic
 * `ServerlessRequest` pre-assigns `req.body` to the raw request Buffer AND marks
 * the request `complete: true` (with `readable: false`). body-parser 2.x (Express
 * 5) guards the top of its read with `onFinished.isFinished(req)`, which is
 * `true` for that synthetic request — so body-parser returns WITHOUT parsing,
 * leaving `req.body` as a raw Buffer. That Buffer then reaches the global
 * ValidationPipe, whose `whitelist` step tries to `delete` array indices off the
 * Uint8Array and throws `TypeError: Cannot delete property '0' of [object
 * Uint8Array]` → an unhandled 500. The normalizer runs after body-parser and,
 * only when body-parser left a raw Buffer/string behind, parses it into the
 * object the rest of the stack expects. On the local path body-parser has already
 * produced an object, so the normalizer is a no-op there — keeping both paths
 * symmetric.
 */

import { NestExpressApplication } from '@nestjs/platform-express';
import {
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Maximum JSON request body size. 8 MB comfortably fits the base64 form of the
 * import cap (4 MB decoded ≈ 5.5 MB base64) with headroom, while staying under
 * the API Gateway payload ceiling (design §7).
 */
export const JSON_BODY_LIMIT = '8mb';

/** {@link JSON_BODY_LIMIT} expressed in bytes for the serverless normalizer. */
const JSON_BODY_LIMIT_BYTES = 8 * 1024 * 1024;

/** True when the request declares a JSON content type (charset params allowed). */
function isJsonContentType(req: Request): boolean {
  const contentType = req.headers['content-type'];
  return typeof contentType === 'string' && /json/i.test(contentType);
}

/**
 * Parse the raw JSON Buffer/string that `serverless-http` leaves on `req.body`.
 *
 * A no-op unless `req.body` is still a Buffer/string (i.e. body-parser skipped
 * it — the Lambda path). Enforces the shared 8 MB limit and turns malformed JSON
 * into a clean 400 rather than letting a raw Buffer reach the ValidationPipe.
 */
export function normalizeServerlessJsonBody(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const body: unknown = req.body;

  // body-parser (local path) already produced an object/array — leave it.
  if (!Buffer.isBuffer(body) && typeof body !== 'string') {
    next();
    return;
  }

  // Only JSON bodies are parsed here; anything else is left untouched (and the
  // ValidationPipe body-shape guard turns it into a clean 400 downstream).
  if (!isJsonContentType(req)) {
    next();
    return;
  }

  const raw = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');

  if (raw.length === 0) {
    req.body = {};
    next();
    return;
  }

  if (raw.length > JSON_BODY_LIMIT_BYTES) {
    next(
      new PayloadTooLargeException(
        `Request body exceeds the ${JSON_BODY_LIMIT} limit.`,
      ),
    );
    return;
  }

  try {
    req.body = JSON.parse(raw.toString('utf8'));
  } catch {
    next(new BadRequestException('Invalid JSON request body.'));
    return;
  }
  next();
}

/**
 * Apply the shared JSON body handling to a Nest Express application. Call this
 * in every bootstrap path BEFORE `app.init()` / `app.listen()` so the raised
 * limit and the serverless normalizer are active for every request identically.
 *
 * `useBodyParser` is registered first (it wins for the local streamed path); the
 * normalizer runs after it and only acts when body-parser left a raw Buffer
 * behind (the serverless path).
 */
export function configureBodyParser(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.use(normalizeServerlessJsonBody);
}
