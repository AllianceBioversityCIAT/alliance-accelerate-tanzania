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
