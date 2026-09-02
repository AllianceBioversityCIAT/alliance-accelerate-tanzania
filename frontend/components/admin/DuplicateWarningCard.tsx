// @sdd-spec admin/registration-review-queue (T-13)
'use client';

/**
 * DuplicateWarningCard — duplicate-candidate warning with per-candidate
 * dismissal (FR-11 scenarios 1-2).
 *
 * FR-11 is explicit that detection "MUST NOT block, reject, merge, or
 * auto-approve" — this card never pre-selects rejection; dismissing a
 * candidate only records that the reviewer judged it NOT a duplicate
 * (FR-11 scenario 1's "allow the reviewer to record that a candidate is not
 * a duplicate"). T-13 covered naming the candidates so a reviewer can judge
 * them; T-14 wires the dismiss control itself.
 *
 * **Per candidate, never row-level (FR-11 scenario 2).** `onDismiss` is
 * called with ONE candidate's `actorId` at a time — dismissing one
 * candidate must never suppress the others. The caller (`Registration
 * DetailPanel.tsx`) re-fetches the registration after a successful
 * dismissal rather than assuming the response carries the refreshed list
 * (`registrations-admin.ts`'s `DismissDuplicateResult` is minimal by
 * design — see that file's doc comment).
 *
 * `onDismiss` is optional so this card still renders read-only wherever a
 * caller has no token/mutation path available (mirrors `DuplicateWarning
 * CardProps` staying backward-compatible with T-13's original read-only
 * usage) — omitting it renders no dismiss control at all.
 *
 * Candidates carry `{ actorId, traderId, traderName, matchedOn }` — no
 * `phone`/`email` VALUES ever cross the wire here (`duplicate-detection.
 * service.ts`'s `DuplicateCandidate` projection). `matchedOn` names WHICH
 * attribute matched (phone / email / traderName / gps) without disclosing
 * WHAT matched — do not invent fields beyond that shape.
 *
 * "5+" cap (carried from T-5's review, A-35; **R6 remediation moved the
 * label function to `lib/content/duplicate-candidates.ts`** so this card and
 * `RegistrationsTable.tsx`'s queue flag share ONE definition and cannot
 * drift apart again — see that module's doc for why the prior fix landed on
 * this card only and left the queue flag under-reporting): the backend caps
 * surfaced candidates at `MAX_CANDIDATES_PER_REGISTRATION = 5`
 * (`duplicate-detection.service.ts`). At exactly 5 candidates the true
 * count could be higher — FR-11 scenario 1's "names the number of
 * candidates" would under-report at >=6 if a bare "5" were rendered, so the
 * cap is rendered as "5+".
 *
 * Tokens only; no hardcoded colours/geometry (NFR-6).
 */

import type { DuplicateCandidate, DuplicateMatchAttribute } from '@/lib/api/registrations-admin';
import { candidateCountLabel } from '@/lib/content/duplicate-candidates';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Human-readable label for each `DuplicateMatchAttribute` — total, so a widened union is a compile error. */
const MATCH_ATTRIBUTE_LABEL: Record<DuplicateMatchAttribute, string> = {
  phone: 'phone number',
  email: 'email address',
  traderName: 'organisation name',
  gps: 'location proximity',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DuplicateWarningCardProps {
  /** Open (non-dismissed) candidates for this registration — `AdminRegistrationDetail.duplicateCandidates`. */
  candidates: DuplicateCandidate[];
  /**
   * Called with a single candidate's `actorId` when the reviewer marks it
   * as not a duplicate (FR-11 scenario 1/2). Omit to render read-only (no
   * dismiss control), matching this card's original T-13 usage.
   */
  onDismiss?: (candidateActorId: string) => void;
  /**
   * `actorId` of the candidate currently being dismissed, if any.
   *
   * **R4 remediation.** Disables EVERY dismiss button while any one
   * candidate's request is in flight, not just that candidate's own — a
   * per-candidate-only disable left every OTHER button clickable during an
   * in-flight request, and `dismissDuplicate`'s pre-fix read-modify-write
   * could lose whichever of two concurrent dismissals landed second (see
   * `admin-registrations.service.ts`'s `dismissDuplicate` doc, R4). The
   * backend fix (a bounded-retry compare-and-set) makes concurrent
   * dismissals safe on the server; this stays as defense in depth so a
   * reviewer cannot fire a second request from this screen at all while the
   * first is outstanding. `aria-busy` still marks only the candidate whose
   * request is actually in flight.
   */
  dismissingId?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchedOnLabel(matchedOn: DuplicateMatchAttribute[]): string {
  return matchedOn.map((attr) => MATCH_ATTRIBUTE_LABEL[attr]).join(', ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DuplicateWarningCard({
  candidates,
  onDismiss,
  dismissingId = null,
}: DuplicateWarningCardProps) {
  const count = candidates.length;

  if (count === 0) {
    return (
      <section
        aria-labelledby="duplicate-warning-heading"
        className="rounded-md border border-border bg-surface p-4 shadow-sm"
      >
        <h2 id="duplicate-warning-heading" className="text-sm font-semibold text-fg">
          Duplicate check
        </h2>
        <p className="mt-1 text-sm text-muted">No possible duplicates found.</p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="duplicate-warning-heading"
      className="rounded-md border border-warning/30 bg-warning/10 p-4 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <h2 id="duplicate-warning-heading" className="text-sm font-semibold text-warning">
          {candidateCountLabel(count)} possible {count === 1 ? 'duplicate' : 'duplicates'} found
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        This is a warning, not a verdict — it does not block approval or pre-select rejection.
        Review each candidate below before deciding.
      </p>

      <ul role="list" className="mt-3 space-y-2">
        {candidates.map((candidate) => {
          const isDismissing = dismissingId === candidate.actorId;
          return (
            <li
              key={candidate.actorId}
              role="listitem"
              className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface p-3"
            >
              <div>
                <p className="text-sm font-medium text-fg">{candidate.traderName}</p>
                <p className="text-xs text-muted">
                  Existing record <span className="font-medium text-fg">{candidate.traderId}</span>
                  {' — matched on '}
                  <span className="font-medium text-fg">{matchedOnLabel(candidate.matchedOn)}</span>
                </p>
              </div>
              {onDismiss && (
                <button
                  type="button"
                  onClick={() => onDismiss(candidate.actorId)}
                  disabled={dismissingId !== null}
                  aria-busy={isDismissing}
                  aria-label={`Mark ${candidate.traderName} as not a duplicate`}
                  className={[
                    'shrink-0 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg',
                    'transition-colors hover:bg-surface-alt',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  ].join(' ')}
                >
                  {isDismissing ? 'Marking…' : 'Not a duplicate'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
