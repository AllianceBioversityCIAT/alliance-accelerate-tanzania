import { ArrayUnique, IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ActorCreateDto } from './actor-create.dto';

/**
 * T-2 — Admin-only validated write DTO for creating an Actor (FR-1, NFR-1).
 *
 * Extends the base `ActorCreateDto` so all required-field, canonical-region,
 * taxonomy, GPS-bounds, and email-format validation is preserved unchanged.
 * Adds admin-specific fields: crop assignment against the fixed 3-crop catalog
 * and the explicit consent acknowledgement required when setting
 * `consentStatus` to `GRANTED`.
 *
 * Design refs: `docs/specs/admin/actor-crud-audit/design.md` §3.
 */

export const CROP_NAMES = ['sorghum', 'common_bean', 'groundnut'] as const;

export class AdminActorCreateDto extends ActorCreateDto {
  /** Crop slugs for this actor — fixed 3-crop catalog, no duplicates (FR-1). */
  @IsOptional()
  @IsIn(CROP_NAMES as readonly string[], { each: true })
  @ArrayUnique()
  crops?: string[];

  /**
   * Explicit acknowledgement flag required by the service when the payload
   * sets `consentStatus` to `GRANTED` (FR-1, FR-3). Optional on the DTO so
   * the service can reject the specific GRANTED-without-ack transition.
   */
  @IsOptional()
  @IsBoolean()
  acknowledged?: boolean;
}
