import { NotFoundException } from '@nestjs/common';
import { RegistrationStatus } from '@prisma/client';
import { AdminRegistrationsService } from './admin-registrations.service';
import { DuplicateDetectionService } from './duplicate-detection.service';

/**
 * T-4 — `AdminRegistrationsService` unit tests with a MOCKED PrismaService
 * (no DB), mirroring `ActorsAdminService.adminList`'s test style
 * (`../actors/actors-admin.service.spec.ts`).
 *
 * Covers FR-9 scenarios 1, 2, 4 (list, filter, oldest-first default,
 * pagination envelope, page-beyond-result-set) and NFR-9 (pageSize cap,
 * `where`/`orderBy` shape — index USAGE is DC-25, declared unprovable
 * without a real MySQL `EXPLAIN`).
 *
 * T-5 — `list` gains `duplicateCandidateCount` (FR-11 scenario 1). The
 * REAL `DuplicateDetectionService` is wired to the SAME mocked
 * `PrismaService` (not a stub), so the DD-20 "exactly one `actor.findMany`
 * per page, never one per row" property is proven end-to-end through
 * `AdminRegistrationsService.list`, not just inside
 * `duplicate-detection.service.spec.ts`.
 */

interface MockPrisma {
  registration: {
    findMany: jest.Mock;
    count: jest.Mock;
    findUnique: jest.Mock;
  };
  actor: {
    findMany: jest.Mock;
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
      phone: '+255712345678',
    },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    submitterEmail: 'applicant@example.com',
    duplicateDismissals: null,
    ...overrides,
  };
}

