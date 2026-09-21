import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
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
/**
 * Raised 100 → 500 on 2026-09-21 (ATP-68). The map is the binding consumer:
 * it plots every matching actor, so it pays one round trip per page, in
 * SEQUENCE. Measured at 5 000 actors with 150 ms of added latency, 100/page
 * meant 50 requests and a 15.1 s map; 500/page means 10 requests and 5.2 s.
 * The cost is bounded — a 500-row page measured 140 KB uncompressed and
 * ~19 KB gzipped, well inside API Gateway's 10 MB response limit — and the
 * projection is unchanged, so this widens no PII surface: the list set still
 * never names the contact block, at any page size (CLAUDE.md, Hard constraints).
 * Keep this and frontend DASH_PAGE_SIZE in step; the frontend's own comment
 * says it must not exceed this value.
 */
const MAX_PAGE_SIZE = 500;

export class ListQueryDto {
  /** Crop slug filter (sorghum | common_bean | groundnut). */
  @IsOptional()
  @IsString()
  crop?: string;

  /** Free-text search over traderName/region/district (FR-4); bounded length. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Public name for `traderType` — must be in the OQ-2 taxonomy. */
  @IsOptional()
  @IsIn(TRADER_TYPES as readonly string[])
  role?: string;

  @IsOptional()
  @IsIn(CANONICAL_REGIONS as readonly string[])
  region?: string;

  /**
   * District filter — free text, matched with `contains` rather than equality,
   * so "Moshi" finds "Moshi Urban". Unlike `region` there is no canonical
   * district list to validate against, so this is a bounded string.
   *
   * Declared here deliberately: the dashboard shipped a District input for
   * months while this field was absent from the DTO, so the global pipe's
   * `whitelist: true` stripped `?district=` in silence and the control did
   * nothing. An undeclared query param is not a no-op, it is an invisible one.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

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
