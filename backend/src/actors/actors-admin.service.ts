import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConsentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminActorListQueryDto } from './dto/admin-actor-list-query.dto';
import { AdminActorCreateDto } from './dto/admin-actor-create.dto';
import { AdminActorUpdateDto } from './dto/admin-actor-update.dto';
import { ActorHistoryQueryDto } from './dto/actor-history-query.dto';
import { AdminActor, toAdminActor } from './admin-actor.serializer';
import { AuditEntry, toAuditEntry } from './audit-entry.serializer';
import { ActingAdminResolver } from './acting-admin.resolver';
import { ActorAuditService, ActingAdmin } from './actor-audit.service';

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

/**
 * Scalar Actor fields that can be supplied by the Admin create/update DTOs.
 * `id`, `createdAt`, `updatedAt` are row metadata and never accepted from the
 * client; crop assignments are handled separately via `CropsOnActors`.
 */
const SCALAR_FIELDS = [
  'traderId',
  'traderName',
  'region',
  'district',
  'traderType',
  'sex',
  'position',
  'marketLocation',
  'capacityTons',
  'technicalSupport',
  'phone',
  'email',
  'gpsLatitude',
  'gpsLongitude',
  'gpsAltitude',
  'gpsAccuracy',
  'consentStatus',
] as const;

