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
 * `app.useBodyParser` registers its middleware immediately (before `app.init()`
 * runs Nest's own default parser), so this 8 MB parser wins for JSON bodies while
 * Nest's default urlencoded parser is left untouched.
 */

import { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Maximum JSON request body size. 8 MB comfortably fits the base64 form of the
 * import cap (4 MB decoded ≈ 5.5 MB base64) with headroom, while staying under
 * the API Gateway payload ceiling (design §7).
 */
export const JSON_BODY_LIMIT = '8mb';

/**
 * Apply the shared 8 MB JSON body limit to a Nest Express application. Call this
 * in every bootstrap path BEFORE `app.init()` / `app.listen()` so the raised
 * limit is active for every request identically.
 */
export function configureBodyParser(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
}
