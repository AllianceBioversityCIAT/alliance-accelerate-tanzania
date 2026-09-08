/**
 * CSV serializer for the Discovery Dashboard (T-12; extended by T-16).
 *
 * Traces: FR-7, FR-9, NFR-1, NFR-2, NFR-6, design.md §9, DD-3,
 * spec: actors/public-profile-disclosure (D-1b, D-15).
 *
 * NOT THE BULK BOUNDARY — that is FR-9's list projection (DD-3): this module
 * operates on an EXPLICIT allowlist of public columns, built from
 * `PublicActor` (== `PublicActorListItem`, DD-6).
 * That type has no contact fields at all — `phone`/`email`/`contactPerson`/
 * `position`/`marketLocation` are not just excluded from the allowlist below,
 * they are not nameable on the input type, so this is structural, not just
 * disciplinary (design.md DD-3 / RV-4). This module has no bulk bound of
 * its own to keep — that bound belongs entirely to FR-9's list projection
 * (`GET /api/v1/actors`), which is where the contact block was withdrawn;
 * this file's input type simply has no contact fields left to carry. The
 * allowlist below stays explicit anyway as a second, structural guard
 * sitting behind that type: it keeps this module from re-widening on its
 * own if `PublicActorListItem` (DD-6) ever grows a contact field —
 * redundancy behind the control (FR-9's list projection), not the control
 * itself.
 * Do NOT add spread operators over actor objects — always use the named
 * allowlist. A spread would silently readmit every field the moment
 * `PublicActor` widens (e.g. FR-1's contact block landing on the detail
 * type), which is exactly the leak this construction prevents.
 *
 * Output shape:
 *   [summary block — labelled rows from kpis]
 *   [blank line]
 *   [CSV header]
 *   [CSV rows — one per actor, allowlisted columns only]
 */

import type { PublicActor } from '@/lib/api/actors';
import type { DashboardKpis } from '@/lib/dashboard/aggregate';

// ── Allowed public columns (explicit allowlist — the list set, FR-7) ───────────

/**
 * The ordered set of public columns exported to CSV — the LIST set (FR-7):
 * every field `GET /api/v1/actors` returns that is useful for bulk analysis
 * (see the gps/id exclusion note below), and nothing more.
 * Crops are serialised as a semicolon-joined list within a single field.
 * gps and id are intentionally excluded (not useful for bulk analysis).
 * district, sex, and otherCrops may be null and are rendered as empty
 * string in that case.
 */
const PUBLIC_COLUMNS = [
  'traderName',
  'region',
  'district',
  'traderType',
  'capacityTons',
  'crops',
  'sex',
  'otherCrops',
] as const;

type PublicColumn = (typeof PUBLIC_COLUMNS)[number];

// ── Residual risk notes for this array's order (csv.test.ts anchoring) ────────
//
// The null-district/null-capacityTons tests anchor on `fields[2]`/`fields[4]`
// (this array's positions for `district`/`capacityTons`) rather than a
// comma-count regex — robust against appends, and fails loudly on most
// insertions. It is silently vacuous only on a nullable insertion ahead of
// the index: a new null-by-default column added at or before index 2 shifts
// the target and leaves `fields[2]` reading the new empty column — green,
// asserting nothing about `district`.
//
// The null-sex/null-otherCrops test instead checks the row ends `/,,$/`,
// relying on `sex`/`otherCrops` being the last two, both-nullable columns.
// Safe today, but one nullable append from re-vacuizing: add a ninth
// nullable column and the row ends `,female,,`, which matches `/,,$/` even
// though `sex` itself is non-empty — same mechanism, opposite end of the row.
//
// Either risk is closed by appending new nullable columns after `otherCrops`
// and updating the fixed test indices in lockstep, not by widening the regex.

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
 * district, sex, and otherCrops are serialised as an empty string when null.
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
    case 'sex':
      return actor.sex ?? '';
    case 'otherCrops':
      return actor.otherCrops ?? '';
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
 * Build a complete CSV string — the list set only — from a filtered actor
 * list and KPI summary. `actors` is expected to already be the caller's
 * filtered `GRANTED` set; this function serialises exactly what it is given
 * and introduces no actor of its own (FR-7's filtered-set fidelity clause).
 *
 * Structure:
 *   1. Summary block (KPI labelled rows).
 *   2. Blank separator line.
 *   3. Column header row (allowlist columns only).
 *   4. One data row per actor (allowlist columns only — the contact block
 *      is not on the input type, so it cannot appear here; see the module
 *      header comment).
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
