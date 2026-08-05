/**
 * Registrations API contract + getter — design.md §3.1, §5.2 (T-18).
 *
 * `getConsentPolicy()` fetches `GET /registrations/consent-policy`, the one
 * public endpoint `ConsentPolicyDisclosure` depends on. Types mirror
 * `backend/src/registrations/registrations.controller.ts`'s
 * `ConsentPolicyResponse` and `backend/src/registrations/consent-policy.ts`'s
 * `ConsentPolicySection` EXACTLY (`frontend/CLAUDE.md`: "types mirror backend
 * contracts exactly").
 *
 * This is a public, unauthenticated endpoint — there is no Cognito session
 * before OTP verification even exists, so this calls `apiFetch` with `token`
 * omitted rather than `apiGet`/`apiGetAuthed`, per the Leader's brief.
 *
 * Returns null on ANY failure (network error, non-OK status, unparseable
 * body) rather than throwing — the same DD-6/NFR-5 "resilient null-on-
 * failure" contract `getActors()` (`lib/api/actors.ts`) establishes for
 * public reads. The component layer renders a "couldn't load" state and
 * keeps the acceptance checkbox disabled: FR-3's gate must not silently pass
 * just because the policy itself failed to render.
 */

import { apiFetch } from './client';

export interface ConsentPolicySection {
  heading: string;
  body: string;
}

export interface ConsentPolicy {
  version: string;
  sections: ConsentPolicySection[];
}

export async function getConsentPolicy(): Promise<ConsentPolicy | null> {
  try {
    return await apiFetch<ConsentPolicy>('/api/v1/registrations/consent-policy');
  } catch {
    // Intentionally swallow all errors (DD-6 / NFR-5) — see file header.
    return null;
  }
}
