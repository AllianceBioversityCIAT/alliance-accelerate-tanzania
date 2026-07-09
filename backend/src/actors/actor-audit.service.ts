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
import { ActorAuditAction, ActorAuditLog, Prisma } from '@prisma/client';
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

/** Field-level diff envelope. */
interface DiffEnvelope {
  kind: 'diff';
  fields: Record<string, { from: unknown; to: unknown }>;
}

/** Full-snapshot envelope. */
interface SnapshotEnvelope {
  kind: 'snapshot';
  values: Record<string, unknown>;
}

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
   * Record `BULK_CONSENT` audit entries for actors whose status really changes.
   *
   * Rows already at the target `status` are skipped (empty-diff skip per row).
   * All remaining rows are inserted with a single `createMany` (NFR-6), and the
   * typed `acknowledged` flag is persisted on every row.
   */
  async logBulkConsent(
    tx: Prisma.TransactionClient,
    beforeRows: AdminActor[],
    status: string,
    acting: ActingAdmin,
    acknowledged: boolean,
  ): Promise<{ count: number }> {
    const changedRows = beforeRows.filter(
      (row) => row.consentStatus !== status,
    );

    if (changedRows.length === 0) {
      return { count: 0 };
    }

    return tx.actorAuditLog.createMany({
      data: changedRows.map((row) => ({
        actorId: row.id,
        traderId: row.traderId,
        traderName: row.traderName,
        action: ActorAuditAction.BULK_CONSENT,
        actingSub: acting.sub,
        actingEmail: acting.email ?? null,
        changes: {
          kind: 'diff',
          fields: {
            consentStatus: { from: row.consentStatus, to: status },
          },
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
