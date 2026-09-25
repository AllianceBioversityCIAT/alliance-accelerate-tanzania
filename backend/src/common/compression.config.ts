/**
 * ATP-68 — Response compression for the API, registered through a single
 * `common/` helper and called from BOTH bootstraps (`main.ts`, `lambda.ts`),
 * following the precedent `payload-cap.config.ts` and
 * `security-headers.config.ts` set for shared bootstrap configuration.
 *
 * **Why this exists.** Nothing on the request path compressed anything. The
 * API sent plain JSON and API Gateway did not make up the difference: the
 * deployed API is an `AWS::Serverless::HttpApi` (`infra/20-backend/template.yaml`),
 * and an HTTP API (v2) has no `MinimumCompressionSize` — that is a REST API
 * (v1) feature. So compression has to happen inside the Lambda or not at all.
 *
 * Measured on the actor list at the PRD's 1 000+ target (2026-09-21, ATP-68):
 * a 100-actor page was 28 KB uncompressed and 4 KB gzipped; the full 1 000-actor
 * map load was 277 KB and 37 KB. That ~7x is larger than the saving a
 * narrow-projection `/actors/geo` endpoint would have produced over the same
 * payload (160 KB → 30 KB), which is why this shipped and that endpoint did not.
 *
 * **Ordering.** After `configureSecurityHeaders` (which must stay first so its
 * headers reach error responses) and before the body-parser helpers. The
 * middleware wraps `res.write`/`res.end`, so it must be registered ahead of
 * anything that writes a response body — which, since routes are registered
 * after every `app.use` here, means anywhere in this block works, but keeping
 * it early keeps the intent legible.
 *
 * **Lambda correctness — verified, not assumed.** A gzipped body must reach
 * API Gateway base64-encoded with `isBase64Encoded: true`, or the client gets
 * mojibake. `serverless-http@3.2.0`'s `lib/provider/aws/is-binary.js` checks
 * `content-encoding` against `['gzip', 'deflate', 'br']` BEFORE it consults
 * content-type, so a `Content-Encoding: gzip` response is classified binary
 * and base64-encoded on its own. No `binary` option is needed on the
 * `serverlessExpress(...)` call, and adding one keyed on content-type would
 * actually be wrong — `application/json` is not binary when it is not encoded.
 * Re-check this if `serverless-http` is ever upgraded across a major version.
 *
 * **BREACH.** Compressing a response that mixes a secret with attacker-chosen
 * input can leak the secret through response sizes. It is not a live risk
 * here — the compressible responses are the public registry projections
 * (`/actors`, `/metrics`), which carry no secret, and the API issues no
 * cookie or CSRF token for a side channel to recover (auth is a bearer JWT
 * the client already holds). Recorded because the reasoning, not the default,
 * is what makes it safe: if a future endpoint ever reflects caller input
 * alongside a secret in one response body, exempt that route with
 * `res.set('Cache-Control', 'no-transform')` rather than assuming this note
 * still covers it.
 */
import compression from 'compression';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Responses at or above this many bytes are compressed. Below it, the gzip
 * header and CPU cost outweigh the saving — and every write path here
 * (`202` empty bodies, `{ reference }`, error envelopes) sits far below it.
 * 1 KB is the `compression` package's own default, restated explicitly so the
 * value is reviewable here rather than inherited invisibly.
 */
export const COMPRESSION_THRESHOLD_BYTES = 1024;

export function configureCompression(app: NestExpressApplication): void {
  app.use(compression({ threshold: COMPRESSION_THRESHOLD_BYTES }));
}
