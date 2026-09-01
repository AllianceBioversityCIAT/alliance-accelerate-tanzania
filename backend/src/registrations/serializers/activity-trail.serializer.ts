import { Prisma, RegistrationStatus } from '@prisma/client';

/**
 * T-6 — The activity trail (FR-10 scenario 3, `design.md` §6.6).
 *
 * Five event types, all DERIVED from columns `Registration` already stores —
 * never authored, and never a sixth. {@link buildActivityTrail} is a PURE
 * function: same input row, same output, in the same order, every time. It
 * reads exactly five source-column groups and produces exactly one event
 * shape per group:
 *
 * - *submitted*              ← `createdAt`
 * - *email verified*         ← `emailVerifiedAt`
 * - *consent recorded*       ← `consentAcceptedAt` + `consentPolicyVersion`
 * - *cleared as not a duplicate* ← one per `duplicateDismissals` entry
 * - *adjudicated*            ← `reviewedAt` + `status` + reviewer identity
 *
 * **What this file deliberately does NOT do (FR-10, amended 2026-08-05 —
 * 3a Judgment Day S-4, carried in amended form): it never claims a
 * duplicate-CHECK time.** Detection (`duplicate-detection.service.ts`) runs
 * at READ time and is never persisted — there is no `duplicateCheckedAt`
 * column anywhere in `schema.prisma`, so any such timestamp in this trail
 * would be FABRICATED, in the one surface whose purpose is an auditable
 * consent trail. The original FR-10 demanded both a timestamped
 * duplicate-check event AND derivation from stored fields only; those were
 * mutually unsatisfiable, and the check-time clause was the one removed —
 * do not reintroduce it. `activity-trail.serializer.spec.ts`'s purity test
 * (same input row → `toEqual` against an expectation built independently
 * from the row's own fields) would redden the instant a sixth,
 * unsourced field appeared on any event.
 *
 * Design refs: `design.md` §6.6. Requirements: `requirements.md` FR-10
 * scenario 3.
 */

/** The columns `buildActivityTrail` reads — a strict subset of `Registration`. */
export interface ActivityTrailSourceRow {
  createdAt: Date;
  emailVerifiedAt: Date;
  consentAcceptedAt: Date;
  consentPolicyVersion: string;
  duplicateDismissals: Prisma.JsonValue | null;
  reviewedAt: Date | null;
  reviewedBySub: string | null;
  reviewedByEmail: string | null;
  status: RegistrationStatus;
}

export type ActivityTrailEventType =
  | 'SUBMITTED'
  | 'EMAIL_VERIFIED'
  | 'CONSENT_RECORDED'
  | 'DUPLICATE_DISMISSED'
  | 'ADJUDICATED';

export interface SubmittedTrailEvent {
  type: 'SUBMITTED';
  occurredAt: string;
}

export interface EmailVerifiedTrailEvent {
  type: 'EMAIL_VERIFIED';
  occurredAt: string;
}

export interface ConsentRecordedTrailEvent {
  type: 'CONSENT_RECORDED';
  occurredAt: string;
  policyVersion: string;
}

export interface DuplicateDismissedTrailEvent {
  type: 'DUPLICATE_DISMISSED';
  occurredAt: string;
  candidateActorId: string;
  dismissedBySub: string;
  dismissedByEmail: string;
}

export interface AdjudicatedTrailEvent {
  type: 'ADJUDICATED';
  occurredAt: string;
  status: typeof RegistrationStatus.APPROVED | typeof RegistrationStatus.REJECTED;
  /**
   * `null` when `acting-admin.resolver.ts` could not resolve the reviewer
   * identity (`design.md` §8 — the resolver returns null on failure, an
   * unresolved-reviewer row is a real, reachable production state). Passed
   * through verbatim, never coalesced to `''` — an empty string would read
   * as "reviewed by an empty identity" where the truth is "reviewer
   * identity unknown", and this trail must never disagree with the record
   * it describes (FR-10 scenario 3).
   */
  reviewedBySub: string | null;
  reviewedByEmail: string | null;
}

