import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CANONICAL_REGIONS, TRADER_TYPES } from '../../common/normalize';

/**
 * T-3 — Validated query DTO for `GET /api/v1/actors` (NFR-4, FR-6).
 *
 * Filters and pagination are coerced from query strings via `@Type` and
 * range-checked so a malformed query is rejected (→ 400 in T-5), not silently
 * accepted. `role` is the public name for `traderType` (design.md §6 query
 * `?role=`); both `role` and `region` are validated against the same canonical
 * constants used elsewhere (DD-5).
 *
 * Scope note: authored + unit-tested in isolation (T-3); controller wiring is
 * T-5. Design refs: design.md §6 (`list-query.dto.ts`), §7. Requirement: FR-6.
 */

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class ListQueryDto {
  /** Crop slug filter (sorghum | common_bean | groundnut). */
  @IsOptional()
  @IsString()
  crop?: string;

  /** Public name for `traderType` — must be in the OQ-2 taxonomy. */
  @IsOptional()
  @IsIn(TRADER_TYPES as readonly string[])
  role?: string;

  @IsOptional()
  @IsIn(CANONICAL_REGIONS as readonly string[])
  region?: string;

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
}
