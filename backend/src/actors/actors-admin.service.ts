import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConsentMethod, ConsentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminActorListQueryDto } from './dto/admin-actor-list-query.dto';
import { AdminActorCreateDto } from './dto/admin-actor-create.dto';
import { AdminActorUpdateDto } from './dto/admin-actor-update.dto';
import { ActorHistoryQueryDto } from './dto/actor-history-query.dto';
import { AdminActor, toAdminActor } from './admin-actor.serializer';
import { AuditEntry, toAuditEntry } from './audit-entry.serializer';
import { ActingAdminResolver } from './acting-admin.resolver';
import {
  ActorAuditService,
  ActingAdmin,
  ConsentFillPatch,
} from './actor-audit.service';
import { FieldErrorDetail } from '../common/validation-pipe';
import { isConsentProvenanceSatisfied } from '../common/consent-provenance.policy';

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

/**
 * T-4 — `bulkSetConsent`'s result envelope (design.md §4.2, DD-4, R-8).
 * `preserved` counts actors left untouched because they already carried
 * their own provenance — legible evidence that the partitioned write did not
 * silently overwrite anyone's evidence.
 */
export interface BulkConsentResult extends BulkResult {
  preserved: number;
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
  'registrationSource',
  'consentMethod',
  'consentObtainedAt',
  'consentReference',
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
      // T-8 — AND-composed with the filters above; this is FR-9's enumeration
      // mechanism (`consentStatus=GRANTED&consentMethod=NOT_RECORDED` finds
      // the legacy unevidenced set).
      ...(q.registrationSource
        ? { registrationSource: q.registrationSource }
        : {}),
      ...(q.consentMethod ? { consentMethod: q.consentMethod } : {}),
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

