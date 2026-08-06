import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  CONSENT_POLICY_SECTIONS,
  CONSENT_POLICY_VERSION,
  ConsentPolicySection,
} from './consent-policy';
import { RegistrationCreateDto } from './dto/registration-create.dto';
import { RegistrationLookupDto } from './dto/registration-lookup.dto';
import { RegistrationVerifyDto } from './dto/registration-verify.dto';
import { RegistrationCreateResponse, RegistrationsService } from './registrations.service';
import { RegistrationsThrottleGuard } from './registrations-throttle.guard';
import { ThrottlerExceptionFilter } from './throttler-exception.filter';
import { PublicRegistrationLookup } from './serializers/public-registration.serializer';

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
 * T-11 — `POST /registrations/lookup` (FR-6, FR-8, design.md §3.1 decision
 * 3–4, §4.4 L-1…L-4). The handler validates shape (the global pipe), reads
 * the caller's IP off the request (the identity `RegistrationsService`'s
 * L-1…L-4 mechanism is keyed on — see that class's doc comment on
 * `lookupRegistration`), and awaits the one call — no branching of its own,
 * for the same "one place, not two" reason every other handler in this
 * controller does nothing beyond the one call. The return type is the
 * serializer's own output type (`PublicRegistrationLookup`), not
 * `Registration` — `design.md` §6.2's "typed boundary" layer, so returning
 * a raw row here would not type-check.
 *
 * T5-A2 (carried from T-5, resolved in `RegistrationsService`'s doc
 * comment): this handler is NOT decorated with `@SkipThrottle()`. The
 * class-level `RegistrationsThrottleGuard`/`ThrottlerExceptionFilter` below
 * still apply to this route exactly like every other one in this
 * controller.
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

  /**
   * T-11 — FR-6, FR-8. `200 { status, reviewNote? }` for a matching pair —
   * `@HttpCode(HttpStatus.OK)` is required here, UNLIKE `submitRegistration`
   * above: Nest's implicit default for `@Post()` is `201`, correct for a
   * creation, but `design.md` §3.1's contract table specifies `200` for
   * this route (it is a read, expressed as a `POST` only to keep PII out of
   * the URL per C-11 — see `RegistrationLookupDto`'s doc). The identical
   * `404` for a reference that does not exist, a reference whose email does
   * not match, and a caller over the lookup-attempt cap (L-2) — see
   * `RegistrationsService.lookupRegistration`'s doc for the full mechanism
   * and the single throw site that keeps those three exits byte-identical
   * by construction.
   */
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  async lookupRegistration(
    @Body() dto: RegistrationLookupDto,
    @Req() req: Request,
  ): Promise<PublicRegistrationLookup> {
    // `req.ip` is typed `string | undefined` (Express can fail to resolve
    // it in principle); falling back to a single shared bucket is the
    // conservative direction for a rate-limiting identity — it can only
    // make the cap MORE restrictive for callers with no resolvable IP,
    // never less, and this endpoint must never throw over a missing tracker.
    return this.registrationsService.lookupRegistration(
      dto.reference,
      dto.email,
      req.ip ?? 'unknown',
    );
  }
}
