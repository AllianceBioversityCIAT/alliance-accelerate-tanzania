import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
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
  DuplicateConfirmationSnapshot,
} from './actor-audit.service';
import { FieldErrorDetail } from '../common/validation-pipe';
import {
  isConsentProvenanceSatisfied,
  isSameProvenanceValue,
} from '../common/consent-provenance.policy';
import { missingIdentityFields, missingIntakeFields } from '../common/intake-contract';
import {
  allocateTraderIds,
  isTraderIdCollisionError,
  MAX_TRADER_ID_ALLOCATION_ATTEMPTS,
} from './trader-id.util';
import { IntakeDuplicateService } from './intake-duplicate.service';
import { DuplicateCandidate } from '../registrations/duplicate-detection.service';

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

/**
 * T-3 — `create()`'s response envelope (design.md §3): the created actor,
 * plus the weak matches surfaced as an informational warning (FR-3's weak
 * scenario — always present, possibly empty, never blocks the create).
 */
export interface AdminActorCreateResult extends AdminActor {
  duplicateWarnings: DuplicateCandidate[];
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
  'traderName',
  'region',
  'district',
  'traderType',
  'contactPerson',
  'sex',
  'position',
  'marketLocation',
  'capacityTons',
  'otherCrops',
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
  private readonly logger = new Logger(ActorsAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly actorAuditService: ActorAuditService,
    private readonly actingAdminResolver: ActingAdminResolver,
    private readonly intakeDuplicateService: IntakeDuplicateService,
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
   * Create a single actor (FR-1, FR-2, FR-3). Allocates a system-generated
   * `traderId` and retries on collision up to {@link MAX_TRADER_ID_ALLOCATION_ATTEMPTS}
   * (design.md §4.2) before giving up with a 500 — never a 409 for this.
   *
   * FR-3's duplicate gate runs BEFORE allocation (design.md §4.4 steps 1-2):
   * a create blocked on an unconfirmed strong match never burns a Trader ID.
   */
  async create(
    dto: AdminActorCreateDto,
    actingSub: string,
  ): Promise<AdminActorCreateResult> {
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

    // FR-3 — the duplicate gate (design.md §4.3, §4.4 step 2, DD-3, DD-4).
    // Recomputed on every request: `confirmedNotDuplicateOf` only clears
    // candidates the SERVER currently finds, so a changed field that now
    // matches a different actor is never silently waved through.
    const { strong, weak } = await this.intakeDuplicateService.check({
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      traderName: dto.traderName,
      gpsLatitude: dto.gpsLatitude ?? null,
      gpsLongitude: dto.gpsLongitude ?? null,
    });
    const confirmedIds = new Set(dto.confirmedNotDuplicateOf ?? []);
    const unconfirmedStrong = strong.filter((c) => !confirmedIds.has(c.actorId));
    if (unconfirmedStrong.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Possible duplicate',
        duplicateCandidates: unconfirmedStrong,
      });
    }
    const confirmedStrong = strong.filter((c) => confirmedIds.has(c.actorId));
    const duplicateConfirmation: DuplicateConfirmationSnapshot[] | null =
      confirmedStrong.length > 0
        ? confirmedStrong.map((c) => ({
            kind: 'actor' as const,
            actorId: c.actorId,
            traderId: c.traderId,
            traderName: c.traderName,
            matchedOn: c.matchedOn,
          }))
        : null;

    const acting = await this.resolveActing(actingSub);
    const now = new Date();

