/**
 * actors/consent-intake/consent-request-email T-5 — the two PUBLIC consent-link
 * routes (design.md §5.4, §6, DD-4).
 *
 * **No auth guard, on purpose.** The bearer of the token IS the credential;
 * `app.module.ts` registers no global guard, so the ABSENCE of
 * `@UseGuards(JwtAuthGuard)` here is the intended behaviour (the
 * `RegistrationsController` convention). The only guard is
 * {@link ConsentThrottleGuard}, applied at class level so every route this
 * controller ever adds inherits it, with `ThrottlerExceptionFilter` shaping
 * the `429` (a body that says nothing about the token — NFR-4).
 *
 * **Both routes are `POST` with the token in the BODY (DD-4, NFR-1)**, never
 * a path or query string, so it cannot land in an API Gateway or CloudWatch
 * request line. `200` on both: `view` is a read, `respond`'s only success
 * body is `{ decision }`.
 *
 * The DTOs validate the NON-token fields only; the token is `@Allow()`-ed and
 * the service owns every decision about it (see `consent-public.dto.ts`).
 * `req.ip` is the throttle key AND the evidence IP; under serverless-http it
 * is `event.requestContext.http.sourceIp` (P-14, pinned in
 * `lambda-handler.e2e.spec.ts`).
 */

import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseFilters, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ThrottlerExceptionFilter } from '../registrations/throttler-exception.filter';
import { CONSENT_THROTTLE_LIMIT, CONSENT_THROTTLE_TTL_MS, ConsentThrottleGuard } from './consent-throttle.guard';
import { ConsentPublicService, ConsentViewResult } from './consent-public.service';
import { ConsentRespondDto, ConsentViewDto } from './dto/consent-public.dto';

@Controller('consent')
@UseGuards(ConsentThrottleGuard)
@UseFilters(ThrottlerExceptionFilter)
@Throttle({ default: { limit: CONSENT_THROTTLE_LIMIT, ttl: CONSENT_THROTTLE_TTL_MS } })
export class ConsentPublicController {
  constructor(private readonly consentPublicService: ConsentPublicService) {}

  /** `POST /api/v1/consent/view` — `200 { organization, record, edition, expiresAt }` · uniform `404` · `429`. */
  @Post('view')
  @HttpCode(HttpStatus.OK)
  view(@Body() dto: ConsentViewDto): Promise<ConsentViewResult> {
    return this.consentPublicService.view(dto.token);
  }

  /** `POST /api/v1/consent/respond` — `200 { decision }` · `400` (non-token fields) · uniform `404` · `429`. */
  @Post('respond')
  @HttpCode(HttpStatus.OK)
  respond(@Body() dto: ConsentRespondDto, @Req() req: Request): Promise<{ decision: ConsentRespondDto['decision'] }> {
    const userAgent = req.headers['user-agent'];
    return this.consentPublicService.respond(
      { token: dto.token, decision: dto.decision, respondent: dto.respondent },
      { ip: req.ip ?? null, userAgent: typeof userAgent === 'string' ? userAgent : null },
    );
  }
}
