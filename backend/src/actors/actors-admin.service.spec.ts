import { BadRequestException } from '@nestjs/common';
import { ConsentStatus } from '@prisma/client';
import { ActorsAdminService } from './actors-admin.service';
import { PII_ALLOWLIST } from '../common/pii-consent.policy';

/**
 * T-4 — ActorsAdminService unit tests with a MOCKED PrismaService (no DB).
 *
 * These assert the Admin-only bulk-operations contract (FR-1, FR-3, FR-4, FR-5):
 *   - adminList applies optional filters WITHOUT pinning consent to GRANTED;
 *   - adminList returns a paginated envelope and maps rows through toAdminActor
 *     so PII + consentStatus are present;
 *   - bulkSetConsent flips consentStatus, reports notFound ids, requires an
 *     acknowledgement for GRANTED, and calls updateMany only on found ids;
 *   - bulkDelete removes found ids via deleteMany and reports notFound ids.
 *
 * Design refs: docs/specs/admin/bulk-actor-operations/design.md §4, §10.
 */

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

describe('ActorsAdminService (mocked Prisma)', () => {
  let service: ActorsAdminService;
  let prisma: {
    actor: {
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      actor: {
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      // Pass the same mocked prisma object back into the callback so tx.actor
      // resolves to the same in-memory delegate.
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };
    service = new ActorsAdminService(prisma as never);
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

  describe('bulkSetConsent', () => {
    it('flips status to GRANTED and returns { requested, applied, notFound }', async () => {
      prisma.actor.findMany.mockResolvedValue([{ id: 'actor-1' }]);
      prisma.actor.updateMany.mockResolvedValue({ count: 1 });

      const res = await service.bulkSetConsent(
        ['actor-1'],
        'GRANTED',
        'admin-sub',
        true,
      );

      expect(res).toEqual({ requested: 1, applied: 1, notFound: [] });
      expect(prisma.actor.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['actor-1'] } },
        data: { consentStatus: ConsentStatus.GRANTED },
      });
    });

    it('flips status to DENIED and returns { requested, applied, notFound }', async () => {
      prisma.actor.findMany.mockResolvedValue([
        { id: 'actor-1' },
        { id: 'actor-2' },
      ]);
      prisma.actor.updateMany.mockResolvedValue({ count: 2 });

      const res = await service.bulkSetConsent(
        ['actor-1', 'actor-2'],
        'DENIED',
        'admin-sub',
      );

      expect(res).toEqual({ requested: 2, applied: 2, notFound: [] });
      expect(prisma.actor.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['actor-1', 'actor-2'] } },
        data: { consentStatus: ConsentStatus.DENIED },
      });
    });

    it('reports notFound ids correctly', async () => {
      prisma.actor.findMany.mockResolvedValue([{ id: 'actor-1' }]);
      prisma.actor.updateMany.mockResolvedValue({ count: 1 });

      const res = await service.bulkSetConsent(
        ['actor-1', 'missing-1', 'missing-2'],
        'DENIED',
        'admin-sub',
      );

      expect(res).toEqual({
        requested: 3,
        applied: 1,
        notFound: ['missing-1', 'missing-2'],
      });
      // updateMany must only touch the ids that actually exist (FR-3).
      expect(prisma.actor.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['actor-1'] } },
        data: { consentStatus: ConsentStatus.DENIED },
      });
    });

    it('throws BadRequestException when status === GRANTED and !acknowledged', async () => {
      await expect(
        service.bulkSetConsent(['actor-1'], 'GRANTED', 'admin-sub'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.actor.findMany).not.toHaveBeenCalled();
      expect(prisma.actor.updateMany).not.toHaveBeenCalled();
    });

    it('does not require acknowledgement for DENIED (lock)', async () => {
      prisma.actor.findMany.mockResolvedValue([{ id: 'actor-1' }]);
      prisma.actor.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.bulkSetConsent(['actor-1'], 'DENIED', 'admin-sub'),
      ).resolves.toEqual({ requested: 1, applied: 1, notFound: [] });
    });
  });

  describe('bulkDelete', () => {
    it('deletes found ids via deleteMany and reports notFound', async () => {
      prisma.actor.findMany.mockResolvedValue([{ id: 'actor-1' }]);
      prisma.actor.deleteMany.mockResolvedValue({ count: 1 });

      const res = await service.bulkDelete(
        ['actor-1', 'missing-1'],
        'admin-sub',
      );

      expect(res).toEqual({ requested: 2, applied: 1, notFound: ['missing-1'] });
      expect(prisma.actor.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['actor-1'] } },
      });
    });

    it('returns all-found result when every id exists', async () => {
      prisma.actor.findMany.mockResolvedValue([
        { id: 'actor-1' },
        { id: 'actor-2' },
      ]);
      prisma.actor.deleteMany.mockResolvedValue({ count: 2 });

      const res = await service.bulkDelete(['actor-1', 'actor-2'], 'admin-sub');

      expect(res).toEqual({ requested: 2, applied: 2, notFound: [] });
    });
  });
});
