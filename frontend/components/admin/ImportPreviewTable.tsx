// @sdd-spec admin/actor-import (T-8)
'use client';

/**
 * ImportPreviewTable — per-row outcomes for the bulk actor import flow.
 *
 * Shared by both the preview (dry run) and the result (commit) views: it renders
 * the `ImportReport.rows` returned by `importActors` (design.md §3/§5). Columns:
 *   Row #  ·  Trader ID  ·  Name  ·  Outcome (badge)  ·  Details (errors/warnings)
 *
 * The Trader ID column/line is gated by the caller-supplied `showTraderId` prop (see below) — never inferred from row data.
 *
 * Rows are grouped invalid-first — failed, then possible-duplicate, then
 * create/created — so an Admin sees the problems that need attention at the
 * top; the Excel row number stays visible on every row regardless of position
 * (FR-7, FR-9).
 *
 * Outcome badge palette (design.md §5 — EXISTING tokens only, matching the
 * consent badges in ActorsTable):
 *   create / created            → positive  (bg-highlight-tint text-success)
 *   possible-duplicate          → neutral   (bg-border text-muted)
 *   failed                      → danger    (bg-danger-soft text-danger)
 *   warning indicator           → caution   (bg-surface-alt text-warning)
 *
 * T-7 (`actors/consent-intake/intake-required-fields`) — a `possible-duplicate`
 * row shows its duplicate candidates and a **Not a duplicate — create**
 * checkbox (design.md §5, P-19): the same `RowDetails` renders in BOTH the
 * `hidden md:block` table and the `md:hidden` cards, so the control cannot
 * drift between the two layouts. A row whose true candidate count exceeds
 * the 50 shown on the wire (`duplicateCandidatesTotal`) cannot be confirmed
 * — its checkbox is disabled with a short truthful note (design.md §9
 * accepted limit). Weak matches (`duplicateWarnings`) are advisory only and
 * never gate creation; they render as a secondary line using
 * `bg-surface-alt text-warning` (I-11) — **never** a `/NN` opacity modifier,
 * which emits no CSS for a semantic token (frontend/CLAUDE.md).
 *
 * Layout: <table> on md+, stacked cards on mobile (console pattern).
 * Errors are rendered as "field: message" lines (field NAMES only — no PII
 * values, FR-11); warnings as plain notes. Duplicate candidates carry no
 * PII either (NFR-3) — Trader ID, name, and matched-attribute names only.
 *
 * Accessibility (WCAG 2.1 AA / system-design §10):
 *   - <table> with <caption>, <th scope="col">.
 *   - Non-interactive, keyboard-navigable content; no hidden focus traps.
 *   - The confirmation checkbox is a native, labeled control (NFR-4).
 *
 * Tokens only; no hardcoded colors/geometry.
 */

import { useId } from 'react';

import { matchedOnLabel } from './DuplicateConfirmDialog';
import {
  importDuplicateCandidateKey,
  type ImportDuplicateCandidate,
  type ImportRowResult,
} from '@/lib/api/actors-admin';

// ---------------------------------------------------------------------------
// Outcome presentation
// ---------------------------------------------------------------------------

/** Sort weight so invalid rows surface first, then possible duplicates, then creates. */
function outcomeWeight(outcome: ImportRowResult['outcome']): number {
  switch (outcome) {
    case 'failed':
      return 0;
    case 'possible-duplicate':
      return 1;
    default:
      return 2; // create / created
  }
}

/**
 * T-7 — the label depends on more than the bare outcome: a `created` row
 * with a weak duplicate warning reads differently from a plain create, so
 * this takes the whole row rather than just `row.outcome`.
 */
function outcomeLabel(row: ImportRowResult): string {
  switch (row.outcome) {
    case 'create':
      return 'Will create';
    case 'created':
      return (row.duplicateWarnings?.length ?? 0) > 0
        ? 'Created (similar actor exists)'
        : 'Created';
    case 'possible-duplicate':
      return 'Possible duplicate — not created';
    default:
      return 'Failed';
  }
}

function outcomeBadgeClasses(outcome: ImportRowResult['outcome']): string {
  switch (outcome) {
    case 'create':
    case 'created':
      return 'bg-highlight-tint text-success';
    case 'failed':
      return 'bg-danger-soft text-danger';
    default: // possible-duplicate
      return 'bg-border text-muted';
  }
}