    // FR-3/NFR-7 — the shared provenance invariant, a gate INDEPENDENT of
    // `acknowledged` (DD-2): a create has no stored actor, so `stored` is
    // `null` and the predicate evaluates the payload on its own.
    if (!isConsentProvenanceSatisfied(null, dto)) {
      throw this.buildProvenanceError(dto.consentMethod, dto.consentObtainedAt ?? null);
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

        // FR-3/NFR-7 — the shared provenance invariant, evaluated against the
        // STORED row loaded above (design.md §4.1's concurrency assumption:
        // read-then-decide inside this same transaction). Independent of the
        // `acknowledged` check above (DD-2) — both must pass.
        if (!isConsentProvenanceSatisfied(before, dto)) {
          const effectiveMethod = dto.consentMethod ?? before.consentMethod;
          const effectiveObtainedAt =
            dto.consentObtainedAt !== undefined
              ? dto.consentObtainedAt
              : (before.consentObtainedAt ?? null);
          throw this.buildProvenanceError(effectiveMethod, effectiveObtainedAt);
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
   * Bulk set `consentStatus` to `GRANTED` (unlock) or `DENIED` (lock)
   * (FR-3, FR-4).
   *
   * Unlocking publishes PII + GPS, so the server enforces an explicit
   * `acknowledged` flag in addition to any UI acknowledgement (FR-4) —
   * independent of the FR-3 provenance gate below (design.md DD-2).
   *
   * T-4 — When unlocking, the batch's `consentMethod`/`consentObtainedAt`/
   * `consentReference` are validated through the SAME shared invariant as
   * create/update (`isConsentProvenanceSatisfied`, NFR-7) before the
   * transaction opens, with `stored = null` — mirroring `create()`'s call,
   * since a batch-level value has no single stored row to merge against.
   * A failing batch is rejected before any read or write happens, so **zero**
   * rows are ever touched (FR-3's bulk scenario).
   *
   * The write itself is PARTITIONED (design.md DD-4, corrected from a naive
   * uniform `updateMany` after Judgment Day J-3, then corrected AGAIN after
   * two independent Reviewer FAILs on the attempt-1 partition below).
   *
   * **Attempt-1 defect (fixed here):** the fill/preserved split keyed on
   * `consentMethod === NOT_RECORDED` alone. An actor with a recorded method
   * but a `null` consentObtainedAt (reachable via create/import with a
   * method column filled and no date, or via un-publish-then-strip) landed
   * in "preserved", got a status-only write, and ended `GRANTED` with
   * `consentObtainedAt = null` — the exact FR-3 invariant violation this
   * spec exists to close.
   *
   * **Corrected partition:** a row joins the fill set when its OWN
   * `consentMethod` is `NOT_RECORDED` **or** its OWN `consentObtainedAt` is
   * `null` — not only the former. Only the field(s) a given row is actually
   * missing are filled from the batch's values; a field the row already
   * carries (including `consentReference`) is NEVER overwritten (R-8,
   * ADVISORY-1). A row fully evidenced on both method and date stays
   * status-only regardless of its `consentReference`. Rows are grouped by
   * which fields they need filled so the write stays a handful of
   * `updateMany` calls — bounded and independent of batch size — rather than
   * a per-row loop. `preserved` in the result envelope counts only the
   * fully-evidenced, untouched rows. Both the fill writes and the status-only
   * write happen inside the same transaction as the existence check and the
   * audit entries, and the audit diff is built from the SAME per-actor patch
   * map that drives the write (`ConsentFillPatch`, NFR-6) — see
   * `ActorAuditService.logBulkConsent`.
   */
  async bulkSetConsent(
    ids: string[],
    status: string,
    actingSub: string,
    acknowledged?: boolean,
    consentMethod?: ConsentMethod,
    consentObtainedAt?: string,
    consentReference?: string,
  ): Promise<BulkConsentResult> {
    if (status === ConsentStatus.GRANTED && !acknowledged) {
      throw new BadRequestException(
        'Consent acknowledgement is required to unlock actors',
      );
    }

    const isUnlock = status === ConsentStatus.GRANTED;

    if (isUnlock) {
      if (
        !isConsentProvenanceSatisfied(null, {
          consentStatus: ConsentStatus.GRANTED,
          consentMethod,
          consentObtainedAt,
          consentReference,
        })
      ) {
        throw this.buildProvenanceError(consentMethod, consentObtainedAt ?? null);
      }
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

      let preserved = 0;

      if (foundIds.length > 0) {
        const beforeRows = existing.map((row) => toAdminActor(row));

        // Corrected DD-4 partition (T-4 rework, attempt 2): a row needs a
        // fill when EITHER its own method or its own date is missing — not
        // only when the method is NOT_RECORDED (attempt 1's defect). Only
        // the fields actually missing on THIS row are patched; a value the
        // row already carries is never overwritten. Rows are grouped by
        // which fields they need so the write is a handful of `updateMany`
        // calls, bounded and independent of batch size.
        const patches = new Map<string, ConsentFillPatch>();
        const fillGroups = new Map<
          string,
          { ids: string[]; patch: ConsentFillPatch }
        >();
        const preservedIds: string[] = [];

        if (isUnlock) {
          for (const row of existing) {
            const missingMethod =
              row.consentMethod === ConsentMethod.NOT_RECORDED;
            const missingDate = row.consentObtainedAt === null;

            if (!missingMethod && !missingDate) {
              preservedIds.push(row.id);
              continue;
            }

            const patch: ConsentFillPatch = {};
            if (missingMethod) {
              patch.consentMethod = consentMethod as ConsentMethod;
            }
            if (missingDate) {
              patch.consentObtainedAt = consentObtainedAt as string;
            }
            if (
              consentReference !== undefined &&
              (row.consentReference === null ||
                row.consentReference === undefined)
            ) {
              patch.consentReference = consentReference;
            }

            patches.set(row.id, patch);

            const key = Object.keys(patch).sort().join(',');
            const group = fillGroups.get(key);
            if (group) {
              group.ids.push(row.id);
            } else {
              fillGroups.set(key, { ids: [row.id], patch });
            }
          }
        }
        preserved = isUnlock ? preservedIds.length : 0;

        await this.actorAuditService.logBulkConsent(
          tx,
          beforeRows,
          status,
          acting,
          acknowledged ?? false,
          isUnlock ? patches : undefined,
        );

        if (isUnlock) {
          if (preservedIds.length > 0) {
            await tx.actor.updateMany({
              where: { id: { in: preservedIds } },
              data: { consentStatus: status as ConsentStatus },
            });
          }
          for (const { ids, patch } of fillGroups.values()) {
            await tx.actor.updateMany({
              where: { id: { in: ids } },
              data: {
                consentStatus: status as ConsentStatus,
                ...patch,
              } as Prisma.ActorUpdateManyMutationInput,
            });
          }
        } else {
          // Lock (DENIED) — no provenance concept applies; uniform
          // status-only write, unchanged from before this spec.
          await tx.actor.updateMany({
            where: { id: { in: foundIds } },
            data: { consentStatus: status as ConsentStatus },
          });
        }
      }

      return {
        requested: ids.length,
        applied: foundIds.length,
        notFound,
        preserved,
      };
    });

    console.info(
      JSON.stringify({
        action: 'bulk-consent',
        status,
        actingSub,
        count: result.applied,
        preserved: result.preserved,
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

  /**
   * Build the field-level 400 for a write that fails the FR-3 provenance
   * invariant (`isConsentProvenanceSatisfied` returned `false`). Matches the
   * project's standard error envelope (`createValidationPipe()`'s
   * `{ statusCode, error, message, details: [{ field, message }] }`) so the
   * admin form's existing inline field-error mapping applies unchanged
   * (design.md §3) — this is a hand-built instance of that same envelope
   * rather than a differently-shaped ad hoc error.
   */
  private buildProvenanceError(
    effectiveMethod: string | undefined,
    effectiveObtainedAt: Date | string | null | undefined,
  ): BadRequestException {
    const details: FieldErrorDetail[] = [];
    if (!effectiveMethod || effectiveMethod === ConsentMethod.NOT_RECORDED) {
      details.push({
        field: 'consentMethod',
        message:
          'consentMethod must be recorded (not NOT_RECORDED) when consentStatus is GRANTED',
      });
    }
    if (effectiveObtainedAt === null || effectiveObtainedAt === undefined) {
      details.push({
        field: 'consentObtainedAt',
        message: 'consentObtainedAt is required when consentStatus is GRANTED',
      });
    }
    return new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Consent provenance is required to set status to GRANTED',
      details,
    });
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
