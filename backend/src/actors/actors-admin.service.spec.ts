import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConsentMethod, ConsentStatus, Prisma } from '@prisma/client';
import { ActorsAdminService } from './actors-admin.service';
import { ActorAuditService } from './actor-audit.service';
import { ActingAdminResolver } from './acting-admin.resolver';
import {
  CONTACT_BLOCK_FIELDS,
  NEVER_PUBLIC_FIELDS,
} from '../common/pii-consent.policy';
import { AdminActorCreateDto } from './dto/admin-actor-create.dto';
import { AdminActorUpdateDto } from './dto/admin-actor-update.dto';
import { ActorHistoryQueryDto } from './dto/actor-history-query.dto';
import { buildTraderId } from './trader-id.util';
import { IntakeDuplicateService } from './intake-duplicate.service';
import { createActorSequenceMock } from '../test/support/actor-sequence.mock';

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
 * T-9 (D-1c) — every field the Admin projection MUST retain that a `Public`
 * response never carries: {@link CONTACT_BLOCK_FIELDS} (withheld from the
 * public LIST path, FR-9) UNION {@link NEVER_PUBLIC_FIELDS} (withheld from
 * EVERY public path, including `technicalSupport` and the admin-only
 * operational columns). This is the Admin-side mirror of the same union the
 * public e2e suites use as an ABSENCE check — here it is a PRESENCE check
 * instead (FR-3's `BUT` — the Admin projection is the one place
 * `technicalSupport` still surfaces).
 *
 * Re-points the loop below, which used to iterate `PII_ALLOWLIST` (emptied by
 * `actors/public-profile-disclosure` T-6, DD-2) and is *a* standing proof that
 * the Admin projection still returns PII (FR-3) — not the only one:
 * `src/test/admin-actors.e2e.spec.ts` additionally asserts `sex`, `phone`,
 * `email`, `position`, `marketLocation` and `technicalSupport` BY VALUE on an
 * Admin response. (That spec's own Done-when called this loop "the only
 * proof"; the claim was copied here verbatim and is corrected in both places
 * — T-9 review, 2026-09-04.) `PUBLICLY_DISCLOSED_FIELDS`
 * is deliberately NOT used here even though it is `PII_ALLOWLIST`'s closer
 * historical analogue: it omits `technicalSupport` (which moved to
 * `NEVER_PUBLIC_FIELDS` instead) and using it alone would repeat T-6's exact
 * defect of dropping that field's coverage rather than moving it.
 */
const ADMIN_RETAINED_FIELDS = [...CONTACT_BLOCK_FIELDS, ...NEVER_PUBLIC_FIELDS];

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
    // T-1 (intake-required-fields) — part of the required set (FR-1); a
    // COMPLETE fixture by default so unrelated `update` tests aren't tripped
    // by the merged-state required check. Tests of the "incomplete legacy
    // actor" scenario override one of these fields back to `null`.
    contactPerson: 'Grace Mushi',
    phone: '+255700000000',
    email: 'director@example.com',
    technicalSupport: 'Needs cold storage',
    capacityTons: 1850,
    gpsLatitude: -3.3869,
    gpsLongitude: 36.683,
    gpsAltitude: 1400,
    gpsAccuracy: 5,
    consentStatus: ConsentStatus.GRANTED,
    // T-3 — registration source & consent provenance (FR-1, FR-2); defaults
    // mirror the Prisma column defaults so a plain fixtureActor() looks like
    // a legacy row (design.md FR-9 — 436/436 live actors are GRANTED +
    // NOT_RECORDED).
    registrationSource: 'TEAM_MANAGED',
    consentMethod: 'NOT_RECORDED',
    consentObtainedAt: null,
    consentReference: null,
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
  $executeRaw: jest.Mock;
  $queryRaw: jest.Mock;
}

/**
 * T-2 — a Prisma `P2002` on `traderId`, the REAL MySQL shape (`meta.target`
 * is the index-name string `Actor_traderId_key`, measured against the local
 * container, execution.md T-2 attempt 2). Shared by the retry/exhaustion
 * tests below.
 */
function buildTraderIdCollisionError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`traderId`)',
    {
      code: 'P2002',
      clientVersion: '1.0.0',
      meta: { modelName: 'Actor', target: 'Actor_traderId_key' },
    },
  );
}

