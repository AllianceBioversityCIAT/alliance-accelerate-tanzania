/**
 * PII-free CSV serializer for the Discovery Dashboard (T-12).
 *
 * Traces: FR-9, NFR-1, NFR-2, design.md §5.7/§6, spec: dashboard/discovery-dashboard.
 *
 * HARD PII GATE: this module operates on an EXPLICIT allowlist of public columns.
 * phone and email are NOT on PublicActor and are NEVER referenced here.
 * Do NOT add spread operators over actor objects — always use the named allowlist.
 *
 * Output shape:
 *   [summary block — labelled rows from kpis]
 *   [blank line]
 *   [CSV header]
 *   [CSV rows — one per actor, allowlisted columns only]
 */

import type { PublicActor } from '@/lib/api/actors';
import type { DashboardKpis } from '@/lib/dashboard/aggregate';

// ── Allowed public columns (explicit allowlist — never add phone/email) ────────

/**
 * The ordered set of public columns exported to CSV.
 * Crops are serialised as a semicolon-joined list within a single field.
 * gps and id are intentionally excluded (not useful for bulk analysis).
 * district may be null/undefined and is rendered as empty string in that case.
 */
const PUBLIC_COLUMNS = [
  'traderName',
  'region',
  'district',
  'traderType',
  'capacityTons',
  'crops',
] as const;

type PublicColumn = (typeof PUBLIC_COLUMNS)[number];

// ── CSV helpers ───────────────────────────────────────────────────────────────

/**
 * Escape a single CSV field value per RFC 4180:
 *   - If the value contains a comma, double-quote, or newline, wrap in double
 *     quotes and escape any internal double-quotes as "".
 *   - Otherwise return the value as-is.
 */
function escapeField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Join an array of field values into a single CSV row string (no newline). */
function toCsvRow(fields: string[]): string {
  return fields.map(escapeField).join(',');
}

// ── Actor → row serialiser (allowlist only) ───────────────────────────────────

/**
 * Extract the allowlisted column value for a single actor.
 * Crops are joined with ";" so the crops field is a single CSV cell.
 * capacityTons is serialised as an empty string when null/undefined.
 * district is serialised as an empty string when null/undefined.
 */
function actorColumnValue(actor: PublicActor, col: PublicColumn): string {
  switch (col) {
    case 'traderName':
      return actor.traderName;
    case 'region':
      return actor.region;
    case 'district':
      return actor.district ?? '';
    case 'traderType':
      return actor.traderType;
    case 'capacityTons':
      return actor.capacityTons != null ? String(actor.capacityTons) : '';
    case 'crops':
      return actor.crops.join(';');
  }
}

// ── Summary header builder ────────────────────────────────────────────────────

/**
 * Build a small labelled summary section from the KPI aggregate.
 * Each row is a two-field "Label,Value" CSV row prefixed with "#" to distinguish
 * it visually from the data table.  Tools that import CSV will treat these as
 * ordinary rows, but the "#" prefix signals meta-content to human readers.
 */
function buildSummaryRows(kpis: DashboardKpis): string {
  const rows: [string, string][] = [
    ['# ACCELERATE Tanzania — Dashboard Export', ''],
    ['# Matching actors', String(kpis.matchingCount)],
    ['# Total capacity (t)', String(kpis.totalCapacityTons)],
    ['# Median capacity (t)', String(kpis.medianCapacityTons)],
    ['# Capacity reporting count', String(kpis.capacityReportingCount)],
    ['# Regions covered', String(kpis.regionsCovered)],
    ['# Actor types', String(kpis.actorTypes)],
  ];

  return rows.map(([label, value]) => toCsvRow([label, value])).join('\n');
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build a complete, PII-free CSV string from a filtered actor list and KPI summary.
 *
 * Structure:
 *   1. Summary block (KPI labelled rows).
 *   2. Blank separator line.
 *   3. Column header row (allowlist columns only).
 *   4. One data row per actor (allowlist columns only — no phone, no email).
 *
 * CSV is UTF-8; callers must set the Blob type to 'text/csv;charset=utf-8'.
 */
export function buildDashboardCsv(args: {
  actors: PublicActor[];
  kpis: DashboardKpis;
}): string {
  const { actors, kpis } = args;

  // 1. Summary section
  const summary = buildSummaryRows(kpis);

  // 2. Column header row
  const headerRow = toCsvRow([...PUBLIC_COLUMNS]);

  // 3. Data rows — explicit column extraction, NEVER spread actor
  const dataRows = actors
    .map((actor) => toCsvRow(PUBLIC_COLUMNS.map((col) => actorColumnValue(actor, col))))
    .join('\n');

  // Assemble: summary + blank line + header + data rows
  const parts = [summary, '', headerRow];
  if (dataRows) {
    parts.push(dataRows);
  }

  return parts.join('\n');
}
