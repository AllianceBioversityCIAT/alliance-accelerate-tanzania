/**
 * ATP-68 — `configureCompression` over HTTP.
 *
 * Asserted through a real server rather than by inspecting the middleware,
 * because the property that matters is a wire property: does a large JSON
 * response actually arrive gzipped, and does a small one actually not. A unit
 * test that only checked `app.use` was called would pass while shipping a
 * misconfigured threshold.
 *
 * The Lambda half — that a `Content-Encoding: gzip` response is base64-encoded
 * by `serverless-http` rather than mangled into a UTF-8 string — is asserted
 * in `src/test/lambda-handler.e2e.spec.ts`, which drives the real handler.
 */
import express from 'express';
import request from 'supertest';
import {
  COMPRESSION_THRESHOLD_BYTES,
  configureCompression,
} from './compression.config';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * `configureCompression` takes a Nest app only to call `.use` on it, so a bare
 * Express app standing in keeps this test free of a Nest bootstrap (and of the
 * DB that bootstrap would want).
 */
function appWithBody(bytes: number): express.Express {
  const app = express();
  configureCompression(app as unknown as NestExpressApplication);
  app.get('/payload', (_req, res) => {
    // Repeated keys, like a real actor page — compressible, which is the
    // point. Random bytes would not compress and would prove nothing.
    const row = { traderName: 'Mbeya Highlands Sorghum Cooperative', region: 'Mbeya' };
    const count = Math.ceil(bytes / JSON.stringify(row).length);
    res.json(Array.from({ length: count }, () => row));
  });
  return app;
}

describe('configureCompression (ATP-68)', () => {
  it('gzips a response above the threshold when the client accepts it', async () => {
    const res = await request(appWithBody(50_000))
      .get('/payload')
      .set('Accept-Encoding', 'gzip');

    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
  });

  it('leaves a response below the threshold uncompressed', async () => {
    const res = await request(appWithBody(COMPRESSION_THRESHOLD_BYTES - 200))
      .get('/payload')
      .set('Accept-Encoding', 'gzip');

    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('sends plain JSON when the client does not accept gzip', async () => {
    const res = await request(appWithBody(50_000))
      .get('/payload')
      .set('Accept-Encoding', 'identity');

    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('round-trips the body intact through compression', async () => {
    // supertest/superagent decompresses transparently, so this asserts the
    // client gets the SAME JSON it would have got uncompressed — the failure
    // this guards against is a corrupted or truncated body, not a missing header.
    const res = await request(appWithBody(50_000))
      .get('/payload')
      .set('Accept-Encoding', 'gzip');

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toEqual({
      traderName: 'Mbeya Highlands Sorghum Cooperative',
      region: 'Mbeya',
    });
  });
});
