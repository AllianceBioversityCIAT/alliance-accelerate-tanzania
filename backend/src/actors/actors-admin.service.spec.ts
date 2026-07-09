import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConsentStatus, Prisma } from '@prisma/client';
import { ActorsAdminService } from './actors-admin.service';
import { ActorAuditService } from './actor-audit.service';
import { ActingAdminResolver } from './acting-admin.resolver';
import { PII_ALLOWLIST } from '../common/pii-consent.policy';
import { AdminActorCreateDto } from './dto/admin-actor-create.dto';
import { AdminActorUpdateDto } from './dto/admin-actor-update.dto';
import { ActorHistoryQueryDto } from './dto/actor-history-query.dto';

/**
 * T-5 — ActorsAdminService unit tests with a MOCKED PrismaService (no DB).
 *
 * These assert the Admin-only CRUD + audit contract (FR-1..FR-7, NFR-4):
 *   - adminList applies optional filters WITHOUT pinning consent to GRANTED;
 *   - create / update / remove / history behave correctly and write audit rows
 *     inside the same transaction;
 *   - GRANTED transitions require acknowledgement;
 *   - duplicate traderId maps to 409;
 *   - bulk consent/delete are retrofitted with audit rows while keeping the
 *     same external BulkResult shape.
 *
 * Design refs: docs/specs/admin/actor-crud-audit/design.md §4, §10.
 */

const ACTING_SUB = 'admin-sub';
const ACTING_EMAIL = 'admin@example.com';

/**
 * A fully-populated Prisma-shaped Actor row WITH PII set, used to prove the
 * Admin serializer exposes it. `crops` carries the included `crop` relation the
 * serializer reads. Fields mirror the schema columns (Decimals as numbers).
 */
function fixtureActor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'actor-1',
    traderId: 'TZ-SEED-0001',
    traderName: 'Meru Agro-Processing & Seeds',
    region: 'Arusha',
    district: 'Arusha Urban',
    traderType: 'seed_company',
    // PII — populated on purpose; MUST appear in Admin output.
    sex: 'M',
    position: 'Director',
    marketLocation: 'Arusha Central Market',
    phone: '+255700000000',
    email: 'director@example.com',
    technicalSupport: 'Needs cold storage',
    capacityTons: 1850,
    gpsLatitude: -3.3869,
    gpsLongitude: 36.683,
    gpsAltitude: 1400,
    gpsAccuracy: 5,
    consentStatus: ConsentStatus.GRANTED,
    crops: [{ crop: { name: 'sorghum' } }, { crop: { name: 'common_bean' } }],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Raw Actor row shaped like a Prisma `create` result (no crop relation yet). */
