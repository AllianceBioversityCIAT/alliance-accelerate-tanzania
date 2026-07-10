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
    sex: 'M',
    position: 'Director',
    marketLocation: 'Arusha Central Market',
    capacityTons: 1850,
    technicalSupport: 'Needs cold storage',
    phone: '+255700000000',
    email: 'director@example.com',
    gpsLatitude: -3.3869,
    gpsLongitude: 36.683,
    gpsAltitude: 1400,
    gpsAccuracy: 5,
    consentStatus: 'UNKNOWN',
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
