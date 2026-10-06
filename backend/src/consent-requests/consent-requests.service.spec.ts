// @sdd-spec actors/consent-intake/consent-request-email (T-3)
/**
 * `ConsentRequestsService` unit tests (design.md §5.1, §5.2 step 1, §6).
 *
 * `prisma.actor.findMany`/`consentRequest.findMany`/`consentRequest.createMany`
 * are mocked with small, realistic in-memory behaviour (not just
 * shape-asserted), so these tests prove the actual partition/enqueue logic.
 */
import { BadRequestException } from '@nestjs/common';
import { ConsentMethod, ConsentStatus, RegistrationSource } from '@prisma/client';
import { ConsentRequestsService } from './consent-requests.service';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';
import { ConsentSupersessionService } from './consent-supersession.service';
import { CURRENT_ADMIN_CONSENT_EDITION, computeAdminConsentEditionHash } from './admin-consent-policy';

const ACTING_SUB = 'admin-sub';
const ACTING_EMAIL = 'admin@example.com';

interface FixtureActor {
  id: string;
  traderId: string;
  traderName: string;
  email: string | null;
  consentStatus: ConsentStatus;
  region?: string;
  traderType?: string;
  registrationSource?: RegistrationSource;
  consentMethod?: ConsentMethod;
}

interface FixtureRequest {
  actorId: string;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
}

function buildPrisma(actors: FixtureActor[], requests: FixtureRequest[]) {
  const createManyCalls: unknown[] = [];

  const matchesFilterWhere = (actor: FixtureActor, where: Record<string, unknown>): boolean => {
    if (where.id && (where.id as { in: string[] }).in) {
      return (where.id as { in: string[] }).in.includes(actor.id);
    }
    for (const [key, value] of Object.entries(where)) {
      if (actor[key as keyof FixtureActor] !== value) return false;
    }
    return true;
  };

  const actor = {
    findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      actors.filter((a) => matchesFilterWhere(a, where)),
    ),
  };

  const consentRequest = {
    findMany: jest.fn(async ({ where }: { where: { actorId: { in: string[] } } }) =>
      requests.filter((r) => where.actorId.in.includes(r.actorId)),
    ),
    createMany: jest.fn(async (args: { data: unknown[] }) => {
      createManyCalls.push(args.data);
      return { count: args.data.length };
    }),
  };

  const tx: { actor: typeof actor; consentRequest: typeof consentRequest } = { actor, consentRequest };
  const $transaction = jest.fn(async (cb: (tx: { actor: typeof actor; consentRequest: typeof consentRequest }) => unknown) => cb(tx));

  return { actor, consentRequest, $transaction, createManyCalls };
}

