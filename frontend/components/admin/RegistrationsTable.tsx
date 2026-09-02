// @sdd-spec admin/registration-review-queue (T-12)
'use client';

/**
 * RegistrationsTable — Admin registrations queue list (FR-9).
 *
 * Follows `ActorsTable.tsx`'s conventions (`design.md` §7.2,
 * `frontend/CLAUDE.md`):
 *   - Dual rendering: a `hidden <bp>:block` table with `overflow-x-auto`
 *     plus a `<bp>:hidden` stacked card list.
 *   - One sticky column (Reference), pinned `left-0` with an **opaque**
 *     token background — a transparent sticky cell would let scrolled
 *     columns show through underneath it — and the frozen/scrolling
 *     boundary marked with `shadow-sticky-edge` (an inset box-shadow),
 *     never `border-r` (under `border-collapse` a cell border belongs to
 *     the table's border grid, not the cell's own paint, so it visibly
 *     detaches from the sticky cell on scroll).
 *   - Row hover re-declared on the sticky cell via `group`/`group-hover`,
 *     since an opaque `td` cannot inherit the ambient `<tr>` background the
 *     way a transparent one would.
 *
 * **Breakpoint — `md`, measured (`design.md` §7.2).** Headless-Chrome
 * measurement at 768px against this table with a 70-char worst-case
 * applicant name:
 *
 * |                  | RegistrationsTable (measured) | ActorsTable precedent |
 * |------------------|-------------------------------:|-----------------------:|
 * | viewport         | 768                             | 768                     |
 * | container        | 481px                           | 494px                   |
 * | frozen sticky     | 140px (29%)                     | ~400px (81%)            |
 * | scrollable strip | **341px**                       | 94px                    |
 *
 * Raw result: `{"viewport":768,"container":481,"tableContent":1232,
 * "frozenSticky":140,"scrollableStrip":341,"hiddenContent":751,
 * "frozenPct":29}`.
 *
 * 341px of strip is 3.6× the 94px that forced `ActorsTable` to `lg`, and
 * the frozen share is 29% against 81%. The structural reason: this table's
 * sticky column is Reference, a format-bounded `REG-YYYY-NNNN` code
 * (measured at 140px) — not an unbounded 55–60 character cooperative name
 * like `ActorsTable`'s `traderName`, which froze ~400px of a 494px
 * container. A reference code does not grow with the data, so the failure
 * mode that forced `ActorsTable` to `lg` cannot occur here. That is why
 * this table sits on the `UsersTable` (`md`) side rather than the
 * `ActorsTable` (`lg`) side — established by measurement, not argument.
 * Reasoning to a breakpoint without measuring is the defect `design.md`
 * §7.2 names explicitly (`usage-analytics` L-1 defect #4).
 *
 * Columns: Reference (sticky) · Applicant · Type · Region · Submitted ·
 * Duplicates · Status · Action — eight, one sticky.
 *
 * Segments (FR-9 scenario 1): rows render only for `PENDING_REVIEW`,
 * `APPROVED`, `REJECTED` — the three statuses this chunk can produce. This
 * component itself renders whatever rows it is given; the *segment
 * control* that keeps `AWAITING_APPLICANT`/`WITHDRAWN` unreachable lives in
 * the page (`app/(admin)/admin/registrations/page.tsx`), which is what the
 * absence assertion in this file's test actually exercises end-to-end.
 *
 * No "No email" flag: email is required and OTP-verified (3a FR-4), so the
 * state that flag would describe cannot occur, and none is rendered here.
 *
 * No selection, no bulk actions (D-3 excludes bulk approve/reject). The
 * only row-level control is a "Review" link to the detail screen.
 *
 * Tokens only; no hardcoded colors/geometry.
 */

import Link from 'next/link';

import type { AdminRegistrationListRow, RegistrationStatus } from '@/lib/api/registrations-admin';
import { roleLabel, type TraderType } from '@/lib/content/roles';

// ---------------------------------------------------------------------------
// Breakpoint — single source; see the measured `md` decision in the
// file-level doc comment above
// ---------------------------------------------------------------------------

/** `md` — measured; see the file-level doc comment above. */
const TABLE_VISIBLE_CLASS = 'hidden md:block';
const CARDS_VISIBLE_CLASS = 'flex flex-col gap-3 md:hidden';

// ---------------------------------------------------------------------------
// Sticky first column (Reference) — mirrors ActorsTable.tsx's pattern
// ---------------------------------------------------------------------------

const STICKY_REFERENCE_TH = 'sticky left-0 bg-surface-alt shadow-sticky-edge';
const STICKY_REFERENCE_TD = [
  'sticky left-0',
  'bg-surface group-hover:bg-surface-alt transition-colors',
  'shadow-sticky-edge',
].join(' ');

/**
 * Width clamp for the rendered Applicant name — on an inner `<span>`, never
 * on the `<td>` itself. `max-w-*` on a table cell is a no-op once the cell
 * is `whitespace-nowrap` (see `ActorsTable.tsx`'s identical note on its
 * Trader column for the full CSS-sizing rationale); a block-level child
 * obeys the clamp because its min-content *contribution* — not the cell's
 * — is what gets bounded.
 */
