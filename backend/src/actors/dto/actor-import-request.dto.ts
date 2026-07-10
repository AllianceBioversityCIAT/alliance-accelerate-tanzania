import { IsBase64, IsBoolean, IsIn, IsOptional, IsString, Matches } from 'class-validator';

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
}