/** The trail's one output shape — a union closed to exactly these five members. */
export type ActivityTrailEvent =
  | SubmittedTrailEvent
  | EmailVerifiedTrailEvent
  | ConsentRecordedTrailEvent
  | DuplicateDismissedTrailEvent
  | AdjudicatedTrailEvent;

/**
 * One entry of `Registration.duplicateDismissals` as `design.md` §4.3 fixes
 * its contents: the dismissed candidate's actor id, the dismissing
 * reviewer's `sub` and email, and the dismissal instant (ISO-8601 string —
 * the column is opaque JSON, so no Prisma `Date` coercion applies to values
 * inside it).
 */
interface RawDuplicateDismissalEntry {
  actorId?: unknown;
  dismissedBySub?: unknown;
  dismissedByEmail?: unknown;
  dismissedAt?: unknown;
}

interface DuplicateDismissalEntry {
  actorId: string;
  dismissedBySub: string;
  dismissedByEmail: string;
  dismissedAt: string;
}

function isDuplicateDismissalEntry(
  entry: RawDuplicateDismissalEntry,
): entry is DuplicateDismissalEntry {
  return (
    typeof entry?.actorId === 'string' &&
    typeof entry?.dismissedBySub === 'string' &&
    typeof entry?.dismissedByEmail === 'string' &&
    typeof entry?.dismissedAt === 'string'
  );
}

/**
 * Absent (`null`) and an empty array are treated identically (`design.md`
 * §4.3); an entry missing any of the four required string fields is
 * skipped rather than throwing — T-7 is the write path for this column,
 * this is a read path over data it does not write.
 */
function extractDuplicateDismissalEntries(
  value: Prisma.JsonValue | null,
): DuplicateDismissalEntry[] {
  if (!Array.isArray(value)) return [];
  return (value as RawDuplicateDismissalEntry[]).filter(isDuplicateDismissalEntry);
}

/**
 * Build the activity trail for one registration (FR-10 scenario 3).
 *
 * Every event pushed here traces to a named column group in
 * {@link ActivityTrailSourceRow} — nothing is computed, inferred, or read
 * from any other source. `createdAt`/`emailVerifiedAt`/`consentAcceptedAt`
 * are non-nullable on `Registration` (a row cannot exist unverified or
 * unconsented — `schema.prisma`'s own comments), so *submitted*, *email
 * verified* and *consent recorded* are unconditional; *cleared as not a
 * duplicate* and *adjudicated* are conditional on the columns they derive
 * from actually being populated.
 *
 * Ordered by `occurredAt` ascending via `Array.prototype.sort`, which V8
 * guarantees stable (Node ≥ 11) — ties keep the push order above, which is
 * already the correct chronological order for same-instant fixtures. This
 * is what makes the function ORDER-STABLE, not merely correct once: the
 * same row produces the same array, element for element, on every call.
 */
export function buildActivityTrail(row: ActivityTrailSourceRow): ActivityTrailEvent[] {
  const events: ActivityTrailEvent[] = [
    { type: 'SUBMITTED', occurredAt: row.createdAt.toISOString() },
    { type: 'EMAIL_VERIFIED', occurredAt: row.emailVerifiedAt.toISOString() },
    {
      type: 'CONSENT_RECORDED',
      occurredAt: row.consentAcceptedAt.toISOString(),
      policyVersion: row.consentPolicyVersion,
    },
  ];

  for (const dismissal of extractDuplicateDismissalEntries(row.duplicateDismissals)) {
    events.push({
      type: 'DUPLICATE_DISMISSED',
      occurredAt: dismissal.dismissedAt,
      candidateActorId: dismissal.actorId,
      dismissedBySub: dismissal.dismissedBySub,
      dismissedByEmail: dismissal.dismissedByEmail,
    });
  }

  if (
    row.reviewedAt &&
    (row.status === RegistrationStatus.APPROVED || row.status === RegistrationStatus.REJECTED)
  ) {
    events.push({
      type: 'ADJUDICATED',
      occurredAt: row.reviewedAt.toISOString(),
      status: row.status,
      reviewedBySub: row.reviewedBySub,
      reviewedByEmail: row.reviewedByEmail,
    });
  }

  return [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}
