import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RegistrationsController } from './registrations.controller';
import { LoggingModule } from '../logging/logging.module';
import { RequestContextMiddleware } from '../logging/request-context.middleware';

/**
 * T-2 — RegistrationsModule: public consent-policy endpoint (FR-3).
 * T-4 — wires `LoggingModule`'s `RequestContextMiddleware` to this module's
 * controllers ONLY, via `configure()`/`forRoutes(RegistrationsController)` —
 * never `forRoutes('*')`. That single middleware both attaches the request
 * id and emits the structured log line (design.md §4.10: scoped, not
 * global); there is no separate interceptor to apply on
 * `RegistrationsController` — attempt 2 removed it (see
 * `request-context.middleware.ts`) because middleware, unlike an
 * interceptor, runs ahead of guards and so cannot miss a guard-rejected
 * request.
 *
 * Registered in `app.module.ts`. This module grows in later tasks (T-7…T-13)
 * to add the OTP, submission and lookup services/controllers; only the
 * consent-policy controller exists as of this task.
 */
@Module({
  imports: [LoggingModule],
  controllers: [RegistrationsController],
})
export class RegistrationsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes(RegistrationsController);
  }
}
