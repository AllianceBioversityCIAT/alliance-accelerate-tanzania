import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  CONSENT_POLICY_SECTIONS,
  CONSENT_POLICY_VERSION,
  ConsentPolicySection,
} from './consent-policy';
import { RegistrationCreateDto } from './dto/registration-create.dto';
import { RegistrationVerifyDto } from './dto/registration-verify.dto';
import { RegistrationCreateResponse, RegistrationsService } from './registrations.service';
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
 * `GET /registrations/consent-policy` is the only route T-2 added.
 * Unauthenticated by design — `app.module.ts` registers no global guard, so
 * no `@UseGuards` here is itself the intended behaviour, not an omission.
 *
 * T-8 — `POST /registrations/verify` (FR-4, FR-8, design.md §3.1). Returns
 * `202` with an empty body for EVERY accepted (well-formed) email — a
 * deliverable address, an undeliverable one, and one already over the
 * per-email send cap all take this exact same path through the handler.
 * `RegistrationsService.requestVerificationCode` is where the cap is
 * silently enforced and where the mail-send latency is kept out of the
 * response (see that class's doc comment) — this handler does nothing
 * beyond validating shape and awaiting the one call, on purpose: any
 * branching here would be a second place the byte-identity guarantee could
 * drift.
 *
 * T-10 — `POST /registrations` (FR-2, FR-3, FR-4, FR-5, FR-8, design.md
 * §4.1). The handler itself does nothing beyond validating shape (the
 * global pipe) and awaiting the one call — every ordering decision (consent
 * check → verify-outside-any-transaction → one `$transaction`) and the
 * `{ reference }`-only response shape live in `RegistrationsService.submitRegistration`,
 * for the same "one place, not two" reason `requestVerificationCode`'s
 * handler above does nothing beyond the one call.
 *
 * `POST /registrations/lookup` (T-11) lands in a later task — do not add a
 * stub handler for it here.
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
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Get('consent-policy')
  getConsentPolicy(): ConsentPolicyResponse {
    return {
      version: CONSENT_POLICY_VERSION,
      sections: CONSENT_POLICY_SECTIONS,
    };
  }

  /**
   * T-8 — FR-4, FR-8. `202`, empty body, for every well-formed email —
   * deliverable, undeliverable, or already over the per-email cap. See the
   * class doc above and `RegistrationsService`'s doc comment for why no
   * branch of this handler's own can leak which case occurred.
   */
  @Post('verify')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestVerificationCode(@Body() dto: RegistrationVerifyDto): Promise<void> {
    await this.registrationsService.requestVerificationCode(dto.email);
  }

  /**
   * T-10 — FR-2, FR-3, FR-4, FR-5, FR-8. `201 { reference }` (Nest's default
   * status for `@Post`, left implicit rather than re-decorated) and nothing
   * else — see `RegistrationsService.submitRegistration`'s doc for why the
   * response can only ever be that literal shape.
   */
  @Post()
  async submitRegistration(
    @Body() dto: RegistrationCreateDto,
  ): Promise<RegistrationCreateResponse> {
    return this.registrationsService.submitRegistration(dto);
  }
}
