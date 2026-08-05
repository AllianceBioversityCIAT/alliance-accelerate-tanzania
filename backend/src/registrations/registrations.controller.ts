import { Controller, Get, UseFilters, UseGuards } from '@nestjs/common';
import {
  CONSENT_POLICY_SECTIONS,
  CONSENT_POLICY_VERSION,
  ConsentPolicySection,
} from './consent-policy';
import { RegistrationsThrottleGuard } from './registrations-throttle.guard';
import { ThrottlerExceptionFilter } from './throttler-exception.filter';

/** `GET /registrations/consent-policy` response (design.md §3.1). */
export interface ConsentPolicyResponse {
  version: string;
  sections: ConsentPolicySection[];
}

/**
 * T-2 — Public registrations controller (FR-3).
 *
 * `GET /registrations/consent-policy` is the only route this task adds.
 * Unauthenticated by design — `app.module.ts` registers no global guard, so
 * no `@UseGuards` here is itself the intended behaviour, not an omission.
 *
 * `POST /registrations/verify` (T-8), `POST /registrations` (T-10), and
 * `POST /registrations/lookup` (T-11) land in later tasks — do not add stub
 * handlers for them here.
 *
 * T-4 — structured request logging for this controller's routes is emitted
 * by `RequestContextMiddleware` (design.md §4.10), applied in
 * `RegistrationsModule.configure()` via `forRoutes(RegistrationsController)`
 * — not by a class-level interceptor here. Rework attempt 2 moved emission
 * out of the interceptor because interceptors run after guards and so cannot
 * see a guard-rejected request (see `request-context.middleware.ts`); no
 * `@UseInterceptors` decorator is needed on this controller for logging to
 * apply. Every handler this module adds inherits it automatically because
 * the middleware is scoped to the whole controller.
 *
 * T-5 — `@UseGuards(RegistrationsThrottleGuard)` and
 * `@UseFilters(ThrottlerExceptionFilter)` are applied at the CLASS level
 * (FR-7, NFR-4), not per-handler, so every route this module adds later
 * (T-8's `/verify`, T-10's `POST /registrations`, T-11's `/lookup`) is
 * rate-limited automatically — nobody has to remember to decorate a new
 * handler individually.
 */
@Controller('registrations')
@UseGuards(RegistrationsThrottleGuard)
@UseFilters(ThrottlerExceptionFilter)
export class RegistrationsController {
  @Get('consent-policy')
  getConsentPolicy(): ConsentPolicyResponse {
    return {
      version: CONSENT_POLICY_VERSION,
      sections: CONSENT_POLICY_SECTIONS,
    };
  }
}
