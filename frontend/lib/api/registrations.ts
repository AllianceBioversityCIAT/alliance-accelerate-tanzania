/**
 * Registrations API contract + getters — design.md §3.1, §5.2, §5.3 (T-18, T-19).
 *
 * `getConsentPolicy()` fetches `GET /registrations/consent-policy`, the one
 * public endpoint `ConsentPolicyDisclosure` depends on. Types mirror
 * `backend/src/registrations/registrations.controller.ts`'s
 * `ConsentPolicyResponse` and `backend/src/registrations/consent-policy.ts`'s
 * `ConsentPolicySection` EXACTLY (`frontend/CLAUDE.md`: "types mirror backend
 * contracts exactly").
 *
 * `requestVerificationCode()` and `submitRegistration()` (T-19) are the two
 * public WRITE calls the OTP step makes — `POST /registrations/verify` and
 * `POST /registrations` respectively (design.md §3.1). Unlike
 * `getConsentPolicy`, these do NOT swallow errors: `OtpVerificationStep` must
 * react to the server's 400/429 (and — per design.md §3.1's collapsed-400
 * decision — must NOT be able to tell wrong/expired/consumed apart), so the
 * caller needs the real `ApiError` (`status`, `details`), not a resilient
 * null.
 *
 * All three are public, unauthenticated endpoints — there is no Cognito
 * session before OTP verification even exists, so every call here uses
 * `apiFetch` with `token` omitted rather than `apiGet`/`apiGetAuthed`, per the
 * Leader's brief (T18-A6: the `apiGet` comment at `client.ts:167` is stale
 * for this module).
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

/**
 * `POST /registrations/verify` (design.md §3.1, §4.3). Sends a one-time code
 * to `email` — or, for a well-formed address over the per-email send cap,
 * silently does not (design.md §3.1 decision 1, C-3). Both outcomes return
 * the SAME `202`, empty body: there is no field here for a caller to read a
 * refusal out of, by construction. Throws `ApiError` on `400` (malformed
 * email — rejected before the always-202 business logic ever runs, per
 * `registration-verify.dto.ts`'s `@IsEmail()`) or `429` (the per-container
 * throttler — keyed on the caller, not the address, so this ONE case is
 * legitimately visible per design.md §3.1 decision 1's own carve-out).
 */
export async function requestVerificationCode(email: string): Promise<void> {
  await apiFetch<void>('/api/v1/registrations/verify', {
    method: 'POST',
    body: { email },
    expectEmpty: true,
  });
}

/** Mirrors `RegistrationPayloadDto` (`backend/src/registrations/dto/registration-create.dto.ts`) EXACTLY. */
export interface RegistrationSubmitPayload {
  traderName: string;
  traderType: string;
  contactPerson: string;
  position?: string;
  district?: string;
  marketLocation?: string;
  sex?: string;
  region: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  crops: string[];
  otherCrops?: string;
  capacityTons: number;
  phone: string;
}

/** Mirrors `ConsentInputDto` EXACTLY. */
export interface RegistrationSubmitConsent {
  accepted: boolean;
  policyVersion: string;
}

/** Mirrors `RegistrationCreateDto`'s top-level shape EXACTLY — `{ email, code, consent, payload }`. */
export interface RegistrationSubmitRequest {
  email: string;
  code: string;
  consent: RegistrationSubmitConsent;
  payload: RegistrationSubmitPayload;
}

export interface RegistrationSubmitResponse {
  reference: string;
}

/**
 * `POST /registrations` (design.md §3.1, §4.1). Returns only `{ reference }`
 * on `201` — no echo of any submitted field (FR-5). Throws `ApiError` on:
 *   - `400` with a `details` array (a genuine field-validation failure —
 *     e.g. `RegistrationCreateDto.email`'s `@IsEmail()`, which the client's
 *     own regex in `RegistrationForm` is deliberately more permissive than,
 *     T17-A4) — safe to surface per-field, exactly like FR-2's form errors;
 *   - `400` with NO `details` (the code was wrong, expired, or already
 *     consumed — collapsed into one indistinguishable shape by design.md
 *     §3.1 decision 2/FR-4 "wrong, expired, or reused code" — the absence of
 *     `details` is the only signal this function's caller may use to tell
 *     the two `400` shapes apart, and it must never attempt to tell the
 *     three code-failure causes apart from each other);
 *   - `429` (the per-container throttler — caller-keyed, legitimately
 *     visible, same carve-out as `requestVerificationCode`).
 */
export async function submitRegistration(
  input: RegistrationSubmitRequest,
): Promise<RegistrationSubmitResponse> {
  return apiFetch<RegistrationSubmitResponse>('/api/v1/registrations', {
    method: 'POST',
    body: input,
  });
}