const APPLICANT_NAME_CLAMP_CLASS = 'block max-w-xs truncate';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegistrationsTableProps {
  /** Rows currently visible on this page. */
  rows: AdminRegistrationListRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Status badge label/tokens — reuses the `ConsentBadge` token pairing from
 * `ActorsTable.tsx` (`highlight-tint`/`success` for a settled-good state,
 * `danger-soft`/`danger` for a settled-negative state, `border`/`muted` for
 * a neutral/waiting state) rather than inventing a new palette.
 *
 * `AWAITING_APPLICANT`/`WITHDRAWN` are handled defensively (the type is the
 * full `RegistrationStatus` union) but are never actually produced by this
 * chunk's data or reachable via the page's segment control (FR-9 scenario 1).
 */
function statusLabel(status: RegistrationStatus): string {
  switch (status) {
    case 'PENDING_REVIEW':
      return 'Pending review';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    case 'AWAITING_APPLICANT':
      return 'Awaiting applicant';
    case 'WITHDRAWN':
      return 'Withdrawn';
    default:
      return status;
  }
}

function statusBadgeClasses(status: RegistrationStatus): string {
  switch (status) {
    case 'APPROVED':
      return 'bg-highlight-tint text-success';
    case 'REJECTED':
      return 'bg-danger-soft text-danger';
    default:
      return 'bg-border text-muted';
  }
}

function StatusBadge({ status }: { status: RegistrationStatus }) {
  return (
    <span
      className={[
        'inline-flex items-center self-start rounded-full px-2 py-0.5 text-xs font-medium',
        statusBadgeClasses(status),
      ].join(' ')}
    >
      {statusLabel(status)}
    </span>
  );
}

/**
 * Duplicate-candidate flag (FR-11 scenario 1 — "the queue row carries a
 * corresponding flag so a reviewer can spot it before opening"). A count of
 * zero renders a muted dash, matching `ActorsTable.tsx`'s `formatPhone`-style
 * treatment of an absent value rather than an empty cell.
 */
function DuplicatesFlag({ count }: { count: number }) {
  if (count <= 0) {
    return <span className="text-muted">—</span>;
  }
  return (
    <span
      className={[
        'inline-flex items-center self-start rounded-full px-2 py-0.5 text-xs font-medium',
        'bg-warning/10 text-warning',
      ].join(' ')}
    >
      {count} possible {count === 1 ? 'duplicate' : 'duplicates'}
    </span>
  );
}

function ReviewLink({ id, reference }: { id: string; reference: string }) {
  return (
    <Link
      href={`/admin/registrations/review?id=${id}`}
      aria-label={`Review ${reference}`}
      className={[
        'inline-flex items-center rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg',
        'transition-colors hover:bg-surface-alt',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
      ].join(' ')}
    >
      Review
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function RegistrationCard({ row }: { row: AdminRegistrationListRow }) {
  return (
    <article
      aria-label={row.reference}
      className="rounded-md border border-border bg-surface p-4 shadow-sm flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted">{row.reference}</p>
          <p className="truncate text-sm font-medium text-fg">{row.applicant}</p>
          <p className="text-xs text-muted mt-0.5">{roleLabel(row.traderType as TraderType)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={row.status} />
          <DuplicatesFlag count={row.duplicateCandidateCount} />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-muted">Region</dt>
          <dd className="font-medium text-fg">{row.region}</dd>
        </div>
        <div>
          <dt className="text-muted">Submitted</dt>
          <dd className="font-medium text-fg">{formatDate(row.submittedAt)}</dd>
        </div>
      </dl>

      <div className="pt-1">
        <ReviewLink id={row.id} reference={row.reference} />
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RegistrationsTable({ rows }: RegistrationsTableProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* ── Desktop table ──────────────────────────────────────────────── */}
      <div className={[TABLE_VISIBLE_CLASS, 'overflow-x-auto rounded-md border border-border'].join(' ')}>
        <table className="min-w-full divide-y divide-border text-sm" aria-label="Registrations">
          <caption className="sr-only">
            List of pending, approved, and rejected registrations with applicant, type, region,
            submission date, duplicate flag, status, and a review action.
          </caption>
          <thead className="bg-surface-alt">
            <tr>
              {[
                'Reference',
                'Applicant',
                'Type',
                'Region',
                'Submitted',
                'Duplicates',
                'Status',
                'Action',
              ].map((col) => (
                <th
                  key={col}
                  scope="col"
                  className={[
                    'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted whitespace-nowrap',
                    col === 'Reference' ? STICKY_REFERENCE_TH : '',
                  ].join(' ')}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {rows.map((row) => (
              <tr key={row.id} className="group hover:bg-surface-alt transition-colors">
                <td className={['px-4 py-3 font-medium text-fg whitespace-nowrap', STICKY_REFERENCE_TD].join(' ')}>
                  {row.reference}
                </td>
                <td className="px-4 py-3 text-fg" title={row.applicant}>
                  <span className={APPLICANT_NAME_CLAMP_CLASS}>{row.applicant}</span>
                </td>
                <td className="px-4 py-3 text-muted whitespace-nowrap">
                  {roleLabel(row.traderType as TraderType)}
                </td>
                <td className="px-4 py-3 text-muted whitespace-nowrap">{row.region}</td>
                <td className="px-4 py-3 text-muted whitespace-nowrap">{formatDate(row.submittedAt)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <DuplicatesFlag count={row.duplicateCandidateCount} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <ReviewLink id={row.id} reference={row.reference} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile/tablet cards ────────────────────────────────────────── */}
      <div className={CARDS_VISIBLE_CLASS} role="list" aria-label="Registrations">
        {rows.map((row) => (
          <div key={row.id} role="listitem">
            <RegistrationCard row={row} />
          </div>
        ))}
      </div>
    </div>
  );
}
