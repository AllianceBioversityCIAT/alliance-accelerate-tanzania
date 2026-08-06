/**
 * T-2 — The SINGLE source of truth for the consent-provenance invariant
 * (FR-3, NFR-7, DD-1, DD-3, design.md §4.1).
 *
 * Four write paths can set `consentStatus` today: admin create, admin
 * update, admin bulk set-consent, and Excel import. Each one consults THIS
 * module rather than re-implementing its own check, so a legal/business
 * change to the rule is a one-file edit instead of a hunt across four call
 * sites that would drift within a year (DD-1). This mirrors how
 * `pii-consent.policy.ts` already centralises the consent *read* rule.
 *
 * NORMATIVE (design.md §4.1, R-9/J-1): the predicate fires on a VALUE
 * CHANGE, never on mere field presence in the submitted payload. A payload
 * that re-sends the actor's current `consentStatus`/provenance unchanged —
 * which `frontend/components/admin/ActorForm.tsx` always does, because it
 * submits a full object on every save — must NOT be treated as "touching"
 * consent. Reading this as "is `consentStatus` a key in the body?" makes
 * every legacy `GRANTED` actor permanently uneditable; see design.md DD-3.
 *
 * This is a specification/policy function, not a Nest guard: the rule
 * depends on the STORED entity state, which a guard does not have without a
 * DB read it has no business doing (design.md §4.1).
 *
 * Design refs: design.md §4.1, DD-1, DD-3. Requirements: FR-3, NFR-7.
 */

import { ConsentStatus, ConsentMethod } from '@prisma/client';

/**
 * Minimal shape this policy reads off an Actor's consent/provenance fields.
 * Accepts the Prisma entity (and any superset) without coupling to the full
 * generated type, so it is callable from pure unit tests with a plain
 * object — matching `pii-consent.policy.ts`'s `ConsentBearer`.
 */
export interface ConsentProvenanceState {
  consentStatus: ConsentStatus | string;
  consentMethod: ConsentMethod | string;
  consentObtainedAt: Date | string | null;
  consentReference?: string | null;
}

/**
 * A submitted write payload. Every field is optional — a caller only
 * includes what the request body actually contains (or, for a full-object
 * resubmit, includes a field whose value happens to equal what is stored).
 */
export type ConsentProvenancePayload = Partial<ConsentProvenanceState>;

/** The three provenance fields condition (b) watches for a value change on. */
const PROVENANCE_FIELDS = [
  'consentMethod',
  'consentObtainedAt',
  'consentReference',
] as const;

/**
 * Does the submitted payload leave a publishable (`GRANTED`) actor with real
 * evidence behind it?
 *
 * Returns `true` when the write is allowed to proceed, `false` when it must
 * be rejected (FR-3). Given the **stored** actor state (`null` for a
 * not-yet-created actor, i.e. the `create` path) and the **submitted**
 * payload:
 *
 * 1. If the **effective post-write** `consentStatus` is not `GRANTED`, the
 *    invariant does not apply — always allowed (design.md §4.1 row 5,
 *    "un-publish-then-strip").
 * 2. Otherwise the guard only FIRES when either:
 *    - **(a)** the stored `consentStatus` was not `GRANTED` — a transition
 *      *into* published state (no stored actor counts as "not GRANTED"); or
 *    - **(b)** the payload changes one of the three provenance fields to a
 *      value **different** from what is stored.
 * 3. When the guard does not fire (neither (a) nor (b)), the write is
 *    allowed regardless of whether the effective provenance would satisfy
 *    the invariant on its own — this is what keeps a legacy
 *    `GRANTED`+`NOT_RECORDED` actor editable (design.md §4.1 row 3, R-9).
 * 4. When the guard fires, the write is allowed only if the **effective**
 *    `consentMethod` is not `NOT_RECORDED` and the effective
 *    `consentObtainedAt` is non-null.
 */
export function isConsentProvenanceSatisfied(
  stored: ConsentProvenanceState | null,
  payload: ConsentProvenancePayload,
): boolean {
  const effectiveStatus = payload.consentStatus ?? stored?.consentStatus;
  if (effectiveStatus !== ConsentStatus.GRANTED) {
    return true;
  }

  // Condition (a): no stored actor, or the stored actor was not GRANTED.
  const transitionsIntoGranted = stored?.consentStatus !== ConsentStatus.GRANTED;

  // Condition (b): any provenance field submitted with a value different
  // from what is stored. A field absent from the payload never counts —
  // this is what makes the check value-based rather than presence-based.
  const provenanceValueChanged = PROVENANCE_FIELDS.some((field) => {
    if (!(field in payload)) return false;
    const submitted = payload[field];
    if (submitted === undefined) return false;
    return !isSameValue(submitted, stored?.[field] ?? null);
  });

  if (!transitionsIntoGranted && !provenanceValueChanged) {
    return true;
  }

  const effectiveMethod = payload.consentMethod ?? stored?.consentMethod;
  const effectiveObtainedAt =
    payload.consentObtainedAt !== undefined
      ? payload.consentObtainedAt
      : (stored?.consentObtainedAt ?? null);

  return (
    effectiveMethod !== undefined &&
    effectiveMethod !== ConsentMethod.NOT_RECORDED &&
    effectiveObtainedAt !== null &&
    effectiveObtainedAt !== undefined
  );
}

/**
 * Value equality for provenance-field comparison. `consentObtainedAt` may
 * arrive as a `Date` (from Prisma) on one side and an ISO string (from a
 * freshly-parsed DTO) on the other, so dates are compared by ISO string
 * rather than reference/`Date` identity.
 */
function isSameValue(
  a: string | Date | null | undefined,
  b: string | Date | null | undefined,
): boolean {
  const normalize = (v: string | Date | null | undefined): string | null => {
    if (v === null || v === undefined) return null;
    return v instanceof Date ? v.toISOString() : v;
  };
  return normalize(a) === normalize(b);
}
