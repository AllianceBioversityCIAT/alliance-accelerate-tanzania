import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConsentMethod, ConsentStatus, Prisma, RegistrationSource, RegistrationStatus } from '@prisma/client';
import {
  APPROVAL_ACKNOWLEDGEMENT_TEXT,
  AdminRegistrationsService,
  deriveTraderIdFromReference,
} from './admin-registrations.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';
import { ActorAuditService } from '../actors/actor-audit.service';
import {
  createCommitOrderTracker,
  createTxRegistrationFindUniqueMock,
  createTxRegistrationUpdateManyMock,
} from '../test/admin-registrations-harness';

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
    update: jest.Mock;
  };
  actor: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
  /**
   * T-8 — `approve`'s ONLY entry point into Prisma. Deliberately a
   * SEPARATE `tx` delegate set (built per-test below, in the `approve`
   * describe block), never the SAME object as `registration`/`actor`
   * above — `list`/`getById`/`dismissDuplicate` never open a transaction,
   * so this keeps their existing coverage untouched while making
   * `approve`'s "every write happens through `tx`, never bypassing it"
   * structurally checkable: `registration`/`actor` above have no
   * `updateMany`/`create` spies at all, so a hypothetical bypass would
   * throw "not a function" rather than silently passing.
   */
  $transaction: jest.Mock;
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
  let actingAdminResolver: { resolve: jest.Mock };
  let actorAuditService: ActorAuditService;
  let mailService: { sendApproval: jest.Mock };

  beforeEach(() => {
    prisma = {
      registration: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      actor: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      // Default: no test outside the `approve` describe block opens a
      // transaction; a real call here (if `list`/`getById`/
      // `dismissDuplicate` ever accidentally did) throws loudly rather than
      // silently resolving `undefined`.
      $transaction: jest.fn(() => {
        throw new Error('$transaction called outside the approve describe block');
      }),
    };
    actingAdminResolver = { resolve: jest.fn() };
    const duplicateDetection = new DuplicateDetectionService(prisma as unknown as never);
    // T-8 — real `ActorAuditService` (no constructor deps), same convention
    // `actors-admin.service.spec.ts` already uses: it lets `approve`'s tests
    // assert the actual persisted audit envelope/`acknowledged` flag by
    // value, not a mock's stand-in return.
    actorAuditService = new ActorAuditService();
    mailService = { sendApproval: jest.fn().mockResolvedValue(undefined) };
    service = new AdminRegistrationsService(
      prisma as unknown as never,
      duplicateDetection,
      actingAdminResolver as unknown as ActingAdminResolver,
      actorAuditService,
      mailService as unknown as never,
    );
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

    describe('A-28 half 1 — page has no @Max; skip is clamped to total instead', () => {
      it(
        'clamps skip to total when page is astronomically far beyond the result set, never ' +
          'passing the raw (page-1)*pageSize product to Prisma — reddens against the pre-fix ' +
          'code, which sent skip=1999999960',
        async () => {
          prisma.registration.findMany.mockResolvedValue([]);
          prisma.registration.count.mockResolvedValue(3);

          const res = await service.list({ page: 99999999, pageSize: 20 } as never);

          const args = prisma.registration.findMany.mock.calls[0][0];
          expect(args.skip).toBe(3); // clamped to total, never (99999999 - 1) * 20
          expect(res.data).toEqual([]);
          expect(res.total).toBe(3);
          expect(res.page).toBe(99999999);
        },
      );

      it('does not clamp skip when the requested page is within the result set (unaffected pagination)', async () => {
        prisma.registration.findMany.mockResolvedValue([fixtureRow()]);
        prisma.registration.count.mockResolvedValue(42);

        await service.list({ page: 3, pageSize: 5 } as never);

        expect(prisma.registration.findMany.mock.calls[0][0].skip).toBe(10); // (3 - 1) * 5, well under total=42
      });

      it('queries count() before findMany() so the clamp has a real total to clamp against', async () => {
        const callOrder: string[] = [];
        prisma.registration.findMany.mockImplementation(async () => {
          callOrder.push('findMany');
          return [];
        });
        prisma.registration.count.mockImplementation(async () => {
          callOrder.push('count');
          return 0;
        });

        await service.list({} as never);

        expect(callOrder).toEqual(['count', 'findMany']);
      });
    });

    describe('A-28 half 2 — q escapes LIKE metacharacters before reaching Prisma', () => {
      it(
        'escapes a bare "%" so it cannot match every row — reddens against the pre-fix code, ' +
          'which passed the raw "%" straight through to string_contains',
        async () => {
          prisma.registration.findMany.mockResolvedValue([]);
          prisma.registration.count.mockResolvedValue(0);

          await service.list({ q: '%' } as never);

          const where = prisma.registration.findMany.mock.calls[0][0].where;
          expect(where).toEqual({
            AND: [{ payload: { path: '$.traderName', string_contains: '\\%' } }],
          });
        },
      );

      it('escapes "_" the same way as "%"', async () => {
        prisma.registration.findMany.mockResolvedValue([]);
        prisma.registration.count.mockResolvedValue(0);

        await service.list({ q: '_' } as never);

        const where = prisma.registration.findMany.mock.calls[0][0].where;
        expect(where).toEqual({
          AND: [{ payload: { path: '$.traderName', string_contains: '\\_' } }],
        });
      });

      it('escapes a literal backslash first, so it is not re-escaped by the %/_ passes', async () => {
        prisma.registration.findMany.mockResolvedValue([]);
        prisma.registration.count.mockResolvedValue(0);

        await service.list({ q: '\\%' } as never);

        const where = prisma.registration.findMany.mock.calls[0][0].where;
        expect(where).toEqual({
          AND: [{ payload: { path: '$.traderName', string_contains: '\\\\\\%' } }],
        });
      });

      it('leaves an ordinary search term (no metacharacters) unchanged — no existing test relied on wildcard semantics', async () => {
        prisma.registration.findMany.mockResolvedValue([]);
        prisma.registration.count.mockResolvedValue(0);

        await service.list({ q: 'Meru' } as never);

        const where = prisma.registration.findMany.mock.calls[0][0].where;
        expect(where).toEqual({
          AND: [{ payload: { path: '$.traderName', string_contains: 'Meru' } }],
        });
      });
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
          publishedActorId: true,
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

      it(
        'A-33 — an APPROVED registration does not flag itself: it matches every ' +
          'detection attribute of the actor it itself created, and publishedActorId excludes exactly that actor',
        async () => {
          prisma.registration.findMany.mockResolvedValue([
            fixtureRow({
              id: 'reg-approved-1',
              status: RegistrationStatus.APPROVED,
              payload: {
                traderName: 'Meru Agro-Processing & Seeds',
                traderType: 'seed_company',
                region: 'Arusha',
                phone: '+255712345678',
              },
              // Every one of these attributes matches `fixtureActor()`
              // below on phone, traderName AND email (via submitterEmail) —
              // without the A-33 exclusion this row would report itself as
              // its own duplicate on all three.
              publishedActorId: 'actor-1',
            }),
          ]);
          prisma.registration.count.mockResolvedValue(1);
          prisma.actor.findMany.mockResolvedValue([
            fixtureActor({ id: 'actor-1', email: 'applicant@example.com' }),
          ]);

          const res = await service.list({} as never);

          expect(res.data[0].duplicateCandidateCount).toBe(0);
        },
      );

      it(
        "A-33 — a genuine OTHER duplicate is still reported for an APPROVED row (the exclusion is " +
          'scoped to publishedActorId, not to APPROVED status generally)',
        async () => {
          prisma.registration.findMany.mockResolvedValue([
            fixtureRow({
              id: 'reg-approved-1',
              status: RegistrationStatus.APPROVED,
              payload: {
                traderName: 'Meru Agro-Processing & Seeds',
                traderType: 'seed_company',
                region: 'Arusha',
                phone: '+255712345678',
              },
              publishedActorId: 'actor-1',
            }),
          ]);
          prisma.registration.count.mockResolvedValue(1);
          prisma.actor.findMany.mockResolvedValue([
            // Its own published actor (excluded) plus an UNRELATED actor
            // that happens to share the same phone number.
            fixtureActor({ id: 'actor-1' }),
            fixtureActor({ id: 'actor-2', traderName: 'A Different Trader' }),
          ]);

          const res = await service.list({} as never);

          expect(res.data[0].duplicateCandidateCount).toBe(1);
        },
      );
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
          publishedActorId: true,
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

  describe('approve (T-8, FR-12 all six scenarios, FR-14 scenario 1)', () => {
    const ACKNOWLEDGEMENT = { acknowledgement: APPROVAL_ACKNOWLEDGEMENT_TEXT };
    const ACTING_SUB = 'admin-sub-1';
    const ACTING_EMAIL = 'admin@example.com';

    const CROPS_CATALOG = [
      { id: 'crop-sorghum', name: 'sorghum' },
      { id: 'crop-common_bean', name: 'common_bean' },
      { id: 'crop-groundnut', name: 'groundnut' },
    ];

    /**
     * The stored `Registration` row `approve`'s tx-scoped `findUnique`
     * calls resolve to. Every field carries a distinctive value so a
     * projection bug (a field landing on the wrong column, or an omitted
     * field silently reappearing) is unmistakable in a failure message.
     */
    function approvalRegistrationRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: 'reg-approve-1',
        reference: 'REG-2026-0184',
        status: RegistrationStatus.PENDING_REVIEW,
        payload: {
          traderName: 'Meru Agro-Processing & Seeds',
          traderType: 'seed_company',
          contactPerson: 'Grace Mushi — DO NOT PUBLISH',
          position: 'Director',
          district: 'Arusha Urban',
          marketLocation: 'Arusha Central Market',
          sex: 'F',
          region: 'Arusha',
          gpsLatitude: -3.3869,
          gpsLongitude: 36.683,
          crops: ['sorghum', 'common_bean'],
          otherCrops: 'Sunflower — DO NOT PUBLISH',
          capacityTons: 120,
          phone: '+255700000000',
        },
        submitterEmail: 'director@example.com',
        consentAcceptedAt: new Date('2026-01-01T00:10:00Z'),
        ...overrides,
      };
    }

    /**
     * A fresh, ISOLATED `tx` delegate set (never the SAME object as the
     * outer `prisma.registration`/`prisma.actor` mocks list/getById/
     * dismissDuplicate use) — see the `MockPrisma.$transaction` JSDoc
     * above. `prisma.$transaction` is wired to invoke the callback with
     * THIS object, so any call `approve` makes outside it (a hypothetical
     * bypass of the transaction) has nothing to land on.
     */
    function buildTx(registrationRow = approvalRegistrationRow()) {
      let registration = { ...registrationRow };
      const createdActors: Record<string, unknown>[] = [];
      const cropLinks: Array<{ actorId: string; cropName: string }> = [];
      let actorSeq = 0;

      const registrationDelegate = {
        updateMany: createTxRegistrationUpdateManyMock(
          () => registration,
          (next) => {
            registration = next;
          },
        ),
        findUnique: createTxRegistrationFindUniqueMock(() => registration),
        update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          registration = { ...registration, ...args.data };
          return { ...registration };
        }),
      };

      const actorDelegate = {
        create: jest.fn(async (args: { data: Record<string, unknown> }) => {
          if (createdActors.some((a) => a.traderId === args.data.traderId)) {
            throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
              code: 'P2002',
              clientVersion: '0.0.0',
              meta: { target: ['traderId'] },
            });
          }
          actorSeq += 1;
          const now = new Date('2026-01-05T00:00:00Z');
          const created = {
            id: `actor-approved-${actorSeq}`,
            ...args.data,
            createdAt: now,
            updatedAt: now,
          };
          createdActors.push(created);
          return created;
        }),
        findUnique: jest.fn(async (args: { where: { id: string } }) => {
          const found = createdActors.find((a) => a.id === args.where.id);
          if (!found) return null;
          const links = cropLinks
            .filter((l) => l.actorId === args.where.id)
            .map((l) => ({ crop: { name: l.cropName } }));
          return { ...found, crops: links };
        }),
      };

      const cropsOnActorsDelegate = {
        createMany: jest.fn(async (args: { data: Array<{ actorId: string; cropId: string }> }) => {
          for (const link of args.data) {
            const crop = CROPS_CATALOG.find((c) => c.id === link.cropId);
            if (crop) cropLinks.push({ actorId: link.actorId, cropName: crop.name });
          }
          return { count: args.data.length };
        }),
      };

      const cropDelegate = {
        findMany: jest.fn(async (args: { where: { name: { in: string[] } } }) => {
          const wanted = new Set(args.where.name.in);
          return CROPS_CATALOG.filter((c) => wanted.has(c.name));
        }),
      };

      const actorAuditLogDelegate = {
        create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
          id: 'audit-1',
          createdAt: new Date(),
          ...args.data,
        })),
      };

      return {
        registration: registrationDelegate,
        actor: actorDelegate,
        cropsOnActors: cropsOnActorsDelegate,
        crop: cropDelegate,
        actorAuditLog: actorAuditLogDelegate,
        getStoredRegistration: () => registration,
        getCreatedActors: () => createdActors,
      };
    }

    function wireTransaction(tx: ReturnType<typeof buildTx>) {
      prisma.$transaction = jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx));
    }

    beforeEach(() => {
      actingAdminResolver.resolve.mockResolvedValue(ACTING_EMAIL);
    });

    describe('Scenario: Approval publishes with correct provenance', () => {
      it('creates an Actor with SELF_REGISTERED/GRANTED/PORTAL_CHECKBOX provenance, the stored acceptance instant, and the reference as consentReference', async () => {
        const tx = buildTx();
        wireTransaction(tx);

        const result = await service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB);

        expect(result.actor.registrationSource).toBe(RegistrationSource.SELF_REGISTERED);
        expect(result.actor.consentStatus).toBe(ConsentStatus.GRANTED);
        expect(result.actor.consentMethod).toBe(ConsentMethod.PORTAL_CHECKBOX);
        expect(result.actor.consentObtainedAt).toEqual(new Date('2026-01-01T00:10:00Z'));
        expect(result.actor.consentReference).toBe('REG-2026-0184');
      });

      it("marks the registration APPROVED with publishedActorId, reviewedBySub, reviewedByEmail and reviewedAt", async () => {
        const tx = buildTx();
        wireTransaction(tx);

        const result = await service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB);

        expect(result.registration.status).toBe(RegistrationStatus.APPROVED);
        expect(result.registration.publishedActorId).toBe(result.actor.id);
        const stored = tx.getStoredRegistration() as Record<string, unknown>;
        expect(stored.reviewedBySub).toBe(ACTING_SUB);
        expect(stored.reviewedByEmail).toBe(ACTING_EMAIL);
        expect(stored.reviewedAt).toBeInstanceOf(Date);
      });

      it('resolves the acting admin identity server-side via ActingAdminResolver — never from the request body (no such field exists on the DTO)', async () => {
        const tx = buildTx();
        wireTransaction(tx);

        await service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB);

        expect(actingAdminResolver.resolve).toHaveBeenCalledWith(ACTING_SUB);
      });

      // R14 — FR-11 scenario 1's "BUT it must NOT prevent approval" clause.
      // Detection reads the OUTER `prisma.actor.findMany` (this describe
      // block's own mock, injected into the real `DuplicateDetectionService`
      // at construction — see `beforeEach` above); `approve`'s own writes
      // land on the SEPARATE `tx` delegate set `buildTx()` returns. An
      // approve that started consulting detection would call the outer
      // mock, not `tx` — so this assertion is the only one in this file
      // that can catch it.
      it('R14 — approve never consults DuplicateDetectionService: zero calls to the outer prisma.actor.findMany', async () => {
        const tx = buildTx();
        wireTransaction(tx);

        await service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB);

        expect(prisma.actor.findMany).not.toHaveBeenCalled();
      });
    });

    describe('Scenario: The publishable subset is exactly this, and nothing else (§6.3/DD-18 — the projection gate)', () => {
      it(
        'DISQUALIFYING GATE — asserts fixture VALUES absent from EVERY column of the created actor, ' +
          'never field names (a renamed target must still fail this)',
        async () => {
          const tx = buildTx();
          wireTransaction(tx);

          const result = await service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB);

          // The two review-context values, which must land NOWHERE in the
          // created actor — checked as raw VALUES across the whole
          // serialized object, not by absence of a key name.
          const serializedActor = JSON.stringify(result.actor);
          expect(serializedActor).not.toContain('Grace Mushi');
          expect(serializedActor).not.toContain('Sunflower');

          // Same sweep, one layer earlier: the pre-serialization `tx.actor.create`
          // input, BEFORE `toAdminActor` runs. `capacityTons`/`gpsAltitude`/
          // `gpsAccuracy` pass through `toNullableNumber` on the way OUT of
          // `toAdminActor`, which coerces a non-numeric string to `null` — a
          // text value mis-mapped onto one of those columns would vanish
          // before `serializedActor` above ever saw it. Sweeping the create
          // input closes that blind spot on the other side of the serializer.
          const serializedCreateInput = JSON.stringify(tx.getCreatedActors()[0]);
          expect(serializedCreateInput).not.toContain('Grace Mushi');
          expect(serializedCreateInput).not.toContain('Sunflower');

          // The three columns with no payload source stay null.
          expect(result.actor.technicalSupport).toBeNull();
          expect(result.actor.gpsAltitude).toBeNull();
          expect(result.actor.gpsAccuracy).toBeNull();

          // Actor.email comes from Registration.submitterEmail, not the payload.
          expect(result.actor.email).toBe('director@example.com');

          // Every published field lands where FR-12's projection table says.
          expect(result.actor.traderName).toBe('Meru Agro-Processing & Seeds');
          expect(result.actor.traderType).toBe('seed_company');
          expect(result.actor.position).toBe('Director');
          expect(result.actor.district).toBe('Arusha Urban');
          expect(result.actor.marketLocation).toBe('Arusha Central Market');
          expect(result.actor.sex).toBe('F');
          expect(result.actor.region).toBe('Arusha');
          expect(result.actor.gpsLatitude).toBe(-3.3869);
          expect(result.actor.gpsLongitude).toBe(36.683);
          expect(result.actor.capacityTons).toBe(120);
          expect(result.actor.phone).toBe('+255700000000');
          expect(result.actor.crops.sort()).toEqual(['common_bean', 'sorghum']);
        },
      );

      // The `contactPerson` → `Actor.position` falsifying mutation (the
      // spec's single most valuable falsification) was performed BY HAND
      // against `admin-registrations.service.ts`'s `approve` step 3 —
      // temporarily changing `position: payload.position ?? null,` to
      // `position: (payload as unknown as { contactPerson?: string })
      // .contactPerson,`. The cast is required because
      // `RegistrationApprovalPayload` deliberately has no `contactPerson`
      // member (see that interface's JSDoc) — the realistic one-liner
      // `payload.contactPerson` does not compile on its own. THIS describe block's
      // "DISQUALIFYING GATE" test was re-run against the mutation, its
      // failure output recorded VERBATIM, and the source reverted. Not kept
      // as a standing test (a permanently mutated line would itself be the
      // defect this gate exists to catch) — the transcript is in the
      // completion report / execution.md, per this repo's established
      // convention for manual falsification proofs (see e.g.
      // `pii-boundary.spec.ts`'s T-13 RA7 throwaway-route proofs).
    });

    describe('Scenario: The acknowledgement gate is real (server-side, FR-12 scenario 3)', () => {
      it('400s a request whose acknowledgement is misspelled, with a field-scoped detail', async () => {
        const tx = buildTx();
        wireTransaction(tx);

        await expect(
          service.approve('reg-approve-1', { acknowledgement: 'i confirm consent is on file' } as never, ACTING_SUB),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(tx.actor.create).not.toHaveBeenCalled();
      });

      it('400s a request with an empty acknowledgement', async () => {
        const tx = buildTx();
        wireTransaction(tx);

        await expect(
          service.approve('reg-approve-1', { acknowledgement: '' } as never, ACTING_SUB),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('proceeds when the acknowledgement matches exactly', async () => {
        const tx = buildTx();
        wireTransaction(tx);

        await expect(
          service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB),
        ).resolves.toBeDefined();
      });
    });

    describe('Scenario: Atomicity under failure (structurally asserted — DC-24, never rollback-proven)', () => {
      it(
        'a throw at the audit step (step 7) propagates unswallowed out of approve() — no catch ' +
          'absorbs it, and the step AFTER it (setting publishedActorId) is never reached',
        async () => {
          const tx = buildTx();
          tx.actorAuditLog.create.mockRejectedValueOnce(new Error('forced audit failure'));
          wireTransaction(tx);

          await expect(
            service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB),
          ).rejects.toThrow('forced audit failure');

          // Step 8 (publishedActorId) is a SECOND registration.update call —
          // never reached because step 7 threw first.
          expect(tx.registration.update).not.toHaveBeenCalled();
        },
      );

      it(
        'every write this method makes lands on the tx delegate the $transaction callback receives, ' +
          'never on a second, un-transacted path (no bypass)',
        async () => {
          const tx = buildTx();
          wireTransaction(tx);

          await service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB);

          expect(prisma.$transaction).toHaveBeenCalledTimes(1);
          expect(tx.registration.updateMany).toHaveBeenCalledTimes(1);
          expect(tx.actor.create).toHaveBeenCalledTimes(1);
          expect(tx.cropsOnActors.createMany).toHaveBeenCalledTimes(1);
          expect(tx.actorAuditLog.create).toHaveBeenCalledTimes(1);
          expect(tx.registration.update).toHaveBeenCalledTimes(1);
        },
      );
    });

    describe('Scenario: Double approval is refused (DD-17 — a conditional update, not read-then-check)', () => {
      it('409s when the registration is not PENDING_REVIEW, and actor.create is never invoked', async () => {
        const tx = buildTx(approvalRegistrationRow({ status: RegistrationStatus.APPROVED }));
        wireTransaction(tx);

        await expect(
          service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(tx.actor.create).not.toHaveBeenCalled();
      });

      it('the "already adjudicated" 409 message is distinguishable from the traderId-collision 409 message', async () => {
        const tx = buildTx(approvalRegistrationRow({ status: RegistrationStatus.APPROVED }));
        wireTransaction(tx);

        await expect(
          service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB),
        ).rejects.toThrow('has already been adjudicated');
      });

      it('404s (never 409) when the id does not exist at all (DD-22 — honest here)', async () => {
        const tx = buildTx();
        wireTransaction(tx);

        await expect(
          service.approve('reg-does-not-exist', ACKNOWLEDGEMENT as never, ACTING_SUB),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      // R15 — pins the conditional update's PREDICATE SHAPE by value. Both
      // `buildTx`'s and `buildPrismaMock`'s `updateMany` implementations
      // happen to compare `status` themselves, so dropping `status` from the
      // real `where` clause is caught today only because the mock re-derives
      // the same check — not because any assertion pins what the CODE sends.
      // This test would still pass against a mock; it pins the call args
      // directly instead.
      it('R15 — the conditional update\'s where clause is exactly { id, status: PENDING_REVIEW }, by value', async () => {
        const tx = buildTx();
        wireTransaction(tx);

        await service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB);

        expect(tx.registration.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'reg-approve-1', status: RegistrationStatus.PENDING_REVIEW },
          }),
        );
      });
    });

    describe('Scenario: The generated natural key does not collide (DD-23)', () => {
      it('derives SR-<year>-<seq> from REG-<year>-<seq>', () => {
        expect(deriveTraderIdFromReference('REG-2026-0184')).toBe('SR-2026-0184');
      });

      it('the SR- prefix collides with none of chunk 2\'s eight prefixes, nor with TZ-SEED-*', () => {
        const traderId = deriveTraderIdFromReference('REG-2026-0184');
        const foreignPrefixes = [
          'OFB-',
          'OFS-',
          'OFG-',
          'BBB-',
          'HUM-',
          'DSP-',
          'SDC-',
          'QDS-',
          'TZ-SEED-',
        ];
        for (const prefix of foreignPrefixes) {
          expect(traderId.startsWith(prefix)).toBe(false);
        }
        expect(traderId.startsWith('SR-')).toBe(true);
      });

      it('a traderId collision (P2002) 409s naming the colliding key, distinguishable from the "already adjudicated" 409', async () => {
        const tx = buildTx();
        // Pre-seed a colliding actor by calling create once with the SAME
        // derived traderId this registration will produce.
        await tx.actor.create({ data: { traderId: 'SR-2026-0184' } });
        wireTransaction(tx);

        await expect(
          service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB),
        ).rejects.toMatchObject({
          message: expect.stringContaining('SR-2026-0184'),
        });
      });

      it('the traderId-collision 409 is a ConflictException, not an unhandled 500', async () => {
        const tx = buildTx();
        await tx.actor.create({ data: { traderId: 'SR-2026-0184' } });
        wireTransaction(tx);

        await expect(
          service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB),
        ).rejects.toBeInstanceOf(ConflictException);
      });
    });

    describe('DEC-1 — acknowledged: true on the audit row, by value', () => {
      it('logRegistrationApprove writes acknowledged: true on the created audit row', async () => {
        const tx = buildTx();
        wireTransaction(tx);

        await service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB);

        const auditData = tx.actorAuditLog.create.mock.calls[0][0].data;
        expect(auditData.acknowledged).toBe(true);
      });

      it("the changes envelope is UNCHANGED — still logCreate's exact snapshot shape", async () => {
        const tx = buildTx();
        wireTransaction(tx);

        await service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB);

        const auditData = tx.actorAuditLog.create.mock.calls[0][0].data as {
          changes: { kind: string; values: Record<string, unknown> };
        };
        expect(auditData.changes.kind).toBe('snapshot');
        expect(auditData.changes.values.traderName).toBe('Meru Agro-Processing & Seeds');
      });
    });

    describe('A-8 — actor.consentReference === reference asserted by value at the call site', () => {
      it('the created actor\'s consentReference equals the registration reference passed to logRegistrationApprove', async () => {
        const tx = buildTx();
        wireTransaction(tx);

        await service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB);

        const auditCallArgs = tx.actorAuditLog.create.mock.calls[0][0].data as {
          changes: { values: Record<string, unknown> };
        };
        expect(auditCallArgs.changes.values.consentReference).toBe('REG-2026-0184');
      });

      it(
        'rejects and never writes the audit row when the refetched actor\'s consentReference has ' +
          'diverged from the registration reference (demonstrates the throw\'s true branch, which ' +
          'the two harnesses above never exercise — both echo `create`\'s data straight back through ' +
          '`findUnique`)',
        async () => {
          const tx = buildTx();
          const originalFindUnique = tx.actor.findUnique;
          tx.actor.findUnique = jest.fn(async (args: { where: { id: string } }) => {
            const found = await originalFindUnique(args);
            return found ? { ...found, consentReference: 'REG-2026-DIVERGED' } : found;
          });
          wireTransaction(tx);

          await expect(
            service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB),
          ).rejects.toThrow('Invariant violated');

          // The throw must abort BEFORE step 7's audit write, not after.
          expect(tx.actorAuditLog.create).not.toHaveBeenCalled();
        },
      );
    });

    describe('FR-14 scenario 1 — the notification is dispatched AFTER commit, never inside it', () => {
      it('sendApproval is called with the submitter email and reference, AFTER the transaction resolves', async () => {
        const tx = buildTx();
        wireTransaction(tx);
        const callOrder = createCommitOrderTracker(prisma, tx);
        mailService.sendApproval.mockImplementationOnce(async () => {
          callOrder.push('notification-dispatched');
        });

        await service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB);

        expect(mailService.sendApproval).toHaveBeenCalledWith('director@example.com', 'REG-2026-0184');
        expect(callOrder).toEqual(['transaction-committed', 'notification-dispatched']);
      });

      it('a notification failure does not reject approve() — it is fire-and-forget, logged by error class name only', async () => {
        const tx = buildTx();
        wireTransaction(tx);
        mailService.sendApproval.mockRejectedValueOnce(new Error('SES unavailable'));

        await expect(
          service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB),
        ).resolves.toBeDefined();
      });

      it('the transaction never calls sendApproval itself — only the post-await dispatch does', async () => {
        const tx = buildTx();
        wireTransaction(tx);
        (prisma.$transaction as jest.Mock).mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
          const result = await cb(tx);
          // Inside the transaction's own execution window, the mail spy
          // must not have been touched yet.
          expect(mailService.sendApproval).not.toHaveBeenCalled();
          return result;
        });

        await service.approve('reg-approve-1', ACKNOWLEDGEMENT as never, ACTING_SUB);

        expect(mailService.sendApproval).toHaveBeenCalledTimes(1);
      });
    });
  });
});

// `dismissDuplicate` (T-7) unit tests live in their own file,
// `admin-registrations-dismiss-duplicate.spec.ts` — its filename is what the
// task's Verify command (`npm test -- --silent dismiss-duplicate`) matches
// against; the class stays defined here.
