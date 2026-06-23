import { Injectable } from '@nestjs/common';
import { ConsentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListQueryDto } from './dto/list-query.dto';
import {
  PublicActor,
  toPublic,
} from '../common/role-aware.serializer';
import { isPublic } from '../common/pii-consent.policy';

/**
 * T-5 — Public Actors read service (FR-6, NFR-1, NFR-6).
 *
 * The two public read paths for the directory/map. Both enforce consent at the
 * QUERY (a `consentStatus = GRANTED` WHERE / guard) — never relying on the
 * serializer alone — and map every row through {@link toPublic} so no raw Prisma
 * entity (and thus no PII) can reach a controller (DD-1/DD-2, NFR-1, defense in
 * depth). The `crops.crop` relation is always included so the serializer can
 * project crop names.
 *
 * Design refs: spec design.md §4, §6, §7; detailed-design §4 (envelope
 * `{ data, page, pageSize, total }`). Requirements: FR-6, NFR-1, NFR-6.
 */

/** Public paginated list envelope (detailed-design §4) — shared response shape. */
export interface PublicActorList {
  data: PublicActor[];
  page: number;
  pageSize: number;
  total: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** The `crops.crop` include reused by both reads so names resolve in toPublic. */
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
   * through {@link toPublic}; `total` counts the same filtered GRANTED set.
   */
  async findPublic(query: ListQueryDto): Promise<PublicActorList> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const where: Prisma.ActorWhereInput = {
      // Consent enforced at the QUERY — never serializer-only (NFR-1, DD-3).
      consentStatus: ConsentStatus.GRANTED,
      ...(query.region ? { region: query.region } : {}),
      ...(query.role ? { traderType: query.role } : {}),
      ...(query.crop
        ? { crops: { some: { crop: { name: query.crop } } } }
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
      data: rows.map((row) => toPublic(row)),
      page,
      pageSize,
      total,
    };
  }

  /**
   * Single public actor by id (FR-6). Returns `null` when the id is absent OR
   * the actor is not public (consent ≠ GRANTED) — the controller maps `null` to
   * a 404 so a non-consented actor is indistinguishable from a missing one.
   * Consent is re-checked here via {@link isPublic} (defense in depth) before
   * the row is ever projected.
   */
  async findOnePublic(id: string): Promise<PublicActor | null> {
    const actor = await this.prisma.actor.findUnique({
      where: { id },
      include: CROPS_INCLUDE,
    });

    if (!actor || !isPublic(actor)) return null;

    return toPublic(actor);
  }
}
