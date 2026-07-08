import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * T-1 — Admin actor list query DTO (`GET /api/v1/admin/actors`).
 *
 * Mirrors the public `ListQueryDto` pagination contract but allows filtering
 * across ALL consent statuses (no GRANTED pin) and exposes no search/crop
 * filters in this iteration. `class-transformer` coerces query-string numbers.
 *
 * Design refs: `docs/specs/admin/bulk-actor-operations/design.md` §3.
 * Requirements: FR-1, NFR-1, NFR-6.
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
}
