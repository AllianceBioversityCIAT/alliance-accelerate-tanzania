import { NotFoundException } from '@nestjs/common';
import { Prisma, RegistrationStatus } from '@prisma/client';
import { AdminRegistrationsController } from './admin-registrations.controller';
import { AdminRegistrationsService } from './admin-registrations.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';

/**
 * T-7 — `POST /admin/registrations/:id/dismiss-duplicate` (FR-11 scenario 2,
 * `design.md` §4.3, §5's contract row).
 *
 * Named for the task's own Verify command (`npm test -- --silent
 * dismiss-duplicate`) rather than collocated with `admin-registrations.
 * service.spec.ts`/`.controller.spec.ts` — `AdminRegistrationsService` and
 * `AdminRegistrationsController` are still the classes under test (T-4's
 * `list`/T-6's `getById` keep their own coverage in those files, untouched).
 *
 * Two top-level blocks: `AdminRegistrationsService.dismissDuplicate` (mocked
 * Prisma, mirroring `admin-registrations.service.spec.ts`'s own style) and
 * `AdminRegistrationsController.dismissDuplicate` (mocked service, mirroring
 * `admin-registrations.controller.spec.ts`'s own style).
 *
 * **R4 remediation (post-validation).** `dismissDuplicate` was rewritten
 * from a plain read-modify-write (`prisma.registration.update`, no
 * predicate on the value read) to a bounded-retry compare-and-set
 * (`prisma.registration.updateMany`, `where` pinning the exact value this
 * attempt read) — see that method's own doc comment in
 * `admin-registrations.service.ts` for the full account of the defect and
 * the fix. Every test below that asserts on the persistence call now
 * targets `updateMany`, not `update`; a standalone `describe` block near
 * the end of this file is the NEW concurrency proof this remediation added.
 */

interface MockPrisma {
  registration: {
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
  actor: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
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

/** The row `dismissDuplicate` reads before writing — its own narrow `select`. */
function dismissBaseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'reg-1',
    reference: 'REG-2026-0001',
    status: RegistrationStatus.PENDING_REVIEW,
    duplicateDismissals: null,
    ...overrides,
  };
}

/** A `getById`-shaped row, standing in for a persisted registration on "reload". */
function reloadDetailRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'reg-1',
    reference: 'REG-2026-0001',
    status: RegistrationStatus.PENDING_REVIEW,
    payload: {
      traderName: 'Meru Agro-Processing & Seeds',
      traderType: 'seed_company',
      contactPerson: 'Grace Mushi',
      region: 'Arusha',
      crops: ['sorghum'],
      capacityTons: 50,
      phone: '+255712345678',
    },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    submitterEmail: 'applicant@example.com',
    emailVerifiedAt: new Date('2026-01-01T00:05:00Z'),
    consentAcceptedAt: new Date('2026-01-01T00:10:00Z'),
    consentPolicyVersion: 'v3',
    reviewedAt: null,
    reviewedBySub: null,
    reviewedByEmail: null,
    duplicateDismissals: null,
    ...overrides,
  };
}

