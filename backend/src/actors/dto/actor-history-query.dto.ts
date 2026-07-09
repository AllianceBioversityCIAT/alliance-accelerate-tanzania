import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * T-2 — Paginated query DTO for `GET /api/v1/admin/actors/:id/history` (FR-7, NFR-6).
 *
 * Mirrors the pagination contract used by `AdminActorListQueryDto` and the
 * public `ListQueryDto`: query-string numbers are coerced via `class-transformer`,
 * bounded, and default to page 1 / pageSize 20.
 *
 * Design refs: `docs/specs/admin/actor-crud-audit/design.md` §3.
 */

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class ActorHistoryQueryDto {
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
