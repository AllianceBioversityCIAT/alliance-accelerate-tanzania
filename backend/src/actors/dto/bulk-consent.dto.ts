import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * T-1 — Bulk set-consent (lock/unlock) request body.
 *
 * The `ids` array is validated as non-empty, unique, bounded, and composed of
 * strings to protect the Lambda invocation and produce clean per-id results.
 * `acknowledged` is required server-side when unlocking (`GRANTED`) because
 * publishing PII + GPS demands an explicit consent confirmation (FR-4).
 *
 * Design refs: `docs/specs/admin/bulk-actor-operations/design.md` §3.
 * Requirements: FR-3, FR-4, FR-8, NFR-1, NFR-4.
 */

const CONSENT_STATUSES = ['GRANTED', 'DENIED'] as const;
const MAX_BATCH_SIZE = 500;

export class BulkConsentDto {
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(MAX_BATCH_SIZE)
  @IsString({ each: true })
  ids!: string[];

  @IsIn(CONSENT_STATUSES as readonly string[])
  consentStatus!: string;

  @IsOptional()
  @IsBoolean()
  acknowledged?: boolean;
}
