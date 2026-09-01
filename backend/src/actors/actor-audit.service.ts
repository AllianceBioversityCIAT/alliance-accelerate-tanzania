// @sdd-spec admin/actor-crud-audit (T-4)
/**
 * T-4 — Transaction-scoped audit writer + diff builder.
 *
 * Every admin write to the actor registry (single create/update/delete and the
 * existing bulk consent/delete operations) is recorded as an `ActorAuditLog`
 * row inside the SAME Prisma transaction as the mutation (FR-5, NFR-4).
 *
 * The service is intentionally dumb about business rules beyond diff/snapshot
 * shaping: callers pass the already-resolved acting admin, the transaction
 * client, and the before/after Admin projections. This keeps call sites
 * explicit and testable (design §4, §8 ADR).
 *
 * Design refs: `docs/specs/admin/actor-crud-audit/design.md` §2, §4.
 */

import { Injectable } from '@nestjs/common';
import {
  ActorAuditAction,
  ActorAuditLog,
  Prisma,
  Registration,
} from '@prisma/client';
import { AdminActor } from './admin-actor.serializer';

/** Acting admin identity snapshotted into each audit row. */
export interface ActingAdmin {
  sub: string;
  email?: string | null;
}

/**
 * Scalar fields of `AdminActor` that participate in diffs and snapshots.
 * `id`, `createdAt`, `updatedAt` are excluded because they are row metadata,
 * not actor data; the audit row itself stores `actorId` and `createdAt`.
 */
const AUDITABLE_FIELDS = [
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
  // T-3 — registration source & consent provenance (FR-1, FR-2, NFR-6):
  // flow through this existing diff/snapshot machinery unchanged
  // (design.md §4.6) rather than a parallel audit path.
  'registrationSource',
  'consentMethod',
  'consentObtainedAt',
  'consentReference',
] as const;

type AuditableField = (typeof AUDITABLE_FIELDS)[number];

/**
 * Decimal fields stored as strings in the `changes` JSON so the audit trail
 * keeps exact precision (no float drift) (design §2).
 */
const DECIMAL_FIELDS: readonly AuditableField[] = [
  'capacityTons',
  'gpsLatitude',
  'gpsLongitude',
  'gpsAltitude',
  'gpsAccuracy',
] as const;

/**
 * T-3 — Date fields serialized to ISO strings in the `changes` JSON. Without
 * this, two `Date` instances representing the same instant (e.g. an
 * unrelated update's before/after `consentObtainedAt`, refetched from Prisma
 * on both sides) would fail `valuesEqual`'s reference/array checks and
 * produce a spurious diff entry on every update to an actor that has this
 * field set — mirrors why `DECIMAL_FIELDS` is compared as strings.
 */
const DATE_FIELDS: readonly AuditableField[] = ['consentObtainedAt'] as const;

/** Full-snapshot envelope. */
interface SnapshotEnvelope {
  kind: 'snapshot';
  values: Record<string, unknown>;
}

/**
 * T-4 (rework, attempt 2) — the provenance fields `bulkSetConsent` fills on
 * ONE actor during an unlock, computed by the caller from what that actor's
 * row was actually missing (`design.md` DD-4, corrected after two Reviewer
 * FAILs on attempt 1's `consentMethod === NOT_RECORDED`-only partition).
 *
 * Replaces the earlier batch-uniform `fill: { ids, consentMethod, ... }`
 * shape, which could only express "these ids get the full batch value" and
 * therefore claimed a `consentMethod` change in the audit for a row that
 * only had its `consentObtainedAt` filled. A key **absent** here means that
 * field was left untouched on this actor — present-but-unchanged is not
 * possible by construction, since the caller only sets a key when the row's
 * own value was missing.
 */
export type ConsentFillPatch = Partial<{
  consentMethod: string;
  consentObtainedAt: string | Date;
  consentReference: string | null;
}>;

