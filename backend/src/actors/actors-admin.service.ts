import { BadRequestException, Injectable } from '@nestjs/common';
import { ConsentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminActorListQueryDto } from './dto/admin-actor-list-query.dto';
import { AdminActor, toAdminActor } from './admin-actor.serializer';

/**
 * T-2 — Admin-only actor operations service (FR-1, FR-3, FR-4, FR-5, NFR-4).
 *
 * Extends the actors domain with a separate Admin-gated write surface:
 * paginated list of all actors (any consent status, with PII), bulk set-consent
 * (lock/unlock), and bulk permanent delete. All mutations run inside a Prisma
 * transaction and return a per-id result. Unlocking (`GRANTED`) requires an
 * explicit `acknowledged` flag because it publishes PII + GPS (FR-4).
 *
 * Design refs: `docs/specs/admin/bulk-actor-operations/design.md` §4.
 */

/** Per-id bulk mutation result envelope (design.md §3). */
export interface BulkResult {
  requested: number;
  applied: number;
  notFound: string[];
}

/** Admin paginated list envelope (FR-1). */
export interface AdminActorList {
  data: AdminActor[];
  page: number;
  pageSize: number;
  total: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Crop include reused so the Admin serializer can resolve crop names. */
const CROPS_INCLUDE = {
  crops: { include: { crop: true } },
} satisfies Prisma.ActorInclude;

@Injectable()
export class ActorsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated, filtered Admin actor list (FR-1).
   *
   * Returns actors of every `consentStatus` with full PII. Filters are optional
   * and never pin `consentStatus = GRANTED` — the admin must see all statuses.
   * Pagination defaults/clamps mirror the public list contract.
   */
  async adminList(q: AdminActorListQueryDto): Promise<AdminActorList> {
    const page = q.page ?? DEFAULT_PAGE;
    const pageSize = Math.min(q.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const where: Prisma.ActorWhereInput = {
      ...(q.region ? { region: q.region } : {}),
      ...(q.traderType ? { traderType: q.traderType } : {}),
      ...(q.consentStatus
        ? { consentStatus: q.consentStatus as ConsentStatus }
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
      data: rows.map((row) => toAdminActor(row)),
      page,
      pageSize,
      total,
    };
  }

  /**
   * Bulk set `consentStatus` to `GRANTED` (unlock) or `DENIED` (lock) (FR-3).
   *
   * Unlocking publishes PII + GPS, so the server enforces an explicit
   * `acknowledged` flag in addition to any UI acknowledgement (FR-4). The
   * operation is transactional: existing ids are updated atomically while
   * missing ids are reported separately.
   */
  async bulkSetConsent(
    ids: string[],
    status: string,
    actingSub: string,
    acknowledged?: boolean,
  ): Promise<BulkResult> {
    if (status === 'GRANTED' && !acknowledged) {
      throw new BadRequestException(
        'Consent acknowledgement is required to unlock actors',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.actor.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      const foundIds = existing.map((a) => a.id);
      const foundSet = new Set(foundIds);
      const notFound = ids.filter((id) => !foundSet.has(id));

      if (foundIds.length > 0) {
        await tx.actor.updateMany({
          where: { id: { in: foundIds } },
          data: { consentStatus: status as ConsentStatus },
        });
      }

      return { requested: ids.length, applied: foundIds.length, notFound };
    });

    console.info(
      JSON.stringify({
        action: 'bulk-consent',
        status,
        actingSub,
        count: result.applied,
        acknowledged,
        notFoundCount: result.notFound.length,
      }),
    );

    return result;
  }

  /**
   * Bulk permanent delete of actors (FR-5).
   *
   * The existing `CropsOnActors` relation cascades on delete, so only the Actor
   * rows are removed here. Missing ids are reported without failing the
   * operation for the ids that do exist.
   */
  async bulkDelete(ids: string[], actingSub: string): Promise<BulkResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.actor.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      const foundIds = existing.map((a) => a.id);
      const foundSet = new Set(foundIds);
      const notFound = ids.filter((id) => !foundSet.has(id));

      if (foundIds.length > 0) {
        await tx.actor.deleteMany({
          where: { id: { in: foundIds } },
        });
      }

      return { requested: ids.length, applied: foundIds.length, notFound };
    });

    console.info(
      JSON.stringify({
        action: 'bulk-delete',
        actingSub,
        count: result.applied,
        notFoundCount: result.notFound.length,
      }),
    );

    return result;
  }
}
