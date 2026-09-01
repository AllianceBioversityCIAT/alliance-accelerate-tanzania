import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';
import { EmailVerificationService } from './email-verification.service';
import { AdminRegistrationsController } from './admin-registrations.controller';
import { AdminRegistrationsService } from './admin-registrations.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
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
 * controllers ONLY, via `configure()`/`forRoutes(...)` — never
 * `forRoutes('*')`. (Originally scoped to `RegistrationsController` alone;
 * `admin/registration-review-queue` T-4 below extends the same call to also
 * name `AdminRegistrationsController` — see that paragraph for why, and the
 * `configure()` body below for the current call.) That single middleware
 * both attaches the request id and emits the structured log line
 * (design.md §4.10: scoped, not global); there is no separate interceptor
 * to apply on `RegistrationsController` — attempt 2 removed it (see
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
 *
 * `admin/registration-review-queue` T-4 — adds `AdminRegistrationsController`
 * + `AdminRegistrationsService` to this SAME module rather than a new one
 * (`design.md` §6.1, DD-15): `pii-boundary.spec.ts`'s release gate derives
 * its route set from THIS module's own `controllers` array, so a sibling
 * module would ship the five most PII-dense routes in this spec with zero
 * gate coverage. `JwtAuthGuard`/`RolesGuard` need no explicit `imports`
 * entry here — they resolve via Nest's own DI the same way
 * `actors.module.ts` already relies on for `admin-actors.controller.ts`
 * (neither guard has an unresolvable constructor dependency: `RolesGuard`'s
 * `Reflector` is a Nest core-provided singleton, and `JwtAuthGuard` takes
 * none).
 *
 * **The two edits `configure()`'s call below makes are load-bearing
 * (`design.md` §6.1 table):** adding the controller to `controllers` above
 * makes the routes exist at all (any endpoint test catches an omission
 * there); extending `forRoutes(...)` to name `AdminRegistrationsController`
 * as well is what makes `RequestContextMiddleware` emit a structured log
 * line for THOSE routes too (NFR-8) — an omission here has NO compile-time
 * signal (DD-19) and produces silence, not a wrong value, which is why
 * `logging-scope.e2e.spec.ts` carries a dedicated emission proof for this
 * controller rather than trusting registration alone. Per DD-19, this call
 * is NOT widened to `forRoutes('*')` — that would silently re-scope 3a's
 * deliberately module-local observability rollout to the whole app.
 *
 * `RegistrationsThrottleGuard` (below, `providers`) is applied at the
 * PUBLIC controller's class level only and is deliberately NOT added to
 * `AdminRegistrationsController` — the admin surface is authenticated and
 * `@Roles('Admin')`-gated, so it carries neither abuse profile the public
 * throttle addresses (`design.md` §6.1).
 *
 * `admin/registration-review-queue` T-5 — adds `DuplicateDetectionService`
 * (below, `providers`) so `AdminRegistrationsService.list` can inject it
 * (`design.md` §6.5, DD-20). No controller of its own — it is consumed
 * only from within this module, never routed directly.
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
  controllers: [RegistrationsController, AdminRegistrationsController],
  providers: [
    RegistrationsThrottleGuard,
    EmailVerificationService,
    RegistrationsService,
    AdminRegistrationsService,
    DuplicateDetectionService,
  ],
})
export class RegistrationsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware)
      .forRoutes(RegistrationsController, AdminRegistrationsController);
  }
}
