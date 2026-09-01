import { RegistrationStatus } from '@prisma/client';
import { AdminRegistrationsService } from './admin-registrations.service';

/**
 * T-4 — `AdminRegistrationsService` unit tests with a MOCKED PrismaService
 * (no DB), mirroring `ActorsAdminService.adminList`'s test style
 * (`../actors/actors-admin.service.spec.ts`).
 *
 * Covers FR-9 scenarios 1, 2, 4 (list, filter, oldest-first default,
 * pagination envelope, page-beyond-result-set) and NFR-9 (pageSize cap,
 * `where`/`orderBy` shape — index USAGE is DC-25, declared unprovable
 * without a real MySQL `EXPLAIN`).
 */

interface MockPrisma {
  registration: {
    findMany: jest.Mock;
    count: jest.Mock;
  };
}

function fixtureRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'reg-1',
    reference: 'REG-2026-0001',
    status: RegistrationStatus.PENDING_REVIEW,
    payload: {
      traderName: 'Meru Agro-Processing & Seeds',
      traderType: 'seed_company',
      region: 'Arusha',
    },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('AdminRegistrationsService (mocked Prisma)', () => {
  let service: AdminRegistrationsService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = {
      registration: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    service = new AdminRegistrationsService(prisma as unknown as never);
  });

  describe('list', () => {
    it('omits absent filters from the WHERE (FR-9 scenario 1, no filters applied)', async () => {
      prisma.registration.findMany.mockResolvedValue([]);
      prisma.registration.count.mockResolvedValue(0);

      await service.list({} as never);

      expect(prisma.registration.findMany.mock.calls[0][0].where).toEqual({});
      expect(prisma.registration.count.mock.calls[0][0].where).toEqual({});
    });

    it('composes status/region/traderType/q as an AND array of single-path filters (NFR-9 shape)', async () => {
      prisma.registration.findMany.mockResolvedValue([]);
      prisma.registration.count.mockResolvedValue(0);

      await service.list({
        status: RegistrationStatus.PENDING_REVIEW,
        region: 'Arusha',
        traderType: 'seed_company',
        q: 'Meru',
      } as never);

      const where = prisma.registration.findMany.mock.calls[0][0].where;
      expect(where).toEqual({
        AND: [
          { status: RegistrationStatus.PENDING_REVIEW },
          { payload: { path: '$.region', equals: 'Arusha' } },
          { payload: { path: '$.traderType', equals: 'seed_company' } },
          { payload: { path: '$.traderName', string_contains: 'Meru' } },
        ],
      });
    });

    it('defaults to oldest-first (createdAt ascending) when sort is omitted', async () => {
      prisma.registration.findMany.mockResolvedValue([]);
      prisma.registration.count.mockResolvedValue(0);

      await service.list({} as never);

      expect(prisma.registration.findMany.mock.calls[0][0].orderBy).toEqual({
        createdAt: 'asc',
      });
    });

    it("sorts newest-first when sort: 'newest' is requested", async () => {
      prisma.registration.findMany.mockResolvedValue([]);
      prisma.registration.count.mockResolvedValue(0);

      await service.list({ sort: 'newest' } as never);

      expect(prisma.registration.findMany.mock.calls[0][0].orderBy).toEqual({
        createdAt: 'desc',
      });
    });

    it('returns the paginated envelope { data, page, pageSize, total }', async () => {
      prisma.registration.findMany.mockResolvedValue([fixtureRow()]);
      prisma.registration.count.mockResolvedValue(42);

      const res = await service.list({ page: 3, pageSize: 5 } as never);

      const args = prisma.registration.findMany.mock.calls[0][0];
      expect(args.skip).toBe(10); // (3 - 1) * 5
      expect(args.take).toBe(5);
      expect(res).toMatchObject({ page: 3, pageSize: 5, total: 42 });
      expect(res.data).toHaveLength(1);
    });

    it('applies default page/pageSize when omitted', async () => {
      prisma.registration.findMany.mockResolvedValue([]);
      prisma.registration.count.mockResolvedValue(0);

      const res = await service.list({} as never);

      const args = prisma.registration.findMany.mock.calls[0][0];
      expect(args.skip).toBe(0);
      expect(args.take).toBe(20);
      expect(res).toMatchObject({ page: 1, pageSize: 20 });
    });

    it('caps pageSize at the max regardless of what the client requests (NFR-9)', async () => {
      prisma.registration.findMany.mockResolvedValue([]);
      prisma.registration.count.mockResolvedValue(0);

      const res = await service.list({ pageSize: 9999 } as never);

      expect(prisma.registration.findMany.mock.calls[0][0].take).toBe(100);
      expect(res.pageSize).toBe(100);
    });

    it('projects each row to { id, reference, applicant, traderType, region, submittedAt, status }', async () => {
      prisma.registration.findMany.mockResolvedValue([
        fixtureRow({
          id: 'reg-2',
          reference: 'REG-2026-0002',
          status: RegistrationStatus.APPROVED,
          payload: {
            traderName: 'Dodoma Farmers Cooperative',
            traderType: 'cooperative',
            region: 'Dodoma',
          },
          createdAt: new Date('2026-02-01T00:00:00Z'),
        }),
      ]);
      prisma.registration.count.mockResolvedValue(1);

      const res = await service.list({} as never);

      expect(res.data[0]).toEqual({
        id: 'reg-2',
        reference: 'REG-2026-0002',
        applicant: 'Dodoma Farmers Cooperative',
        traderType: 'cooperative',
        region: 'Dodoma',
        submittedAt: new Date('2026-02-01T00:00:00Z'),
        status: RegistrationStatus.APPROVED,
      });
    });

    it('returns an empty data array with total 0 when the result set is empty (FR-9 "page beyond result set")', async () => {
      prisma.registration.findMany.mockResolvedValue([]);
      prisma.registration.count.mockResolvedValue(0);

      const res = await service.list({ page: 5, pageSize: 20 } as never);

      expect(res.data).toEqual([]);
      expect(res.total).toBe(0);
      expect(res.page).toBe(5);
    });
  });
});
