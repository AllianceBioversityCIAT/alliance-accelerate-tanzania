// @sdd-spec admin/registration-review-queue (T-13)
'use client';

/**
 * ConsentRecordCard — the consent block (FR-10 scenario 2).
 *
 * Renders the consenting organisation, the policy version, and the
 * acceptance timestamp — with two properties that are load-bearing, not
 * decorative:
 *
 *   1. **An explicit timezone designator on the rendered timestamp.** An
 *      adjudicator comparing an acceptance time to a policy publication
 *      time cannot do so from an ambiguous local string. `acceptedAt` is
 *      always UTC (`Z` suffix) on the wire, so it is rendered with
 *      `Intl.DateTimeFormat`'s `timeZone: 'UTC'` + `timeZoneName: 'short'`,
 *      which yields a literal "UTC" designator in the string.
 *   2. **The "recorded at submission" qualifier**, rendered from
 *      `AdminConsentRecord.acceptedAtQualifier` — DATA, not frontend prose.
 *      `Registration`'s own `schema.prisma` comment records that the
 *      contract collects no client acceptance timestamp by design, making
 *      the stored value an UPPER BOUND on the applicant's true acceptance
 *      moment, never an independently attested one. Presenting it as
 *      attested would overstate the consent record in the one card whose
 *      job is to be exact about it.
 *
 * The qualifier's label is a TOTAL `Record<AdminConsentRecord
 * ['acceptedAtQualifier'], string>` (the same pattern
 * `ActorHistoryPanel.tsx`'s `actionBadgeClasses` — DD-21 — uses for
 * `AuditEntry['action']`). `acceptedAtQualifier` is a single-member
 * string-literal union today; a total `Record` turns a future widening
 * into a compile error instead of a silently stale label.
 *
 * Tokens only; no hardcoded colours/geometry (NFR-6).
 */

import type { AdminConsentRecord } from '@/lib/api/registrations-admin';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Total map over `AdminConsentRecord['acceptedAtQualifier']` — see the
 * file-level doc comment. Adding a member to the backend union without
 * adding it here fails `npx tsc --noEmit`, not silently at runtime.
 */
const ACCEPTED_AT_QUALIFIER_LABEL: Record<AdminConsentRecord['acceptedAtQualifier'], string> = {
  RECORDED_AT_SUBMISSION:
    'Recorded at submission — an upper bound on the applicant’s acceptance moment, not an independently attested timestamp.',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Renders `acceptedAt` with an explicit timezone designator (FR-10 scenario
 * 2). `timeZone: 'UTC'` matches the wire format's `Z` suffix;
 * `timeZoneName: 'short'` is what supplies the designator itself (renders
 * "UTC" for `en-GB` + `timeZone: 'UTC'`).
 */
function formatAcceptedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsentRecordCardProps {
  consent: AdminConsentRecord;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConsentRecordCard({ consent }: Readonly<ConsentRecordCardProps>) {
  const qualifierLabel = ACCEPTED_AT_QUALIFIER_LABEL[consent.acceptedAtQualifier];

  return (
    <section
      aria-labelledby="consent-record-heading"
      className="rounded-md border border-border bg-surface p-4 shadow-sm"
    >
      <h2 id="consent-record-heading" className="text-sm font-semibold text-fg">
        Consent record
      </h2>

      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Consenting organisation
          </dt>
          <dd className="mt-0.5 text-sm font-medium text-fg">{consent.consentingOrganisation}</dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Policy version
          </dt>
          <dd className="mt-0.5 text-sm font-medium text-fg">{consent.policyVersion}</dd>
        </div>

        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Acceptance timestamp
          </dt>
          <dd className="mt-0.5 text-sm font-medium text-fg">
            <time dateTime={consent.acceptedAt}>{formatAcceptedAt(consent.acceptedAt)}</time>
          </dd>
          <dd className="mt-1 text-xs text-muted">{qualifierLabel}</dd>
        </div>
      </dl>
    </section>
  );
}