/** Whether the row has anything the caution "Warning" badge should flag. */
function hasAnyWarning(row: ImportRowResult): boolean {
  return (row.warnings?.length ?? 0) > 0 || (row.duplicateWarnings?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function OutcomeBadge({ row }: Readonly<{ row: ImportRowResult }>) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        outcomeBadgeClasses(row.outcome),
      ].join(' ')}
    >
      {outcomeLabel(row)}
    </span>
  );
}

function WarningBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-alt px-2 py-0.5 text-xs font-medium text-warning">
      Warning
    </span>
  );
}

// ---------------------------------------------------------------------------
// Duplicate candidates (T-7)
// ---------------------------------------------------------------------------

/** One candidate's identity + matched attributes, as a single readable line. */
function CandidateLine({ candidate }: Readonly<{ candidate: ImportDuplicateCandidate }>) {
  if (candidate.kind === 'actor') {
    return (
      <>
        <span className="font-medium text-fg">{candidate.traderName}</span>
        {' — existing record '}
        <span className="font-medium text-fg">{candidate.traderId}</span>
        {' — matched on '}
        <span className="font-medium text-fg">{matchedOnLabel(candidate.matchedOn)}</span>
      </>
    );
  }
  return (
    <>
      <span className="font-medium text-fg">{candidate.traderName}</span>
      {` — row ${candidate.row} of this file`}
      {' — matched on '}
      <span className="font-medium text-fg">{matchedOnLabel(candidate.matchedOn)}</span>
    </>
  );
}

/**
 * Strong candidates for a `possible-duplicate` row, plus (when the preview
 * page wires it up) the per-row **Not a duplicate — create** checkbox.
 * Disabled, with a truthful note, when the true count exceeds what the wire
 * cap shows (design.md §9 accepted limit) — that row can never be confirmed.
 */
