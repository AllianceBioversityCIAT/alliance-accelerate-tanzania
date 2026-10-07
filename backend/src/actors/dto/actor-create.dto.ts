import {
  IsDateString,
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
import { Transform } from 'class-transformer';
import { ConsentMethod, ConsentStatus, RegistrationSource } from '@prisma/client';
import { CANONICAL_REGIONS, TRADER_TYPES } from '../../common/normalize';
import { IsFullInstant, IsNotFutureDate } from '../../common/consent-date-validators';
import { IsAdditionalTraderTypes } from '../../common/additional-types.validator';
import { ADMIN_ASSERTABLE_CONSENT_METHODS } from '../../common/consent-methods';

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
/** T-3 — enum membership derived from the Prisma-generated types (NFR-3, design.md §4.3). */
const REGISTRATION_SOURCE_VALUES = Object.values(RegistrationSource);
/**
 * T-1 (consent-request-email, DD-9) — create validates against the
 * admin-assertable subset, not the full enum: `EMAIL_LINK` can only be
 * written by the actor's own response to a consent-request link, never
 * asserted on create. See `common/consent-methods.ts`.
 */
const CONSENT_METHOD_VALUES = ADMIN_ASSERTABLE_CONSENT_METHODS;

export class ActorCreateDto {
  // `traderId` is system-assigned (`trader-id.util.ts`, FR-2); a client-sent value is stripped by the global pipe's `whitelist`, not declared here.

  /** Bound matches self-registration's `RegistrationPayloadDto.traderName` (intake-contract.ts, FR-1). */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
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

  /** Optional extra actor types from the same taxonomy; never the main type. */
  @IsAdditionalTraderTypes()
  additionalTraderTypes?: string[];

  /**
   * Named natural person, published deliberately once consent is `GRANTED`
   * (`actors/public-profile-disclosure` FR-4). Bound to match
   * `RegistrationPayloadDto.contactPerson` — the column is `VARCHAR(191)`, so
   * 120 leaves headroom and keeps both intake paths identical.
   *
   * Required (FR-1, intake-contract.ts): the required set every intake path
   * now shares, taking self-registration's rule as the reference.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  contactPerson!: string;

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

  /** Capacity in tonnes — numeric, non-negative; `0` is valid. Required (FR-1, intake-contract.ts). */
  @IsNumber()
  @Min(0)
  capacityTons!: number;

  /** Actor-declared free text, published (FR-4). Matches the `VARCHAR(300)` column. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  otherCrops?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  technicalSupport?: string;

  /** Required (FR-1, intake-contract.ts); bound matches self-registration's `phone`. */
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  phone!: string;

  /**
   * Validated email format; required (FR-1, intake-contract.ts). `@MaxLength(191)`
   * matches the `VARCHAR(191)` column — `@IsEmail()` alone admits up to 254
   * characters (RFC 5321), which would otherwise reach the database and fail
   * as a 500 (requirements.md FR-1's "same bounds" scenario).
   */
  @IsEmail()
  @MaxLength(191)
  email!: string;

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

  /**
   * T-3 — Which track produced this record (FR-1). Enum membership enforced
   * against the Prisma-generated `RegistrationSource`.
   */
  @IsOptional()
  @IsIn(REGISTRATION_SOURCE_VALUES)
  registrationSource?: RegistrationSource;

  /**
   * T-3 — How consent was obtained (FR-2). Enum membership enforced against
   * the Prisma-generated `ConsentMethod`. Whether this satisfies the FR-3
   * provenance invariant for a `GRANTED` write is decided by
   * `isConsentProvenanceSatisfied` in the service, not here.
   */
  @IsOptional()
  @IsIn(CONSENT_METHOD_VALUES)
  consentMethod?: ConsentMethod;

  /**
   * T-3 — Date consent was obtained (FR-2); must not be in the future, and
   * (R-2/E-1 fix) must be a full RFC-3339 instant, not a date-only string.
   * Both validators are shared with `bulk-consent.dto.ts` via
   * `common/consent-date-validators.ts` (NFR-7/DD-1 — one implementation).
   */
  @IsOptional()
  @IsDateString()
  @IsFullInstant()
  @IsNotFutureDate()
  consentObtainedAt?: string;

  /**
   * T-3 — Free-text pointer to where the consent evidence lives (FR-2). Not
   * required.
   *
   * (R-2/E-2 fix) A string value is trimmed, and an empty/whitespace-only
   * result is normalized to `null`, before validation. Without this, an
   * explicit `''` (or `'   '`) reads as a *changed* value against a stored
   * `null` in `isConsentProvenanceSatisfied`'s comparison
   * (`consent-provenance.policy.ts`), which wrongly fires the FR-3 guard on
   * an edit that changed nothing relevant — rejecting a legacy `GRANTED` +
   * `NOT_RECORDED` actor's unrelated edit with a 400. This mirrors the
   * frontend's own `values.consentReference.trim() || null` convention
   * (`ActorForm.tsx buildDto`) exactly — trim first, then treat emptiness as
   * absent — so both clients and this DTO agree that an empty or
   * whitespace-only reference means "absent", never a distinct value from
   * `null`. Same transform on `bulk-consent.dto.ts`'s `consentReference`.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsString()
  @MaxLength(255)
  consentReference?: string | null;
}
