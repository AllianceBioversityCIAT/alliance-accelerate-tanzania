// @sdd-spec admin/registration-review-queue (T-14)
/**
 * Registration status vocabulary — the single source for the label/badge
 * pairing shared by `RegistrationsTable.tsx` (T-12) and
 * `RegistrationDetailPanel.tsx` (T-13/T-14).
 *
 * **Carried forward from T-13's review (`execution.md` A-78).** Before this
 * module existed, `statusLabel`/`statusBadgeClasses` in those two files
 * were byte-equivalent copies of each other — two independent places the
 * status vocabulary could silently drift apart. This is the
 * `lib/content/roles.ts` precedent applied to `RegistrationStatus`.
 *
 * **A-79 — total `Record`, not a `switch` with a `default`.** The prior
 * copies fell through to `default: return status` / `default: return
 * 'bg-border text-muted'` for `AWAITING_APPLICANT`/`WITHDRAWN`, which never
 * actually occur in this chunk's data (`design.md` §7.2's segment control
 * keeps them unreachable) but were silently accepted by the `switch`
 * regardless. A total `Record<RegistrationStatus, …>` makes a future
 * `RegistrationStatus` member a COMPILE error here, not a value that quietly
 * falls through to a `default` at runtime — the same discipline `design.md`
 * DD-21 documents for `actionBadgeClasses`.
 */

import type { RegistrationStatus } from '@/lib/api/registrations-admin';

/** Human-readable label for every `RegistrationStatus` member. */
export const REGISTRATION_STATUS_LABEL: Record<RegistrationStatus, string> = {
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  AWAITING_APPLICANT: 'Awaiting applicant',
  WITHDRAWN: 'Withdrawn',
};

/**
 * Badge token pairing for every `RegistrationStatus` member — reuses the
 * `ActorsTable.tsx` `ConsentBadge` pairing (`highlight-tint`/`success` for a
 * settled-good state, `danger-soft`/`danger` for a settled-negative state,
 * `border`/`muted` for a neutral/waiting state) rather than inventing a new
 * palette.
 */
export const REGISTRATION_STATUS_BADGE_CLASSES: Record<RegistrationStatus, string> = {
  PENDING_REVIEW: 'bg-border text-muted',
  APPROVED: 'bg-highlight-tint text-success',
  REJECTED: 'bg-danger-soft text-danger',
  AWAITING_APPLICANT: 'bg-border text-muted',
  WITHDRAWN: 'bg-border text-muted',
};
