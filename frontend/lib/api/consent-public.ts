/**
 * Public consent-link API — actors/consent-intake/consent-request-email T-8
 * (design.md §5.4, §7.3, P-26).
 *
 * Two unauthenticated calls the token holder makes from `/consent/`:
 * `POST /consent/view` and `POST /consent/respond`. The token travels in the
 * request BODY only (never a URL, never a header) and both calls go through
 * `apiFetch` with NO `token` option — no Bearer is ever attached (P-26).
 *
 * Neither call swallows errors: the page must tell the uniform `404`
 * (dead-end, FR-11), the `429` throttle, a `400` with field `details` and a
 * network failure apart, so it needs the real `ApiError`.
 *
 * Types mirror `backend/src/consent-requests/consent-public.service.ts`
 * (`ConsentViewResult`, `respond`'s `{ decision }`) and
 * `dto/consent-public.dto.ts` EXACTLY. The `edition` carries no `issuedAt`:
 * the backend `Pick`s only `version`, `sections`, `acceptanceStatement`.
 */

import { apiFetch } from './client';
import type { PublicActorDetail } from './actors';

export type ConsentDecision = 'ACCEPT' | 'DECLINE';

export interface ConsentEditionSection {
  heading: string;
  body: string;
}

export interface ConsentViewEdition {
  version: string;
  sections: ConsentEditionSection[];
  acceptanceStatement: string;
}

export interface ConsentViewResponse {
  organization: string;
  record: PublicActorDetail;
  edition: ConsentViewEdition;
  expiresAt: string;
}

export interface ConsentRespondent {
  name: string;
  position: string;
  email: string;
  phone: string;
}

/** `ConsentRespondDto` minus the token (added by {@link respondToConsentRequest}). */
export type ConsentRespondBody =
  | { decision: 'ACCEPT'; respondent: ConsentRespondent; accepted: true }
  | { decision: 'DECLINE' };

export interface ConsentRespondResponse {
  decision: ConsentDecision;
}

export function viewConsentRequest(token: string): Promise<ConsentViewResponse> {
  return apiFetch<ConsentViewResponse>('/api/v1/consent/view', {
    method: 'POST',
    body: { token },
  });
}

export function respondToConsentRequest(
  token: string,
  body: ConsentRespondBody,
): Promise<ConsentRespondResponse> {
  return apiFetch<ConsentRespondResponse>('/api/v1/consent/respond', {
    method: 'POST',
    body: { token, ...body },
  });
}
