// @sdd-spec admin/user-management (T-2)
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * T-2 — Validated query DTO for `GET /api/v1/users` (design §3, FR-1).
 *
 * Cognito `ListUsers` paginates by an opaque `PaginationToken` and caps each
 * call at 60 results, so `limit` is range-checked to `[1, 60]` and coerced from
 * the query string via `@Type`. `paginationToken` is an opaque passthrough.
 *
 * Scope note: authored in isolation (T-2). Controller/service wiring is T-3/T-4.
 */

const MIN_LIMIT = 1;
const MAX_LIMIT = 60;

export class ListUsersQueryDto {
  /** Page size, 1..60 (Cognito per-call cap). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_LIMIT)
  @Max(MAX_LIMIT)
  limit?: number;

  /** Opaque Cognito pagination token for the next page. */
  @IsOptional()
  @IsString()
  paginationToken?: string;
}
