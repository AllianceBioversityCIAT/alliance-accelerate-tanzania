// @sdd-spec actors/public-self-registration (T-4)
/**
 * T-4 — LoggingModule (design.md §4.10).
 *
 * Exports `RequestContextMiddleware` — which both attaches a request id and
 * emits the structured log line on `res.on('finish', ...)`, since attempt 2
 * moved emission out of the now-deleted `StructuredLogInterceptor` (see
 * `request-context.middleware.ts` for why) — for a consuming module to apply
 * to its own controllers. This module registers nothing globally: no
 * `APP_INTERCEPTOR`/`APP_MIDDLEWARE`-style provider here, and no
 * `.forRoutes('*')` — it has no `configure()` of its own at all, because it
 * owns no routes. A consumer imports `LoggingModule` and opts in explicitly;
 * see `RegistrationsModule`, which applies `RequestContextMiddleware` to its
 * own controllers and no others.
 */
import { Module } from '@nestjs/common';
import { RequestContextMiddleware } from './request-context.middleware';

@Module({
  providers: [RequestContextMiddleware],
  exports: [RequestContextMiddleware],
})
export class LoggingModule {}
