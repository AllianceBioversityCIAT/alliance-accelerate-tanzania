import { Controller, Get } from '@nestjs/common';
import {
  CONSENT_POLICY_SECTIONS,
  CONSENT_POLICY_VERSION,
  ConsentPolicySection,
} from './consent-policy';

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
 * `@UseInterceptors`/`@UseGuards` decorator is needed on this controller for
 * logging to apply. Every handler this module adds inherits it automatically
 * because the middleware is scoped to the whole controller.
 */
@Controller('registrations')
export class RegistrationsController {
  @Get('consent-policy')
  getConsentPolicy(): ConsentPolicyResponse {
    return {
      version: CONSENT_POLICY_VERSION,
      sections: CONSENT_POLICY_SECTIONS,
    };
  }
}