describe('ActorsAdminService (mocked Prisma)', () => {
  let service: ActorsAdminService;
  let actorAuditService: ActorAuditService;
  let actingAdminResolver: ActingAdminResolver;
  let intakeDuplicateService: IntakeDuplicateService;
  let prisma: MockPrisma;

  beforeEach(() => {
    // T-2 — in-memory ActorSequence counter (design.md §4.2), so create's
    // retry loop allocates a genuinely fresh id per attempt, not a canned one.
    const { $executeRaw, $queryRaw } = createActorSequenceMock();

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
      $executeRaw,
      $queryRaw,
      // Pass the same mocked prisma object back into the callback so tx.*
      // resolves to the same in-memory delegates.
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };

    actorAuditService = new ActorAuditService();
    actingAdminResolver = {
      resolve: jest.fn().mockResolvedValue(ACTING_EMAIL),
      resetCache: jest.fn(),
    } as unknown as ActingAdminResolver;
    // T-3 — the REAL IntakeDuplicateService wired to the same mocked
    // `prisma.actor.findMany`, exactly like `actorAuditService` above is the
    // real `ActorAuditService` over the same mocked `tx`: it proves the
    // actual duplicate-check code path, not a stand-in.
    intakeDuplicateService = new IntakeDuplicateService(
      prisma as unknown as never,
    );

    service = new ActorsAdminService(
      prisma as unknown as never,
      actorAuditService,
      actingAdminResolver,
      intakeDuplicateService,
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

    // T-8 — registrationSource + consentMethod are FR-9's enumeration
    // mechanism (`consentStatus=GRANTED&consentMethod=NOT_RECORDED` finds the
    // legacy unevidenced set); they must AND-compose with each other and with
    // the existing filters.
    it('applies registrationSource and consentMethod filters, AND-composed with consentStatus', async () => {
      prisma.actor.findMany.mockResolvedValue([]);
      prisma.actor.count.mockResolvedValue(0);

      await service.adminList({
        consentStatus: 'GRANTED',
        registrationSource: 'TEAM_MANAGED',
        consentMethod: 'NOT_RECORDED',
      } as never);

      const where = prisma.actor.findMany.mock.calls[0][0].where;
      expect(where).toEqual({
        consentStatus: ConsentStatus.GRANTED,
        registrationSource: 'TEAM_MANAGED',
        consentMethod: ConsentMethod.NOT_RECORDED,
      });
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
      // Guards the loop itself against silently going vacuous again the way
      // PII_ALLOWLIST did under T-6 (D-1c) — an accidentally emptied
      // ADMIN_RETAINED_FIELDS would fail HERE, by name, instead of the loop
      // below asserting nothing and staying green.
      expect(ADMIN_RETAINED_FIELDS.length).toBeGreaterThan(0);
      for (const key of ADMIN_RETAINED_FIELDS) {
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
    // Pins the clock so a test's own `new Date().getUTCFullYear()` and
    // `create()`'s internal `new Date()` can never read different years
    // (the year-boundary race a real clock would otherwise leave open).
    const FIXED_NOW = new Date('2026-06-15T12:00:00.000Z');

    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.setSystemTime(FIXED_NOW);
      // T-3 — `create()` now runs the FR-3 duplicate scan unconditionally;
      // default to "no existing actors" so every pre-existing test in this
      // describe (none of which cares about duplicates) is unaffected.
      // Duplicate-specific tests below override this per-test.
      prisma.actor.findMany.mockResolvedValue([]);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    // T-2 — `as unknown as AdminActorCreateDto` below: with `traderId` gone,
    // these deliberately-partial fixtures no longer satisfy TS's `as` cast.

    it('creates actor with scalar fields and crop links, writes audit, returns AdminActor', async () => {
      const year = FIXED_NOW.getUTCFullYear();
      const expectedTraderId = buildTraderId(year, 1);
      const created = fixtureCreatedActor({ id: 'actor-new', traderId: expectedTraderId });
      const full = fixtureActor({
        id: 'actor-new',
        traderId: expectedTraderId,
        traderName: 'New Actor',
        crops: [{ crop: { name: 'sorghum' } }],
      });

      prisma.actor.create.mockResolvedValue(created);
      prisma.crop.findMany.mockResolvedValue([{ id: 'crop-1', name: 'sorghum' }]);
      prisma.cropsOnActors.createMany.mockResolvedValue({ count: 1 });
      prisma.actor.findUnique.mockResolvedValue(full);
      prisma.actorAuditLog.create.mockResolvedValue({ id: 'audit-1' });

      const dto = {
        traderName: 'New Actor',
        region: 'Arusha',
        traderType: 'seed_company',
        crops: ['sorghum'],
      } as unknown as AdminActorCreateDto;

      const res = await service.create(dto, ACTING_SUB);

      // FR-2 — the system-assigned id is what reaches the write, never a
      // client value (there is none here — the DTO has no `traderId` field
      // at all any more).
      expect(prisma.actor.create).toHaveBeenCalledWith({
        data: {
          traderName: 'New Actor',
          region: 'Arusha',
          traderType: 'seed_company',
          traderId: expectedTraderId,
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
      expect(auditData.changes.values.traderId).toBe(expectedTraderId);
      expect(auditData.changes.values.crops).toEqual(['sorghum']);

      expect(res.id).toBe('actor-new');
      expect(res.traderId).toBe(expectedTraderId);
      expect(res.crops).toEqual(['sorghum']);
    });

    it('creates actor without crops when dto.crops is omitted', async () => {
      const year = FIXED_NOW.getUTCFullYear();
      const expectedTraderId = buildTraderId(year, 1);
      const created = fixtureCreatedActor({ id: 'actor-no-crops', traderId: expectedTraderId });
      const full = fixtureActor({
        id: 'actor-no-crops',
        traderId: expectedTraderId,
        traderName: 'No Crops Actor',
        crops: [],
      });

      prisma.actor.create.mockResolvedValue(created);
      prisma.actor.findUnique.mockResolvedValue(full);
      prisma.actorAuditLog.create.mockResolvedValue({ id: 'audit-1' });

      const dto = {
        traderName: 'No Crops Actor',
        region: 'Arusha',
        traderType: 'seed_company',
      } as unknown as AdminActorCreateDto;

      await service.create(dto, ACTING_SUB);

      expect(prisma.cropsOnActors.createMany).not.toHaveBeenCalled();
      expect(prisma.crop.findMany).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when consentStatus === GRANTED and !acknowledged', async () => {
      const dto = {
        traderName: 'New Actor',
        region: 'Arusha',
        traderType: 'seed_company',
        consentStatus: ConsentStatus.GRANTED,
      } as unknown as AdminActorCreateDto;

      await expect(service.create(dto, ACTING_SUB)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    // Falsifier 2 (tasks.md T-2, design.md §4.2) — removing the retry is
    // what must redden this.
    it('retries once after a traderId collision and succeeds with a freshly-allocated id (design.md §4.2)', async () => {
      const year = FIXED_NOW.getUTCFullYear();

      prisma.actor.create
        .mockRejectedValueOnce(buildTraderIdCollisionError())
        .mockImplementationOnce(async (args: { data: Record<string, unknown> }) => ({
          id: 'actor-new',
          ...args.data,
        }));
      prisma.actor.findUnique.mockResolvedValue(
        fixtureActor({
          id: 'actor-new',
          traderId: buildTraderId(year, 2),
          traderName: 'New Actor',
          crops: [],
        }),
      );
      prisma.actorAuditLog.create.mockResolvedValue({ id: 'audit-1' });

      const dto = {
        traderName: 'New Actor',
        region: 'Arusha',
        traderType: 'seed_company',
      } as unknown as AdminActorCreateDto;

      const res = await service.create(dto, ACTING_SUB);

      expect(prisma.actor.create).toHaveBeenCalledTimes(2);
      const attemptedIds = prisma.actor.create.mock.calls.map(
        (call: unknown[]) => (call[0] as { data: { traderId: string } }).data.traderId,
      );
      // The retry's allocation is GENUINELY new — never the id the
      // rolled-back first attempt already (uselessly) consumed.
      expect(attemptedIds).toEqual([buildTraderId(year, 1), buildTraderId(year, 2)]);
      expect(res.traderId).toBe(buildTraderId(year, 2));
    });

    // Falsifier 3 (tasks.md T-2) — uncapped retries, or the wrong cap, must
    // redden this (never reaching the 500, or reaching it at the wrong count).
    it('exhausts allocation retries after 3 collisions and returns 500 — never a 409 (design.md §4.2 exhaustion)', async () => {
      const year = FIXED_NOW.getUTCFullYear();
      prisma.actor.create.mockRejectedValue(buildTraderIdCollisionError());

      const dto = {
        traderName: 'New Actor',
        region: 'Arusha',
        traderType: 'seed_company',
      } as unknown as AdminActorCreateDto;

      let caught: unknown;
      try {
        await service.create(dto, ACTING_SUB);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(InternalServerErrorException);
      expect(caught).not.toBeInstanceOf(ConflictException);
      expect((caught as InternalServerErrorException).getStatus()).toBe(500);

      expect(prisma.actor.create).toHaveBeenCalledTimes(3);
      const attemptedIds = prisma.actor.create.mock.calls.map(
        (call: unknown[]) => (call[0] as { data: { traderId: string } }).data.traderId,
      );
      expect(attemptedIds).toEqual([
        buildTraderId(year, 1),
        buildTraderId(year, 2),
        buildTraderId(year, 3),
      ]);
      expect(new Set(attemptedIds).size).toBe(3);
      expect(prisma.actorAuditLog.create).not.toHaveBeenCalled();
    });

    // Falsifier 5 (rework) — un-narrowing isTraderIdCollisionError back to
    // "any P2002" is what must redden this.
    it('does not retry a P2002 on a different unique target — maps to the generic 409 (design.md §4.4)', async () => {
      const otherTargetError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`PRIMARY`)',
        { code: 'P2002', clientVersion: '1.0.0', meta: { modelName: 'Actor', target: 'PRIMARY' } },
      );
      prisma.actor.create.mockRejectedValue(otherTargetError);

      const dto = {
        traderName: 'New Actor',
        region: 'Arusha',
        traderType: 'seed_company',
      } as unknown as AdminActorCreateDto;

      let caught: unknown;
      try {
        await service.create(dto, ACTING_SUB);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      expect((caught as ConflictException).message).toBe('Unique constraint violation');
      expect(prisma.actor.create).toHaveBeenCalledTimes(1);
    });

    it('does not write audit when actor.create fails (rollback leaves no audit row)', async () => {
      prisma.actor.create.mockRejectedValue(new Error('DB unavailable'));

      const dto = {
        traderName: 'New Actor',
        region: 'Arusha',
        traderType: 'seed_company',
      } as unknown as AdminActorCreateDto;

      await expect(service.create(dto, ACTING_SUB)).rejects.toThrow('DB unavailable');
      expect(prisma.actorAuditLog.create).not.toHaveBeenCalled();
      // A non-collision error is never retried — a single attempt only.
      expect(prisma.actor.create).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException (field-level) when creating GRANTED without provenance (FR-3, R-1/NFR-7)', async () => {
      const dto = {
        traderName: 'New Actor',
        region: 'Arusha',
        traderType: 'seed_company',
        consentStatus: ConsentStatus.GRANTED,
        acknowledged: true,
      } as unknown as AdminActorCreateDto;

      let caught: unknown;
      try {
        await service.create(dto, ACTING_SUB);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      const response = (caught as BadRequestException).getResponse() as {
        details: Array<{ field: string }>;
      };
      expect(response.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'consentMethod' }),
          expect.objectContaining({ field: 'consentObtainedAt' }),
        ]),
      );
    });

    it('creates GRANTED with provenance and round-trips registrationSource/consentMethod/consentObtainedAt/consentReference through buildScalarData (R-1)', async () => {
      const created = fixtureCreatedActor({
        id: 'actor-new',
        consentStatus: ConsentStatus.GRANTED,
        registrationSource: 'SELF_REGISTERED',
        consentMethod: 'SIGNED_FORM',
        consentObtainedAt: new Date('2026-01-01T00:00:00Z'),
        consentReference: 'DOC-123',
      });
      const full = fixtureActor({
        id: 'actor-new',
        traderId: 'TZ-SEED-0002',
        traderName: 'New Actor',
        crops: [{ crop: { name: 'sorghum' } }],
        consentStatus: ConsentStatus.GRANTED,
        registrationSource: 'SELF_REGISTERED',
        consentMethod: 'SIGNED_FORM',
        consentObtainedAt: new Date('2026-01-01T00:00:00Z'),
        consentReference: 'DOC-123',
      });

      prisma.actor.create.mockResolvedValue(created);
      prisma.actor.findUnique.mockResolvedValue(full);
      prisma.actorAuditLog.create.mockResolvedValue({ id: 'audit-1' });
      prisma.crop.findMany.mockResolvedValue([{ id: 'crop-1', name: 'sorghum' }]);

      const dto: AdminActorCreateDto = {
        traderName: 'New Actor',
        region: 'Arusha',
        traderType: 'seed_company',
        contactPerson: 'Neema Shirima',
        capacityTons: 100,
        phone: '+255700000000',
        email: 'new-actor@example.com',
        // Advisory (tasks.md T-1 rework) — crops is required now (FR-1); an
        // empty array here was never a realistic valid-create payload.
        crops: ['sorghum'],
        consentStatus: ConsentStatus.GRANTED,
        acknowledged: true,
        registrationSource: 'SELF_REGISTERED' as never,
        consentMethod: 'SIGNED_FORM' as never,
        consentObtainedAt: '2026-01-01T00:00:00Z' as never,
        consentReference: 'DOC-123' as never,
      } as AdminActorCreateDto;

      const res = await service.create(dto, ACTING_SUB);

      // Proves SCALAR_FIELDS actually carries the four fields into the write
      // (R-1) — not just that the request returns 201.
      expect(prisma.actor.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          registrationSource: 'SELF_REGISTERED',
          consentMethod: 'SIGNED_FORM',
          consentObtainedAt: '2026-01-01T00:00:00Z',
          consentReference: 'DOC-123',
        }),
      });
      expect(res.registrationSource).toBe('SELF_REGISTERED');
      expect(res.consentMethod).toBe('SIGNED_FORM');
      expect(res.consentReference).toBe('DOC-123');
    });

    /**
     * T-3 — the FR-3 duplicate gate on admin create (design.md §4.3, §4.4,
     * DD-3, DD-4). `prisma.actor.findMany` here stands in for
     * `IntakeDuplicateService.check()`'s one scan — these are genuinely
     * exercising `IntakeDuplicateService` (constructed for real above), not
     * a mock of it.
     */
    describe('duplicate detection gate (FR-3)', () => {
      function existingActorRow(overrides: Partial<Record<string, unknown>> = {}) {
        return {
          id: 'actor-strong-1',
          traderId: 'TZ-STRONG-0001',
          traderName: 'Strong Match Co',
          phone: '+255788880001',
          email: 'strong-match@example.com',
          gpsLatitude: -4.5,
          gpsLongitude: 29.5,
          ...overrides,
        };
      }

      const baseDto = () =>
        ({
          traderName: 'New Actor',
          region: 'Arusha',
          traderType: 'seed_company',
          contactPerson: 'Jane M',
          capacityTons: 10,
          phone: '+255711111111',
          email: 'new-actor@example.com',
          crops: ['sorghum'],
        }) as unknown as AdminActorCreateDto;

      function stubSuccessfulCreate(id: string) {
        prisma.actor.create.mockResolvedValue(fixtureCreatedActor({ id }));
        prisma.actor.findUnique.mockResolvedValue(
          fixtureActor({ id, crops: [] }),
        );
        prisma.actorAuditLog.create.mockResolvedValue({ id: 'audit-1' });
        // `baseDto()` carries `crops: ['sorghum']`, which routes through
        // `buildCropLinks` → `prisma.crop.findMany`.
        prisma.crop.findMany.mockResolvedValue([{ id: 'crop-1', name: 'sorghum' }]);
      }

      /** Runs `service.create`, asserts the rejection is a 409 naming exactly `expectedActorIds`. */
      async function createAndExpectDuplicateConflictIds(
        dto: AdminActorCreateDto,
        expectedActorIds: string[],
      ): Promise<void> {
        let caught: unknown;
        try {
          await service.create(dto, ACTING_SUB);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(ConflictException);
        const response = (caught as ConflictException).getResponse() as {
          duplicateCandidates: Array<{ actorId: string }>;
        };
        expect(response.duplicateCandidates.map((c) => c.actorId)).toEqual(
          expectedActorIds,
        );
      }

      it('throws ConflictException (409) with duplicateCandidates when a strong (email) match is unconfirmed', async () => {
        prisma.actor.findMany.mockResolvedValue([existingActorRow()]);
        // Defensive: if the gate incorrectly fails to fire, `create` would
        // proceed down the success path — stub it so THAT path cannot also
        // throw for an unrelated reason, keeping any red purely about the
        // gate assertion below, never a crash elsewhere.
        stubSuccessfulCreate('actor-new');

        const dto = { ...baseDto(), email: 'strong-match@example.com' };

        let caught: unknown;
        try {
          await service.create(dto as AdminActorCreateDto, ACTING_SUB);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(ConflictException);
        const response = (caught as ConflictException).getResponse() as {
          statusCode: number;
          message: string;
          duplicateCandidates: unknown[];
        };
        expect(response.statusCode).toBe(409);
        expect(response.message).toBe('Possible duplicate');
        expect(response.duplicateCandidates).toEqual([
          {
            actorId: 'actor-strong-1',
            traderId: 'TZ-STRONG-0001',
            traderName: 'Strong Match Co',
            matchedOn: ['email'],
          },
        ]);
        // A gated create never allocates or opens the create transaction.
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.actor.create).not.toHaveBeenCalled();
      });

      it('creates and audits the confirmation when the strong candidate is named in confirmedNotDuplicateOf', async () => {
        prisma.actor.findMany.mockResolvedValue([existingActorRow()]);
        stubSuccessfulCreate('actor-new');

        const dto = {
          ...baseDto(),
          email: 'strong-match@example.com',
          confirmedNotDuplicateOf: ['actor-strong-1'],
        } as unknown as AdminActorCreateDto;

        const res = await service.create(dto, ACTING_SUB);

        expect(res.duplicateWarnings).toEqual([]);
        const auditData = prisma.actorAuditLog.create.mock.calls[0][0]
          .data as Record<string, unknown>;
        expect(auditData.duplicateConfirmation).toEqual([
          {
            kind: 'actor',
            actorId: 'actor-strong-1',
            traderId: 'TZ-STRONG-0001',
            traderName: 'Strong Match Co',
            matchedOn: ['email'],
          },
        ]);
      });

      it('omits duplicateConfirmation (writes Prisma.JsonNull) when there was nothing to confirm (falsifier 6)', async () => {
        stubSuccessfulCreate('actor-new');

        await service.create(baseDto(), ACTING_SUB);

        const auditData = prisma.actorAuditLog.create.mock.calls[0][0]
          .data as Record<string, unknown>;
        expect(auditData.duplicateConfirmation).toEqual(Prisma.JsonNull);
      });

      it('creates (201) with duplicateConfirmation as Prisma.JsonNull when confirmedNotDuplicateOf names only unknown ids and there is no strong match', async () => {
        prisma.actor.findMany.mockResolvedValue([]);
        stubSuccessfulCreate('actor-new');

        const dto = {
          ...baseDto(),
          confirmedNotDuplicateOf: ['actor-does-not-exist'],
        } as unknown as AdminActorCreateDto;

        const res = await service.create(dto, ACTING_SUB);

        expect(res.duplicateWarnings).toEqual([]);
        const auditData = prisma.actorAuditLog.create.mock.calls[0][0]
          .data as Record<string, unknown>;
        expect(auditData.duplicateConfirmation).toEqual(Prisma.JsonNull);
      });

      it('creates without confirmation and returns duplicateWarnings when only a weak (traderName) match exists', async () => {
        prisma.actor.findMany.mockResolvedValue([
          existingActorRow({ phone: null, email: null, traderName: 'New Actor' }),
        ]);
        stubSuccessfulCreate('actor-new');

        const res = await service.create(baseDto(), ACTING_SUB);

        expect(res.duplicateWarnings).toEqual([
          {
            actorId: 'actor-strong-1',
            traderId: 'TZ-STRONG-0001',
            traderName: 'New Actor',
            matchedOn: ['traderName'],
          },
        ]);
        // A weak match never asks — exactly one create attempt.
        expect(prisma.actor.create).toHaveBeenCalledTimes(1);
      });

      // Falsifier 3 (tasks.md T-3) — `traderName` must never classify as
      // strong; the weak-creates test above already proves this behaviorally,
      // and this test pins the classification directly against the gate.
      it('never gates creation on a traderName-only match', async () => {
        prisma.actor.findMany.mockResolvedValue([
          existingActorRow({ phone: null, email: null, traderName: 'New Actor' }),
        ]);
        stubSuccessfulCreate('actor-new');

        await expect(service.create(baseDto(), ACTING_SUB)).resolves.toBeDefined();
        expect(prisma.$transaction).toHaveBeenCalled();
      });

      // Falsifier 2 (tasks.md T-3) — a confirmation naming actor A must NOT
      // clear a DIFFERENT actor B the current (changed) email strongly
      // matches: the confirmation is a set of ids, never a boolean.
      it('re-asks when the confirmed id does not cover the actor the CURRENT fields match (not reusable)', async () => {
        prisma.actor.findMany.mockResolvedValue([
          existingActorRow({ id: 'actor-a', traderId: 'TZ-A', email: 'a@example.com' }),
          existingActorRow({
            id: 'actor-b',
            traderId: 'TZ-B',
            traderName: 'B Co',
            email: 'b@example.com',
          }),
        ]);
        // Defensive: see the comment above — keeps any red
        // purely about the gate assertion below.
        stubSuccessfulCreate('actor-new');

        const dto = {
          ...baseDto(),
          email: 'b@example.com',
          confirmedNotDuplicateOf: ['actor-a'],
        } as unknown as AdminActorCreateDto;

        await createAndExpectDuplicateConflictIds(dto, ['actor-b']);
      });

      // Falsifier 5 (tasks.md T-3) — an EMPTY confirmedNotDuplicateOf must
      // not read as "fully confirmed"; it confirms nothing.
      it('does not bypass the gate when confirmedNotDuplicateOf is present but empty', async () => {
        prisma.actor.findMany.mockResolvedValue([existingActorRow()]);
        stubSuccessfulCreate('actor-new');

        const dto = {
          ...baseDto(),
          email: 'strong-match@example.com',
          confirmedNotDuplicateOf: [],
        } as unknown as AdminActorCreateDto;

        await expect(service.create(dto, ACTING_SUB)).rejects.toBeInstanceOf(
          ConflictException,
        );
      });

      // Falsifier 4 (tasks.md T-3, NFR-3) — no matched VALUE ever appears on
      // the candidate, only attribute names.
      it('candidates never carry a matched VALUE — only actorId/traderId/traderName/matchedOn (NFR-3)', async () => {
        prisma.actor.findMany.mockResolvedValue([existingActorRow()]);
        stubSuccessfulCreate('actor-new');

        const dto = { ...baseDto(), email: 'strong-match@example.com' };

        let caught: unknown;
        try {
          await service.create(dto as AdminActorCreateDto, ACTING_SUB);
        } catch (err) {
          caught = err;
        }

        const response = (caught as ConflictException).getResponse() as {
          duplicateCandidates: Array<Record<string, unknown>>;
        };
        for (const candidate of response.duplicateCandidates) {
          expect(Object.keys(candidate).sort()).toEqual([
            'actorId',
            'matchedOn',
            'traderId',
            'traderName',
          ]);
        }
      });

      // Falsifier 1 (tasks.md T-3, DD-3) — the DD-3 fixture: 5 weak
      // (name+GPS) matches plus 1 strong (email-only) match. An email-only
      // strong match MUST still gate even though every weak match outranks
      // it by `matchedOn.length` (2 vs 1) — proving the strong set is never
      // capped by re-applying the registration matcher's sort-then-slice-5.
      it('DD-3: an email-only strong match still gates alongside 5 weak name+GPS matches', async () => {
        const weakRows = Array.from({ length: 5 }, (_, i) =>
          existingActorRow({
            id: `actor-weak-${i}`,
            traderId: `TZ-WEAK-${i}`,
            phone: null,
            email: null,
            traderName: 'New Actor', // matches dto.traderName
            gpsLatitude: -4.5,
            gpsLongitude: 29.5, // matches dto's GPS below
          }),
        );
        const strongRow = existingActorRow({
          id: 'actor-email-only',
          traderId: 'TZ-EMAIL-ONLY',
          phone: null,
          email: 'strong-match@example.com',
          traderName: 'Totally Unrelated Name',
          gpsLatitude: 10, // far away — no GPS overlap
          gpsLongitude: 10,
        });
        prisma.actor.findMany.mockResolvedValue([...weakRows, strongRow]);
        // Defensive: see the comment above — keeps any red purely about
        // the gate assertion below.
        stubSuccessfulCreate('actor-new');

        const dto = {
          ...baseDto(),
          email: 'strong-match@example.com',
          traderName: 'New Actor',
          gpsLatitude: -4.5,
          gpsLongitude: 29.5,
        } as unknown as AdminActorCreateDto;

        await createAndExpectDuplicateConflictIds(dto, ['actor-email-only']);
      });
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
    /**
     * FR-1 scenario 3 / design.md §4.4 — runs `service.update`, asserts it
     * rejects with a 400 naming `field`, and that the update itself never
     * ran. Returns nothing; callers add their own extra non-call assertions
     * (e.g. `cropsOnActors.deleteMany`, `actorAuditLog.create`) after it.
     */
    async function updateAndExpectFieldRejection(
      actorId: string,
      dto: AdminActorUpdateDto,
      field: string,
    ): Promise<void> {
      let caught: unknown;
      try {
        await service.update(actorId, dto, ACTING_SUB);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      const response = (caught as BadRequestException).getResponse() as {
        details: Array<{ field: string }>;
      };
      expect(response.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field })]),
      );
      expect(prisma.actor.update).not.toHaveBeenCalled();
    }

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

    // T-1 (intake-required-fields) FR-1/design.md §4.4 — reverses the old
    // "removes all crop links" behaviour: a PATCH can no longer wipe every
    // crop. Falsifier 4 (tasks.md T-1): letting `crops: []` pass here is
    // exactly what must redden.
    it('rejects an explicit empty crops array on update (400, field "crops")', async () => {
      const before = fixtureActor({
        crops: [{ crop: { name: 'sorghum' } }],
      });
      prisma.actor.findUnique.mockResolvedValue(before);

      const dto: AdminActorUpdateDto = { crops: [] } as AdminActorUpdateDto;

      await updateAndExpectFieldRejection('actor-1', dto, 'crops');
      expect(prisma.cropsOnActors.deleteMany).not.toHaveBeenCalled();
      expect(prisma.actorAuditLog.create).not.toHaveBeenCalled();
    });

    // FR-1 scenario 3 / design.md §4.4 — the merged-state required check.
    // Falsifier 3 (tasks.md T-1): dropping this check is what must redden.
    describe('merged-state required check (FR-1 scenario 3)', () => {
      it('rejects an edit of an actor stored without email until email is filled', async () => {
        const before = fixtureActor({ email: null });
        prisma.actor.findUnique.mockResolvedValue(before);

        const dto: AdminActorUpdateDto = {
          region: 'Dodoma',
        } as AdminActorUpdateDto;

        await updateAndExpectFieldRejection('actor-1', dto, 'email');
        expect(prisma.actorAuditLog.create).not.toHaveBeenCalled();
      });

      it('allows the same edit once the missing field is supplied in the patch', async () => {
        const before = fixtureActor({ email: null });
        const after = fixtureActor({ region: 'Dodoma', email: 'new@example.com' });

        prisma.actor.findUnique
          .mockResolvedValueOnce(before)
          .mockResolvedValueOnce(after);
        prisma.actor.update.mockResolvedValue(after);
        prisma.actorAuditLog.create.mockResolvedValue({ id: 'audit-1' });

        const dto: AdminActorUpdateDto = {
          region: 'Dodoma',
          email: 'new@example.com',
        } as AdminActorUpdateDto;

        const res = await service.update('actor-1', dto, ACTING_SUB);

        expect(prisma.actor.update).toHaveBeenCalled();
        expect(res.email).toBe('new@example.com');
      });

      it('keeps the stored crop links when dto.crops is absent (not re-required)', async () => {
        const before = fixtureActor({
          crops: [{ crop: { name: 'sorghum' } }],
        });
        const after = fixtureActor({
          traderName: 'Renamed',
          crops: [{ crop: { name: 'sorghum' } }],
        });

        prisma.actor.findUnique
          .mockResolvedValueOnce(before)
          .mockResolvedValueOnce(after);
        prisma.actor.update.mockResolvedValue(after);
        prisma.actorAuditLog.create.mockResolvedValue({ id: 'audit-1' });

        const dto: AdminActorUpdateDto = {
          traderName: 'Renamed',
        } as AdminActorUpdateDto;

        await service.update('actor-1', dto, ACTING_SUB);

        expect(prisma.actor.update).toHaveBeenCalled();
        expect(prisma.cropsOnActors.deleteMany).not.toHaveBeenCalled();
      });

      it('rejects an edit when the stored crop count is zero and the patch never supplies crops', async () => {
        const before = fixtureActor({ crops: [] });
        prisma.actor.findUnique.mockResolvedValue(before);

        const dto: AdminActorUpdateDto = {
          region: 'Dodoma',
        } as AdminActorUpdateDto;

        await updateAndExpectFieldRejection('actor-1', dto, 'crops');
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

    it('allows GRANTED transition when acknowledged is true AND provenance is supplied (FR-3, DD-2)', async () => {
      const before = fixtureActor({ consentStatus: ConsentStatus.UNKNOWN });
      const after = fixtureActor({
        consentStatus: ConsentStatus.GRANTED,
        consentMethod: 'SIGNED_FORM',
        consentObtainedAt: new Date('2026-01-01T00:00:00Z'),
      });

      prisma.actor.findUnique
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce(after);
      prisma.actor.update.mockResolvedValue(after);
      prisma.actorAuditLog.create.mockResolvedValue({ id: 'audit-1' });

      const dto: AdminActorUpdateDto = {
        consentStatus: ConsentStatus.GRANTED,
        acknowledged: true,
        consentMethod: 'SIGNED_FORM' as never,
        consentObtainedAt: '2026-01-01T00:00:00Z' as never,
      } as AdminActorUpdateDto;

      await service.update('actor-1', dto, ACTING_SUB);

      const auditData = prisma.actorAuditLog.create.mock.calls[0][0].data;
      expect(auditData.acknowledged).toBe(true);
      expect(auditData.changes.fields.consentStatus).toEqual({
        from: 'UNKNOWN',
        to: 'GRANTED',
      });
      expect(auditData.changes.fields.consentMethod).toEqual({
        from: 'NOT_RECORDED',
        to: 'SIGNED_FORM',
      });
    });

    it('rejects a GRANTED transition with acknowledged but no provenance (FR-3 — acknowledged is NOT a substitute)', async () => {
      const before = fixtureActor({ consentStatus: ConsentStatus.UNKNOWN });
      prisma.actor.findUnique.mockResolvedValue(before);

      const dto: AdminActorUpdateDto = {
        consentStatus: ConsentStatus.GRANTED,
        acknowledged: true,
      } as AdminActorUpdateDto;

      await expect(
        service.update('actor-1', dto, ACTING_SUB),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.actor.update).not.toHaveBeenCalled();
      expect(prisma.actorAuditLog.create).not.toHaveBeenCalled();
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

    // Falsifier 4 (tasks.md T-2) — re-adding 'traderId' to SCALAR_FIELDS is
    // what must redden the toHaveBeenCalledWith assertion below.
    it('ignores a client-sent traderId on update — it is never forwarded to the write and the stored id never changes', async () => {
      const before = fixtureActor({ traderId: 'TZ-SEED-0001' });
      const after = fixtureActor({ traderId: 'TZ-SEED-0001', region: 'Dodoma' });

      prisma.actor.findUnique
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce(after);
      prisma.actor.update.mockResolvedValue(after);
      prisma.actorAuditLog.create.mockResolvedValue({ id: 'audit-1' });

      const dto = {
        traderId: 'TZ-SEED-9999',
        region: 'Dodoma',
      } as unknown as AdminActorUpdateDto;

      const res = await service.update('actor-1', dto, ACTING_SUB);

      expect(prisma.actor.update).toHaveBeenCalledWith({
        where: { id: 'actor-1' },
        data: { region: 'Dodoma' },
      });
      expect(prisma.actor.update.mock.calls[0][0].data).not.toHaveProperty(
        'traderId',
      );
      expect(res.traderId).toBe('TZ-SEED-0001');
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
    // T-4 — batch provenance for the fill set (design.md DD-4). Every fixture
    // actor defaults to consentMethod: 'NOT_RECORDED' (fixtureActor's own
    // default), so it lands in the fill set unless overridden.
    const BATCH_METHOD = ConsentMethod.PORTAL_CHECKBOX;
    const BATCH_DATE = '2026-07-01T00:00:00.000Z';
    const BATCH_REFERENCE = 'BATCH-2026-07';

    /**
     * Design.md §4.1 preserve/fill matrix — runs `bulkSetConsent` on a
     * single existing actor with the shared `BATCH_*` provenance and asserts
     * the exact `updateMany` write and audit diff it must leave.
     */
    async function expectBulkConsentWrite(
      existingActor: ReturnType<typeof fixtureActor>,
      expectedData: Record<string, unknown>,
      expectedAuditFields: Record<string, unknown>,
    ): Promise<{ preserved: number }> {
      prisma.actor.findMany.mockResolvedValue([existingActor]);
      prisma.actor.updateMany.mockResolvedValue({ count: 1 });
      prisma.actorAuditLog.createMany.mockResolvedValue({ count: 1 });

      const res = await service.bulkSetConsent(
        [existingActor.id as string],
        'GRANTED',
        ACTING_SUB,
        true,
        BATCH_METHOD,
        BATCH_DATE,
        BATCH_REFERENCE,
      );

      expect(prisma.actor.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [existingActor.id] } },
        data: expectedData,
      });

      const auditData = prisma.actorAuditLog.createMany.mock.calls[0][0].data;
      expect(auditData[0].changes.fields).toEqual(expectedAuditFields);

      return { preserved: res.preserved };
    }

    it('flips status to GRANTED, fills provenance on the NOT_RECORDED set, and returns preserved: 0', async () => {
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
        BATCH_METHOD,
        BATCH_DATE,
        BATCH_REFERENCE,
      );

      expect(res).toEqual({
        requested: 2,
        applied: 2,
        notFound: [],
        preserved: 0,
      });
      // Both actors are NOT_RECORDED — one uniform fill updateMany, no
      // separate status-only call for a (here empty) preserved set.
      expect(prisma.actor.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.actor.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['actor-1', 'actor-2'] } },
        data: {
          consentStatus: ConsentStatus.GRANTED,
          consentMethod: BATCH_METHOD,
          consentObtainedAt: BATCH_DATE,
          consentReference: BATCH_REFERENCE,
        },
      });

      const auditData = prisma.actorAuditLog.createMany.mock.calls[0][0].data;
      expect(auditData).toHaveLength(2);
      expect(auditData[0].action).toBe('BULK_CONSENT');
      expect(auditData[0].acknowledged).toBe(true);
      expect(auditData[0].changes.fields.consentStatus).toEqual({
        from: 'UNKNOWN',
        to: 'GRANTED',
      });
      expect(auditData[0].changes.fields.consentMethod).toEqual({
        from: 'NOT_RECORDED',
        to: BATCH_METHOD,
      });
      expect(auditData[0].changes.fields.consentObtainedAt).toEqual({
        from: null,
        to: BATCH_DATE,
      });
      expect(auditData[0].changes.fields.consentReference).toEqual({
        from: null,
        to: BATCH_REFERENCE,
      });
      expect(auditData[1].changes.fields.consentStatus).toEqual({
        from: 'DENIED',
        to: 'GRANTED',
      });
    });

    it('mixed batch: preserves an already-evidenced actor untouched and fills only the unevidenced one (R-8, FR-3)', async () => {
      const evidencedObtainedAt = new Date('2025-06-01T00:00:00Z');
      const existing = [
        // Already carries its OWN evidence, recorded during an earlier
        // individual edit — DIFFERENT from the batch values below, so an
        // overwrite bug would be detectable.
        fixtureActor({
          id: 'actor-evidenced',
          consentStatus: ConsentStatus.DENIED,
          consentMethod: ConsentMethod.SIGNED_FORM,
          consentObtainedAt: evidencedObtainedAt,
          consentReference: 'DOC-100',
        }),
        fixtureActor({
          id: 'actor-unevidenced',
          consentStatus: ConsentStatus.DENIED,
          consentMethod: ConsentMethod.NOT_RECORDED,
          consentObtainedAt: null,
          consentReference: null,
        }),
      ];
      prisma.actor.findMany.mockResolvedValue(existing);
      prisma.actor.updateMany.mockResolvedValue({ count: 1 });
      prisma.actorAuditLog.createMany.mockResolvedValue({ count: 2 });

      const res = await service.bulkSetConsent(
        ['actor-evidenced', 'actor-unevidenced'],
        'GRANTED',
        ACTING_SUB,
        true,
        BATCH_METHOD,
        BATCH_DATE,
        BATCH_REFERENCE,
      );

      expect(res).toEqual({
        requested: 2,
        applied: 2,
        notFound: [],
        preserved: 1,
      });

      // Two distinct updateMany calls: status-only for the preserved actor,
      // full fill for the unevidenced one. Neither touches the other's row.
      expect(prisma.actor.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.actor.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['actor-evidenced'] } },
        data: { consentStatus: ConsentStatus.GRANTED },
      });
      expect(prisma.actor.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['actor-unevidenced'] } },
        data: {
          consentStatus: ConsentStatus.GRANTED,
          consentMethod: BATCH_METHOD,
          consentObtainedAt: BATCH_DATE,
          consentReference: BATCH_REFERENCE,
        },
      });

      const auditData = prisma.actorAuditLog.createMany.mock.calls[0][0].data;
      const byId = Object.fromEntries(
        auditData.map((row: { actorId: string; changes: unknown }) => [
          row.actorId,
          row.changes,
        ]),
      );

      // The evidenced actor's audit entry shows ONLY the status transition —
      // its method/date/reference are absent from the diff because they
      // never changed.
      expect(byId['actor-evidenced'].fields.consentStatus).toEqual({
        from: 'DENIED',
        to: 'GRANTED',
      });
      expect(byId['actor-evidenced'].fields.consentMethod).toBeUndefined();
      expect(byId['actor-evidenced'].fields.consentObtainedAt).toBeUndefined();
      expect(byId['actor-evidenced'].fields.consentReference).toBeUndefined();

      expect(byId['actor-unevidenced'].fields.consentMethod).toEqual({
        from: 'NOT_RECORDED',
        to: BATCH_METHOD,
      });
    });

    it('T-4 rework attempt-2 regression: fills a missing date (and a missing reference) on an actor with its OWN recorded method, and never overwrites that method with the batch value', async () => {
      // Attempt 1's defect: this actor's consentMethod is recorded (EMAIL),
      // so `consentMethod === NOT_RECORDED` alone put it in "preserved" and
      // it would have ended GRANTED with consentObtainedAt still null. It
      // has NO consentReference either, so this also covers the "date +
      // reference missing, method present" fill group.
      const existing = [
        fixtureActor({
          id: 'actor-date-ref-only',
          consentStatus: ConsentStatus.DENIED,
          consentMethod: ConsentMethod.EMAIL,
          consentObtainedAt: null,
          consentReference: null,
        }),
      ];
      prisma.actor.findMany.mockResolvedValue(existing);
      prisma.actor.updateMany.mockResolvedValue({ count: 1 });
      prisma.actorAuditLog.createMany.mockResolvedValue({ count: 1 });

      const res = await service.bulkSetConsent(
        ['actor-date-ref-only'],
        'GRANTED',
        ACTING_SUB,
        true,
        BATCH_METHOD,
        BATCH_DATE,
        BATCH_REFERENCE,
      );

      // Not preserved — it was genuinely missing provenance (the date), so
      // it must end up with COMPLETE provenance, not left GRANTED+null.
      expect(res).toEqual({
        requested: 1,
        applied: 1,
        notFound: [],
        preserved: 0,
      });

      // consentMethod is absent from the write entirely — the actor's own
      // EMAIL is never touched, let alone overwritten by BATCH_METHOD.
      expect(prisma.actor.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.actor.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['actor-date-ref-only'] } },
        data: {
          consentStatus: ConsentStatus.GRANTED,
          consentObtainedAt: BATCH_DATE,
          consentReference: BATCH_REFERENCE,
        },
      });

      const auditData = prisma.actorAuditLog.createMany.mock.calls[0][0].data;
      expect(auditData).toHaveLength(1);
      // Exactly the fields written — no phantom consentMethod entry.
      expect(auditData[0].changes.fields).toEqual({
        consentStatus: { from: 'DENIED', to: 'GRANTED' },
        consentObtainedAt: { from: null, to: BATCH_DATE },
        consentReference: { from: null, to: BATCH_REFERENCE },
      });
    });

    it('reachable via un-publish-then-strip (design.md §4.1 row 5): a DENIED actor with its own method and reference but a stripped date is filled on the date alone and keeps its method', async () => {
      // Only the date is written — method and reference are the actor's own
      // and are never touched.
      const { preserved } = await expectBulkConsentWrite(
        fixtureActor({
          id: 'actor-date-only',
          consentStatus: ConsentStatus.DENIED,
          consentMethod: ConsentMethod.SIGNED_FORM,
          consentObtainedAt: null,
          consentReference: 'DOC-777',
        }),
        {
          consentStatus: ConsentStatus.GRANTED,
          consentObtainedAt: BATCH_DATE,
        },
        {
          consentStatus: { from: 'DENIED', to: 'GRANTED' },
          consentObtainedAt: { from: null, to: BATCH_DATE },
        },
      );
      expect(preserved).toBe(0);
    });

    it('ADVISORY-1: an actor with NOT_RECORDED method and its OWN non-null consentReference keeps that reference — the batch reference never overwrites it', async () => {
      // consentReference is absent — the actor's own OWN-REF-1 survives.
      const { preserved } = await expectBulkConsentWrite(
        fixtureActor({
          id: 'actor-ref-preserved',
          consentStatus: ConsentStatus.UNKNOWN,
          consentMethod: ConsentMethod.NOT_RECORDED,
          consentObtainedAt: null,
          consentReference: 'OWN-REF-1',
        }),
        {
          consentStatus: ConsentStatus.GRANTED,
          consentMethod: BATCH_METHOD,
          consentObtainedAt: BATCH_DATE,
        },
        {
          consentStatus: { from: 'UNKNOWN', to: 'GRANTED' },
          consentMethod: { from: 'NOT_RECORDED', to: BATCH_METHOD },
          consentObtainedAt: { from: null, to: BATCH_DATE },
        },
      );
      expect(preserved).toBe(0);
    });

    it('skips the audit row for an actor with no field change at all', async () => {
      // Already GRANTED with the SAME provenance the batch would apply —
      // truly nothing changes.
      const existing = [
        fixtureActor({
          id: 'actor-1',
          consentStatus: ConsentStatus.GRANTED,
          consentMethod: BATCH_METHOD,
          consentObtainedAt: new Date(BATCH_DATE),
          consentReference: BATCH_REFERENCE,
        }),
        fixtureActor({
          id: 'actor-2',
          consentStatus: ConsentStatus.DENIED,
          consentMethod: ConsentMethod.NOT_RECORDED,
        }),
      ];
      prisma.actor.findMany.mockResolvedValue(existing);
      prisma.actor.updateMany.mockResolvedValue({ count: 1 });
      prisma.actorAuditLog.createMany.mockResolvedValue({ count: 1 });

      const res = await service.bulkSetConsent(
        ['actor-1', 'actor-2'],
        'GRANTED',
        ACTING_SUB,
        true,
        BATCH_METHOD,
        BATCH_DATE,
        BATCH_REFERENCE,
      );

      // actor-1 is already GRANTED+BATCH_METHOD, so it lands in the
      // "preserved" partition (its consentMethod is not NOT_RECORDED) even
      // though its values happen to equal the batch's.
      expect(res.preserved).toBe(1);
      const auditData = prisma.actorAuditLog.createMany.mock.calls[0][0].data;
      expect(auditData).toHaveLength(1);
      expect(auditData[0].actorId).toBe('actor-2');
    });

    it('rejects an unlock with no consentMethod/consentObtainedAt and modifies zero rows', async () => {
      await expect(
        service.bulkSetConsent(['actor-1'], 'GRANTED', ACTING_SUB, true),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.actor.findMany).not.toHaveBeenCalled();
      expect(prisma.actor.updateMany).not.toHaveBeenCalled();
      expect(prisma.actorAuditLog.createMany).not.toHaveBeenCalled();
    });

    it('rejects an unlock with consentMethod but no consentObtainedAt (partial provenance) and modifies zero rows', async () => {
      await expect(
        service.bulkSetConsent(
          ['actor-1'],
          'GRANTED',
          ACTING_SUB,
          true,
          BATCH_METHOD,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.actor.findMany).not.toHaveBeenCalled();
    });

    it('flips status to DENIED and returns { requested, applied, notFound, preserved: 0 } with no provenance required', async () => {
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

      expect(res).toEqual({
        requested: 2,
        applied: 2,
        notFound: [],
        preserved: 0,
      });
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
        preserved: 0,
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

    it('does not require acknowledgement or provenance for DENIED (lock)', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActor({ id: 'actor-1' })]);
      prisma.actor.updateMany.mockResolvedValue({ count: 1 });
      prisma.actorAuditLog.createMany.mockResolvedValue({ count: 1 });

      await expect(
        service.bulkSetConsent(['actor-1'], 'DENIED', ACTING_SUB),
      ).resolves.toEqual({
        requested: 1,
        applied: 1,
        notFound: [],
        preserved: 0,
      });
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
