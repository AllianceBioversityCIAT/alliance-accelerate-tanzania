// @sdd-spec actors/public-self-registration (T-6)
/**
 * T-6 — Local-entrypoint proof of P-3 ("a request that declares no length
 * must not bypass the cap") against a REAL streaming HTTP connection.
 *
 * **Scope correction (2026-08-05 review).** Only the ABSENT-`Content-Length`
 * sub-case of P-3 is unreachable via `lambda-handler.e2e.spec.ts` — not P-3
 * as a whole, as an earlier version of this comment overstated. A
 * `transfer-encoding: chunked` header, or a malformed `content-length` value,
 * both survive into the synthetic request when the event declares them
 * (`create-request.js`'s `requestHeaders()` forwards `event.headers`
 * verbatim), so those two sub-cases ARE proven through the real handler —
 * see `lambda-handler.e2e.spec.ts`'s "Registrations payload cap" describe
 * block. What genuinely cannot happen there: `serverless-http`'s synthetic
 * request (`node_modules/serverless-http/lib/request.js:16-18`) computes and
 * injects an accurate `Content-Length` from the already fully materialized
 * `event.body` whenever the event did not supply one — so a request that
 * declares NO length header at all (the "real" chunked case, where the
 * sender never states a size up front) is structurally unreachable on the
 * deployed Lambda path; API Gateway always hands Lambda a complete body.
 * That sub-case can only happen on the local (`main.ts`) path, where a real
 * client opens a real streaming connection and never declares
 * `Content-Length` at all.
 *
 * This suite reproduces exactly that over a live TCP connection to an app
 * bootstrapped the same way `main.ts` does (`configurePayloadCap` then
 * `configureBodyParser`, in that order — hand-copied here rather than
 * imported from `main.ts`, so this suite proves the CONFIGURATION works but
 * cannot by itself prove `main.ts` still calls `configurePayloadCap`; that
 * fidelity is maintained by hand today, the same pre-existing gap
 * `configureBodyParser`/`createValidationPipe` already have): a raw
 * `http.request` — NOT supertest/superagent, both of which compute and set
 * `Content-Length` for you and so cannot construct this case — sending
 * `Transfer-Encoding: chunked` with NO `Content-Length` header.
 */
import * as http from 'http';
import type { AddressInfo } from 'net';
import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { createValidationPipe } from './validation-pipe';
import { configureBodyParser } from './body-parser.config';
import { configurePayloadCap } from './payload-cap.config';

describe(
  'Registrations payload cap — real chunked request over a live connection ' +
    '(local entrypoint, P-3)',
  () => {
    let app: NestExpressApplication;
    let port: number;

    beforeAll(async () => {
      // Same minimal override already proven safe for booting this exact
      // AppModule + hitting a RegistrationsController route without a real
      // database (`registrations-throttle.e2e.spec.ts`'s first describe block).
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PrismaService)
        .useValue({} as unknown as PrismaService)
        .compile();

      app = moduleRef.createNestApplication<NestExpressApplication>();
      app.setGlobalPrefix('api/v1');
      app.useGlobalPipes(createValidationPipe());
      // Production ordering (main.ts/lambda.ts): cap BEFORE body parser.
      configurePayloadCap(app);
      configureBodyParser(app);
      await app.init();
      await app.listen(0);
      const address = app.getHttpServer().address() as AddressInfo;
      port = address.port;
    });

    afterAll(async () => {
      await app.close();
    });

    /** POST with genuine chunked framing and no Content-Length header at all. */
    function chunkedPost(
      path: string,
      chunks: string[],
    ): Promise<{ statusCode: number; body: string }> {
      return new Promise((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port,
            path,
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'transfer-encoding': 'chunked',
              // Deliberately NO content-length header — that is the point.
            },
          },
          (res) => {
            let body = '';
            res.on('data', (d: Buffer) => {
              body += d.toString('utf8');
            });
            res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body }));
          },
        );
        req.on('error', reject);
        for (const chunk of chunks) req.write(chunk);
        req.end();
      });
    }

    it(
      'rejects a genuinely chunked request (no Content-Length) to a registrations path with ' +
        '413, before any JSON parsing is attempted',
      async () => {
        const res = await chunkedPost('/api/v1/registrations', [
          '{"payload":',
          '"irrelevant, never parsed"}',
        ]);

        expect(res.statusCode).toBe(413);
        const parsed = JSON.parse(res.body) as { statusCode: number };
        expect(parsed.statusCode).toBe(413);
      },
    );

    it('leaves a chunked request to a NON-registrations path unaffected by this cap', async () => {
      const res = await chunkedPost('/api/v1/metrics', []);

      // Whatever Nest routing decides for a POST against a GET-only route
      // (404/405), it must NOT be 413 — this path is outside the cap's scope.
      expect(res.statusCode).not.toBe(413);
    });
  },
);