describe('AdminRegistrationsService.dismissDuplicate (T-7, FR-11 scenario 2, mocked Prisma)', () => {
  let service: AdminRegistrationsService;
  let prisma: MockPrisma;
  let actingAdminResolver: { resolve: jest.Mock };

  beforeEach(() => {
    prisma = {
      registration: {
        findUnique: jest.fn(),
        // R4 — the compare-and-set write. Defaults to a first-attempt
        // success ({ count: 1 }); the concurrency `describe` block below
        // overrides this with real compare-and-set semantics.
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      actor: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
    };
    actingAdminResolver = { resolve: jest.fn() };
    const duplicateDetection = new DuplicateDetectionService(prisma as unknown as never);
    // T-8 — `AdminRegistrationsService` gained two constructor deps
    // (`ActorAuditService`, `MailService`) for `approve`; `dismissDuplicate`
    // uses neither, so bare mocks are enough to satisfy the constructor.
    service = new AdminRegistrationsService(
      prisma as unknown as never,
      duplicateDetection,
      actingAdminResolver as unknown as ActingAdminResolver,
      { logRegistrationApprove: jest.fn() } as unknown as never,
      { sendApproval: jest.fn() } as unknown as never,
    );
  });

  it('throws NotFoundException (404) for an unknown registration id, and touches neither Actor nor the write path', async () => {
    prisma.registration.findUnique.mockResolvedValue(null);

    await expect(
      service.dismissDuplicate('reg-missing', 'actor-1', 'admin-sub'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.dismissDuplicate('reg-missing', 'actor-1', 'admin-sub'),
    ).rejects.toThrow('Registration reg-missing not found');
    expect(prisma.actor.findUnique).not.toHaveBeenCalled();
    expect(prisma.registration.updateMany).not.toHaveBeenCalled();
  });

  it('throws NotFoundException (404) when candidateActorId names no existing Actor row — the second limb of the §5 404 contract', async () => {
    prisma.registration.findUnique.mockResolvedValue(dismissBaseRow());
    prisma.actor.findUnique.mockResolvedValue(null);

    await expect(
      service.dismissDuplicate('reg-1', 'actor-does-not-exist', 'admin-sub'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.actor.findUnique).toHaveBeenCalledWith({
      where: { id: 'actor-does-not-exist' },
      select: { id: true },
    });
    expect(prisma.registration.updateMany).not.toHaveBeenCalled();
  });

  it(
    'writes exactly ONE new dismissal entry naming the requested candidate, never the whole ' +
      'detected set — the write-side half of DC-31',
    async () => {
      prisma.registration.findUnique.mockResolvedValue(dismissBaseRow());
      prisma.actor.findUnique.mockResolvedValue({ id: 'actor-1' });
      actingAdminResolver.resolve.mockResolvedValue('admin@example.com');

      await service.dismissDuplicate('reg-1', 'actor-1', 'admin-sub-1');

      expect(prisma.registration.updateMany).toHaveBeenCalledTimes(1);
      const data = prisma.registration.updateMany.mock.calls[0][0].data;
      expect(data.duplicateDismissals).toHaveLength(1);
      expect(data.duplicateDismissals[0]).toMatchObject({ actorId: 'actor-1' });
    },
  );

  it(
    'DC-31 — dismissing one of THREE open candidates leaves the other two returned after reload ' +
      "(design.md §14's own gate description; a single-candidate fixture cannot distinguish this " +
      "from a row-level bug, per tasks.md T-7's disqualifying clause)",
    async () => {
      // Step 1 — dismiss actor-1 of three open candidates (actor-1/2/3, none previously dismissed).
      prisma.registration.findUnique.mockResolvedValueOnce(dismissBaseRow());
      prisma.actor.findUnique.mockResolvedValue({ id: 'actor-1' });
      actingAdminResolver.resolve.mockResolvedValue('admin@example.com');

      await service.dismissDuplicate('reg-1', 'actor-1', 'admin-sub-1');

      const writtenDismissals = prisma.registration.updateMany.mock.calls[0][0].data
        .duplicateDismissals as unknown[];
      expect(writtenDismissals).toHaveLength(1);

      // Step 2 — "reload": GET /:id sees the PERSISTED duplicateDismissals
      // from step 1, and all three actors still match the registration on phone.
      prisma.registration.findUnique.mockResolvedValueOnce(
        reloadDetailRow({ duplicateDismissals: writtenDismissals }),
      );
      prisma.actor.findMany.mockResolvedValue([
        fixtureActor({ id: 'actor-1', phone: '+255712345678' }),
        fixtureActor({ id: 'actor-2', phone: '+255712345678' }),
        fixtureActor({ id: 'actor-3', phone: '+255712345678' }),
      ]);

      const detail = await service.getById('reg-1');
      const openCandidateIds = detail.duplicateCandidates.map((c) => c.actorId).sort();
      expect(openCandidateIds).toEqual(['actor-2', 'actor-3']);
    },
  );

  it(
    'appends onto a PRE-EXISTING dismissal rather than overwriting it — the literal ' +
      'append-vs-overwrite proof (see this task\'s report for the verbatim falsifying-mutation ' +
      'run against this test)',
    async () => {
      const priorEntry = {
        actorId: 'actor-0',
        dismissedBySub: 'earlier-admin-sub',
        dismissedByEmail: 'earlier-admin@example.com',
        dismissedAt: '2026-01-01T00:00:00.000Z',
      };
      prisma.registration.findUnique.mockResolvedValue(
        dismissBaseRow({ duplicateDismissals: [priorEntry] }),
      );
      prisma.actor.findUnique.mockResolvedValue({ id: 'actor-1' });
      actingAdminResolver.resolve.mockResolvedValue('admin@example.com');

      await service.dismissDuplicate('reg-1', 'actor-1', 'admin-sub-1');

      const data = prisma.registration.updateMany.mock.calls[0][0].data;
      expect(data.duplicateDismissals).toHaveLength(2);
      expect(data.duplicateDismissals[0]).toEqual(priorEntry);
      expect(data.duplicateDismissals[1]).toMatchObject({ actorId: 'actor-1' });
    },
  );

  describe('the dismisser identity is sourced server-side — never from the request body (§8)', () => {
    it("uses the JWT-resolved actingSub verbatim as dismissedBySub, and calls the resolver with that SAME sub for the email", async () => {
      prisma.registration.findUnique.mockResolvedValue(dismissBaseRow());
      prisma.actor.findUnique.mockResolvedValue({ id: 'actor-1' });
      actingAdminResolver.resolve.mockResolvedValue('resolved-admin@example.com');

      await service.dismissDuplicate('reg-1', 'actor-1', 'cognito-sub-xyz');

      expect(actingAdminResolver.resolve).toHaveBeenCalledWith('cognito-sub-xyz');
      const entry = prisma.registration.updateMany.mock.calls[0][0].data.duplicateDismissals[0];
      expect(entry.dismissedBySub).toBe('cognito-sub-xyz');
      expect(entry.dismissedByEmail).toBe('resolved-admin@example.com');
    });

    it(
      'persists NULL, never an empty string, when ActingAdminResolver fails to resolve the email — ' +
        "the exact coalescing defect T-6 was reworked for (execution.md FAIL Issue 2)",
      async () => {
        prisma.registration.findUnique.mockResolvedValue(dismissBaseRow());
        prisma.actor.findUnique.mockResolvedValue({ id: 'actor-1' });
        actingAdminResolver.resolve.mockResolvedValue(null);

        await service.dismissDuplicate('reg-1', 'actor-1', 'cognito-sub-xyz');

        const entry = prisma.registration.updateMany.mock.calls[0][0].data.duplicateDismissals[0];
        expect(entry.dismissedByEmail).toBeNull();
        expect(entry.dismissedByEmail).not.toBe('');
      },
    );
  });

  it('emits dismissedAt as a Z-suffixed ISO-8601 instant via new Date().toISOString() — never an offset-bearing one (carried from T-6 execution.md A-37)', async () => {
    prisma.registration.findUnique.mockResolvedValue(dismissBaseRow());
    prisma.actor.findUnique.mockResolvedValue({ id: 'actor-1' });
    actingAdminResolver.resolve.mockResolvedValue('admin@example.com');

    const before = new Date();
    await service.dismissDuplicate('reg-1', 'actor-1', 'admin-sub-1');
    const after = new Date();

    const entry = prisma.registration.updateMany.mock.calls[0][0].data.duplicateDismissals[0];
    expect(entry.dismissedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const parsed = new Date(entry.dismissedAt).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before.getTime());
    expect(parsed).toBeLessThanOrEqual(after.getTime());
  });

  it(
    'ROUND-TRIP — a resolver-null dismissal survives write→read: GET /:id’s activity trail ' +
      'still carries one DUPLICATE_DISMISSED event with dismissedByEmail === null, never silently ' +
      "dropped (T-7 rework, execution.md FAIL — activity-trail.serializer.ts's DUPLICATE_DISMISSED " +
      'guard used to demand a string email, unlike the ADJUDICATED path it already models correctly)',
    async () => {
      // Step 1 — dismiss with a resolver that FAILS to resolve an email (design.md §8: null is a
      // real, reachable production state, never coalesced to '').
      prisma.registration.findUnique.mockResolvedValueOnce(dismissBaseRow());
      prisma.actor.findUnique.mockResolvedValue({ id: 'actor-1' });
      actingAdminResolver.resolve.mockResolvedValue(null);

      await service.dismissDuplicate('reg-1', 'actor-1', 'admin-sub-1');

      const writtenDismissals = prisma.registration.updateMany.mock.calls[0][0].data
        .duplicateDismissals as unknown[];
      expect(writtenDismissals).toHaveLength(1);

      // Step 2 — "reload": GET /:id sees the PERSISTED duplicateDismissals from step 1.
      prisma.registration.findUnique.mockResolvedValueOnce(
        reloadDetailRow({ duplicateDismissals: writtenDismissals }),
      );
      prisma.actor.findMany.mockResolvedValue([]);

      const detail = await service.getById('reg-1');
      const dismissedEvents = detail.activityTrail.filter((e) => e.type === 'DUPLICATE_DISMISSED');

      expect(dismissedEvents).toHaveLength(1);
      expect(dismissedEvents[0]).toMatchObject({ dismissedByEmail: null });
      expect((dismissedEvents[0] as { dismissedByEmail: unknown }).dismissedByEmail).not.toBe('');
    },
  );

  it(
    'resolves { registration: { id, reference, status } } from the row READ before the ' +
      'compare-and-set write, never from the write itself (R4 — updateMany returns only a ' +
      'count, never row data; id/reference/status cannot change across a dismissal)',
    async () => {
      prisma.registration.findUnique.mockResolvedValue({
        id: 'reg-1',
        reference: 'REG-2026-0001',
        status: RegistrationStatus.PENDING_REVIEW,
        duplicateDismissals: null,
      });
      prisma.actor.findUnique.mockResolvedValue({ id: 'actor-1' });
      actingAdminResolver.resolve.mockResolvedValue('admin@example.com');

      const result = await service.dismissDuplicate('reg-1', 'actor-1', 'admin-sub-1');

      expect(result).toEqual({
        registration: {
          id: 'reg-1',
          reference: 'REG-2026-0001',
          status: RegistrationStatus.PENDING_REVIEW,
        },
      });
    },
  );

  it(
    'R4 — exhausting the retry budget raises a 409, never a silent loss and never an ' +
      'unbounded loop',
    async () => {
      prisma.registration.findUnique.mockResolvedValue(dismissBaseRow());
      prisma.actor.findUnique.mockResolvedValue({ id: 'actor-1' });
      actingAdminResolver.resolve.mockResolvedValue('admin@example.com');
      // Every attempt's compare-and-set predicate loses — simulates a
      // registration under sustained concurrent write pressure.
      prisma.registration.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.dismissDuplicate('reg-1', 'actor-1', 'admin-sub-1'),
      ).rejects.toThrow(/kept changing concurrently/);

      // Bounded: findUnique is called once up front (the 404 check) plus
      // once per retry attempt after the first (MAX_DISMISS_DUPLICATE_
      // ATTEMPTS - 1 extra re-reads), and updateMany exactly
      // MAX_DISMISS_DUPLICATE_ATTEMPTS times — never runs away.
      expect(prisma.registration.updateMany).toHaveBeenCalledTimes(3);
      expect(prisma.registration.findUnique).toHaveBeenCalledTimes(3);
    },
  );
});

/**
 * R4 remediation — the required concurrency proof (post-validation WARN
 * R4): two dismissals of DIFFERENT candidates, interleaved so both read the
 * SAME base `duplicateDismissals` array, must not lose either entry.
 *
 * **Why this uses its own hand-rolled Prisma double instead of jest.fn()
 * return-value sequencing.** The other tests in this file mock Prisma calls
 * with fixed/sequenced return values, which can only prove what a SINGLE
 * request does. A lost update is a property of TWO requests racing against
 * shared mutable state — proving it (and proving the fix) requires a fake
 * that actually behaves like the row it is standing in for: `findUnique`
 * always reads the CURRENT value, and the write methods actually mutate it.
 * `update` is wired to an UNCONDITIONAL overwrite — exactly what a real
 * `UPDATE Registration SET duplicateDismissals = ? WHERE id = ?` with no
 * predicate on the prior value does — which is what lets this SAME test run
 * against the pre-fix `dismissDuplicate` (which called `.update`) and
 * genuinely reproduce the lost update, rather than merely erroring on a
 * renamed mock method. `updateMany` is wired to the real compare-and-set
 * semantics the fix depends on: a write only lands when the column still
 * holds exactly the value this attempt read.
 *
 * Two `dismissDuplicate` calls are started via `Promise.all` with NO
 * intervening `await` — both begin executing synchronously up to their own
 * first awaited Prisma call, so they interleave in lockstep through their
 * identical sequence of awaited reads (registration existence check, actor
 * existence check, email resolution) and arrive at their first write
 * attempt in the SAME microtask round, each having read the row before
 * either had written to it.
 */
describe('R4 — CONCURRENCY: two overlapping dismissals of DIFFERENT candidates', () => {
  interface RaceMockPrisma {
    registration: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    actor: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  }

  function buildRacePrisma(stateHolder: { stored: unknown[] | null }): RaceMockPrisma {
    return {
      registration: {
        findUnique: jest.fn(async () => ({
          id: 'reg-1',
          reference: 'REG-2026-0001',
          status: RegistrationStatus.PENDING_REVIEW,
          duplicateDismissals: stateHolder.stored,
        })),
        // Pre-fix shape (`.update`) — an UNCONDITIONAL overwrite, matching
        // a real MySQL UPDATE with no predicate on the prior value. This is
        // what makes this same test able to redden against the ORIGINAL
        // dismissDuplicate.
        update: jest.fn(
          async ({ data }: { data: { duplicateDismissals: unknown[] } }) => {
            stateHolder.stored = data.duplicateDismissals;
            return {
              id: 'reg-1',
              reference: 'REG-2026-0001',
              status: RegistrationStatus.PENDING_REVIEW,
            };
          },
        ),
        // Post-fix shape (`.updateMany`) — a real compare-and-set: `count:
        // 0` whenever the column no longer holds exactly what THIS attempt
        // read.
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { duplicateDismissals: { equals: unknown } };
            data: { duplicateDismissals: unknown[] };
          }) => {
            const predicateValue = where.duplicateDismissals.equals;
            // `Prisma.DbNull` is a singleton class instance (identity
            // comparison), representing "the column is a real SQL NULL" —
            // never `=== null` itself, and never JSON-serializable.
            const currentMatches =
              predicateValue === Prisma.DbNull
                ? stateHolder.stored === null
                : JSON.stringify(stateHolder.stored) === JSON.stringify(predicateValue);
            if (!currentMatches) return { count: 0 };
            stateHolder.stored = data.duplicateDismissals;
            return { count: 1 };
          },
        ),
      },
      actor: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
      },
    };
  }

  it(
    'both entries survive when the writes interleave so both requests read the SAME base ' +
      'array — reddens against the pre-fix read-modify-write (see this task\'s report for the ' +
      'verbatim pre-fix failure output)',
    async () => {
      const stateHolder: { stored: unknown[] | null } = { stored: null };
      const racePrisma = buildRacePrisma(stateHolder);
      const raceResolver = { resolve: jest.fn().mockResolvedValue('admin@example.com') };
      const raceDuplicateDetection = new DuplicateDetectionService(racePrisma as unknown as never);
      const raceService = new AdminRegistrationsService(
        racePrisma as unknown as never,
        raceDuplicateDetection,
        raceResolver as unknown as ActingAdminResolver,
        { logRegistrationApprove: jest.fn() } as unknown as never,
        { sendApproval: jest.fn() } as unknown as never,
      );

      const [resultA, resultB] = await Promise.all([
        raceService.dismissDuplicate('reg-1', 'actor-A', 'admin-sub-A'),
        raceService.dismissDuplicate('reg-1', 'actor-B', 'admin-sub-B'),
      ]);

      expect(resultA.registration.id).toBe('reg-1');
      expect(resultB.registration.id).toBe('reg-1');

      expect(stateHolder.stored).not.toBeNull();
      const finalDismissals = stateHolder.stored as Array<{ actorId: string }>;
      expect(finalDismissals).toHaveLength(2);
      expect(finalDismissals.map((e) => e.actorId).sort()).toEqual(['actor-A', 'actor-B']);
    },
  );
});

