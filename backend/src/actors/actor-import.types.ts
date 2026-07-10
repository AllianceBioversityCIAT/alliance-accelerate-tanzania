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

/** A single field-level validation error for a failed row (no PII values, FR-11). */
export interface ImportRowError {
  field: string;
  message: string;
}

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
   * `skipped-exists` — `traderId` already in the registry (FR-4).
   * `skipped-duplicate-in-file` — `traderId` repeated later in the same file (FR-4).
   * `failed` — validation failed (carries `errors`).
   */
  outcome:
    | 'create'
    | 'created'
    | 'skipped-exists'
    | 'skipped-duplicate-in-file'
    | 'failed';
  /** New actor id — commit + `created` only. */
  actorId?: string;
  /** Field-level errors — `failed` only; field names + messages, never PII values (FR-11). */
  errors?: ImportRowError[];
  /** Non-fatal notes, e.g. 'GPS out of range — imported with GPS cleared' (DR-5). */
  warnings?: string[];
}

/** Aggregate counts across all data rows (FR-7). */
export interface ImportReportTotals {
  rows: number;
  toCreate: number;
  created: number;
  skipped: number;
  failed: number;
  warnings: number;
}

/** Full import report for a preview or commit run (FR-3, FR-7). */
export interface ImportReport {
  mode: 'preview' | 'commit';
  /** Template version read from the Instructions sheet, if present (best effort, NFR-8). */
  templateVersionDetected?: string;
  totals: ImportReportTotals;
  rows: ImportRowResult[];
}
