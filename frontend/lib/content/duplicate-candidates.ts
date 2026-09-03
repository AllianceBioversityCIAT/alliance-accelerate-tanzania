// @sdd-spec admin/registration-review-queue (R6 remediation)
/**
 * Duplicate-candidate count vocabulary — the single source for the "5+"
 * saturation label shared by `RegistrationsTable.tsx`'s queue flag (FR-11
 * scenario 1) and `DuplicateWarningCard.tsx`'s detail-screen heading.
 *
 * **Why this module exists (post-validation remediation R6).** Both
 * components independently rendered a count derived from the SAME backend
 * cap (`MAX_CANDIDATES_PER_REGISTRATION` in
 * `backend/src/registrations/duplicate-detection.service.ts`), but only
 * `DuplicateWarningCard` rendered the saturated case as `"5+"` — the queue
 * table rendered a bare number, so nine real candidates read as "5 possible
 * duplicates" in the queue and "5+" in the detail card. `requirements.md`
 * FR-11 scenario 1 specifies the **queue flag** as the surface this label
 * governs, so the prior fix (A-35) landed on the wrong component. This
 * module is the `lib/content/registration-status.ts` precedent (T-13's own
 * fix for the same class of two-copy drift, `execution.md` A-78/A-79)
 * applied to the duplicate-candidate count: one `CANDIDATE_CAP` constant
 * and one `candidateCountLabel` function, imported by both components, so
 * they cannot drift apart again.
 *
 * The value here MUST track `MAX_CANDIDATES_PER_REGISTRATION` on the
 * backend — there is no way to import a backend constant into a static
 * frontend export, so this is a deliberately duplicated literal, not a
 * shared one; a future change to the backend cap requires updating both.
 */

/** Mirrors `MAX_CANDIDATES_PER_REGISTRATION` in `backend/src/registrations/duplicate-detection.service.ts` — the point past which the true count is unknown. */
export const CANDIDATE_CAP = 5;

/** `"5+"` at or above the cap (the true count is unknown beyond it); the exact number otherwise. */
export function candidateCountLabel(count: number): string {
  if (count >= CANDIDATE_CAP) return `${CANDIDATE_CAP}+`;
  return String(count);
}