@Injectable()
export class ActorAuditService {
  /**
   * Record a `CREATE` audit entry with a full snapshot of the new actor.
   *
   * Decimal fields are serialized as strings; crops are serialized as a
   * `string[]` of crop names.
   */
  async logCreate(
    tx: Prisma.TransactionClient,
    actor: AdminActor,
    acting: ActingAdmin,
  ): Promise<ActorAuditLog> {
    return tx.actorAuditLog.create({
      data: {
        actorId: actor.id,
        traderId: actor.traderId,
        traderName: actor.traderName,
        action: ActorAuditAction.CREATE,
        actingSub: acting.sub,
        actingEmail: acting.email ?? null,
        changes: this.buildSnapshot(actor) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Record a `DELETE` audit entry with a final snapshot of the actor.
   *
   * The snapshot is written BEFORE the actor row is removed so the audit trail
   * remains meaningful after deletion (FR-6).
   */
  async logDelete(
    tx: Prisma.TransactionClient,
    actor: AdminActor,
    acting: ActingAdmin,
  ): Promise<ActorAuditLog> {
    return tx.actorAuditLog.create({
      data: {
        actorId: actor.id,
        traderId: actor.traderId,
        traderName: actor.traderName,
        action: ActorAuditAction.DELETE,
        actingSub: acting.sub,
        actingEmail: acting.email ?? null,
        changes: this.buildSnapshot(actor) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Record an `UPDATE` audit entry with a field-level diff.
   *
   * Only actually-changed fields appear in the diff. If the before/after
   * projections are identical, NO row is written and `null` is returned
   * (design §8 ADR).
   */
  async logUpdate(
    tx: Prisma.TransactionClient,
    before: AdminActor,
    after: AdminActor,
    acting: ActingAdmin,
    acknowledged?: boolean,
  ): Promise<ActorAuditLog | null> {
    const diff = this.buildDiff(before, after);
    if (Object.keys(diff).length === 0) {
      return null;
    }

    const data: Prisma.ActorAuditLogCreateInput = {
      actorId: after.id,
      traderId: after.traderId,
      traderName: after.traderName,
      action: ActorAuditAction.UPDATE,
      actingSub: acting.sub,
      actingEmail: acting.email ?? null,
      changes: { kind: 'diff', fields: diff } as unknown as Prisma.InputJsonValue,
    };

    if (acknowledged !== undefined) {
      data.acknowledged = acknowledged;
    }

    return tx.actorAuditLog.create({ data });
  }

  /**
   * Record `BULK_CONSENT` audit entries for actors whose status and/or
   * provenance really changes.
   *
   * Rows with no field change at all are skipped (empty-diff skip per row,
   * same convention as {@link logUpdate}). All remaining rows are inserted
   * with a single `createMany` (NFR-6), and the typed `acknowledged` flag is
   * persisted on every row.
   *
   * T-4 (rework, attempt 2) — `patches` is a per-actor {@link ConsentFillPatch}
   * map, computed ONCE by the caller from the same per-row missing-field
   * partition that drives the write (`design.md` DD-4). Diffing directly off
   * that map — rather than off a single batch-uniform value — means the
   * audit entry can only ever claim a field change the write actually made:
   * a row present in `patches` with only `consentObtainedAt` set produces a
   * diff naming `consentObtainedAt` alone, never a phantom `consentMethod`
   * change. A row absent from `patches` (not in the fill set at all) is
   * diffed on `consentStatus` alone, so an already-evidenced actor's audit
   * entry correctly shows no provenance change (R-8).
   */
  async logBulkConsent(
    tx: Prisma.TransactionClient,
    beforeRows: AdminActor[],
    status: string,
    acting: ActingAdmin,
    acknowledged: boolean,
    patches?: ReadonlyMap<string, ConsentFillPatch>,
  ): Promise<{ count: number }> {
    const entries = beforeRows
      .map((row) => {
        const fields: Record<string, { from: unknown; to: unknown }> = {};

        if (row.consentStatus !== status) {
          fields.consentStatus = { from: row.consentStatus, to: status };
        }

        const patch = patches?.get(row.id);
        if (patch) {
          if (
            patch.consentMethod !== undefined &&
            !this.valuesEqual(row.consentMethod, patch.consentMethod)
          ) {
            fields.consentMethod = {
              from: row.consentMethod,
              to: patch.consentMethod,
            };
          }

          if (patch.consentObtainedAt !== undefined) {
            const fromObtainedAt = this.serializeValue(
              'consentObtainedAt',
              row.consentObtainedAt,
            );
            const toObtainedAt = this.serializeValue(
              'consentObtainedAt',
              patch.consentObtainedAt,
            );
            if (!this.valuesEqual(fromObtainedAt, toObtainedAt)) {
              fields.consentObtainedAt = {
                from: fromObtainedAt,
                to: toObtainedAt,
              };
            }
          }

          if (patch.consentReference !== undefined) {
            const toReference = patch.consentReference ?? null;
            if (!this.valuesEqual(row.consentReference ?? null, toReference)) {
              fields.consentReference = {
                from: row.consentReference ?? null,
                to: toReference,
              };
            }
          }
        }

        return { row, fields };
      })
      .filter(({ fields }) => Object.keys(fields).length > 0);

    if (entries.length === 0) {
      return { count: 0 };
    }

    return tx.actorAuditLog.createMany({
      data: entries.map(({ row, fields }) => ({
        actorId: row.id,
        traderId: row.traderId,
        traderName: row.traderName,
        action: ActorAuditAction.BULK_CONSENT,
        actingSub: acting.sub,
        actingEmail: acting.email ?? null,
        changes: {
          kind: 'diff',
          fields,
        } as unknown as Prisma.InputJsonValue,
        acknowledged,
      })),
    });
  }

  /**
   * Record `BULK_DELETE` snapshot entries for every row in one `createMany`.
   */
  async logBulkDelete(
    tx: Prisma.TransactionClient,
    rows: AdminActor[],
    acting: ActingAdmin,
  ): Promise<{ count: number }> {
    if (rows.length === 0) {
      return { count: 0 };
    }

    return tx.actorAuditLog.createMany({
      data: rows.map((row) => ({
        actorId: row.id,
        traderId: row.traderId,
        traderName: row.traderName,
        action: ActorAuditAction.BULK_DELETE,
        actingSub: acting.sub,
        actingEmail: acting.email ?? null,
        changes: this.buildSnapshot(row) as unknown as Prisma.InputJsonValue,
      })),
    });
  }

  /**
   * Record `IMPORT` snapshot entries for a chunk of freshly-created actors in a
   * single `createMany` (FR-8), mirroring {@link logBulkDelete}'s batching.
   *
   * Each entry carries a full snapshot envelope (Decimal fields as strings,
   * crops as names). When `acknowledged` is supplied — the file-level consent
   * gate for `GRANTED` rows (FR-6) — it is persisted on every entry; when it is
   * omitted, the column is left unset so `UNKNOWN`/`DENIED`-only imports don't
   * record a spurious flag.
   *
   * @sdd-spec admin/actor-import
   */
  async logImport(
    tx: Prisma.TransactionClient,
    actors: AdminActor[],
    acting: ActingAdmin,
    acknowledged?: boolean,
  ): Promise<{ count: number }> {
    if (actors.length === 0) {
      return { count: 0 };
    }

    return tx.actorAuditLog.createMany({
      data: actors.map((actor) => {
        const row: Prisma.ActorAuditLogCreateManyInput = {
          actorId: actor.id,
          traderId: actor.traderId,
          traderName: actor.traderName,
          action: ActorAuditAction.IMPORT,
          actingSub: acting.sub,
          actingEmail: acting.email ?? null,
          changes: this.buildSnapshot(actor) as unknown as Prisma.InputJsonValue,
        };
        if (acknowledged !== undefined) {
          row.acknowledged = acknowledged;
        }
        return row;
      }),
    });
  }

  /**
   * Record a `REGISTRATION_APPROVE` audit entry (FR-16, FR-12 audit clause,
   * design.md §6.7, DD-6).
   *
   * `logCreate` cannot be reused: it hardcodes `action: CREATE` and takes no
   * action parameter. This is additive, not a refactor of `logCreate`.
   *
   * The `changes` envelope is pinned **identical in shape to `logCreate`'s**
   * — a full snapshot of the created actor — because approval *is* a create,
   * just with a distinct provenance and authority (a self-registration
   * adjudicated by an Admin, rather than a direct admin create). Reusing the
   * exact shape means `SnapshotDetails` on the frontend renders it with no
   * new narrowing branch, and it satisfies `ActorHistoryPanel`'s `isSnapshot`
   * check the same way `logCreate`'s does.
   *
   * `reference` (the originating registration's human-readable reference,
   * e.g. `REG-2026-0184`) is accepted for parity with the pinned call-site
   * signature (design.md §6.2 step 7) and with {@link logRegistrationReject},
   * but is deliberately NOT duplicated into the envelope: FR-12 requires
   * `actor.consentReference` to already equal it by the time this is called,
   * and `consentReference` is already an `AUDITABLE_FIELDS` member captured
   * by {@link buildSnapshot} — adding it again would invent a field outside
   * §6.7's pinned table rather than reuse `logCreate`'s shape.
   */
  async logRegistrationApprove(
    tx: Prisma.TransactionClient,
    actor: AdminActor,
    acting: ActingAdmin,
    _reference: string,
  ): Promise<ActorAuditLog> {
    return tx.actorAuditLog.create({
      data: {
        actorId: actor.id,
        traderId: actor.traderId,
        traderName: actor.traderName,
        action: ActorAuditAction.REGISTRATION_APPROVE,
        actingSub: acting.sub,
        actingEmail: acting.email ?? null,
        changes: this.buildSnapshot(actor) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Record a `REGISTRATION_REJECT` audit entry (FR-16, FR-13 audit clause,
   * design.md §6.7, DD-6).
   *
   * There is no actor to snapshot — rejection creates nothing (FR-13). The
   * envelope is instead **snapshot-shaped** over the registration's
   * reviewable facts: the reference, the submitted organisation name, and
   * the structured rejection reason. Snapshot-shaped rather than a third
   * envelope kind, so it stays legible to `ActorHistoryPanel`'s existing
   * `isSnapshot` narrowing without widening it.
   *
   * The row's top-level identity columns deliberately do NOT name a real
   * actor: `actorId` = the **registration** id, `traderId` = the reference,
   * `traderName` = the submitted organisation name. `ActorAuditLog.actorId`
   * is deliberately FK-less (design.md §6.7), so this bends no constraint —
   * and because the actor-history read path filters on `actorId` against a
   * real `Actor` row, a rejection row's registration-id `actorId` can never
   * match any actor's history query. That is the carried-forward FR-16
   * clause (`BUT a REGISTRATION_REJECT row must NOT appear in any actor's
   * history`), asserted here at the persistence layer since no UI can ever
   * render this row to assert it against.
   */
  async logRegistrationReject(
    tx: Prisma.TransactionClient,
    registration: Pick<Registration, 'id' | 'reference' | 'payload' | 'rejectionReason'>,
    acting: ActingAdmin,
  ): Promise<ActorAuditLog> {
    const traderName = this.extractSubmittedTraderName(registration.payload);

    return tx.actorAuditLog.create({
      data: {
        actorId: registration.id,
        traderId: registration.reference,
        traderName,
        action: ActorAuditAction.REGISTRATION_REJECT,
        actingSub: acting.sub,
        actingEmail: acting.email ?? null,
        changes: {
          kind: 'snapshot',
          values: {
            reference: registration.reference,
            traderName,
            reason: registration.rejectionReason ?? null,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Read `traderName` out of a registration's untyped JSON `payload`
   * (`RegistrationPayloadDto`'s field, §6.3's projection table). Defensive
   * only: a real registration always carries this field by the time it
   * reaches adjudication (FR-2), but `payload` is stored as `Prisma.JsonValue`
   * with no compile-time shape.
   */
  private extractSubmittedTraderName(payload: Prisma.JsonValue): string {
    if (
      payload !== null &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      typeof (payload as Record<string, unknown>).traderName === 'string'
    ) {
      return (payload as Record<string, unknown>).traderName as string;
    }
    return '';
  }

  private buildSnapshot(actor: AdminActor): SnapshotEnvelope {
    const values: Record<string, unknown> = {};
    for (const field of AUDITABLE_FIELDS) {
      values[field] = this.serializeValue(field, actor[field]);
    }
    values.crops = actor.crops;
    return { kind: 'snapshot', values };
  }

  private buildDiff(
    before: AdminActor,
    after: AdminActor,
  ): Record<string, { from: unknown; to: unknown }> {
    const diff: Record<string, { from: unknown; to: unknown }> = {};

    for (const field of AUDITABLE_FIELDS) {
      const from = this.serializeValue(field, before[field]);
      const to = this.serializeValue(field, after[field]);
      if (!this.valuesEqual(from, to)) {
        diff[field] = { from, to };
      }
    }

    const cropsFromSorted = [...before.crops].sort();
    const cropsToSorted = [...after.crops].sort();
    if (!this.valuesEqual(cropsFromSorted, cropsToSorted)) {
      diff.crops = { from: before.crops, to: after.crops };
    }

    return diff;
  }

  private serializeValue(field: AuditableField, value: unknown): unknown {
    if (DECIMAL_FIELDS.includes(field)) {
      return value === null || value === undefined ? null : String(value);
    }
    if (DATE_FIELDS.includes(field)) {
      if (value === null || value === undefined) return null;
      return value instanceof Date ? value.toISOString() : value;
    }
    return value;
  }

  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || a === undefined) return a === b;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i += 1) {
        if (!this.valuesEqual(a[i], b[i])) return false;
      }
      return true;
    }
    return false;
  }
}