@Injectable()
export class ActorsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actorAuditService: ActorAuditService,
    private readonly actingAdminResolver: ActingAdminResolver,
  ) {}

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
   * Create a single actor (FR-1).
   *
   * Resolves the acting Admin email before opening the transaction, then creates
   * the Actor row, optionally links crops, refetches the full row, and writes a
   * `CREATE` audit entry in the same transaction. Duplicate `traderId` is mapped
   * to a clean 409.
   */
  async create(
    dto: AdminActorCreateDto,
    actingSub: string,
  ): Promise<AdminActor> {
    if (dto.consentStatus === ConsentStatus.GRANTED && !dto.acknowledged) {
      throw new BadRequestException(
        'Consent acknowledgement is required to set status to GRANTED',
      );
    }

    const acting = await this.resolveActing(actingSub);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.actor.create({
          data: this.buildScalarData(dto) as Prisma.ActorCreateInput,
        });

        if (dto.crops && dto.crops.length > 0) {
          const cropLinks = await this.buildCropLinks(
            tx,
            created.id,
            dto.crops,
          );
          await tx.cropsOnActors.createMany({ data: cropLinks });
        }

        const full = await tx.actor.findUnique({
          where: { id: created.id },
          include: CROPS_INCLUDE,
        });
        if (!full) {
          throw new Error('Created actor could not be refetched');
        }

        const adminActor = toAdminActor(full);
        await this.actorAuditService.logCreate(tx, adminActor, acting);
        return adminActor;
      });
    } catch (err) {
      throw this.mapPrismaError(err);
    }
  }

  /**
   * Admin detail read for a single actor (FR-2).
   *
   * Returns the full Admin projection regardless of consent status; unknown id
   * → 404.
   */
  async getById(id: string): Promise<AdminActor> {
    const actor = await this.prisma.actor.findUnique({
      where: { id },
      include: CROPS_INCLUDE,
    });

    if (!actor) {
      throw new NotFoundException(`Actor ${id} not found`);
    }

    return toAdminActor(actor);
  }

  /**
   * Partially update a single actor (FR-3).
   *
   * Only supplied scalar fields are applied; when `crops` is supplied the link
   * set is fully replaced. A transition to `GRANTED` requires the explicit
   * acknowledgement flag. The audit entry records only the fields that actually
   * changed.
   */
  async update(
    id: string,
    dto: AdminActorUpdateDto,
    actingSub: string,
  ): Promise<AdminActor> {
    const acting = await this.resolveActing(actingSub);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await tx.actor.findUnique({
          where: { id },
          include: CROPS_INCLUDE,
        });
        if (!before) {
          throw new NotFoundException(`Actor ${id} not found`);
        }

        if (
          dto.consentStatus === ConsentStatus.GRANTED &&
          before.consentStatus !== ConsentStatus.GRANTED &&
          !dto.acknowledged
        ) {
          throw new BadRequestException(
            'Consent acknowledgement is required to set status to GRANTED',
          );
        }

        const updateData = this.buildScalarData(dto);
        if (Object.keys(updateData).length > 0) {
          await tx.actor.update({
            where: { id },
            data: updateData as Prisma.ActorUpdateInput,
          });
        }

        if (dto.crops !== undefined) {
          await tx.cropsOnActors.deleteMany({ where: { actorId: id } });
          if (dto.crops.length > 0) {
            const cropLinks = await this.buildCropLinks(tx, id, dto.crops);
            await tx.cropsOnActors.createMany({ data: cropLinks });
          }
        }

        const after = await tx.actor.findUnique({
          where: { id },
          include: CROPS_INCLUDE,
        });
        if (!after) {
          throw new Error('Updated actor could not be refetched');
        }

        const adminBefore = toAdminActor(before);
        const adminAfter = toAdminActor(after);
        await this.actorAuditService.logUpdate(
          tx,
          adminBefore,
          adminAfter,
          acting,
          dto.acknowledged,
        );

        return adminAfter;
      });
    } catch (err) {
      throw this.mapPrismaError(err);
    }
  }

  /**
   * Permanently delete a single actor (FR-4).
   *
   * Writes a final `DELETE` snapshot audit entry before removing the Actor row
   * (and its cascading crop links) so history remains meaningful.
   */
  async remove(
    id: string,
    actingSub: string,
  ): Promise<{ deleted: true; id: string }> {
    const acting = await this.resolveActing(actingSub);

    await this.prisma.$transaction(async (tx) => {
      const actor = await tx.actor.findUnique({
        where: { id },
        include: CROPS_INCLUDE,
      });
      if (!actor) {
        throw new NotFoundException(`Actor ${id} not found`);
      }

      const adminActor = toAdminActor(actor);
      await this.actorAuditService.logDelete(tx, adminActor, acting);
      await tx.actor.delete({ where: { id } });
    });

    return { deleted: true, id };
  }

  /**
   * Paginated audit history for a single actor (FR-7).
   *
   * Returns newest-first entries; works for deleted actors because no existence
   * check is performed on the `Actor` table.
   */
  async history(
    id: string,
    q: ActorHistoryQueryDto,
  ): Promise<{ data: AuditEntry[]; page: number; pageSize: number; total: number }> {
    const page = q.page ?? DEFAULT_PAGE;
    const pageSize = Math.min(q.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const [rows, total] = await Promise.all([
      this.prisma.actorAuditLog.findMany({
        where: { actorId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.actorAuditLog.count({ where: { actorId: id } }),
    ]);

    return {
      data: rows.map((row) => toAuditEntry(row)),
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

    const acting = await this.resolveActing(actingSub);

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.actor.findMany({
        where: { id: { in: ids } },
        include: CROPS_INCLUDE,
      });
      const foundIds = existing.map((a) => a.id);
      const foundSet = new Set(foundIds);
      const notFound = ids.filter((id) => !foundSet.has(id));

      if (foundIds.length > 0) {
        const beforeRows = existing.map((row) => toAdminActor(row));
        await this.actorAuditService.logBulkConsent(
          tx,
          beforeRows,
          status,
          acting,
          acknowledged ?? false,
        );

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
    const acting = await this.resolveActing(actingSub);

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.actor.findMany({
        where: { id: { in: ids } },
        include: CROPS_INCLUDE,
      });
      const foundIds = existing.map((a) => a.id);
      const foundSet = new Set(foundIds);
      const notFound = ids.filter((id) => !foundSet.has(id));

      if (foundIds.length > 0) {
        const rows = existing.map((row) => toAdminActor(row));
        await this.actorAuditService.logBulkDelete(tx, rows, acting);

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

  /** Resolve the acting Admin email and package it with the verified sub. */
  private async resolveActing(actingSub: string): Promise<ActingAdmin> {
    const email = await this.actingAdminResolver.resolve(actingSub);
    return { sub: actingSub, email };
  }

  /**
   * Build a Prisma data object containing only the scalar fields present in
   * the DTO. Used for both create and partial update inputs.
   */
  private buildScalarData(
    dto: AdminActorCreateDto | AdminActorUpdateDto,
  ): Prisma.ActorCreateInput | Prisma.ActorUpdateInput {
    const data: Record<string, unknown> = {};
    for (const field of SCALAR_FIELDS) {
      if (field in dto) {
        data[field] = dto[field as keyof typeof dto];
      }
    }
    return data as Prisma.ActorCreateInput | Prisma.ActorUpdateInput;
  }

  /**
   * Resolve crop names to Crop ids and build `CropsOnActors` link rows.
   * Throws `BadRequestException` if any name does not exist in the catalog.
   */
  private async buildCropLinks(
    tx: Prisma.TransactionClient,
    actorId: string,
    cropNames: string[],
  ): Promise<Array<{ actorId: string; cropId: string }>> {
    const crops = await tx.crop.findMany({
      where: { name: { in: cropNames } },
      select: { id: true, name: true },
    });

    const foundNames = new Set(crops.map((c) => c.name));
    const missing = cropNames.filter((name) => !foundNames.has(name));
    if (missing.length > 0) {
      throw new BadRequestException(`Unknown crops: ${missing.join(', ')}`);
    }

    return crops.map((crop) => ({ actorId, cropId: crop.id }));
  }

  /**
   * Map Prisma errors to domain HTTP exceptions.
   *
   * A duplicate `traderId` (`P2002` on the unique index) becomes a clean 409.
   * All other errors are re-thrown unchanged so the original exception type
   * (e.g. `NotFoundException`) propagates.
   */
  private mapPrismaError(err: unknown): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        const targets = Array.isArray(err.meta?.target) ? err.meta.target : [];
        if (targets.includes('traderId')) {
          throw new ConflictException(
            'An actor with this traderId already exists',
          );
        }
        throw new ConflictException('Unique constraint violation');
      }
    }
    throw err;
  }
}
