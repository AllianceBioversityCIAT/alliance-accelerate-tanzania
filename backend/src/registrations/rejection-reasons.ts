// @sdd-spec admin/registration-review-queue (T-9)
/**
 * T-9 — the frozen rejection-reason list (FR-11 scenario 3, FR-13 scenario
 * 1, `design.md` §6.4).
 *
 * `RegistrationRejectDto.reason` (`dto/registration-reject.dto.ts`) validates
 * against {@link REJECTION_REASON_CODES} via `@IsIn(...)` — the SAME set this
 * file exports, never a second, hand-copied list. FR-13's "the reason is
 * mandatory" scenario is what makes an unknown or missing code a `400`
 * before `AdminRegistrationsService.reject` ever runs (the global
 * `ValidationPipe`, `common/validation-pipe.ts`).
 *
 * **FR-11 scenario 3 — "Duplicate of an existing registry record" MUST be a
 * first-class, structured reason, not only free text.**
 * {@link DUPLICATE_OF_EXISTING_RECORD_REASON_CODE} is that reason's code; its
 * `label` is the exact quoted string the requirement names, so a reviewer
 * reading either the code or the rendered label recognises the same reason.
 * Recording the STRUCTURED code (never only the applicant-facing `note`) is
 * what makes duplicates countable later — `design.md` §6.4.
 *
 * **Frozen, and additive-only if ever extended.** `Object.freeze` on both the
 * array and each element guards the same invariant `consent-policy.ts`'s
 * `KNOWN_CONSENT_POLICY_VERSIONS` documents for a different frozen list:
 * a reason CODE already written to a `Registration.rejectionReason` column
 * must keep resolving to a real reason forever, so a code is added here, never
 * renamed or removed, if this list is ever extended.
 */

/** FR-11 scenario 3 — the exact quoted reason. */
export const DUPLICATE_OF_EXISTING_RECORD_REASON_CODE = 'DUPLICATE_OF_EXISTING_RECORD';

/**
 * Source literals — `as const` so `RejectionReasonCode` below is a closed
 * union of the five literal codes, never widened to `string`. Not exported:
 * the exported {@link REJECTION_REASONS} is the runtime-frozen (via
 * `Object.freeze`) view every caller actually uses; this array exists only
 * so the union type can be derived from a single, non-duplicated source.
 */
const REJECTION_REASONS_SOURCE = [
  {
    code: DUPLICATE_OF_EXISTING_RECORD_REASON_CODE,
    label: 'Duplicate of an existing registry record',
  },
  {
    code: 'INCOMPLETE_OR_INVALID_INFORMATION',
    label: 'Incomplete or invalid information',
  },
  {
    code: 'NOT_A_SEED_SYSTEM_ACTOR',
    label: 'Not a seed-system actor',
  },
  {
    code: 'UNABLE_TO_VERIFY_CONTACT_DETAILS',
    label: 'Unable to verify contact details',
  },
  {
    code: 'OTHER',
    label: 'Other',
  },
] as const;

/**
 * The closed set of valid `rejectionReason` codes — mirrored by nothing
 * else. `RegistrationRejectDto.reason` and `RejectionReason.code` both type
 * against THIS, so a future addition/removal here is a compile error at
 * every call site that assumed the old set, rather than a silent drift a
 * hand-copied client-side enum could develop unnoticed (the exact gap
 * `frontend/CLAUDE.md`'s NFR-11 exact-string-literal-union rule exists to
 * close for T-11's typed client).
 */
export type RejectionReasonCode = (typeof REJECTION_REASONS_SOURCE)[number]['code'];

export interface RejectionReason {
  /** The value persisted to `Registration.rejectionReason` and echoed in the audit row (`design.md` §6.7) — admin-only, never returned by the public lookup (DC-32). */
  code: RejectionReasonCode;
  /** Applicant-neutral, reviewer-facing copy. Never sent to the applicant — the public lookup returns at most `reviewNote` (§6.4). */
  label: string;
}

export const REJECTION_REASONS: readonly RejectionReason[] = Object.freeze(
  REJECTION_REASONS_SOURCE.map((reason) => Object.freeze({ ...reason }) as RejectionReason),
);

/** Derived, never hand-duplicated — `RegistrationRejectDto`'s `@IsIn(...)` validates against THIS. */
export const REJECTION_REASON_CODES: readonly RejectionReasonCode[] = Object.freeze(
  REJECTION_REASONS.map((reason) => reason.code),
);