function DuplicateCandidates({
  row,
  confirmed,
  onToggleConfirm,
}: Readonly<{
  row: ImportRowResult;
  confirmed: boolean;
  onToggleConfirm?: (checked: boolean) => void;
}>) {
  // Stable per-mount id (table and card render separate instances of this
  // component for the same row, so a literal `row.rowNumber`-based id would
  // collide across the two DOM trees).
  const overCapNoteId = useId();
  const candidates = row.duplicateCandidates ?? [];
  if (candidates.length === 0) return null;

  const total = row.duplicateCandidatesTotal ?? candidates.length;
  const tooMany = total > candidates.length;
  const canConfirm = row.outcome === 'possible-duplicate' && Boolean(onToggleConfirm);

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-alt p-2">
      <ul className="flex flex-col gap-0.5">
        {candidates.map((candidate) => (
          <li key={importDuplicateCandidateKey(candidate)} className="text-xs text-muted">
            <CandidateLine candidate={candidate} />
          </li>
        ))}
      </ul>
      {canConfirm && (
        <label className="flex items-center gap-2 text-xs font-medium text-fg">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={tooMany}
            onChange={(e) => onToggleConfirm?.(e.target.checked)}
            aria-label={`Not a duplicate — create (row ${row.rowNumber})`}
            aria-describedby={tooMany ? overCapNoteId : undefined}
            className={[
              'h-4 w-4 rounded border-border text-primary',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          />
          <span>Not a duplicate — create</span>
        </label>
      )}
      {tooMany && (
        <p id={overCapNoteId} className="text-xs text-muted">
          more than 50 matches — resolve the duplicates first
        </p>
      )}
    </div>
  );
}

/** Weak matches — advisory only, never gates creation (design.md I-11). */
function DuplicateWarnings({ row }: Readonly<{ row: ImportRowResult }>) {
  const weak = row.duplicateWarnings ?? [];
  if (weak.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-surface-alt p-2">
      <ul className="flex flex-col gap-0.5">
        {weak.map((candidate, i) => (
          <li key={`w-${i}`} className="text-xs text-warning">
            <CandidateLine candidate={candidate} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row details (errors + warnings + duplicates) — shared by table and cards
// ---------------------------------------------------------------------------

function RowDetails({
  row,
  confirmed,
  onToggleConfirm,
}: Readonly<{
  row: ImportRowResult;
  confirmed: boolean;
  onToggleConfirm?: (checked: boolean) => void;
}>) {
  const hasErrors = row.errors && row.errors.length > 0;
  const hasWarnings = row.warnings && row.warnings.length > 0;
  const hasCandidates = (row.duplicateCandidates?.length ?? 0) > 0;
  const hasWeakWarnings = (row.duplicateWarnings?.length ?? 0) > 0;

  if (!hasErrors && !hasWarnings && !hasCandidates && !hasWeakWarnings) {
    return <span className="text-muted">—</span>;
  }

  return (
    <div className="flex flex-col gap-2">
      {hasErrors && (
        <ul className="flex flex-col gap-0.5">
          {row.errors!.map((err, i) => (
            <li key={`e-${i}`} className="text-xs text-danger">
              <span className="font-medium">{err.field}:</span> {err.message}
            </li>
          ))}
        </ul>
      )}
      {hasCandidates && (
        <DuplicateCandidates row={row} confirmed={confirmed} onToggleConfirm={onToggleConfirm} />
      )}
      {hasWeakWarnings && <DuplicateWarnings row={row} />}
      {hasWarnings && (
        <ul className="flex flex-col gap-0.5">
          {row.warnings!.map((warn) => (
            <li key={warn} className="text-xs text-warning">
              {warn}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function PreviewCard({
  row,
  confirmed,
  onToggleConfirm,
  showTraderId,
}: Readonly<{
  row: ImportRowResult;
  confirmed: boolean;
  onToggleConfirm?: (checked: boolean) => void;
  showTraderId: boolean;
}>) {
  return (
    <article
      aria-label={`Row ${row.rowNumber}`}
      className="rounded-md border border-border bg-surface p-4 shadow-sm flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">
            {row.traderName ?? '—'}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Row {row.rowNumber}
            {showTraderId ? ` · ${row.traderId ?? '—'}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <OutcomeBadge row={row} />
          {hasAnyWarning(row) && <WarningBadge />}
        </div>
      </div>

      <RowDetails row={row} confirmed={confirmed} onToggleConfirm={onToggleConfirm} />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ImportPreviewTableProps {
  /** Report rows from a preview or commit run. */
  rows: ImportRowResult[];
  /**
   * T-7 — Excel row numbers the admin has confirmed are not duplicates.
   * Omit entirely (along with `onToggleConfirm`) for a read-only render,
   * e.g. the post-commit result view, where no further confirmation is
   * possible.
   */
  confirmedRows?: ReadonlySet<number>;
  /** T-7 — called when the admin toggles a `possible-duplicate` row's checkbox. */
  onToggleConfirm?: (rowNumber: number, checked: boolean) => void;
  /** Whether to render the Trader ID column/line — `false` for a preview (always `null` until commit), `true` for the result. Defaults to `true`. */
  showTraderId?: boolean;
}

export function ImportPreviewTable({
  rows,
  confirmedRows,
  onToggleConfirm,
  showTraderId = true,
}: Readonly<ImportPreviewTableProps>) {
  // Group invalid-first while preserving Excel row order within each group.
  const sorted = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const w = outcomeWeight(a.row.outcome) - outcomeWeight(b.row.outcome);
      return w !== 0 ? w : a.index - b.index;
    })
    .map((entry) => entry.row);

  const toggleHandlerFor = onToggleConfirm
    ? (rowNumber: number) => (checked: boolean) => onToggleConfirm(rowNumber, checked)
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      {/* ── Desktop table (md+) ─────────────────────────────────────────────── */}
      <div className="hidden md:block overflow-x-auto rounded-md border border-border">
        <table className="min-w-full divide-y divide-border text-sm" aria-label="Import rows">
          <caption className="sr-only">
            Per-row import outcomes, grouped with invalid rows first.
          </caption>
          <thead className="bg-surface-alt">
            <tr>
              {(showTraderId
                ? ['Row #', 'Trader ID', 'Name', 'Outcome', 'Details']
                : ['Row #', 'Name', 'Outcome', 'Details']
              ).map((col) => (
                <th
                  key={col}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {sorted.map((row) => (
              <tr key={row.rowNumber} className="align-top">
                <td className="px-4 py-3 font-medium text-fg whitespace-nowrap">
                  {row.rowNumber}
                </td>
                {showTraderId && (
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {row.traderId ?? '—'}
                  </td>
                )}
                <td className="px-4 py-3 text-fg">{row.traderName ?? '—'}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex flex-col items-start gap-1">
                    <OutcomeBadge row={row} />
                    {hasAnyWarning(row) && <WarningBadge />}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <RowDetails
                    row={row}
                    confirmed={confirmedRows?.has(row.rowNumber) ?? false}
                    onToggleConfirm={toggleHandlerFor?.(row.rowNumber)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile cards (<md) ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:hidden" role="list" aria-label="Import rows">
        {sorted.map((row) => (
          <div key={row.rowNumber} role="listitem">
            <PreviewCard
              row={row}
              confirmed={confirmedRows?.has(row.rowNumber) ?? false}
              onToggleConfirm={toggleHandlerFor?.(row.rowNumber)}
              showTraderId={showTraderId}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
