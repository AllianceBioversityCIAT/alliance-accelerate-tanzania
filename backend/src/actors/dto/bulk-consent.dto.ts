import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ConsentMethod } from '@prisma/client';
import { IsFullInstant, IsNotFutureDate } from '../../common/consent-date-validators';

/**
 * T-1 — Bulk set-consent (lock/unlock) request body.
 *
 * The `ids` array is validated as non-empty, unique, bounded, and composed of
 * strings to protect the Lambda invocation and produce clean per-id results.
 * `acknowledged` is required server-side when unlocking (`GRANTED`) because
 * publishing PII + GPS demands an explicit consent confirmation (FR-4).
 *
 * T-4 — `consentMethod` + `consentObtainedAt` carry the BATCH-level provenance
 * applied to actors in the selection whose own `consentMethod` is
 * `NOT_RECORDED` (DD-4 option d) — actors that already carry their own
 * evidence keep it untouched. These fields are only SHAPE-validated here
 * (enum membership, date format, not-in-the-future); whether they are
 * *required* for a given write is decided by `isConsentProvenanceSatisfied`
 * in `ActorsAdminService.bulkSetConsent` (FR-3, NFR-7), mirroring
 * `ActorCreateDto`'s precedent rather than a DTO-level "required" decorator.
 *
 * Design refs: `docs/specs/admin/bulk-actor-operations/design.md` §3;
 * `docs/specs/actors/registration-source-and-consent/design.md` §4.2, §4.3, DD-4.
 * Requirements: FR-3, FR-4, FR-8, NFR-1, NFR-4, NFR-7.
 */

const CONSENT_STATUSES = ['GRANTED', 'DENIED'] as const;
const MAX_BATCH_SIZE = 500;
const CONSENT_METHOD_VALUES = Object.values(ConsentMethod);

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

  /**
   * T-4 — Batch consent method (FR-2). Required-when-`GRANTED` is enforced
   * service-side, not here (see class doc comment).
   */
  @IsOptional()
  @IsIn(CONSENT_METHOD_VALUES)
  consentMethod?: ConsentMethod;

  /**
   * T-4 — Batch consent date (FR-2); must not be in the future.
   *
   * (delta-round fix, R-2/E-1 symmetry) `bulkSetConsent` has no try/catch at
   * all — unlike the single-actor create/update path, a date-only value here
   * used to reach Prisma untransformed and raise an UNHANDLED 500 (not even
   * remapped to a 409/400 by `mapPrismaError`, since that function is never
   * called on this path). `@IsFullInstant()` — shared with
   * `actor-create.dto.ts` via `common/consent-date-validators.ts` (NFR-7/DD-1)
   * — closes it the same way: reject with a clean field-level 400.
   */
  @IsOptional()
  @IsDateString()
  @IsFullInstant()
  @IsNotFutureDate()
  consentObtainedAt?: string;

  /**
   * T-4 — Batch free-text evidence pointer (FR-2). Applied only to the
   * actors the batch actually fills (DD-4); optional even when granting.
   *
   * (R-2/E-2 carry-forward) A string value is trimmed, and an empty or
   * whitespace-only result normalized to `null`, before validation — same
   * transform as `ActorCreateDto.consentReference`. Without this,
   * `consentReference !== undefined` in `ActorsAdminService.bulkSetConsent`'s
   * fill-patch check would treat a submitted `''`/`'   '` as a real value and
   * write it literally into every row missing a reference, instead of
   * leaving it untouched/null.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsString()
  @MaxLength(255)
  consentReference?: string | null;
}