function fixtureCreatedActor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'actor-new',
    traderId: 'TZ-SEED-0002',
    traderName: 'New Actor',
    region: 'Arusha',
    district: null,
    traderType: 'seed_company',
    sex: null,
    position: null,
    marketLocation: null,
    phone: null,
    email: null,
    technicalSupport: null,
    capacityTons: null,
    gpsLatitude: null,
    gpsLongitude: null,
    gpsAltitude: null,
    gpsAccuracy: null,
    consentStatus: ConsentStatus.UNKNOWN,
    createdAt: new Date('2026-01-02T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

/** Mocked Prisma client shape used by the service under test. */
interface MockPrisma {
  actor: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  cropsOnActors: {
    createMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  crop: {
    findMany: jest.Mock;
  };
  actorAuditLog: {
    create: jest.Mock;
    createMany: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  $transaction: jest.Mock;
}

describe('ActorsAdminService (mocked Prisma)', () => {
  let service: ActorsAdminService;
  let actorAuditService: ActorAuditService;
  let actingAdminResolver: ActingAdminResolver;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = {
      actor: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      cropsOnActors: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      crop: {
        findMany: jest.fn(),
      },
      actorAuditLog: {
        create: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      // Pass the same mocked prisma object back into the callback so tx.*
      // resolves to the same in-memory delegates.
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };

    actorAuditService = new ActorAuditService();
    actingAdminResolver = {
      resolve: jest.fn().mockResolvedValue(ACTING_EMAIL),
      resetCache: jest.fn(),
    } as unknown as ActingAdminResolver;

    service = new ActorsAdminService(
      prisma as unknown as never,
      actorAuditService,
      actingAdminResolver,
    );
  });

  describe('adminList', () => {
    it('applies optional filters (region, traderType, consentStatus) without pinning GRANTED', async () => {
      prisma.actor.findMany.mockResolvedValue([]);
      prisma.actor.count.mockResolvedValue(0);

      await service.adminList({
        region: 'Arusha',
        traderType: 'seed_company',
        consentStatus: 'DENIED',
      } as never);

      const where = prisma.actor.findMany.mock.calls[0][0].where;
      expect(where).toEqual({
        region: 'Arusha',
        traderType: 'seed_company',
        consentStatus: ConsentStatus.DENIED,
      });
      // The Admin list must NOT pin consent to GRANTED (FR-1).
      expect(where.consentStatus).not.toBe(ConsentStatus.GRANTED);
    });

    it('omits absent filters from the WHERE', async () => {
      prisma.actor.findMany.mockResolvedValue([]);
      prisma.actor.count.mockResolvedValue(0);

      await service.adminList({} as never);

      expect(prisma.actor.findMany.mock.calls[0][0].where).toEqual({});
    });

    it('returns paginated envelope { data, page, pageSize, total }', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActor()]);
      prisma.actor.count.mockResolvedValue(42);

      const res = await service.adminList({
        page: 3,
        pageSize: 5,
      } as never);

      const args = prisma.actor.findMany.mock.calls[0][0];
      expect(args.skip).toBe(10); // (3 - 1) * 5
      expect(args.take).toBe(5);
      expect(res).toMatchObject({
        data: expect.any(Array),
        page: 3,
        pageSize: 5,
        total: 42,
      });
    });

    it('applies default page/pageSize when omitted', async () => {
      prisma.actor.findMany.mockResolvedValue([]);
      prisma.actor.count.mockResolvedValue(0);

      const res = await service.adminList({} as never);

      const args = prisma.actor.findMany.mock.calls[0][0];
      expect(args.skip).toBe(0); // page 1
      expect(args.take).toBe(20); // default pageSize
      expect(res).toMatchObject({ page: 1, pageSize: 20 });
    });

    it('caps pageSize at the max', async () => {
      prisma.actor.findMany.mockResolvedValue([]);
      prisma.actor.count.mockResolvedValue(0);

      const res = await service.adminList({ pageSize: 9999 } as never);

      expect(prisma.actor.findMany.mock.calls[0][0].take).toBe(100);
      expect(res.pageSize).toBe(100);
    });

    it('maps rows through toAdminActor so PII + consentStatus are present', async () => {
      prisma.actor.findMany.mockResolvedValue([
        fixtureActor({ consentStatus: ConsentStatus.DENIED }),
      ]);
      prisma.actor.count.mockResolvedValue(1);

      const res = await service.adminList({} as never);

      expect(res.data).toHaveLength(1);
      const item = res.data[0];
      for (const key of PII_ALLOWLIST) {
        expect(item).toHaveProperty(key);
      }
      expect(item).toMatchObject({
        id: 'actor-1',
        traderId: 'TZ-SEED-0001',
        traderName: 'Meru Agro-Processing & Seeds',
        consentStatus: 'DENIED',
        gpsAltitude: 1400,
        gpsAccuracy: 5,
        crops: ['sorghum', 'common_bean'],
      });
    });
  });

  describe('create', () => {
    it('creates actor with scalar fields and crop links, writes audit, returns AdminActor', async () => {
      const created = fixtureCreatedActor({ id: 'actor-new' });
      const full = fixtureActor({
        id: 'actor-new',
        traderId: 'TZ-SEED-0002',
        traderName: 'New Actor',
        crops: [{ crop: { name: 'sorghum' } }],
      });

      prisma.actor.create.mockResolvedValue(created);
      prisma.crop.findMany.mockResolvedValue([{ id: 'crop-1', name: 'sorghum' }]);
      prisma.cropsOnActors.createMany.mockResolvedValue({ count: 1 });
      prisma.actor.findUnique.mockResolvedValue(full);
      prisma.actorAuditLog.create.mockResolvedValue({ id: 'audit-1' });

      const dto: AdminActorCreateDto = {
        traderId: 'TZ-SEED-0002',
        traderName: 'New Actor',
        region: 'Arusha',
        traderType: 'seed_company',
        crops: ['sorghum'],
      } as AdminActorCreateDto;

      const res = await service.create(dto, ACTING_SUB);

      expect(prisma.actor.create).toHaveBeenCalledWith({
        data: {
          traderId: 'TZ-SEED-0002',
          traderName: 'New Actor',
          region: 'Arusha',
          traderType: 'seed_company',
        },
      });
      expect(prisma.cropsOnActors.createMany).toHaveBeenCalledWith({
        data: [{ actorId: 'actor-new', cropId: 'crop-1' }],
      });
      expect(prisma.actor.findUnique).toHaveBeenCalledWith({
        where: { id: 'actor-new' },
        include: { crops: { include: { crop: true } } },
      });

      const auditData = prisma.actorAuditLog.create.mock.calls[0][0].data;
      expect(auditData.action).toBe('CREATE');
      expect(auditData.actorId).toBe('actor-new');
      expect(auditData.actingSub).toBe(ACTING_SUB);
      expect(auditData.actingEmail).toBe(ACTING_EMAIL);
      expect(auditData.changes.kind).toBe('snapshot');
      expect(auditData.changes.values.traderId).toBe('TZ-SEED-0002');
      expect(auditData.changes.values.crops).toEqual(['sorghum']);

      expect(res.id).toBe('actor-new');
      expect(res.crops).toEqual(['sorghum']);
    });

    it('creates actor without crops when dto.crops is omitted', async () => {
      const created = fixtureCreatedActor({ id: 'actor-no-crops' });
      const full = fixtureActor({
        id: 'actor-no-crops',
        traderId: 'TZ-SEED-0003',
        traderName: 'No Crops Actor',
        crops: [],
      });

      prisma.actor.create.mockResolvedValue(created);
      prisma.actor.findUnique.mockResolvedValue(full);
      prisma.actorAuditLog.create.mockResolvedValue({ id: 'audit-1' });

      const dto: AdminActorCreateDto = {
        traderId: 'TZ-SEED-0003',
        traderName: 'No Crops Actor',
        region: 'Arusha',
        traderType: 'seed_company',
      } as AdminActorCreateDto;

      await service.create(dto, ACTING_SUB);

      expect(prisma.cropsOnActors.createMany).not.toHaveBeenCalled();
      expect(prisma.crop.findMany).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when consentStatus === GRANTED and !acknowledged', async () => {
      const dto: AdminActorCreateDto = {
        traderId: 'TZ-SEED-0002',
        traderName: 'New Actor',
        region: 'Arusha',
        traderType: 'seed_company',
        consentStatus: ConsentStatus.GRANTED,
      } as AdminActorCreateDto;

      await expect(service.create(dto, ACTING_SUB)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException 409 on duplicate traderId (P2002)', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`traderId`)',
        {
          code: 'P2002',
          clientVersion: '1.0.0',
          meta: { target: ['traderId'] },
        },
      );
      prisma.actor.create.mockRejectedValue(error);

      const dto: AdminActorCreateDto = {
        traderId: 'TZ-SEED-0001',
        traderName: 'Duplicate',
        region: 'Arusha',
        traderType: 'seed_company',
      } as AdminActorCreateDto;

      await expect(service.create(dto, ACTING_SUB)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('does not write audit when actor.create fails (rollback leaves no audit row)', async () => {
      prisma.actor.create.mockRejectedValue(new Error('DB unavailable'));

      const dto: AdminActorCreateDto = {
        traderId: 'TZ-SEED-0002',
        traderName: 'New Actor',
        region: 'Arusha',
        traderType: 'seed_company',
      } as AdminActorCreateDto;

      await expect(service.create(dto, ACTING_SUB)).rejects.toThrow('DB unavailable');
      expect(prisma.actorAuditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('returns AdminActor projection for an existing actor', async () => {
      prisma.actor.findUnique.mockResolvedValue(fixtureActor());

      const res = await service.getById('actor-1');

      expect(prisma.actor.findUnique).toHaveBeenCalledWith({
        where: { id: 'actor-1' },
        include: { crops: { include: { crop: true } } },
      });
      expect(res.traderId).toBe('TZ-SEED-0001');
      expect(res.crops).toEqual(['sorghum', 'common_bean']);
    });

    it('throws NotFoundException for an unknown id', async () => {
      prisma.actor.findUnique.mockResolvedValue(null);

      await expect(service.getById('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('applies only submitted scalar fields and records a diff audit', async () => {
      const before = fixtureActor({
        traderName: 'Old Name',
        phone: '+255700000000',
      });
      const after = fixtureActor({
        traderName: 'New Name',
        phone: '+255700000000',
      });

      prisma.actor.findUnique
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce(after);
      prisma.actor.update.mockResolvedValue(after);
      prisma.actorAuditLog.create.mockResolvedValue({ id: 'audit-1' });

      const dto: AdminActorUpdateDto = {
        traderName: 'New Name',
      } as AdminActorUpdateDto;

      const res = await service.update('actor-1', dto, ACTING_SUB);

      expect(prisma.actor.update).toHaveBeenCalledWith({
        where: { id: 'actor-1' },
        data: { traderName: 'New Name' },
      });

      const auditData = prisma.actorAuditLog.create.mock.calls[0][0].data;
      expect(auditData.action).toBe('UPDATE');
      expect(auditData.changes.kind).toBe('diff');
      expect(auditData.changes.fields).toEqual({
        traderName: { from: 'Old Name', to: 'New Name' },
      });

      expect(res.traderName).toBe('New Name');
    });

    it('replaces crop links when dto.crops is provided', async () => {
      const before = fixtureActor({
        crops: [{ crop: { name: 'sorghum' } }],
      });
      const after = fixtureActor({
        crops: [{ crop: { name: 'groundnut' } }],
      });

      prisma.actor.findUnique
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce(after);
      prisma.actor.update.mockResolvedValue(after);
      prisma.crop.findMany.mockResolvedValue([
        { id: 'crop-3', name: 'groundnut' },
      ]);
      prisma.cropsOnActors.createMany.mockResolvedValue({ count: 1 });
      prisma.actorAuditLog.create.mockResolvedValue({ id: 'audit-1' });

      const dto: AdminActorUpdateDto = {
        crops: ['groundnut'],
      } as AdminActorUpdateDto;

      await service.update('actor-1', dto, ACTING_SUB);

      expect(prisma.cropsOnActors.deleteMany).toHaveBeenCalledWith({
        where: { actorId: 'actor-1' },
      });
      expect(prisma.cropsOnActors.createMany).toHaveBeenCalledWith({
        data: [{ actorId: 'actor-1', cropId: 'crop-3' }],
      });

      const auditData = prisma.actorAuditLog.create.mock.calls[0][0].data;
      expect(auditData.changes.fields.crops).toEqual({
        from: ['sorghum'],
        to: ['groundnut'],
      });
    });

    it('removes all crop links when dto.crops is an empty array', async () => {
      const before = fixtureActor({
        crops: [{ crop: { name: 'sorghum' } }],
      });
      const after = fixtureActor({ crops: [] });

      prisma.actor.findUnique
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce(after);
      prisma.actor.update.mockResolvedValue(after);
      prisma.actorAuditLog.create.mockResolvedValue({ id: 'audit-1' });

      const dto: AdminActorUpdateDto = { crops: [] } as AdminActorUpdateDto;

      await service.update('actor-1', dto, ACTING_SUB);

      expect(prisma.cropsOnActors.deleteMany).toHaveBeenCalledWith({
        where: { actorId: 'actor-1' },
      });
      expect(prisma.cropsOnActors.createMany).not.toHaveBeenCalled();

      const auditData = prisma.actorAuditLog.create.mock.calls[0][0].data;
      expect(auditData.changes.fields.crops).toEqual({
        from: ['sorghum'],
        to: [],
      });
    });

    it('throws BadRequestException when granting consent without acknowledgement', async () => {
      const before = fixtureActor({ consentStatus: ConsentStatus.UNKNOWN });
      prisma.actor.findUnique.mockResolvedValue(before);

      const dto: AdminActorUpdateDto = {
        consentStatus: ConsentStatus.GRANTED,
      } as AdminActorUpdateDto;

      await expect(
        service.update('actor-1', dto, ACTING_SUB),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.actor.update).not.toHaveBeenCalled();
      expect(prisma.actorAuditLog.create).not.toHaveBeenCalled();
    });

    it('allows GRANTED transition when acknowledged is true', async () => {
      const before = fixtureActor({ consentStatus: ConsentStatus.UNKNOWN });
      const after = fixtureActor({ consentStatus: ConsentStatus.GRANTED });

      prisma.actor.findUnique
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce(after);
      prisma.actor.update.mockResolvedValue(after);
      prisma.actorAuditLog.create.mockResolvedValue({ id: 'audit-1' });

      const dto: AdminActorUpdateDto = {
        consentStatus: ConsentStatus.GRANTED,
        acknowledged: true,
      } as AdminActorUpdateDto;

      await service.update('actor-1', dto, ACTING_SUB);

      const auditData = prisma.actorAuditLog.create.mock.calls[0][0].data;
      expect(auditData.acknowledged).toBe(true);
      expect(auditData.changes.fields.consentStatus).toEqual({
        from: 'UNKNOWN',
        to: 'GRANTED',
      });
    });

    it('throws NotFoundException when actor id does not exist', async () => {
      prisma.actor.findUnique.mockResolvedValue(null);

      const dto: AdminActorUpdateDto = {
        traderName: 'New Name',
      } as AdminActorUpdateDto;

      await expect(
        service.update('missing', dto, ACTING_SUB),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException 409 when changing traderId to a duplicate', async () => {
      const before = fixtureActor();
      prisma.actor.findUnique.mockResolvedValue(before);

      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`traderId`)',
        {
          code: 'P2002',
          clientVersion: '1.0.0',
          meta: { target: ['traderId'] },
        },
      );
      prisma.actor.update.mockRejectedValue(error);

      const dto: AdminActorUpdateDto = {
        traderId: 'TZ-SEED-9999',
      } as AdminActorUpdateDto;

      await expect(
        service.update('actor-1', dto, ACTING_SUB),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('writes no audit row for a no-op update (empty diff)', async () => {
      const before = fixtureActor();
      const after = fixtureActor();

      prisma.actor.findUnique
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce(after);
      prisma.actor.update.mockResolvedValue(after);

      const dto: AdminActorUpdateDto = {} as AdminActorUpdateDto;

      await service.update('actor-1', dto, ACTING_SUB);

      expect(prisma.actor.update).not.toHaveBeenCalled();
      expect(prisma.actorAuditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('writes DELETE audit then deletes actor and returns { deleted, id }', async () => {
      const actor = fixtureActor();
      prisma.actor.findUnique.mockResolvedValue(actor);
      prisma.actor.delete.mockResolvedValue(actor);
      prisma.actorAuditLog.create.mockResolvedValue({ id: 'audit-delete' });

      const res = await service.remove('actor-1', ACTING_SUB);

      expect(res).toEqual({ deleted: true, id: 'actor-1' });
      expect(prisma.actor.delete).toHaveBeenCalledWith({
        where: { id: 'actor-1' },
      });

      const auditData = prisma.actorAuditLog.create.mock.calls[0][0].data;
      expect(auditData.action).toBe('DELETE');
      expect(auditData.changes.kind).toBe('snapshot');
      expect(auditData.changes.values.traderId).toBe('TZ-SEED-0001');
    });

    it('throws NotFoundException when actor id does not exist', async () => {
      prisma.actor.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing', ACTING_SUB)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.actor.delete).not.toHaveBeenCalled();
      expect(prisma.actorAuditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('history', () => {
    it('returns paginated audit entries ordered newest-first', async () => {
      const entries = [
        {
          id: 'audit-2',
          actorId: 'actor-1',
          traderId: 'TZ-SEED-0001',
          traderName: 'Meru Agro',
          action: 'UPDATE',
          actingSub: ACTING_SUB,
          actingEmail: ACTING_EMAIL,
          changes: { kind: 'diff', fields: {} },
          acknowledged: null,
          createdAt: new Date('2026-01-02T00:00:00Z'),
        },
        {
          id: 'audit-1',
          actorId: 'actor-1',
          traderId: 'TZ-SEED-0001',
          traderName: 'Meru Agro',
          action: 'CREATE',
          actingSub: ACTING_SUB,
          actingEmail: ACTING_EMAIL,
          changes: { kind: 'snapshot', values: {} },
          acknowledged: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      ];
      prisma.actorAuditLog.findMany.mockResolvedValue(entries);
      prisma.actorAuditLog.count.mockResolvedValue(2);

      const q: ActorHistoryQueryDto = { page: 1, pageSize: 10 };
      const res = await service.history('actor-1', q);

      expect(prisma.actorAuditLog.findMany).toHaveBeenCalledWith({
        where: { actorId: 'actor-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 10,
      });
      expect(res.data).toHaveLength(2);
      expect(res.data[0].id).toBe('audit-2');
      expect(res.data[1].id).toBe('audit-1');
      expect(res.total).toBe(2);
      expect(res.data[0].createdAt).toBe('2026-01-02T00:00:00.000Z');
    });

    it('does not check actor existence and returns empty envelope for unknown id', async () => {
      prisma.actorAuditLog.findMany.mockResolvedValue([]);
      prisma.actorAuditLog.count.mockResolvedValue(0);

      const res = await service.history('deleted-actor', { page: 1 });

      expect(prisma.actor.findUnique).not.toHaveBeenCalled();
      expect(res).toEqual({ data: [], page: 1, pageSize: 20, total: 0 });
    });

    it('caps history pageSize at 100', async () => {
      prisma.actorAuditLog.findMany.mockResolvedValue([]);
      prisma.actorAuditLog.count.mockResolvedValue(0);

      await service.history('actor-1', { pageSize: 500 } as ActorHistoryQueryDto);

      expect(prisma.actorAuditLog.findMany.mock.calls[0][0].take).toBe(100);
    });
  });

  describe('bulkSetConsent', () => {
    it('flips status to GRANTED, writes audit rows, and returns unchanged BulkResult', async () => {
      const existing = [
        fixtureActor({ id: 'actor-1', consentStatus: ConsentStatus.UNKNOWN }),
        fixtureActor({ id: 'actor-2', consentStatus: ConsentStatus.DENIED }),
      ];
      prisma.actor.findMany.mockResolvedValue(existing);
      prisma.actor.updateMany.mockResolvedValue({ count: 2 });
      prisma.actorAuditLog.createMany.mockResolvedValue({ count: 2 });

      const res = await service.bulkSetConsent(
        ['actor-1', 'actor-2'],
        'GRANTED',
        ACTING_SUB,
        true,
      );

      expect(res).toEqual({ requested: 2, applied: 2, notFound: [] });
      expect(prisma.actor.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['actor-1', 'actor-2'] } },
        data: { consentStatus: ConsentStatus.GRANTED },
      });

      const auditData = prisma.actorAuditLog.createMany.mock.calls[0][0].data;
      expect(auditData).toHaveLength(2);
      expect(auditData[0].action).toBe('BULK_CONSENT');
      expect(auditData[0].acknowledged).toBe(true);
      expect(auditData[0].changes.fields.consentStatus).toEqual({
        from: 'UNKNOWN',
        to: 'GRANTED',
      });
      expect(auditData[1].changes.fields.consentStatus).toEqual({
        from: 'DENIED',
        to: 'GRANTED',
      });
    });

    it('skips audit rows for actors already at the target status', async () => {
      const existing = [
        fixtureActor({ id: 'actor-1', consentStatus: ConsentStatus.GRANTED }),
        fixtureActor({ id: 'actor-2', consentStatus: ConsentStatus.DENIED }),
      ];
      prisma.actor.findMany.mockResolvedValue(existing);
      prisma.actor.updateMany.mockResolvedValue({ count: 2 });
      prisma.actorAuditLog.createMany.mockResolvedValue({ count: 1 });

      const res = await service.bulkSetConsent(
        ['actor-1', 'actor-2'],
        'GRANTED',
        ACTING_SUB,
        true,
      );

      expect(res).toEqual({ requested: 2, applied: 2, notFound: [] });
      const auditData = prisma.actorAuditLog.createMany.mock.calls[0][0].data;
      expect(auditData).toHaveLength(1);
      expect(auditData[0].actorId).toBe('actor-2');
    });

    it('flips status to DENIED and returns { requested, applied, notFound }', async () => {
      prisma.actor.findMany.mockResolvedValue([
        fixtureActor({ id: 'actor-1' }),
        fixtureActor({ id: 'actor-2' }),
      ]);
      prisma.actor.updateMany.mockResolvedValue({ count: 2 });
      prisma.actorAuditLog.createMany.mockResolvedValue({ count: 2 });

      const res = await service.bulkSetConsent(
        ['actor-1', 'actor-2'],
        'DENIED',
        ACTING_SUB,
      );

      expect(res).toEqual({ requested: 2, applied: 2, notFound: [] });
      expect(prisma.actor.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['actor-1', 'actor-2'] } },
        data: { consentStatus: ConsentStatus.DENIED },
      });
    });

    it('reports notFound ids correctly', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActor({ id: 'actor-1' })]);
      prisma.actor.updateMany.mockResolvedValue({ count: 1 });
      prisma.actorAuditLog.createMany.mockResolvedValue({ count: 1 });

      const res = await service.bulkSetConsent(
        ['actor-1', 'missing-1', 'missing-2'],
        'DENIED',
        ACTING_SUB,
      );

      expect(res).toEqual({
        requested: 3,
        applied: 1,
        notFound: ['missing-1', 'missing-2'],
      });
      expect(prisma.actor.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['actor-1'] } },
        data: { consentStatus: ConsentStatus.DENIED },
      });
    });

    it('throws BadRequestException when status === GRANTED and !acknowledged', async () => {
      await expect(
        service.bulkSetConsent(['actor-1'], 'GRANTED', ACTING_SUB),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.actor.findMany).not.toHaveBeenCalled();
      expect(prisma.actor.updateMany).not.toHaveBeenCalled();
    });

    it('does not require acknowledgement for DENIED (lock)', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActor({ id: 'actor-1' })]);
      prisma.actor.updateMany.mockResolvedValue({ count: 1 });
      prisma.actorAuditLog.createMany.mockResolvedValue({ count: 1 });

      await expect(
        service.bulkSetConsent(['actor-1'], 'DENIED', ACTING_SUB),
      ).resolves.toEqual({ requested: 1, applied: 1, notFound: [] });
    });
  });

  describe('bulkDelete', () => {
    it('deletes found ids, writes audit snapshots, and reports notFound', async () => {
      prisma.actor.findMany.mockResolvedValue([
        fixtureActor({ id: 'actor-1' }),
      ]);
      prisma.actor.deleteMany.mockResolvedValue({ count: 1 });
      prisma.actorAuditLog.createMany.mockResolvedValue({ count: 1 });

      const res = await service.bulkDelete(['actor-1', 'missing-1'], ACTING_SUB);

      expect(res).toEqual({ requested: 2, applied: 1, notFound: ['missing-1'] });
      expect(prisma.actor.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['actor-1'] } },
      });

      const auditData = prisma.actorAuditLog.createMany.mock.calls[0][0].data;
      expect(auditData).toHaveLength(1);
      expect(auditData[0].action).toBe('BULK_DELETE');
      expect(auditData[0].changes.kind).toBe('snapshot');
      expect(auditData[0].changes.values.traderId).toBe('TZ-SEED-0001');
    });

    it('returns all-found result when every id exists', async () => {
      prisma.actor.findMany.mockResolvedValue([
        fixtureActor({ id: 'actor-1' }),
        fixtureActor({ id: 'actor-2' }),
      ]);
      prisma.actor.deleteMany.mockResolvedValue({ count: 2 });
      prisma.actorAuditLog.createMany.mockResolvedValue({ count: 2 });

      const res = await service.bulkDelete(['actor-1', 'actor-2'], ACTING_SUB);

      expect(res).toEqual({ requested: 2, applied: 2, notFound: [] });
      const auditData = prisma.actorAuditLog.createMany.mock.calls[0][0].data;
      expect(auditData).toHaveLength(2);
    });
  });
});
