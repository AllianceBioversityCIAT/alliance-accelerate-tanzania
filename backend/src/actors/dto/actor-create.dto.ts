import {
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ConsentStatus } from '@prisma/client';
import { CANONICAL_REGIONS, TRADER_TYPES } from '../../common/normalize';

/**
 * T-3 — Validated write DTO for creating an Actor (NFR-4).
 *
 * Per the project rule, every write goes through a `class-validator` DTO so
 * malformed input is rejected (→ 400 once wired to a controller in T-5), never
 * silently coerced. Enum membership is enforced against the SAME canonical
 * constants the normalizer uses (`CANONICAL_REGIONS`, `TRADER_TYPES`) so the
 * write contract and the cleaner can never drift (DD-5).
 *
 * Scope note: this DTO is authored and unit-tested in isolation (T-3). It is NOT
 * wired into any controller here — that is T-5. PII gating is T-4.
 *
 * Design refs: design.md §6 (`actor-create.dto.ts` under `actors/dto`), §7,
 * §10 DD-5. Requirement: requirements.md FR-3 / NFR-4.
 */

const SEX_VALUES = ['M', 'F', 'Other'] as const;
const CONSENT_VALUES = Object.values(ConsentStatus);

export class ActorCreateDto {
  /** Source business key — required, deduped on import (FR-2). */
  @IsString()
  @MinLength(1)
  traderId!: string;

  @IsString()
  @MinLength(1)
  traderName!: string;

  /** Must be a canonical Tanzania region (FR-3). */
  @IsString()
  @IsIn(CANONICAL_REGIONS as readonly string[])
  region!: string;

  @IsOptional()
  @IsString()
  district?: string;

  /** Must be in the OQ-2 taxonomy (FR-3). */
  @IsString()
  @IsIn(TRADER_TYPES as readonly string[])
  traderType!: string;

  /** PII — gating happens later (T-4); shape is validated here. */
  @IsOptional()
  @IsIn(SEX_VALUES as readonly string[])
  sex?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  marketLocation?: string;

  /** Capacity in tonnes — numeric, non-negative (FR-3). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  capacityTons?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  technicalSupport?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** Validated email format when present (FR-3). */
  @IsOptional()
  @IsEmail()
  email?: string;

  /** GPS latitude ∈ [−90, 90] (FR-3). */
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  gpsLatitude?: number;

  /** GPS longitude ∈ [−180, 180] (FR-3). */
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  gpsLongitude?: number;

  @IsOptional()
  @IsNumber()
  gpsAltitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  gpsAccuracy?: number;

  /** Consent state (FR-4) — enum membership enforced. */
  @IsOptional()
  @IsIn(CONSENT_VALUES)
  consentStatus?: ConsentStatus;
}