function fixtureActor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'actor-1',
    traderId: 'TZ-SEED-0001',
    traderName: 'Meru Agro-Processing & Seeds',
    phone: '+255712345678',
    email: 'director@example.com',
    gpsLatitude: -3.3869,
    gpsLongitude: 36.683,
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
        findUnique: jest.fn(),
      },
      actor: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const duplicateDetection = new DuplicateDetectionService(prisma as unknown as never);
    service = new AdminRegistrationsService(prisma as unknown as never, duplicateDetection);
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

    it('projects each row to { id, reference, applicant, traderType, region, submittedAt, status, duplicateCandidateCount }', async () => {
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
        duplicateCandidateCount: 0,
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

    describe('select — the PII containment is a property of the query (T-4 advisory A-25)', () => {
      it('selects only the fields the row projection and duplicate detection need — never the whole row', async () => {
        prisma.registration.findMany.mockResolvedValue([]);
        prisma.registration.count.mockResolvedValue(0);

        await service.list({} as never);

        expect(prisma.registration.findMany.mock.calls[0][0].select).toEqual({
          id: true,
          reference: true,
          payload: true,
          createdAt: true,
          status: true,
          submitterEmail: true,
          duplicateDismissals: true,
        });
      });

      it('never places submitterEmail or duplicateDismissals in the response payload', async () => {
        prisma.registration.findMany.mockResolvedValue([fixtureRow()]);
        prisma.registration.count.mockResolvedValue(1);

        const res = await service.list({} as never);

        const serialized = JSON.stringify(res.data[0]);
        expect(serialized).not.toContain('applicant@example.com');
        expect(res.data[0]).not.toHaveProperty('submitterEmail');
        expect(res.data[0]).not.toHaveProperty('duplicateDismissals');
      });
    });

    describe('duplicateCandidateCount — one Actor fetch per page, not per row (DD-20)', () => {
      it('issues exactly ONE prisma.actor.findMany call for a multi-row page', async () => {
        prisma.registration.findMany.mockResolvedValue([
          fixtureRow({ id: 'reg-1' }),
          fixtureRow({ id: 'reg-2' }),
          fixtureRow({ id: 'reg-3' }),
        ]);
        prisma.registration.count.mockResolvedValue(3);
        prisma.actor.findMany.mockResolvedValue([fixtureActor()]);

        await service.list({} as never);

        expect(prisma.actor.findMany).toHaveBeenCalledTimes(1);
      });

      it('counts open (non-dismissed) candidates per row from the batch detection result', async () => {
        prisma.registration.findMany.mockResolvedValue([
          fixtureRow({ id: 'reg-1', payload: { traderName: 'Match Co', traderType: 'x', region: 'Arusha', phone: '+255712345678' } }),
          fixtureRow({ id: 'reg-2', payload: { traderName: 'No Match Co', traderType: 'x', region: 'Arusha' } }),
        ]);
        prisma.registration.count.mockResolvedValue(2);
        prisma.actor.findMany.mockResolvedValue([fixtureActor({ phone: '+255712345678' })]);

        const res = await service.list({} as never);

        const row1 = res.data.find((r) => r.id === 'reg-1')!;
        const row2 = res.data.find((r) => r.id === 'reg-2')!;
        expect(row1.duplicateCandidateCount).toBe(1);
        expect(row2.duplicateCandidateCount).toBe(0);
      });

      it('excludes a dismissed candidate from the count (DC-31, via duplicateDismissals)', async () => {
        prisma.registration.findMany.mockResolvedValue([
          fixtureRow({
            id: 'reg-1',
            payload: { traderName: 'Match Co', traderType: 'x', region: 'Arusha', phone: '+255712345678' },
            duplicateDismissals: [{ actorId: 'actor-1' }],
          }),
        ]);
        prisma.registration.count.mockResolvedValue(1);
        prisma.actor.findMany.mockResolvedValue([fixtureActor({ id: 'actor-1', phone: '+255712345678' })]);

        const res = await service.list({} as never);

        expect(res.data[0].duplicateCandidateCount).toBe(0);
      });

      it('treats an absent duplicateDismissals column the same as an empty array', async () => {
        prisma.registration.findMany.mockResolvedValue([
          fixtureRow({
            id: 'reg-1',
            payload: { traderName: 'Match Co', traderType: 'x', region: 'Arusha', phone: '+255712345678' },
            duplicateDismissals: null,
          }),
        ]);
        prisma.registration.count.mockResolvedValue(1);
        prisma.actor.findMany.mockResolvedValue([fixtureActor({ id: 'actor-1', phone: '+255712345678' })]);

        const res = await service.list({} as never);

        expect(res.data[0].duplicateCandidateCount).toBe(1);
      });

      it('issues zero actor.findMany calls when the page has no rows', async () => {
        prisma.registration.findMany.mockResolvedValue([]);
        prisma.registration.count.mockResolvedValue(0);

        await service.list({} as never);

        expect(prisma.actor.findMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('getById (T-6, FR-10 scenarios 1, 2, 3)', () => {
    function detailFixtureRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        ...fixtureRow(),
        emailVerifiedAt: new Date('2026-01-01T00:05:00Z'),
        consentAcceptedAt: new Date('2026-01-01T00:10:00Z'),
        consentPolicyVersion: 'v3',
        reviewedAt: null,
        reviewedBySub: null,
        reviewedByEmail: null,
        ...overrides,
      };
    }

    it('selects exactly the columns the detail projection and activity trail need', async () => {
      prisma.registration.findUnique.mockResolvedValue(detailFixtureRow());

      await service.getById('reg-1');

      expect(prisma.registration.findUnique.mock.calls[0][0]).toEqual({
        where: { id: 'reg-1' },
        select: {
          id: true,
          reference: true,
          payload: true,
          createdAt: true,
          status: true,
          submitterEmail: true,
          duplicateDismissals: true,
          emailVerifiedAt: true,
          consentAcceptedAt: true,
          consentPolicyVersion: true,
          reviewedAt: true,
          reviewedBySub: true,
          reviewedByEmail: true,
        },
      });
    });

    it('throws NotFoundException (404) for an id that matches no row', async () => {
      prisma.registration.findUnique.mockResolvedValue(null);

      await expect(service.getById('reg-does-not-exist')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.getById('reg-does-not-exist')).rejects.toThrow(
        'Registration reg-does-not-exist not found',
      );
    });

    it('returns the full projected detail — payload, consent, duplicate candidates, activity trail — for a known id', async () => {
      prisma.registration.findUnique.mockResolvedValue(
        detailFixtureRow({
          id: 'reg-1',
          reference: 'REG-2026-0001',
          payload: {
            traderName: 'Meru Agro-Processing & Seeds',
            traderType: 'seed_company',
            contactPerson: 'Grace Mushi',
            region: 'Arusha',
            crops: ['sorghum'],
            capacityTons: 50,
            phone: '+255712345678',
          },
        }),
      );
      prisma.actor.findMany.mockResolvedValue([fixtureActor({ phone: '+255712345678' })]);

      const result = await service.getById('reg-1');

      expect(result.id).toBe('reg-1');
      expect(result.reference).toBe('REG-2026-0001');
      expect(result.payload.contactPerson).toBe('Grace Mushi');
      expect(result.consent).toEqual({
        consentingOrganisation: 'Meru Agro-Processing & Seeds',
        policyVersion: 'v3',
        acceptedAt: '2026-01-01T00:10:00.000Z',
        acceptedAtQualifier: 'RECORDED_AT_SUBMISSION',
      });
      expect(result.duplicateCandidates).toHaveLength(1);
      expect(result.duplicateCandidates[0].matchedOn).toContain('phone');
      expect(result.activityTrail.map((e) => e.type)).toEqual([
        'SUBMITTED',
        'EMAIL_VERIFIED',
        'CONSENT_RECORDED',
      ]);
    });

    it('issues exactly ONE actor.findMany call for a single-row detail lookup (DD-20 still holds outside the batch path)', async () => {
      prisma.registration.findUnique.mockResolvedValue(detailFixtureRow());
      prisma.actor.findMany.mockResolvedValue([]);

      await service.getById('reg-1');

      expect(prisma.actor.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns non-empty candidates when the stored id differs in case from the requested id (MySQL default collation is case-insensitive)', async () => {
      // `findUnique({ where: { id } })` can resolve a row whose STORED id
      // differs in case from the request-supplied path parameter under
      // MySQL's default `utf8mb4_0900_ai_ci` collation. The duplicate
      // candidates map is keyed by the stored id
      // (`toDuplicateDetectionInput(sourceRow).registrationId`, i.e.
      // `sourceRow.id`) — looking it up by the request `id` instead would
      // silently miss and fall back to `[]` on the one screen whose job is
      // to warn before an irreversible publication.
      prisma.registration.findUnique.mockResolvedValue(
        detailFixtureRow({
          id: 'REG-1',
          payload: { traderName: 'Match Co', traderType: 'x', region: 'Arusha', phone: '+255712345678' },
        }),
      );
      prisma.actor.findMany.mockResolvedValue([fixtureActor({ phone: '+255712345678' })]);

      const result = await service.getById('reg-1');

      expect(result.duplicateCandidates).toHaveLength(1);
    });

    it('never places submitterEmail outside the admin-only response shape it belongs in (still present here — unlike list, this IS the admin detail surface)', async () => {
      prisma.registration.findUnique.mockResolvedValue(
        detailFixtureRow({ submitterEmail: 'org@example.com' }),
      );

      const result = await service.getById('reg-1');

      expect(result.submitterEmail).toBe('org@example.com');
    });
  });
});
