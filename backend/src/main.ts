import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { createValidationPipe } from './common/validation-pipe';
import { configureBodyParser } from './common/body-parser.config';
import { configurePayloadCap } from './common/payload-cap.config';
import { configureSecurityHeaders } from './common/security-headers.config';
import { configureCompression } from './common/compression.config';

/**
 * Local entrypoint — `npm run start`. In Lambda the app is bootstrapped by
 * `lambda.ts` instead. The global prefix `api/v1`, the global ValidationPipe,
 * and the shared 8 MB JSON body limit are applied in both paths so the T-3
 * query/write DTOs are coerced + validated (malformed query → 400, NFR-4) and
 * the base64 import payload fits (admin/actor-import §4). The registrations
 * payload cap (T-6, FR-7/NFR-4) MUST run before `configureBodyParser` so an
 * oversized registration body is rejected ahead of parsing (design.md §4.4).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // FIRST — so the headers are on error responses too (the payload cap's
  // 413, a ValidationPipe 400, any exception-filter body), not only on
  // successful output. See security-headers.config.ts's header.
  configureSecurityHeaders(app);

  // ATP-68 — gzip/deflate above 1 KB. After the security headers (which must
  // stay first) and before the body parsers. API Gateway HTTP APIs do not
  // compress for us, so this is the only place it can happen.
  configureCompression(app);

  // Local-dev only — `lambda.ts` deliberately sets no CORS header and this
  // file is never imported there. The deployed API is same-origin: CloudFront
  // serves the static frontend and proxies `/api` to API Gateway, so a browser
  // never makes a cross-origin call in production. Locally the frontend is on
  // :3000 and this API on :3001 — different origins — so without this every
  // `npm run dev` request is blocked by the browser before it is sent.
  app.enableCors({
    origin: process.env.LOCAL_CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(createValidationPipe());
  configurePayloadCap(app);
  configureBodyParser(app);
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();
