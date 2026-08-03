import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ConsentMethod, RegistrationSource } from '@prisma/client';

/**
 * T-1 — Admin actor list query DTO (`GET /api/v1/admin/actors`).
 *
 * Mirrors the public `ListQueryDto` pagination contract but allows filtering
 * across ALL consent statuses (no GRANTED pin) and exposes no search/crop
 * filters in this iteration. `class-transformer` coerces query-string numbers.
 *
 * T-8 — `registrationSource` and `consentMethod` filters (FR-9's enumeration
 * mechanism: `consentStatus=GRANTED&consentMethod=NOT_RECORDED` finds the
 * legacy unevidenced set). They compose as AND with the existing filters, the
 * same as `consentStatus` does. Enum values come from the Prisma-generated
 * types, never re-typed as string literals (NFR-3).
 *
 * Design refs: `docs/specs/admin/bulk-actor-operations/design.md` §3;
 * `docs/specs/actors/registration-source-and-consent/design.md` §3.
 * Requirements: FR-1, FR-9, NFR-1, NFR-3, NFR-6.
 */

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const CONSENT_STATUSES = ['GRANTED', 'DENIED', 'UNKNOWN'] as const;

export class AdminActorListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number = DEFAULT_PAGE_SIZE;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  traderType?: string;

  @IsOptional()
  @IsIn(CONSENT_STATUSES as readonly string[])
  consentStatus?: string;

  @IsOptional()
  @IsIn(Object.values(RegistrationSource))
  registrationSource?: RegistrationSource;

  @IsOptional()
  @IsIn(Object.values(ConsentMethod))
  consentMethod?: ConsentMethod;
}