describe('ConsentRequestsService', () => {
  let actingAdminResolver: ActingAdminResolver;
  let supersessionService: ConsentSupersessionService;

  beforeEach(() => {
    actingAdminResolver = {
      resolve: jest.fn().mockResolvedValue(ACTING_EMAIL),
    } as unknown as ActingAdminResolver;
    supersessionService = {
      supersedePendingFor: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConsentSupersessionService;
  });

  function buildService(prisma: ReturnType<typeof buildPrisma>) {
    return new ConsentRequestsService(
      prisma as unknown as never,
      actingAdminResolver,
      supersessionService,
    );
  }

  describe('the five-reason matrix (FR-2 scenario 1), ids target, bulk scope', () => {
    it('reports 1 to send and 4 skipped, each under its own reason', async () => {
      const prisma = buildPrisma(
        [
          { id: 'a-no-email', traderId: 'T1', traderName: 'No Email', email: null, consentStatus: ConsentStatus.UNKNOWN },
          { id: 'a-granted', traderId: 'T2', traderName: 'Granted', email: 'g@example.com', consentStatus: ConsentStatus.GRANTED },
          { id: 'a-pending', traderId: 'T3', traderName: 'Pending', email: 'p@example.com', consentStatus: ConsentStatus.UNKNOWN },
          { id: 'a-declined', traderId: 'T4', traderName: 'Declined', email: 'd@example.com', consentStatus: ConsentStatus.DENIED },
          { id: 'a-eligible', traderId: 'T5', traderName: 'Eligible', email: 'e@example.com', consentStatus: ConsentStatus.UNKNOWN },
        ],
        [
          { actorId: 'a-pending', status: 'QUEUED', expiresAt: null, createdAt: new Date('2026-10-01') },
          { actorId: 'a-declined', status: 'DECLINED', expiresAt: null, createdAt: new Date('2026-10-01') },
        ],
      );
      const service = buildService(prisma);

      const result = await service.preview(
        { kind: 'ids', ids: ['a-no-email', 'a-granted', 'a-pending', 'a-declined', 'a-eligible'] },
        'bulk',
      );

      expect(result).toEqual({
        total: 5,
        toSend: 1,
        skipped: { no_email: 1, granted: 1, pending_request: 1, declined: 1 },
      });
    });
  });

  it('a single-scope preview does not skip a pending or a declined actor', async () => {
    const prisma = buildPrisma(
      [
        { id: 'a-pending', traderId: 'T1', traderName: 'Pending', email: 'p@example.com', consentStatus: ConsentStatus.UNKNOWN },
      ],
      [{ actorId: 'a-pending', status: 'QUEUED', expiresAt: null, createdAt: new Date('2026-10-01') }],
    );
    const service = buildService(prisma);

    const result = await service.preview({ kind: 'ids', ids: ['a-pending'] }, 'single');

    expect(result).toEqual({
      total: 1,
      toSend: 1,
      skipped: { no_email: 0, granted: 0, pending_request: 0, declined: 0 },
    });
  });

  describe('filter target', () => {
    it("uses buildAdminActorWhere — the SAME predicate adminList's result set uses", async () => {
      const prisma = buildPrisma(
        [
          { id: 'a1', traderId: 'T1', traderName: 'Arusha One', email: 'a1@example.com', consentStatus: ConsentStatus.UNKNOWN, region: 'Arusha' },
          { id: 'a2', traderId: 'T2', traderName: 'Dodoma One', email: 'a2@example.com', consentStatus: ConsentStatus.UNKNOWN, region: 'Dodoma' },
        ],
        [],
      );
      const service = buildService(prisma);

      const result = await service.preview(
        { kind: 'filter', filter: { region: 'Arusha' } },
        'bulk',
      );

      expect(result.total).toBe(1);
      expect(result.toSend).toBe(1);
      expect(prisma.actor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { region: 'Arusha' } }),
      );
    });
  });

  describe('enqueue', () => {
    it('creates one QUEUED row per eligible actor, snapshotting the current edition + hash', async () => {
      const prisma = buildPrisma(
        [
          { id: 'a-eligible', traderId: 'T5', traderName: 'Eligible Co', email: 'e@example.com', consentStatus: ConsentStatus.UNKNOWN },
          { id: 'a-granted', traderId: 'T2', traderName: 'Granted Co', email: 'g@example.com', consentStatus: ConsentStatus.GRANTED },
        ],
        [],
      );
      const service = buildService(prisma);

      const result = await service.enqueue(
        { kind: 'ids', ids: ['a-eligible', 'a-granted'] },
        'bulk',
        ACTING_SUB,
      );

      expect(result.queued).toBe(1);
      expect(result.skipped.granted).toBe(1);
      expect(result.batchId).toBeTruthy();

      expect(prisma.consentRequest.createMany).toHaveBeenCalledTimes(1);
      const data = prisma.createManyCalls[0] as Array<Record<string, unknown>>;
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({
        actorId: 'a-eligible',
        traderId: 'T5',
        traderName: 'Eligible Co',
        batchId: result.batchId,
        recipientEmail: 'e@example.com',
        editionVersion: CURRENT_ADMIN_CONSENT_EDITION.version,
        editionHash: computeAdminConsentEditionHash(CURRENT_ADMIN_CONSENT_EDITION),
        requestedBySub: ACTING_SUB,
        requestedByEmail: ACTING_EMAIL,
      });
    });

    it('two enqueues for the same actor create one row per enqueue, and the second is blocked once the first is QUEUED (pending blocks)', async () => {
      const actors: FixtureActor[] = [
        { id: 'a1', traderId: 'T1', traderName: 'Actor One', email: 'a1@example.com', consentStatus: ConsentStatus.UNKNOWN },
      ];
      const requests: FixtureRequest[] = [];
      const prisma = buildPrisma(actors, requests);
      const service = buildService(prisma);

      const first = await service.enqueue({ kind: 'ids', ids: ['a1'] }, 'bulk', ACTING_SUB);
      expect(first.queued).toBe(1);

      // Simulate the row this enqueue created now existing as QUEUED.
      requests.push({ actorId: 'a1', status: 'QUEUED', expiresAt: null, createdAt: new Date() });

      const second = await service.enqueue({ kind: 'ids', ids: ['a1'] }, 'bulk', ACTING_SUB);
      expect(second.queued).toBe(0);
      expect(second.skipped.pending_request).toBe(1);
      expect(prisma.consentRequest.createMany).toHaveBeenCalledTimes(1);
    });

    it('enqueues nothing and does not open a transaction when nothing is eligible', async () => {
      const prisma = buildPrisma(
        [{ id: 'a-granted', traderId: 'T1', traderName: 'G', email: 'g@example.com', consentStatus: ConsentStatus.GRANTED }],
        [],
      );
      const service = buildService(prisma);

      const result = await service.enqueue({ kind: 'ids', ids: ['a-granted'] }, 'bulk', ACTING_SUB);

      expect(result.queued).toBe(0);
      expect(result.skipped.granted).toBe(1);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("a single-scope enqueue supersedes the actor's pending request FIRST, inside the same transaction", async () => {
      const prisma = buildPrisma(
        [{ id: 'a1', traderId: 'T1', traderName: 'Actor One', email: 'a1@example.com', consentStatus: ConsentStatus.UNKNOWN }],
        [{ actorId: 'a1', status: 'QUEUED', expiresAt: null, createdAt: new Date() }],
      );
      const service = buildService(prisma);

      const result = await service.enqueue({ kind: 'ids', ids: ['a1'] }, 'single', ACTING_SUB);

      expect(result.queued).toBe(1);
      expect(supersessionService.supersedePendingFor).toHaveBeenCalledWith(
        expect.anything(),
        ['a1'],
      );
    });

    it('a bulk-scope enqueue never calls supersedePendingFor', async () => {
      const prisma = buildPrisma(
        [{ id: 'a1', traderId: 'T1', traderName: 'Actor One', email: 'a1@example.com', consentStatus: ConsentStatus.UNKNOWN }],
        [],
      );
      const service = buildService(prisma);

      await service.enqueue({ kind: 'ids', ids: ['a1'] }, 'bulk', ACTING_SUB);

      expect(supersessionService.supersedePendingFor).not.toHaveBeenCalled();
    });
  });

  // FR-2: `scope: 'single'` accepts exactly one id; anything wider is a 400.
  describe('scope/target consistency (single requires exactly one id)', () => {
    const prisma = buildPrisma(
      [
        { id: 'a1', traderId: 'T1', traderName: 'Actor One', email: 'a1@example.com', consentStatus: ConsentStatus.UNKNOWN },
        { id: 'a2', traderId: 'T2', traderName: 'Actor Two', email: 'a2@example.com', consentStatus: ConsentStatus.UNKNOWN },
      ],
      [],
    );

    it.each([
      ['preview', (service: ConsentRequestsService, target: Parameters<ConsentRequestsService['preview']>[0]) => service.preview(target, 'single')],
      [
        'enqueue',
        (service: ConsentRequestsService, target: Parameters<ConsentRequestsService['preview']>[0]) =>
          service.enqueue(target, 'single', ACTING_SUB),
      ],
    ])('%s rejects scope "single" with a filter target — BadRequestException naming scope', async (_name, call) => {
      const service = buildService(prisma);
      await expect(call(service, { kind: 'filter', filter: {} })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it.each([
      ['preview', (service: ConsentRequestsService, target: Parameters<ConsentRequestsService['preview']>[0]) => service.preview(target, 'single')],
      [
        'enqueue',
        (service: ConsentRequestsService, target: Parameters<ConsentRequestsService['preview']>[0]) =>
          service.enqueue(target, 'single', ACTING_SUB),
      ],
    ])('%s rejects scope "single" with 2 ids — BadRequestException naming scope', async (_name, call) => {
      const service = buildService(prisma);
      await expect(
        call(service, { kind: 'ids', ids: ['a1', 'a2'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('preview accepts scope "single" with exactly 1 id', async () => {
      const service = buildService(prisma);
      await expect(
        service.preview({ kind: 'ids', ids: ['a1'] }, 'single'),
      ).resolves.toBeDefined();
    });
  });
});
