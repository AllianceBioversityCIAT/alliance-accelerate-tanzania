import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';
import { EmailVerificationService } from './email-verification.service';
import { LoggingModule } from '../logging/logging.module';
import { RequestContextMiddleware } from '../logging/request-context.middleware';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import {
  REGISTRATIONS_THROTTLE_LIMIT,
  REGISTRATIONS_THROTTLE_TTL_MS,
  RegistrationsThrottleGuard,
} from './registrations-throttle.guard';

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
 * T-5 — imports `ThrottlerModule.forRoot(...)` (in-memory, per container —
 * design.md §4.4/DD-5) so `RegistrationsThrottleGuard` (applied at the
 * controller class level, see `registrations.controller.ts`) can resolve its
 * `ThrottlerModuleOptions`/`ThrottlerStorage` dependencies. `ThrottlerModule`
 * is `@Global()`, so this single registration is enough for every route in
 * this controller, present and future.
 *
 * T-8 — wires `POST /registrations/verify`'s dependencies. `PrismaModule`
 * and `MailModule` are imported EXPLICITLY here even though `PrismaModule`
 * is `@Global()`: a module compiled on its own in a `TestingModule` (as
 * `registrations-throttle.e2e.spec.ts`'s `ThrottleDbTestModule` already does
 * for the same reason) only sees a `@Global()` module's exports if that
 * module is somewhere in ITS OWN import graph — `@Global()` broadcasts to
 * every module in a compiled application, it does not retroactively pull a
 * module into a smaller, independently-compiled one. `EmailVerificationService`
 * (T-7) is provided here, since T-7 built the service but named no module
 * to register it in and nothing before this task consumed it. This is the
 * module-wiring gap `design.md`/`tasks.md` left unowned; T-8 is where a
 * reviewer assigned it, so it lands deliberately rather than surfacing as a
 * DI resolution error the first time something injects these.
 *
 * Registered in `app.module.ts`. This module grows in later tasks (T-9…T-13)
 * to add the submission and lookup services/controllers.
 */
@Module({
  imports: [
    LoggingModule,
    PrismaModule,
    MailModule,
    ThrottlerModule.forRoot([
      { ttl: REGISTRATIONS_THROTTLE_TTL_MS, limit: REGISTRATIONS_THROTTLE_LIMIT },
    ]),
  ],
  controllers: [RegistrationsController],
  providers: [RegistrationsThrottleGuard, EmailVerificationService, RegistrationsService],
})
export class RegistrationsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes(RegistrationsController);
  }
}
