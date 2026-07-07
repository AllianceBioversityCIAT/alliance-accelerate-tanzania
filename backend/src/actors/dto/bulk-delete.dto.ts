import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsString,
} from 'class-validator';

/**
 * T-1 — Bulk permanent-delete request body.
 *
 * Same bounded, non-empty, unique id constraints as `BulkConsentDto`. Deletion
 * cascades through the existing `CropsOnActors` relation and is irreversible,
 * so the UI layer demands a typed confirmation before calling the endpoint.
 *
 * Design refs: `docs/specs/admin/bulk-actor-operations/design.md` §3.
 * Requirements: FR-5, FR-8, NFR-1, NFR-4.
 */

const MAX_BATCH_SIZE = 500;

export class BulkDeleteDto {
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(MAX_BATCH_SIZE)
  @IsString({ each: true })
  ids!: string[];
}
