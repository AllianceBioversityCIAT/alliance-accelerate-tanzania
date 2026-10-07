import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBase64,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * T-4 — Admin-only validated request body for the actor bulk-import route
 * `POST /api/v1/admin/actors/import` (FR-2, FR-3, FR-6, NFR-1).
 *
 * The workbook travels as a base64 JSON body rather than multipart (DR-1), so a
 * single DTO validates the entire upload: the filename must be `.xlsx`, the
 * payload must be valid base64 (decoded-size and row-cap guards live in the
 * service), and `mode` selects the validate-first preview (dry run) or the
 * committing run. `acknowledged` carries the file-level consent gate the service
 * requires when any row publishes an actor as `GRANTED` on commit (FR-6).
 *
 * @sdd-spec admin/actor-import
 * Design refs: `docs/specs/admin/actor-import/design.md` §3.
 */

/**
 * T-5 (actors/consent-intake/intake-required-fields) — one row's confirmed
 * duplicate candidates (design.md §3). `candidates` entries are the exact
 * keys the row's `duplicateCandidates` carried in a prior preview:
 * `actor:<id>` for an existing-actor match, `row:<n>` for an earlier row of
 * the same workbook.
 */
export class DuplicateConfirmationEntryDto {
  /** Excel data-row number this confirmation applies to. */
  @IsInt()
  @Min(2)
  row!: number;

  /** Candidate keys the admin confirmed are NOT duplicates of this row. */
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  candidates!: string[];
}

export class ActorImportRequestDto {
  /** Uploaded workbook filename — `.xlsx` only; `.csv`/`.xls` are out of scope (FR-2). */
  @IsString()
  @Matches(/\.xlsx$/i, { message: 'fileName must end in .xlsx' })
  fileName!: string;

  /** Base64-encoded workbook bytes; decoded-size cap enforced server-side (DR-1). */
  @IsString()
  @IsBase64()
  fileBase64!: string;

  /** `preview` validates without writing (FR-3); `commit` re-validates and applies. */
  @IsIn(['preview', 'commit'])
  mode!: 'preview' | 'commit';

  /**
   * File-level consent acknowledgement (FR-6). Optional on the DTO so the
   * service can reject the specific case of a commit carrying `GRANTED` rows
   * without acknowledgement; empty consent columns default to `UNKNOWN`.
   */
  @IsOptional()
  @IsBoolean()
  acknowledged?: boolean;

  /**
   * T-5 — per-row duplicate confirmations (design.md §3, DD-4). Ignored in
   * `preview` mode; the server recomputes every row's matches at commit and
   * only creates a `possible-duplicate` row whose strong candidates are ALL
   * named here for its own `row` number — a stale or partial confirmation
   * never passes (FR-4's "premise changed" scenario).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => DuplicateConfirmationEntryDto)
  duplicateConfirmations?: DuplicateConfirmationEntryDto[];
}
