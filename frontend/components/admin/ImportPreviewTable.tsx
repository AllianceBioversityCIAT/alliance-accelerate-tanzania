// @sdd-spec admin/actor-import (T-8)
'use client';

/**
 * ImportPreviewTable — per-row outcomes for the bulk actor import flow.
 *
 * Shared by both the preview (dry run) and the result (commit) views: it renders
 * the `ImportReport.rows` returned by `importActors` (design.md §3/§5). Columns:
 *   Row #  ·  Trader ID  ·  Name  ·  Outcome (badge)  ·  Details (errors/warnings)
 *
 * Rows are grouped invalid-first — failed, then skipped, then create/created —
 * so an Admin sees the problems that need attention at the top; the Excel row
 * number stays visible on every row regardless of position (FR-7, FR-9).
 *
 * Outcome badge palette (design.md §5 — EXISTING tokens only, matching the
 * consent badges in ActorsTable):
 *   create / created            → positive  (bg-highlight-tint text-success)
 *   skipped-exists / -duplicate → neutral   (bg-border text-muted)
 *   failed                      → danger    (bg-danger-soft text-danger)
 *   warning indicator           → caution   (bg-warning/10 text-warning)
 *
 * Layout: <table> on md+, stacked cards on mobile (console pattern).
 * Errors are rendered as "field: message" lines (field NAMES only — no PII
 * values, FR-11); warnings as plain notes.
 *
 * Accessibility (WCAG 2.1 AA / system-design §10):
 *   - <table> with <caption>, <th scope="col">.
 *   - Non-interactive, keyboard-navigable content; no hidden focus traps.
 *
 * Tokens only; no hardcoded colors/geometry.
 */

import type { ImportRowResult } from '@/lib/api/actors-admin';

// ---------------------------------------------------------------------------
// Outcome presentation
// ---------------------------------------------------------------------------

/** Sort weight so invalid rows surface first, then skips, then creates. */
function outcomeWeight(outcome: ImportRowResult['outcome']): number {
  switch (outcome) {
    case 'failed':
      return 0;
    case 'skipped-exists':
    case 'skipped-duplicate-in-file':
      return 1;
    default:
      return 2; // create / created
  }
}

function outcomeLabel(outcome: ImportRowResult['outcome']): string {
  switch (outcome) {
    case 'create':
      return 'Will create';
    case 'created':
      return 'Created';
    case 'skipped-exists':
      return 'Skipped — exists';
    case 'skipped-duplicate-in-file':
      return 'Skipped — duplicate in file';
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
    default: // skipped-*
      return 'bg-border text-muted';
  }
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function OutcomeBadge({ outcome }: { outcome: ImportRowResult['outcome'] }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        outcomeBadgeClasses(outcome),
      ].join(' ')}
    >
      {outcomeLabel(outcome)}
    </span>
  );
}

function WarningBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
      Warning
    </span>
  );
}

// ---------------------------------------------------------------------------
// Row details (errors + warnings) — shared by table and cards
// ---------------------------------------------------------------------------

function RowDetails({ row }: { row: ImportRowResult }) {
  const hasErrors = row.errors && row.errors.length > 0;
  const hasWarnings = row.warnings && row.warnings.length > 0;

  if (!hasErrors && !hasWarnings) {
    return <span className="text-muted">—</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      {hasErrors && (
        <ul className="flex flex-col gap-0.5">
          {row.errors!.map((err, i) => (
            <li key={`e-${i}`} className="text-xs text-danger">
              <span className="font-medium">{err.field}:</span> {err.message}
            </li>
          ))}
        </ul>
      )}
      {hasWarnings && (
        <ul className="flex flex-col gap-0.5">
          {row.warnings!.map((warn, i) => (
            <li key={`w-${i}`} className="text-xs text-warning">
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

function PreviewCard({ row }: { row: ImportRowResult }) {
  const hasWarnings = row.warnings && row.warnings.length > 0;

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
            Row {row.rowNumber} · {row.traderId ?? '—'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <OutcomeBadge outcome={row.outcome} />
          {hasWarnings && <WarningBadge />}
        </div>
      </div>

      <RowDetails row={row} />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ImportPreviewTableProps {
  /** Report rows from a preview or commit run. */
  rows: ImportRowResult[];
}

export function ImportPreviewTable({ rows }: ImportPreviewTableProps) {
  // Group invalid-first while preserving Excel row order within each group.
  const sorted = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const w = outcomeWeight(a.row.outcome) - outcomeWeight(b.row.outcome);
      return w !== 0 ? w : a.index - b.index;
    })
    .map((entry) => entry.row);

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
              {['Row #', 'Trader ID', 'Name', 'Outcome', 'Details'].map((col) => (
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
            {sorted.map((row) => {
              const hasWarnings = row.warnings && row.warnings.length > 0;
              return (
                <tr key={row.rowNumber} className="align-top">
                  <td className="px-4 py-3 font-medium text-fg whitespace-nowrap">
                    {row.rowNumber}
                  </td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {row.traderId ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-fg">{row.traderName ?? '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col items-start gap-1">
                      <OutcomeBadge outcome={row.outcome} />
                      {hasWarnings && <WarningBadge />}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <RowDetails row={row} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Mobile cards (<md) ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:hidden" role="list" aria-label="Import rows">
        {sorted.map((row) => (
          <div key={row.rowNumber} role="listitem">
            <PreviewCard row={row} />
          </div>
        ))}
      </div>
    </div>
  );
}