describe('AdminRegistrationsController.dismissDuplicate (T-7, mocked service)', () => {
  let controller: AdminRegistrationsController;
  let service: { dismissDuplicate: jest.Mock };

  beforeEach(() => {
    service = {
      dismissDuplicate: jest.fn().mockResolvedValue({
        registration: { id: 'reg-1', reference: 'REG-2026-0001', status: 'PENDING_REVIEW' },
      }),
    };
    controller = new AdminRegistrationsController(
      service as unknown as AdminRegistrationsService,
    );
  });

  it(
    "forwards the path id, the body's candidateActorId, and the CURRENT USER's sub — never a " +
      'sub/email from the body, which the DTO does not even carry',
    async () => {
      const user = {
        sub: 'cognito-sub-current-caller',
        username: 'reviewer',
        groups: ['admin'],
        role: 'Admin',
      } as never;

      const result = await controller.dismissDuplicate(
        'reg-1',
        { candidateActorId: 'actor-1' } as never,
        user,
      );

      expect(service.dismissDuplicate).toHaveBeenCalledTimes(1);
      expect(service.dismissDuplicate).toHaveBeenCalledWith(
        'reg-1',
        'actor-1',
        'cognito-sub-current-caller',
      );
      expect(result).toEqual({
        registration: { id: 'reg-1', reference: 'REG-2026-0001', status: 'PENDING_REVIEW' },
      });
    },
  );

  it("adds no branching of its own — the 404-vs-success decision is entirely the service's", async () => {
    service.dismissDuplicate.mockRejectedValueOnce(
      new Error('Duplicate candidate actor-x not found for registration reg-1'),
    );

    await expect(
      controller.dismissDuplicate(
        'reg-1',
        { candidateActorId: 'actor-x' } as never,
        { sub: 'admin-sub' } as never,
      ),
    ).rejects.toThrow('Duplicate candidate actor-x not found for registration reg-1');
  });
});
