import { Injectable } from '@nestjs/common';
import { ConsentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListQueryDto } from './dto/list-query.dto';
import {
  PublicActorDetail,
  PublicActorListItem,
  toPublicDetail,
  toPublicListItem,
} from '../common/role-aware.serializer';
import { isPublic } from '../common/pii-consent.policy';

/**
 * T-5/T-8 — Public Actors read service (FR-1, FR-9, NFR-1, NFR-6).
 *
 * The two public read paths for the directory/map/profile. Both enforce consent
 * at the QUERY (a `consentStatus = GRANTED` WHERE / guard) — never relying on
 * the serializer alone. `findPublic` maps every row through
 * {@link toPublicListItem} (the LIST set, FR-9 — never the contact block);
 * `findOnePublic` maps through {@link toPublicDetail} (the PUBLISHED set,
 * FR-1 — the list set plus the contact block) so no raw Prisma entity (and
 * thus no PII) can reach a controller (DD-1/DD-2, NFR-1, defense in depth).
 * The `crops.crop` relation is always included so the serializer can project
 * crop names. No Prisma `select` is introduced (DD-9) — both reads fetch
 * whole rows via `include` and the serializer is the sole projection gate.
 *
 * Design refs: spec design.md §4, §6, §7; detailed-design §4 (envelope
 * `{ data, page, pageSize, total }`). Requirements: FR-1, FR-9, NFR-1, NFR-6.
 */

/** Public paginated list envelope (detailed-design §4) — shared response shape. */
export interface PublicActorList {
  data: PublicActorListItem[];
  page: number;
  pageSize: number;
  total: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** The `crops.crop` include reused by both reads so names resolve in the serializer. */
const CROPS_INCLUDE = {
  crops: { include: { crop: true } },
} satisfies Prisma.ActorInclude;

@Injectable()
export class ActorsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated, filtered public directory list (FR-6).
   *
   * The WHERE always pins `consentStatus = GRANTED` (consent enforced at the
   * query, not just the serializer); optional `region`, `role` (→ `traderType`)
   * and `crop` (→ CropsOnActors relation by crop name) narrow it. Pagination is
   * clamped to sane defaults and a capped page size. Every row is projected
   * through {@link toPublicListItem}; `total` counts the same filtered
   * GRANTED set.
   */
  async findPublic(query: ListQueryDto): Promise<PublicActorList> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    // FR-4 — free-text search: a non-empty trimmed term partial-matches
    // non-PII columns. MySQL's default `_ci` collation makes `contains`
    // case-insensitive (no `mode: 'insensitive'` — unsupported on MySQL).
    const term = query.search?.trim();

    const where: Prisma.ActorWhereInput = {
      // Consent enforced at the QUERY — never serializer-only (NFR-1, DD-3).
      consentStatus: ConsentStatus.GRANTED,
      ...(query.region ? { region: query.region } : {}),
      ...(query.district ? { district: { contains: query.district } } : {}),
      ...(query.role ? { traderType: query.role } : {}),
      ...(query.crop
        ? { crops: { some: { crop: { name: query.crop } } } }
        : {}),
      // OR is a sibling key so Prisma ANDs it with consent + the filters above.
      ...(term
        ? {
            OR: [
              { traderName: { contains: term } },
              { region: { contains: term } },
              { district: { contains: term } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.actor.findMany({
        where,
        include: CROPS_INCLUDE,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { traderName: 'asc' },
      }),
      this.prisma.actor.count({ where }),
    ]);

    return {
      data: rows.map((row) => toPublicListItem(row)),
      page,
      pageSize,
      total,
    };
  }

  /**
   * Single public actor by id (FR-1, FR-6). Returns `null` when the id is
   * absent OR the actor is not public (consent ≠ GRANTED) — the controller
   * maps `null` to a 404 so a non-consented actor is indistinguishable from a
   * missing one. Consent is re-checked here via {@link isPublic} (defense in
   * depth) before the row is ever projected. Maps through
   * {@link toPublicDetail} — the published set, contact block included
   * (FR-1) — never the list projection.
   */
  async findOnePublic(id: string): Promise<PublicActorDetail | null> {
    const actor = await this.prisma.actor.findUnique({
      where: { id },
      include: CROPS_INCLUDE,
    });

    if (!actor || !isPublic(actor)) return null;

    return toPublicDetail(actor);
  }
}
