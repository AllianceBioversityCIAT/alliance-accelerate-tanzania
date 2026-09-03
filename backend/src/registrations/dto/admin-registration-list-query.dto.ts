import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { RegistrationStatus } from '@prisma/client';
import { CANONICAL_REGIONS, TRADER_TYPES } from '../../common/normalize';

/**
 * T-4 — Admin registrations list query DTO (`GET /admin/registrations`).
 *
 * Mirrors `AdminActorListQueryDto`'s pagination/filter shape (`../../actors/
 * dto/admin-actor-list-query.dto.ts`) rather than re-deriving it. `status`,
 * `region` and `traderType` are validated against the same enums/canonical
 * constants the write paths already use (`RegistrationStatus` from the
 * Prisma-generated client; `CANONICAL_REGIONS`/`TRADER_TYPES` from
 * `common/normalize.ts`) so a filter value can never diverge from what the
 * column/payload actually stores.
 *
 * `status` deliberately accepts EVERY `RegistrationStatus` member, not only
 * the three this chunk's queue segments render (`PENDING_REVIEW`, `APPROVED`,
 * `REJECTED`). `design.md` §7.2 restricts `AWAITING_APPLICANT`/`WITHDRAWN` to
 * "no segment or control" on the frontend queue UI (FR-9 scenario 1) — that
 * is a UI-presence constraint (T-12's), not an API contract narrowing; no
 * row can carry either status until chunk 4 ships, so this validator simply
 * never rejects a value the data cannot yet produce.
 *
 * `region`/`traderType` filter against `Registration.payload`'s JSON fields
 * (no dedicated columns — 3a never promoted them out of the JSON blob), so
 * the service composes them as `payload` path filters, never top-level
 * `where` keys (see `admin-registrations.service.ts`).
 *
 * Design refs: `design.md` §5 (route contract table), §6.1. Requirements:
 * FR-9 scenarios 1, 2; NFR-9.
 */

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Sort direction over `createdAt`. `'oldest'` is the default (FR-9 "Sorted
 * oldest-first by default" scenario) — the longest-waiting applicant is
 * reviewed first.
 */
const SORT_VALUES = ['oldest', 'newest'] as const;
export type AdminRegistrationListSort = (typeof SORT_VALUES)[number];

export class AdminRegistrationListQueryDto {
  @IsOptional()
  @IsIn(Object.values(RegistrationStatus))
  status?: RegistrationStatus;

  /**
   * Free-text match against the applicant's organisation name
   * (payload.traderName). `@MaxLength(200)` mirrors `note`'s discipline on
   * `RegistrationRejectDto`/`ActorCreateDto` (`@MaxLength(2000)`) — a
   * sensible upper bound for a name-search box, tighter here because `q` is
   * a single search term, not free-form prose (A-28 half 2). The `%`/`_`
   * LIKE-metacharacter escape happens at the Prisma boundary in
   * `admin-registrations.service.ts`'s `list()`, not here — this decorator
   * only bounds length; it does not transform the value.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsIn(CANONICAL_REGIONS)
  region?: string;

  @IsOptional()
  @IsIn(TRADER_TYPES)
  traderType?: string;

  @IsOptional()
  @IsIn(SORT_VALUES)
  sort?: AdminRegistrationListSort;

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
