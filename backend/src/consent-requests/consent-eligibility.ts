/**
 * T-3 — Pure FR-2 eligibility rule (design.md §5.1).
 *
 * `preview`, `enqueue` and `dispatch`'s claim-time re-check (T-4) all share
 * this ONE function, so "eligible" means the same thing everywhere a request
 * can be created or sent. It takes no Prisma dependency — a plain object plus
 * a plain array — so it is testable without any database.
 *
 * Design refs: `docs/specs/actors/consent-intake/consent-request-email/design.md`
 * §5.1. Requirements: FR-2 (all scenarios), FR-10 D-24 scenario (reused by the
 * admin-gate rules, not by this module directly).
 */

export type ConsentEligibilityOutcome =
  | 'eligible'
  | 'no_email'
  | 'granted'
  | 'pending_request'
  | 'declined';

export type ConsentEligibilityScope = 'single' | 'bulk';

/** Minimal actor shape this rule reads — callable from a unit test with a plain object. */
export interface ConsentEligibilityActor {
  email: string | null | undefined;
  consentStatus: string;
}

/**
 * Minimal consent-request shape this rule reads. `createdAt` is required so
 * the "latest request" (FR-2's bulk "declined" reason) can be determined
 * without trusting the caller's ordering.
 */
export interface ConsentEligibilityRequest {
  status: string;
  expiresAt: Date | string | null | undefined;
  createdAt: Date | string;
}

/**
 * The set of `ConsentRequestStatus` values that block a NEW send (design.md
 * §5.1): `QUEUED`, `SENDING`, `FAILED` unconditionally, or `SENT` only while
 * still unexpired. Counting `FAILED` here (not only `QUEUED`/`SENDING`) is
 * what stops two enqueues before a retry from duplicating emails — a failed
 * row is resumed with Retry, never a fresh send.
 */
function isPending(request: ConsentEligibilityRequest, now: Date): boolean {
  if (request.status === 'QUEUED' || request.status === 'SENDING' || request.status === 'FAILED') {
    return true;
  }
  if (request.status === 'SENT') {
    if (!request.expiresAt) return false;
    const expiresAt =
      request.expiresAt instanceof Date ? request.expiresAt : new Date(request.expiresAt);
    return expiresAt.getTime() > now.getTime();
  }
  return false;
}

/** The actor's most recently created request, or `undefined` when it has none. */
function latestRequest(
  requests: readonly ConsentEligibilityRequest[],
): ConsentEligibilityRequest | undefined {
  let latest: ConsentEligibilityRequest | undefined;
  let latestTime = -Infinity;
  for (const request of requests) {
    const createdAt =
      request.createdAt instanceof Date ? request.createdAt : new Date(request.createdAt);
    const time = createdAt.getTime();
    if (time > latestTime) {
      latestTime = time;
      latest = request;
    }
  }
  return latest;
}

/**
 * Evaluate one actor's eligibility for a consent request (FR-2).
 *
 * Order matters and is exhaustive/distinct (FR-2 scenario 1): `no_email` →
 * `granted` → (bulk only) `pending_request` → (bulk only) `declined` →
 * `eligible`.
 *
 * - **`scope = 'bulk'`** blocks on a pending request and on a declined latest
 *   request (D-21).
 * - **`scope = 'single'`** never reports either as a skip: a pending request
 *   is resolved by supersession-then-send (FR-3 resend), and a single send
 *   is explicitly allowed to re-ask a decliner (FR-2 scenario 3).
 */
export function evaluateConsentEligibility(
  actor: ConsentEligibilityActor,
  requests: readonly ConsentEligibilityRequest[],
  scope: ConsentEligibilityScope,
  now: Date = new Date(),
): ConsentEligibilityOutcome {
  if (!actor.email) {
    return 'no_email';
  }
  if (actor.consentStatus === 'GRANTED') {
    return 'granted';
  }

  if (scope === 'bulk') {
    const hasPending = requests.some((request) => isPending(request, now));
    if (hasPending) {
      return 'pending_request';
    }

    const latest = latestRequest(requests);
    if (latest?.status === 'DECLINED') {
      return 'declined';
    }
  }

  return 'eligible';
}

/** Every non-`eligible` outcome, for building a zero-initialized skip-count record. */
export const CONSENT_SKIP_REASONS: readonly Exclude<ConsentEligibilityOutcome, 'eligible'>[] = [
  'no_email',
  'granted',
  'pending_request',
  'declined',
];

export type ConsentSkipReason = (typeof CONSENT_SKIP_REASONS)[number];

/** A fresh `{ reason: 0, ... }` record — never partially keyed. */
export function emptyConsentSkipCounts(): Record<ConsentSkipReason, number> {
  return {
    no_email: 0,
    granted: 0,
    pending_request: 0,
    declined: 0,
  };
}
