// @sdd-spec admin/registration-review-queue (T-13)
'use client';

/**
 * ActivityTrail — read-only, derived event log for one registration (FR-10
 * scenario 3).
 *
 * **Not a writable log or a note thread.** This component renders NO form
 * control anywhere in its tree — no `input`, `textarea`, `button`,
 * `select`, or `contenteditable` element. There is no "load more" and no
 * expand/collapse affordance (unlike `ActorHistoryPanel.tsx`'s snapshot
 * expander): `activityTrail` arrives whole on `GET /:id`
 * (`AdminRegistrationDetail.activityTrail`), never paginated, so no control
 * is needed to reveal more of it. Internal notes are out of scope (D-6).
 *
 * Consumes `ActivityTrailEvent`'s closed 5-member discriminated union
 * (`activity-trail.serializer.ts` via `registrations-admin.ts`), already
 * ordered by `occurredAt` — this component renders the array as given and
 * derives nothing itself, so it cannot disagree with the record it
 * describes.
 *
 * Two event members carry an identity field typed `string | null` rather
 * than `string`: `DuplicateDismissedTrailEvent.dismissedByEmail` and
 * `AdjudicatedTrailEvent.reviewedBySub`/`reviewedByEmail`. `null` means the
 * resolver could not resolve that identity — rendered here as "identity
 * unknown", NEVER coalesced to an empty string. That distinction was a FAIL
 * fix in both T-6 and T-7's backend review; `resolveIdentity` below is
 * this presentation layer's one place it could be silently undone.
 *
 * Tokens only; no hardcoded colours/geometry (NFR-6).
 */

import type { ActivityTrailEvent } from '@/lib/api/registrations-admin';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Prefers email, falls back to sub, falls back to "identity unknown" when
 * BOTH are null/absent — never an empty string (see the file-level note).
 */
function resolveIdentity(email: string | null, sub?: string | null): string {
  if (email) return email;
  if (sub) return sub;
  return 'identity unknown';
}

function formatOccurredAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Total over `ActivityTrailEvent['type']` — a widened union fails `npx tsc --noEmit`, not silently at runtime. */
function describeEvent(event: ActivityTrailEvent): string {
  switch (event.type) {
    case 'SUBMITTED':
      return 'Submitted';
    case 'EMAIL_VERIFIED':
      return 'Email verified';
    case 'CONSENT_RECORDED':
      return `Consent recorded (policy version ${event.policyVersion})`;
    case 'DUPLICATE_DISMISSED':
      return `Cleared as not a duplicate by ${resolveIdentity(event.dismissedByEmail, event.dismissedBySub)}`;
    case 'ADJUDICATED': {
      const verb = event.status === 'APPROVED' ? 'Approved' : 'Rejected';
      return `${verb} by ${resolveIdentity(event.reviewedByEmail, event.reviewedBySub)}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivityTrailProps {
  /** Derived events, already ordered by `occurredAt` — `AdminRegistrationDetail.activityTrail`. */
  events: ActivityTrailEvent[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActivityTrail({ events }: ActivityTrailProps) {
  return (
    <section
      aria-labelledby="activity-trail-heading"
      className="rounded-md border border-border bg-surface p-4 shadow-sm"
    >
      <h2 id="activity-trail-heading" className="text-sm font-semibold text-fg">
        Activity trail
      </h2>

      {events.length === 0 ? (
        <p className="mt-1 text-sm text-muted">No activity recorded.</p>
      ) : (
        <ol role="list" className="mt-3 space-y-3 border-l border-border pl-4">
          {events.map((event, index) => (
            <li key={`${event.type}-${event.occurredAt}-${index}`} role="listitem">
              <p className="text-sm font-medium text-fg">{describeEvent(event)}</p>
              <time className="text-xs text-muted" dateTime={event.occurredAt}>
                {formatOccurredAt(event.occurredAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