    for (let attempt = 1; attempt <= MAX_TRADER_ID_ALLOCATION_ATTEMPTS; attempt += 1) {
      const [traderId] = await allocateTraderIds(this.prisma, 1, now);

      try {
        return await this.prisma.$transaction(async (tx) => {
          const created = await tx.actor.create({
            data: {
              ...this.buildScalarData(dto),
              traderId,
            } as Prisma.ActorCreateInput,
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
          await this.actorAuditService.logCreate(
            tx,
            adminActor,
            acting,
            duplicateConfirmation,
          );
          return { ...adminActor, duplicateWarnings: weak };
        });
      } catch (err) {
        if (isTraderIdCollisionError(err)) {
          if (attempt < MAX_TRADER_ID_ALLOCATION_ATTEMPTS) {
            continue;
          }
          this.logger.error(
            `trader id allocation exhausted: year=${now.getUTCFullYear()} ` +
              `attempts=${MAX_TRADER_ID_ALLOCATION_ATTEMPTS}`,
          );
          throw new InternalServerErrorException(
            'Unable to create the actor right now. Please try again.',
          );
        }
        throw this.mapPrismaError(err);
      }
    }

    // Unreachable — satisfies TS control-flow analysis only (same as RegistrationsService.submitRegistration).
    throw new InternalServerErrorException(
      'Unable to create the actor right now. Please try again.',
    );
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

        // FR-1/NFR-1 — the merged-state required-set check (design.md §4.4,
        // intake-contract.ts): a field absent from the PATCH keeps the
        // STORED value, so this fires only when the EFFECTIVE value (after
        // merging) would leave the actor missing something the required set
        // demands — never merely because the actor already existed
        // incomplete (FR-1 scenario 3's BUT clause).
        const missingFields = [
          ...missingIdentityFields(
            { traderName: before.traderName, traderType: before.traderType, region: before.region },
            { traderName: dto.traderName, traderType: dto.traderType, region: dto.region },
          ),
          ...missingIntakeFields(
            {
              contactPerson: before.contactPerson,
              capacityTons: before.capacityTons,
              phone: before.phone,
              email: before.email,
              cropsCount: before.crops.length,
            },
            {
              contactPerson: dto.contactPerson,
              capacityTons: dto.capacityTons,
              phone: dto.phone,
              email: dto.email,
              crops: dto.crops,
            },
          ),
        ];
        if (missingFields.length > 0) {
          throw new BadRequestException({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Missing required field(s)',
            details: missingFields.map((field) => ({
              field,
              message: `${field} is required`,
            })),
          });
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

        // FR-10/DD-9 (design.md §5.7, rules 1-3) — no admin write may assert
        // or move an actor into EMAIL_LINK, and a GRANTED-by-link actor's
        // evidence is frozen while it stays GRANTED. Independent of the
        // acknowledged check above and of the provenance check below.
        this.enforceConsentMethodRules(before, dto);

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
    consentReference?: string | null,
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
            // DD-9 (design.md §5.7) — a row already GRANTED through
            // EMAIL_LINK is the actor's own evidence; it is left untouched
            // regardless of the batch's values (rule 3). A NON-GRANTED row
            // whose stored method is EMAIL_LINK (e.g. it was later set
            // DENIED by an admin) counts as MISSING a method — it is never
            // "preserved" with a label that claims the actor's own act, and
            // the batch's assertable method fills it instead (RB-2).
            const isGrantedEmailLink =
              row.consentStatus === ConsentStatus.GRANTED &&
              row.consentMethod === ConsentMethod.EMAIL_LINK;
            const missingMethod =
              !isGrantedEmailLink &&
              (row.consentMethod === ConsentMethod.NOT_RECORDED ||
                row.consentMethod === ConsentMethod.EMAIL_LINK);
            const missingDate = !isGrantedEmailLink && row.consentObtainedAt === null;

            if (isGrantedEmailLink || (!missingMethod && !missingDate)) {
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
   * DD-9 / design.md §5.7 — no admin write path may assert `EMAIL_LINK`, and
   * a `GRANTED`-by-link actor's evidence is frozen. `AdminActorUpdateDto`
   * validates `consentMethod` against the FULL enum (unlike create/bulk/
   * import, which use `ADMIN_ASSERTABLE_CONSENT_METHODS`) because
   * `ActorForm.buildDto` always resends the stored value — so these three
   * rules are what keeps that unchanged re-send legal while still refusing
   * an actual admin assertion of `EMAIL_LINK` (FR-10 scenarios "the admin
   * gate is bypassed by design, and only here" / "link evidence is frozen").
   *
   * 1. A CHANGE to `EMAIL_LINK` (stored method differs, payload asserts it).
   * 2. Any transition INTO `GRANTED` whose EFFECTIVE method is `EMAIL_LINK`
   *    (RB-2) — covers an actor that accepted by link, was later set
   *    `DENIED` by an admin (method never cleared), and is now being
   *    re-granted: the re-grant is the admin's own assertion and must carry
   *    an admin-assertable method.
   * 3. While the actor IS `GRANTED` by link and STAYS `GRANTED`, its
   *    `consentMethod`/`consentObtainedAt`/`consentReference` are frozen —
   *    only a status change (which falls under rule 2 on a later re-grant)
   *    can correct the record.
   *
   * Throws a field-level `BadRequestException` naming the offending field,
   * or returns without effect when none of the three rules fire.
   */
  private enforceConsentMethodRules(
    before: { consentStatus: ConsentStatus | string; consentMethod: ConsentMethod | string; consentObtainedAt: Date | null; consentReference: string | null },
    dto: AdminActorUpdateDto,
  ): void {
    const storedMethod = before.consentMethod;
    const effectiveStatus = dto.consentStatus ?? before.consentStatus;
    const effectiveMethod = dto.consentMethod ?? storedMethod;

    // Rule 1 — a CHANGE to EMAIL_LINK.
    if (
      dto.consentMethod === ConsentMethod.EMAIL_LINK &&
      storedMethod !== ConsentMethod.EMAIL_LINK
    ) {
      throw this.buildConsentMethodError(
        'consentMethod',
        'consentMethod cannot be set to EMAIL_LINK — only the actor\'s own response to a consent request can record it',
      );
    }

    // Rule 2 — any transition INTO GRANTED whose EFFECTIVE method is
    // EMAIL_LINK (a re-grant after an admin set the actor DENIED/UNKNOWN).
    if (
      effectiveStatus === ConsentStatus.GRANTED &&
      before.consentStatus !== ConsentStatus.GRANTED &&
      effectiveMethod === ConsentMethod.EMAIL_LINK
    ) {
      throw this.buildConsentMethodError(
        'consentMethod',
        'Granting consent requires an admin-assertable consentMethod, not EMAIL_LINK',
      );
    }

    // Rule 3 — evidence frozen while GRANTED by link (status unchanged).
    const wasGrantedByLink =
      before.consentStatus === ConsentStatus.GRANTED &&
      storedMethod === ConsentMethod.EMAIL_LINK;
    if (wasGrantedByLink && effectiveStatus === ConsentStatus.GRANTED) {
      const frozen: Array<{
        field: 'consentMethod' | 'consentObtainedAt' | 'consentReference';
        submitted: string | Date | null | undefined;
        stored: string | Date | null | undefined;
      }> = [
        { field: 'consentMethod', submitted: dto.consentMethod, stored: storedMethod },
        {
          field: 'consentObtainedAt',
          submitted: dto.consentObtainedAt,
          stored: before.consentObtainedAt,
        },
        {
          field: 'consentReference',
          submitted: dto.consentReference,
          stored: before.consentReference,
        },
      ];
      for (const { field, submitted, stored } of frozen) {
        if (submitted === undefined) continue;
        if (!isSameProvenanceValue(submitted, stored)) {
          throw this.buildConsentMethodError(
            field,
            `${field} cannot be changed while consent is GRANTED by EMAIL_LINK — change the status to correct the record`,
          );
        }
      }
    }
  }

  /** Same field-level 400 envelope as {@link buildProvenanceError}, for the DD-9 rules above. */
  private buildConsentMethodError(field: string, message: string): BadRequestException {
    return new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Consent method change is not permitted',
      details: [{ field, message }],
    });
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
   * Map Prisma errors to domain HTTP exceptions (design.md §4.4). Every
   * `P2002` becomes a generic 409 — a `traderId` collision never reaches
   * here (create's retry loop intercepts it via `isTraderIdCollisionError`,
   * and update can no longer write `traderId` at all). All other errors are
   * re-thrown unchanged so the original exception type propagates.
   */
  private mapPrismaError(err: unknown): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictException('Unique constraint violation');
    }
    throw err;
  }
}
