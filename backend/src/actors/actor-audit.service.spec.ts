// @sdd-spec admin/actor-crud-audit (T-4)
/**
 * T-4 — `ActorAuditService` unit tests with a mocked Prisma transaction client.
 *
 * These tests pin the audit envelope contracts (FR-5, NFR-4, NFR-6):
 *   - create/delete write full snapshots;
 *   - update writes a field-level diff containing ONLY changed fields;
 *   - a no-change update writes nothing;
 *   - Decimal fields are stored as strings;
 *   - crops are stored as `string[]` of crop names;
 *   - bulk consent writes one row per actually-changed actor with `acknowledged`;
 *   - bulk delete writes one snapshot per row via a single `createMany`.
 *
 * Design refs: `docs/specs/admin/actor-crud-audit/design.md` §2, §4, §10.
 */

import { ActorAuditAction, Prisma } from '@prisma/client';
import { ActorAuditService, ActingAdmin } from './actor-audit.service';
import { AdminActor } from './admin-actor.serializer';
import { toAuditEntry } from './audit-entry.serializer';

const acting: ActingAdmin = {
  sub: 'admin-sub-123',
  email: 'admin@example.com',
};

function fixtureActor(overrides: Partial<AdminActor> = {}): AdminActor {
  return {
    id: 'actor-1',
    traderId: 'TZ-SEED-0001',
    traderName: 'Meru Agro-Processing & Seeds',
    region: 'Arusha',
    district: 'Arusha Urban',
    traderType: 'seed_company',
    contactPerson: null,
    sex: 'M',
    position: 'Director',
    marketLocation: 'Arusha Central Market',
    capacityTons: 1850,
    otherCrops: null,
    technicalSupport: 'Needs cold storage',
    phone: '+255700000000',
    email: 'director@example.com',
    gpsLatitude: -3.3869,
    gpsLongitude: 36.683,
    gpsAltitude: 1400,
    gpsAccuracy: 5,
    consentStatus: 'UNKNOWN',
    // T-3 — registration source & consent provenance (FR-1, FR-2); defaults
    // mirror the Prisma column defaults so a plain fixtureActor() looks like
    // a legacy row (design.md FR-9).
    registrationSource: 'TEAM_MANAGED',
    consentMethod: 'NOT_RECORDED',
    consentObtainedAt: null,
    consentReference: null,
    crops: ['sorghum', 'common_bean'],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function mockTx() {
  return {
    actorAuditLog: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
  } as unknown as Prisma.TransactionClient;
}

describe('ActorAuditService', () => {
  let service: ActorAuditService;

  beforeEach(() => {
    service = new ActorAuditService();
  });

  describe('logCreate', () => {
    it('writes a CREATE snapshot with Decimal fields as strings and crops as names', async () => {
      const tx = mockTx();
      const actor = fixtureActor();
      const created = {
        id: 'log-1',
        actorId: actor.id,
        traderId: actor.traderId,
        traderName: actor.traderName,
        action: ActorAuditAction.CREATE,
        actingSub: acting.sub,
        actingEmail: acting.email,
        changes: {},
        acknowledged: null,
        createdAt: new Date(),
      };
      tx.actorAuditLog.create = jest.fn().mockResolvedValue(created);

      const result = await service.logCreate(tx, actor, acting);

      expect(result).toBe(created);
      expect(tx.actorAuditLog.create).toHaveBeenCalledTimes(1);
      const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
        .data as Record<string, unknown>;

      expect(data).toMatchObject({
        actorId: actor.id,
        traderId: actor.traderId,
        traderName: actor.traderName,
        action: ActorAuditAction.CREATE,
        actingSub: acting.sub,
        actingEmail: acting.email,
      });

      const changes = data.changes as {
        kind: string;
        values: Record<string, unknown>;
      };
      expect(changes.kind).toBe('snapshot');
      expect(changes.values).toMatchObject({
        traderId: actor.traderId,
        traderName: actor.traderName,
        region: actor.region,
        district: actor.district,
        traderType: actor.traderType,
        sex: actor.sex,
        position: actor.position,
        marketLocation: actor.marketLocation,
        technicalSupport: actor.technicalSupport,
        phone: actor.phone,
        email: actor.email,
        consentStatus: actor.consentStatus,
        crops: actor.crops,
      });

      // Decimal fields must be strings (design §2).
      expect(changes.values.capacityTons).toBe('1850');
      expect(changes.values.gpsLatitude).toBe('-3.3869');
      expect(changes.values.gpsLongitude).toBe('36.683');
      expect(changes.values.gpsAltitude).toBe('1400');
      expect(changes.values.gpsAccuracy).toBe('5');
    });

    /**
     * T-3 (intake-required-fields) — `duplicateConfirmation` (design.md §2,
     * FR-3): a separate column, not a `changes` key (P-12).
     */
    describe('duplicateConfirmation (FR-3)', () => {
      it('writes Prisma.JsonNull when no duplicateConfirmation is passed (falsifier 6)', async () => {
        const tx = mockTx();
        tx.actorAuditLog.create = jest.fn().mockResolvedValue({ id: 'log-2' });

        await service.logCreate(tx, fixtureActor(), acting);

        const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
          .data as Record<string, unknown>;
        expect(data.duplicateConfirmation).toEqual(Prisma.JsonNull);
      });

      it('writes Prisma.JsonNull when an EMPTY duplicateConfirmation array is passed', async () => {
        const tx = mockTx();
        tx.actorAuditLog.create = jest.fn().mockResolvedValue({ id: 'log-3' });

        await service.logCreate(tx, fixtureActor(), acting, []);

        const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
          .data as Record<string, unknown>;
        expect(data.duplicateConfirmation).toEqual(Prisma.JsonNull);
      });

      it('writes the confirmed-candidate snapshot verbatim when provided (falsifier 6)', async () => {
        const tx = mockTx();
        tx.actorAuditLog.create = jest.fn().mockResolvedValue({ id: 'log-4' });
        const confirmation = [
          {
            kind: 'actor' as const,
            actorId: 'actor-existing-1',
            traderId: 'TZ-SEED-0099',
            traderName: 'Prior Trader',
            matchedOn: ['email' as const],
          },
        ];

        await service.logCreate(tx, fixtureActor(), acting, confirmation);

        const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
          .data as Record<string, unknown>;
        expect(data.duplicateConfirmation).toEqual(confirmation);
      });
    });
  });

  describe('logDelete', () => {
    it('writes a DELETE snapshot before the actor row is removed', async () => {
      const tx = mockTx();
      const actor = fixtureActor();
      const created = {
        id: 'log-delete-1',
        actorId: actor.id,
        traderId: actor.traderId,
        traderName: actor.traderName,
        action: ActorAuditAction.DELETE,
        actingSub: acting.sub,
        actingEmail: acting.email,
        changes: {},
        acknowledged: null,
        createdAt: new Date(),
      };
      tx.actorAuditLog.create = jest.fn().mockResolvedValue(created);

      const result = await service.logDelete(tx, actor, acting);

      expect(result).toBe(created);
      const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
        .data as Record<string, unknown>;
      expect(data.action).toBe(ActorAuditAction.DELETE);
      expect((data.changes as { kind: string }).kind).toBe('snapshot');
    });
  });

  describe('logUpdate', () => {
    it('writes a diff containing exactly the changed scalar fields with from/to', async () => {
      const tx = mockTx();
      const before = fixtureActor({ phone: '+255700000000' });
      const after = fixtureActor({ phone: '+255711111111' });
      const created = { id: 'log-update-1' } as never;
      tx.actorAuditLog.create = jest.fn().mockResolvedValue(created);

      const result = await service.logUpdate(tx, before, after, acting);

      expect(result).toBe(created);
      expect(tx.actorAuditLog.create).toHaveBeenCalledTimes(1);
      const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
        .data as Record<string, unknown>;
      const changes = data.changes as {
        kind: string;
        fields: Record<string, { from: unknown; to: unknown }>;
      };

      expect(changes.kind).toBe('diff');
      expect(Object.keys(changes.fields)).toEqual(['phone']);
      expect(changes.fields.phone).toEqual({
        from: '+255700000000',
        to: '+255711111111',
      });
    });

    it('writes a diff when crops change', async () => {
      const tx = mockTx();
      const before = fixtureActor({ crops: ['sorghum'] });
      const after = fixtureActor({ crops: ['sorghum', 'groundnut'] });
      const created = { id: 'log-update-2' } as never;
      tx.actorAuditLog.create = jest.fn().mockResolvedValue(created);

      await service.logUpdate(tx, before, after, acting);

      const changes = (
        (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
          .data as Record<string, unknown>
      ).changes as { kind: string; fields: Record<string, unknown> };

      expect(Object.keys(changes.fields)).toEqual(['crops']);
      expect(changes.fields.crops).toEqual({
        from: ['sorghum'],
        to: ['sorghum', 'groundnut'],
      });
    });

    it('returns null and writes nothing when before and after are identical', async () => {
      const tx = mockTx();
      const actor = fixtureActor();
      tx.actorAuditLog.create = jest.fn();

      const result = await service.logUpdate(tx, actor, actor, acting);

      expect(result).toBeNull();
      expect(tx.actorAuditLog.create).not.toHaveBeenCalled();
    });

    it('returns null when only crop order changes (same set)', async () => {
      const tx = mockTx();
      const before = fixtureActor({ crops: ['common_bean', 'sorghum'] });
      const after = fixtureActor({ crops: ['sorghum', 'common_bean'] });
      tx.actorAuditLog.create = jest.fn();

      const result = await service.logUpdate(tx, before, after, acting);

      expect(result).toBeNull();
      expect(tx.actorAuditLog.create).not.toHaveBeenCalled();
    });

    it('persists acknowledged when provided for a GRANTED transition', async () => {
      const tx = mockTx();
      const before = fixtureActor({ consentStatus: 'UNKNOWN' });
      const after = fixtureActor({ consentStatus: 'GRANTED' });
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({ id: 'log-ack' });

      await service.logUpdate(tx, before, after, acting, true);

      const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
        .data as Record<string, unknown>;
      expect(data.acknowledged).toBe(true);
    });

    it('omits acknowledged from the row when not provided', async () => {
      const tx = mockTx();
      const before = fixtureActor({ region: 'Arusha' });
      const after = fixtureActor({ region: 'Manyara' });
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({ id: 'log-no-ack' });

      await service.logUpdate(tx, before, after, acting);

      const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
        .data as Record<string, unknown>;
      expect(data).not.toHaveProperty('acknowledged');
    });

    it('serializes Decimal changes as strings', async () => {
      const tx = mockTx();
      const before = fixtureActor({ capacityTons: 1000, gpsLatitude: -3.0 });
      const after = fixtureActor({ capacityTons: 2000.5, gpsLatitude: -3.5 });
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({ id: 'log-dec' });

      await service.logUpdate(tx, before, after, acting);

      const fields = (
        (
          (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
            .data as Record<string, unknown>
        ).changes as { fields: Record<string, { from: unknown; to: unknown }> }
      ).fields;

      expect(fields.capacityTons).toEqual({ from: '1000', to: '2000.5' });
      expect(fields.gpsLatitude).toEqual({ from: '-3', to: '-3.5' });
    });

    it('includes multiple changed fields in a single diff', async () => {
      const tx = mockTx();
      const before = fixtureActor({
        phone: '+255700000000',
        region: 'Arusha',
        crops: ['sorghum'],
      });
      const after = fixtureActor({
        phone: '+255711111111',
        region: 'Manyara',
        crops: ['sorghum', 'groundnut'],
      });
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({ id: 'log-multi' });

      await service.logUpdate(tx, before, after, acting);

      const fields = (
        (
          (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
            .data as Record<string, unknown>
        ).changes as { fields: Record<string, unknown> }
      ).fields;

      expect(Object.keys(fields).sort()).toEqual([
        'crops',
        'phone',
        'region',
      ]);
    });

    // `actors/public-profile-disclosure` T-2 (validation remediation) —
    // `contactPerson` is a third party's name, now publicly disclosed and
    // admin-editable; a `contactPerson`-only update must not be the one kind
    // of admin write that leaves zero audit trace. Falsifiable: removing
    // `'contactPerson'` from `AUDITABLE_FIELDS` makes `logUpdate` see an
    // empty diff for this before/after pair and return `null` without
    // calling `create` at all — reddening both assertions below.
    it('writes a diff row for a contactPerson-only change (regression guard)', async () => {
      const tx = mockTx();
      const before = fixtureActor({ contactPerson: null });
      const after = fixtureActor({ contactPerson: 'Amina Juma' });
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({ id: 'log-contact' });

      const result = await service.logUpdate(tx, before, after, acting);

      expect(result).not.toBeNull();
      expect(tx.actorAuditLog.create).toHaveBeenCalledTimes(1);
      const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
        .data as Record<string, unknown>;
      const changes = data.changes as {
        kind: string;
        fields: Record<string, { from: unknown; to: unknown }>;
      };

      expect(changes.kind).toBe('diff');
      expect(Object.keys(changes.fields)).toEqual(['contactPerson']);
      expect(changes.fields.contactPerson).toEqual({
        from: null,
        to: 'Amina Juma',
      });
    });

    // Same regression guard for `otherCrops` — the second field this task's
    // audit added alongside `contactPerson` (FR-4).
    it('writes a diff row for an otherCrops-only change (regression guard)', async () => {
      const tx = mockTx();
      const before = fixtureActor({ otherCrops: null });
      const after = fixtureActor({ otherCrops: 'Sesame, chia' });
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({ id: 'log-crops-text' });

      const result = await service.logUpdate(tx, before, after, acting);

      expect(result).not.toBeNull();
      const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
        .data as Record<string, unknown>;
      const changes = data.changes as {
        kind: string;
        fields: Record<string, { from: unknown; to: unknown }>;
      };

      expect(Object.keys(changes.fields)).toEqual(['otherCrops']);
      expect(changes.fields.otherCrops).toEqual({
        from: null,
        to: 'Sesame, chia',
      });
    });
  });

  describe('logBulkConsent', () => {
    it('creates one BULK_CONSENT row per actor whose status changes', async () => {
      const tx = mockTx();
      const rows = [
        fixtureActor({ id: 'a1', consentStatus: 'UNKNOWN' }),
        fixtureActor({ id: 'a2', consentStatus: 'DENIED' }),
        fixtureActor({ id: 'a3', consentStatus: 'GRANTED' }),
      ];
      tx.actorAuditLog.createMany = jest.fn().mockResolvedValue({ count: 2 });

      const result = await service.logBulkConsent(
        tx,
        rows,
        'GRANTED',
        acting,
        true,
      );

      expect(result).toEqual({ count: 2 });
      expect(tx.actorAuditLog.createMany).toHaveBeenCalledTimes(1);
      const data = (tx.actorAuditLog.createMany as jest.Mock).mock.calls[0][0]
        .data as Array<Record<string, unknown>>;

      expect(data).toHaveLength(2);
      expect(data[0].actorId).toBe('a1');
      expect(data[1].actorId).toBe('a2');
      for (const row of data) {
        expect(row.action).toBe(ActorAuditAction.BULK_CONSENT);
        expect(row.acknowledged).toBe(true);
        expect((row.changes as { kind: string }).kind).toBe('diff');
      }
      expect(
        (data[0].changes as { fields: Record<string, unknown> }).fields,
      ).toEqual({
        consentStatus: { from: 'UNKNOWN', to: 'GRANTED' },
      });
    });

    it('skips createMany when every row is already at the target status', async () => {
      const tx = mockTx();
      const rows = [
        fixtureActor({ id: 'a1', consentStatus: 'GRANTED' }),
        fixtureActor({ id: 'a2', consentStatus: 'GRANTED' }),
      ];
      tx.actorAuditLog.createMany = jest.fn();

      const result = await service.logBulkConsent(
        tx,
        rows,
        'GRANTED',
        acting,
        true,
      );

      expect(result).toEqual({ count: 0 });
      expect(tx.actorAuditLog.createMany).not.toHaveBeenCalled();
    });

    it('returns count 0 for an empty input array without calling createMany', async () => {
      const tx = mockTx();
      tx.actorAuditLog.createMany = jest.fn();

      const result = await service.logBulkConsent(
        tx,
        [],
        'GRANTED',
        acting,
        true,
      );

      expect(result).toEqual({ count: 0 });
      expect(tx.actorAuditLog.createMany).not.toHaveBeenCalled();
    });

    it('T-4 (rework, attempt 2): diffs strictly off the per-actor patch map — a row present in `patches` with only consentObtainedAt set produces a diff naming ONLY that field, never a phantom consentMethod change', async () => {
      const tx = mockTx();
      const rows = [
        // Own method already recorded (EMAIL); only the date was missing.
        fixtureActor({
          id: 'a1',
          consentStatus: 'DENIED',
          consentMethod: 'EMAIL',
          consentObtainedAt: null,
          consentReference: null,
        }),
        // Not in `patches` at all — fully evidenced, status-only.
        fixtureActor({
          id: 'a2',
          consentStatus: 'DENIED',
          consentMethod: 'SIGNED_FORM',
          consentObtainedAt: new Date('2025-01-01T00:00:00Z'),
        }),
      ];
      tx.actorAuditLog.createMany = jest.fn().mockResolvedValue({ count: 2 });

      const patches = new Map([
        ['a1', { consentObtainedAt: '2026-07-01T00:00:00.000Z' }],
      ]);

      const result = await service.logBulkConsent(
        tx,
        rows,
        'GRANTED',
        acting,
        true,
        patches,
      );

      expect(result).toEqual({ count: 2 });
      const data = (tx.actorAuditLog.createMany as jest.Mock).mock.calls[0][0]
        .data as Array<{ actorId: string; changes: { fields: unknown } }>;
      const byId = Object.fromEntries(
        data.map((row) => [row.actorId, row.changes.fields]),
      );

      expect(byId.a1).toEqual({
        consentStatus: { from: 'DENIED', to: 'GRANTED' },
        consentObtainedAt: {
          from: null,
          to: '2026-07-01T00:00:00.000Z',
        },
      });
      expect(byId.a2).toEqual({
        consentStatus: { from: 'DENIED', to: 'GRANTED' },
      });
    });
  });

  describe('logBulkDelete', () => {
    it('creates one BULK_DELETE snapshot per row via a single createMany', async () => {
      const tx = mockTx();
      const rows = [
        fixtureActor({ id: 'a1', traderName: 'Actor One' }),
        fixtureActor({ id: 'a2', traderName: 'Actor Two' }),
      ];
      tx.actorAuditLog.createMany = jest.fn().mockResolvedValue({ count: 2 });

      const result = await service.logBulkDelete(tx, rows, acting);

      expect(result).toEqual({ count: 2 });
      expect(tx.actorAuditLog.createMany).toHaveBeenCalledTimes(1);
      const data = (tx.actorAuditLog.createMany as jest.Mock).mock.calls[0][0]
        .data as Array<Record<string, unknown>>;

      expect(data).toHaveLength(2);
      expect(data[0].actorId).toBe('a1');
      expect(data[1].actorId).toBe('a2');
      for (const row of data) {
        expect(row.action).toBe(ActorAuditAction.BULK_DELETE);
        expect((row.changes as { kind: string }).kind).toBe('snapshot');
      }
    });

    it('returns count 0 for an empty input array without calling createMany', async () => {
      const tx = mockTx();
      tx.actorAuditLog.createMany = jest.fn();

      const result = await service.logBulkDelete(tx, [], acting);

      expect(result).toEqual({ count: 0 });
      expect(tx.actorAuditLog.createMany).not.toHaveBeenCalled();
    });
  });

  describe('logImport', () => {
    it('creates one IMPORT snapshot per created actor via a single createMany', async () => {
      const tx = mockTx();
      const rows = [
        fixtureActor({ id: 'a1', traderId: 'TZ-1', traderName: 'Actor One' }),
        fixtureActor({ id: 'a2', traderId: 'TZ-2', traderName: 'Actor Two' }),
      ];
      tx.actorAuditLog.createMany = jest.fn().mockResolvedValue({ count: 2 });

      const result = await service.logImport(tx, rows, acting);

      expect(result).toEqual({ count: 2 });
      expect(tx.actorAuditLog.createMany).toHaveBeenCalledTimes(1);
      const data = (tx.actorAuditLog.createMany as jest.Mock).mock.calls[0][0]
        .data as Array<Record<string, unknown>>;

      expect(data).toHaveLength(2);
      expect(data[0].actorId).toBe('a1');
      expect(data[1].actorId).toBe('a2');
      for (const row of data) {
        expect(row.action).toBe(ActorAuditAction.IMPORT);
        expect(row.actingSub).toBe(acting.sub);
        expect(row.actingEmail).toBe(acting.email);
        expect((row.changes as { kind: string }).kind).toBe('snapshot');
      }
      // Snapshot shape: Decimal fields as strings, crops as names.
      const values = (
        data[0].changes as { values: Record<string, unknown> }
      ).values;
      expect(values.capacityTons).toBe('1850');
      expect(values.gpsLatitude).toBe('-3.3869');
      expect(values.crops).toEqual(['sorghum', 'common_bean']);
    });

    it('persists acknowledged on every row when provided', async () => {
      const tx = mockTx();
      const rows = [
        fixtureActor({ id: 'a1', consentStatus: 'GRANTED' }),
        fixtureActor({ id: 'a2', consentStatus: 'GRANTED' }),
      ];
      tx.actorAuditLog.createMany = jest.fn().mockResolvedValue({ count: 2 });

      await service.logImport(tx, rows, acting, true);

      const data = (tx.actorAuditLog.createMany as jest.Mock).mock.calls[0][0]
        .data as Array<Record<string, unknown>>;
      for (const row of data) {
        expect(row.acknowledged).toBe(true);
      }
    });

    it('omits acknowledged from every row when not provided', async () => {
      const tx = mockTx();
      const rows = [fixtureActor({ id: 'a1' })];
      tx.actorAuditLog.createMany = jest.fn().mockResolvedValue({ count: 1 });

      await service.logImport(tx, rows, acting);

      const data = (tx.actorAuditLog.createMany as jest.Mock).mock.calls[0][0]
        .data as Array<Record<string, unknown>>;
      expect(data[0]).not.toHaveProperty('acknowledged');
    });

    it('returns count 0 for an empty input array without calling createMany', async () => {
      const tx = mockTx();
      tx.actorAuditLog.createMany = jest.fn();

      const result = await service.logImport(tx, [], acting);

      expect(result).toEqual({ count: 0 });
      expect(tx.actorAuditLog.createMany).not.toHaveBeenCalled();
    });

    // T-5 (actors/consent-intake/intake-required-fields, design.md §2/§4.5) —
    // `duplicateConfirmations`, aligned by index with `actors`.
    describe('duplicateConfirmations (T-5)', () => {
      it('writes each row its own confirmation snapshot, aligned by index', async () => {
        const tx = mockTx();
        const rows = [
          fixtureActor({ id: 'a1', traderId: 'TZ-1' }),
          fixtureActor({ id: 'a2', traderId: 'TZ-2' }),
        ];
        tx.actorAuditLog.createMany = jest.fn().mockResolvedValue({ count: 2 });

        await service.logImport(tx, rows, acting, undefined, [
          [
            {
              kind: 'actor',
              actorId: 'existing-1',
              traderId: 'TZ-EXIST',
              traderName: 'Existing Co',
              matchedOn: ['email'],
            },
          ],
          null,
        ]);

        const data = (tx.actorAuditLog.createMany as jest.Mock).mock.calls[0][0]
          .data as Array<Record<string, unknown>>;
        expect(data[0].duplicateConfirmation).toEqual([
          {
            kind: 'actor',
            actorId: 'existing-1',
            traderId: 'TZ-EXIST',
            traderName: 'Existing Co',
            matchedOn: ['email'],
          },
        ]);
        expect(data[1].duplicateConfirmation).toEqual(Prisma.JsonNull);
      });

      it('writes Prisma.JsonNull for every row when the param is omitted entirely', async () => {
        const tx = mockTx();
        const rows = [fixtureActor({ id: 'a1' })];
        tx.actorAuditLog.createMany = jest.fn().mockResolvedValue({ count: 1 });

        await service.logImport(tx, rows, acting);

        const data = (tx.actorAuditLog.createMany as jest.Mock).mock.calls[0][0]
          .data as Array<Record<string, unknown>>;
        expect(data[0].duplicateConfirmation).toEqual(Prisma.JsonNull);
      });

      it('writes Prisma.JsonNull for a row whose own confirmation array is empty', async () => {
        const tx = mockTx();
        const rows = [fixtureActor({ id: 'a1' })];
        tx.actorAuditLog.createMany = jest.fn().mockResolvedValue({ count: 1 });

        await service.logImport(tx, rows, acting, undefined, [[]]);

        const data = (tx.actorAuditLog.createMany as jest.Mock).mock.calls[0][0]
          .data as Array<Record<string, unknown>>;
        expect(data[0].duplicateConfirmation).toEqual(Prisma.JsonNull);
      });
    });
  });

  // T-2 — additive: two new audit methods for the registration review queue
  // (admin/registration-review-queue). Envelopes pinned by design.md §6.7 /
  // DD-6. No existing describe block above this comment is modified.
  describe('logRegistrationApprove', () => {
    it('writes a REGISTRATION_APPROVE snapshot identical in shape to logCreate (FR-16, design.md §6.7)', async () => {
      const tx = mockTx();
      const actor = fixtureActor();
      const created = {
        id: 'log-approve-1',
        actorId: actor.id,
        traderId: actor.traderId,
        traderName: actor.traderName,
        action: ActorAuditAction.REGISTRATION_APPROVE,
        actingSub: acting.sub,
        actingEmail: acting.email,
        changes: {},
        acknowledged: null,
        createdAt: new Date(),
      };
      tx.actorAuditLog.create = jest.fn().mockResolvedValue(created);

      const result = await service.logRegistrationApprove(
        tx,
        actor,
        acting,
        'REG-2026-0184',
      );

      expect(result).toBe(created);
      expect(tx.actorAuditLog.create).toHaveBeenCalledTimes(1);
      const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
        .data as Record<string, unknown>;

      expect(data).toMatchObject({
        actorId: actor.id,
        traderId: actor.traderId,
        traderName: actor.traderName,
        action: ActorAuditAction.REGISTRATION_APPROVE,
        actingSub: acting.sub,
        actingEmail: acting.email,
      });

      // §6.7: pinned identical in shape to logCreate's full snapshot envelope.
      const changes = data.changes as {
        kind: string;
        values: Record<string, unknown>;
      };
      expect(changes.kind).toBe('snapshot');
      expect(changes.values).toMatchObject({
        traderId: actor.traderId,
        traderName: actor.traderName,
        region: actor.region,
        district: actor.district,
        traderType: actor.traderType,
        sex: actor.sex,
        position: actor.position,
        marketLocation: actor.marketLocation,
        technicalSupport: actor.technicalSupport,
        phone: actor.phone,
        email: actor.email,
        consentStatus: actor.consentStatus,
        registrationSource: actor.registrationSource,
        consentMethod: actor.consentMethod,
        consentReference: actor.consentReference,
        crops: actor.crops,
      });
      // Decimal fields must be strings, matching logCreate's contract.
      expect(changes.values.capacityTons).toBe('1850');
      expect(changes.values.gpsLatitude).toBe('-3.3869');
    });

    it('satisfies isSnapshot-style narrowing so ActorHistoryPanel never falls through to "Details not available"', async () => {
      const tx = mockTx();
      const actor = fixtureActor({
        registrationSource: 'SELF_REGISTERED',
        consentMethod: 'PORTAL_CHECKBOX',
        consentObtainedAt: new Date('2026-08-01T00:00:00Z'),
        consentReference: 'REG-2026-0184',
      });
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({});

      await service.logRegistrationApprove(tx, actor, acting, 'REG-2026-0184');

      const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
        .data as Record<string, unknown>;
      const changes = data.changes as {
        kind?: unknown;
        values?: unknown;
        fields?: unknown;
      };

      // Replica of the frontend `isDiff`/`isSnapshot` narrowing in
      // ActorHistoryPanel.tsx — a correct badge above an empty body is
      // exactly the failure mode §6.7 exists to prevent (KZ-002: presence is
      // not proof, this asserts the actual shape).
      const isDiff =
        typeof changes === 'object' &&
        changes !== null &&
        changes.kind === 'diff' &&
        typeof changes.fields === 'object';
      const isSnapshot =
        typeof changes === 'object' &&
        changes !== null &&
        changes.kind === 'snapshot' &&
        typeof changes.values === 'object';

      expect(isDiff || isSnapshot).toBe(true);
      expect(isSnapshot).toBe(true);
    });

    it('writes inside the caller-supplied tx, never a separate transaction', async () => {
      const tx = mockTx();
      const otherTx = mockTx();
      const actor = fixtureActor();
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({});
      otherTx.actorAuditLog.create = jest.fn();

      await service.logRegistrationApprove(tx, actor, acting, 'REG-2026-0184');

      expect(tx.actorAuditLog.create).toHaveBeenCalledTimes(1);
      expect(otherTx.actorAuditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('logRegistrationReject', () => {
    function fixtureRegistration(
      overrides: Partial<{
        id: string;
        reference: string;
        payload: unknown;
        rejectionReason: string | null;
      }> = {},
    ) {
      return {
        id: 'registration-1',
        reference: 'REG-2026-0184',
        payload: {
          traderName: 'Meru Agro-Processing & Seeds',
          traderType: 'seed_company',
          contactPerson: 'Jane Applicant',
          position: 'Director',
          district: 'Arusha Urban',
          region: 'Arusha',
        },
        rejectionReason: 'Duplicate of an existing registry record',
        ...overrides,
      };
    }

    it('writes a REGISTRATION_REJECT snapshot-shaped envelope over reference, organisation name and reason (design.md §6.7)', async () => {
      const tx = mockTx();
      const registration = fixtureRegistration();
      const created = {
        id: 'log-reject-1',
        actorId: registration.id,
        traderId: registration.reference,
        traderName: 'Meru Agro-Processing & Seeds',
        action: ActorAuditAction.REGISTRATION_REJECT,
        actingSub: acting.sub,
        actingEmail: acting.email,
        changes: {},
        acknowledged: null,
        createdAt: new Date(),
      };
      tx.actorAuditLog.create = jest.fn().mockResolvedValue(created);

      const result = await service.logRegistrationReject(
        tx,
        registration as never,
        acting,
      );

      expect(result).toBe(created);
      const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
        .data as Record<string, unknown>;

      expect(data.action).toBe(ActorAuditAction.REGISTRATION_REJECT);
      expect(data.actingSub).toBe(acting.sub);
      expect(data.actingEmail).toBe(acting.email);

      const changes = data.changes as {
        kind: string;
        values: Record<string, unknown>;
      };
      expect(changes.kind).toBe('snapshot');
      expect(changes.values).toMatchObject({
        reference: registration.reference,
        traderName: 'Meru Agro-Processing & Seeds',
        reason: registration.rejectionReason,
      });
    });

    it('writes actorId = the registration id, traderId = the reference, traderName = the submitted organisation name — never a real actor id (carried-forward FR-16 clause: no REGISTRATION_REJECT row may appear in any actor history)', async () => {
      const tx = mockTx();
      const registration = fixtureRegistration({
        id: 'registration-42',
        reference: 'REG-2026-0999',
      });
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({});

      await service.logRegistrationReject(tx, registration as never, acting);

      const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
        .data as Record<string, unknown>;

      // ActorAuditLog.actorId is deliberately FK-less (§6.7); this row's
      // actorId is a Registration id, never an Actor id, so the
      // actor-history read path — which queries by actorId against a real
      // actor — structurally can never match this row. Persistence-level
      // proof of the gap the UI layer cannot evaluate (tasks.md T-15's
      // clause sweep, carried forward to T-2).
      expect(data.actorId).toBe('registration-42');
      expect(data.actorId).not.toBe(registration.reference);
      expect(data.traderId).toBe('REG-2026-0999');
      expect(data.traderName).toBe('Meru Agro-Processing & Seeds');
    });

    it('falls back to null when the registration carries no rejection reason yet', async () => {
      const tx = mockTx();
      const registration = fixtureRegistration({ rejectionReason: null });
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({});

      await service.logRegistrationReject(tx, registration as never, acting);

      const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
        .data as Record<string, unknown>;
      const changes = data.changes as { values: Record<string, unknown> };
      expect(changes.values.reason).toBeNull();
    });

    it('is snapshot-shaped, satisfying isSnapshot narrowing even though there is no actor to snapshot', async () => {
      const tx = mockTx();
      const registration = fixtureRegistration();
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({});

      await service.logRegistrationReject(tx, registration as never, acting);

      const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0]
        .data as Record<string, unknown>;
      const changes = data.changes as { kind?: unknown; values?: unknown };
      const isSnapshot =
        typeof changes === 'object' &&
        changes !== null &&
        changes.kind === 'snapshot' &&
        typeof changes.values === 'object';
      expect(isSnapshot).toBe(true);
    });

    it('writes inside the caller-supplied tx', async () => {
      const tx = mockTx();
      const otherTx = mockTx();
      const registration = fixtureRegistration();
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({});
      otherTx.actorAuditLog.create = jest.fn();

      await service.logRegistrationReject(tx, registration as never, acting);

      expect(tx.actorAuditLog.create).toHaveBeenCalledTimes(1);
      expect(otherTx.actorAuditLog.create).not.toHaveBeenCalled();
    });
  });

  // actors/consent-intake/consent-request-email T-4 (rework, attempt 2,
  // Reviewer B issue 2) — `logConsentRequested`'s row shape was previously
  // asserted nowhere: neither here, nor in `consent-requests.service.spec.ts`
  // (which only checks `action`/`actorId`/`actingSub` through the e2e/unit
  // dispatch tests), nor in `admin-consent-requests.e2e.spec.ts` (same
  // partial shape). This block pins every field the method writes.
  describe('logConsentRequested', () => {
    const request = {
      id: 'consent-req-1',
      actorId: 'actor-9',
      // Deliberately DIFFERENT from `acting`/`fixtureActor()`'s own values —
      // this is the whole point of the method (FR-13, design.md §5.2 step
      // 2.6): the row's identity and trader fields come from the
      // CONSENT REQUEST's own snapshot (taken at enqueue), never from the
      // actor table or from whichever admin happens to be driving dispatch.
      traderId: 'TZ-SEED-0099',
      traderName: 'Snapshot Trader Name At Enqueue',
      recipientEmail: 'snapshot-recipient@example.com',
      requestedBySub: 'requesting-admin-sub',
      requestedByEmail: 'requesting-admin@example.com',
    };

    it('writes actorId/traderId/traderName from the REQUEST row (not the actor), action CONSENT_REQUESTED', async () => {
      const tx = mockTx();
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({});

      await service.logConsentRequested(tx, request);

      expect(tx.actorAuditLog.create).toHaveBeenCalledTimes(1);
      const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0].data as Record<string, unknown>;

      expect(data).toMatchObject({
        actorId: request.actorId,
        traderId: request.traderId,
        traderName: request.traderName,
        action: ActorAuditAction.CONSENT_REQUESTED,
      });
    });

    it('credits the REQUESTING admin (requestedBySub/requestedByEmail), never a different "acting" identity', async () => {
      const tx = mockTx();
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({});

      await service.logConsentRequested(tx, request);

      const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0].data as Record<string, unknown>;
      expect(data.actingSub).toBe(request.requestedBySub);
      expect(data.actingEmail).toBe(request.requestedByEmail);
      // Falsifier-adjacent sanity: this must NOT be the generic fixture's
      // `acting` identity, proving the method reads off the row, not a
      // caller-supplied acting admin.
      expect(data.actingSub).not.toBe(acting.sub);
    });

    it('falls back to null actingEmail when the request row has none', async () => {
      const tx = mockTx();
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({});

      await service.logConsentRequested(tx, { ...request, requestedByEmail: null });

      const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0].data as Record<string, unknown>;
      expect(data.actingEmail).toBeNull();
    });

    it('`changes` is EXACTLY { requestId, recipientEmail } — a snapshot envelope, no token, no extra fields', async () => {
      const tx = mockTx();
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({});

      await service.logConsentRequested(tx, request);

      const data = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0].data as Record<string, unknown>;
      const changes = data.changes as { kind: string; values: Record<string, unknown> };

      expect(changes.kind).toBe('snapshot');
      expect(changes.values).toEqual({
        requestId: request.id,
        recipientEmail: request.recipientEmail,
      });
      expect(Object.keys(changes.values)).toEqual(['requestId', 'recipientEmail']);
      expect(JSON.stringify(changes)).not.toMatch(/token/i);
    });

    it('writes inside the caller-supplied tx, never a separate transaction', async () => {
      const tx = mockTx();
      const otherTx = mockTx();
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({});
      otherTx.actorAuditLog.create = jest.fn();

      await service.logConsentRequested(tx, request);

      expect(tx.actorAuditLog.create).toHaveBeenCalledTimes(1);
      expect(otherTx.actorAuditLog.create).not.toHaveBeenCalled();
    });
  });

  // actors/consent-intake/consent-request-email T-5 — pins every field
  // `logConsentResponded` writes (the sentinel author, the diff-over-consent-
  // fields envelope, the request id), the same way `logConsentRequested` is
  // pinned above.
  describe('logConsentResponded', () => {
    const request = {
      id: 'consent-req-7',
      actorId: 'actor-9',
      traderId: 'TZ-SEED-0099',
      traderName: 'Snapshot Trader Name At Enqueue',
    };
    const before = {
      consentStatus: 'UNKNOWN',
      consentMethod: 'NOT_RECORDED',
      consentObtainedAt: null,
      consentReference: null,
    };
    const obtainedAt = new Date('2026-10-06T10:00:00.000Z');
    const acceptedAfter = {
      consentStatus: 'GRANTED',
      consentMethod: 'EMAIL_LINK',
      consentObtainedAt: obtainedAt,
      consentReference: 'consent-req-7',
    };

    async function run(after: typeof acceptedAfter | typeof before) {
      const tx = mockTx();
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({});
      await service.logConsentResponded(tx, { request, before, after });
      expect(tx.actorAuditLog.create).toHaveBeenCalledTimes(1);
      return (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0].data as Record<string, unknown>;
    }

    it('is authored by the SENTINEL consent-link with a null email, action CONSENT_RESPONDED', async () => {
      const data = await run(acceptedAfter);
      expect(data.action).toBe(ActorAuditAction.CONSENT_RESPONDED);
      expect(data.actingSub).toBe('consent-link');
      expect(data.actingEmail).toBeNull();
    });

    it('takes actorId/traderId/traderName from the REQUEST snapshot', async () => {
      const data = await run(acceptedAfter);
      expect(data).toMatchObject({
        actorId: request.actorId,
        traderId: request.traderId,
        traderName: request.traderName,
      });
    });

    it('an accept diffs all four consent fields (ISO date) and carries the request id', async () => {
      const data = await run(acceptedAfter);
      expect(data.changes).toEqual({
        kind: 'diff',
        requestId: 'consent-req-7',
        fields: {
          consentStatus: { from: 'UNKNOWN', to: 'GRANTED' },
          consentMethod: { from: 'NOT_RECORDED', to: 'EMAIL_LINK' },
          consentObtainedAt: { from: null, to: '2026-10-06T10:00:00.000Z' },
          consentReference: { from: null, to: 'consent-req-7' },
        },
      });
    });

    it('a decline names consentStatus ALONE (method, date and reference unchanged)', async () => {
      const data = await run({ ...before, consentStatus: 'DENIED' });
      const changes = data.changes as { fields: Record<string, unknown> };
      expect(Object.keys(changes.fields)).toEqual(['consentStatus']);
    });

    it('never carries a respondent field, an address or a token', async () => {
      const data = await run(acceptedAfter);
      expect(JSON.stringify(data)).not.toMatch(/respondent|token|email@|userAgent|ip"/i);
    });

    it('writes inside the caller-supplied tx only', async () => {
      const tx = mockTx();
      const otherTx = mockTx();
      tx.actorAuditLog.create = jest.fn().mockResolvedValue({});
      otherTx.actorAuditLog.create = jest.fn();
      await service.logConsentResponded(tx, { request, before, after: acceptedAfter });
      expect(otherTx.actorAuditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('toAuditEntry', () => {
    it('passes changes through and formats createdAt as ISO string', () => {
      const createdAt = new Date('2026-07-09T12:34:56Z');
      const log = {
        id: 'entry-1',
        actorId: 'actor-1',
        traderId: 'TZ-001',
        traderName: 'Test Trader',
        action: ActorAuditAction.UPDATE,
        actingSub: 'sub-1',
        actingEmail: 'admin@example.com',
        changes: { kind: 'diff', fields: { region: { from: 'A', to: 'B' } } },
        acknowledged: true,
        createdAt,
      } as never;

      const entry = toAuditEntry(log);

      expect(entry).toEqual({
        id: 'entry-1',
        actorId: 'actor-1',
        traderId: 'TZ-001',
        traderName: 'Test Trader',
        action: ActorAuditAction.UPDATE,
        actingSub: 'sub-1',
        actingEmail: 'admin@example.com',
        changes: { kind: 'diff', fields: { region: { from: 'A', to: 'B' } } },
        acknowledged: true,
        createdAt: '2026-07-09T12:34:56.000Z',
      });
    });

    it('handles null actingEmail and acknowledged', () => {
      const log = {
        id: 'entry-2',
        actorId: 'actor-2',
        traderId: 'TZ-002',
        traderName: 'Another Trader',
        action: ActorAuditAction.CREATE,
        actingSub: 'sub-2',
        actingEmail: null,
        changes: { kind: 'snapshot', values: {} },
        acknowledged: null,
        createdAt: new Date('2026-07-09T00:00:00Z'),
      } as never;

      const entry = toAuditEntry(log);

      expect(entry.actingEmail).toBeNull();
      expect(entry.acknowledged).toBeNull();
    });
  });
});
