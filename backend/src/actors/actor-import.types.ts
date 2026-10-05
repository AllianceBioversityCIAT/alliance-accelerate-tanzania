/**
 * T-4 — Report contract returned by the actor bulk-import route for both the
 * preview (dry run) and commit modes (FR-3, FR-7).
 *
 * The same shape serves both modes so the client can render "preview" vs
 * "result" from the echoed `mode`: in preview `toCreate` counts prospective
 * creates and `created` is 0; on commit `created` reflects reality. Row errors
 * carry field NAMES and messages only — never phone/email values (FR-11).
 *
 * @sdd-spec admin/actor-import
 * Design refs: `docs/specs/admin/actor-import/design.md` §3.
 */

import { DuplicateMatchAttribute } from '../registrations/duplicate-detection.service';

/** A single field-level validation error for a failed row (no PII values, FR-11). */
export interface ImportRowError {
  field: string;
  message: string;
}

/**
 * T-5 (actors/consent-intake/intake-required-fields) — one duplicate
 * candidate surfaced on an import row (design.md §3). Discriminated by
 * `kind` because a row's candidates can mix a match against an EXISTING
 * actor (`'actor'`) and a match against an EARLIER row of the same workbook
 * (`'row'`) in one array. Carries no `phone`/`email` value, only the
 * matched-attribute NAMES (NFR-3) — the same projection `DuplicateCandidate`
 * already holds for the admin-create surface.
 */
export type ImportDuplicateCandidate =
  | {
      kind: 'actor';
      actorId: string;
      traderId: string;
      traderName: string;
      matchedOn: DuplicateMatchAttribute[];
    }
  | {
      kind: 'row';
      row: number;
      traderName: string;
      matchedOn: DuplicateMatchAttribute[];
    };

/** Per-row outcome, tied to the Excel data-row number (header = row 1). */
export interface ImportRowResult {
  /** Excel data-row number the outcome refers to. */
  rowNumber: number;
  /** Row identity echoed for the report — non-PII (FR-7). */
  traderId: string | null;
  traderName: string | null;
  /**
   * `create` — prospective create in preview mode.
   * `created` — actor created (commit mode only; carries `actorId`).
   * `possible-duplicate` — a strong match (DB or in-file) was not confirmed;
   * never created (T-5, design.md §3/§4.5 — replaces `skipped-exists` /
   * `skipped-duplicate-in-file`).
   * `failed` — validation failed (carries `errors`).
   */
  outcome: 'create' | 'created' | 'possible-duplicate' | 'failed';
  /** New actor id — commit + `created` only. */
  actorId?: string;
  /** Field-level errors — `failed` only; field names + messages, never PII values (FR-11). */
  errors?: ImportRowError[];
  /** Non-fatal notes, e.g. 'GPS out of range — imported with GPS cleared' (DR-5). */
  warnings?: string[];
  /**
   * T-5 — strong matches (phone/email) this row was classified against.
   * Present whenever at least one strong match exists, whatever the row's
   * outcome. Never empty when present. **Capped at 50 on the wire**
   * (attempt-2 rework, design.md §3/§9): gating (whether the row becomes
   * `possible-duplicate`) always uses the FULL strong-key set, never this
   * truncated list — see `duplicateCandidatesTotal`.
   */
  duplicateCandidates?: ImportDuplicateCandidate[];
  /**
   * T-5 — the full count of strong matches behind `duplicateCandidates`,
   * present whenever that field is. Equal to its length unless truncated by
   * the 50-item wire cap, in which case it is the larger, true count — a row
   * at this count can never be confirmed (`ArrayMaxSize(50)` on the
   * confirmation DTO), so it stays `possible-duplicate` (design.md §9
   * accepted limit).
   */
  duplicateCandidatesTotal?: number;
  /**
   * T-5 — weak matches (name/GPS only) this row was classified against —
   * advisory, never gates creation. Present whenever at least one weak match
   * exists. Never empty when present.
   */
  duplicateWarnings?: ImportDuplicateCandidate[];
}

/** Aggregate counts across all data rows (FR-7). */
export interface ImportReportTotals {
  rows: number;
  toCreate: number;
  created: number;
  /**
   * T-5 — rows held as a `possible-duplicate` outcome (renamed from
   * `skipped`, design.md §3). `toCreate + possibleDuplicate + failed = rows`
   * in preview; `created + possibleDuplicate + failed = rows` on commit.
   */
  possibleDuplicate: number;
  failed: number;
  warnings: number;
}

/**
 * T-4 — one entry of the per-reason breakdown of rows that did not import
 * (FR-7).
 *
 * `reason` is drawn from a **closed vocabulary of three sources**, none of
 * which can carry a value — which is what makes the breakdown structurally
 * incapable of leaking PII (NFR-9, `design.md` §7 PII row):
 *
 * 1. a **column name** — the `field` of the failing template column;
 * 2. the literal **`possible-duplicate`** outcome (T-5; replaces the former
 *    `skipped-*` pair);
 * 3. the literal **`batch-rolled-back`** — how the internal `_row`
 *    pseudo-field surfaces. `_row` itself is never emitted; it is not a
 *    column and would read as one.
 */
export interface ImportFailureReason {
  reason: string;
  count: number;
}

/** Full import report for a preview or commit run (FR-3, FR-7). */
export interface ImportReport {
  mode: 'preview' | 'commit';
  /** Template version read from the Instructions sheet, if present (best effort, NFR-8). */
  templateVersionDetected?: string;
  totals: ImportReportTotals;
  rows: ImportRowResult[];
  /**
   * T-4 (FR-7) — why rows did not import, **one reason per row**, so the
   * counts sum to `totals.failed + totals.possibleDuplicate` exactly.
   * Ordered by count descending, then reason ascending, so two runs over
   * identical input produce byte-identical output (NFR-6).
   *
   * Optional and **omitted entirely when no row failed or was held as a
   * possible duplicate** — a clean import carries no breakdown rather than
   * an empty array.
   */
  failureBreakdown?: ImportFailureReason[];
}
