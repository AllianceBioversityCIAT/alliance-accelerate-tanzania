// @sdd-spec actors/consent-intake/consent-request-email (T-3)
// @sdd-spec actors/consent-intake/consent-request-email (T-4)
/**
 * `ConsentRequestsService` unit tests (design.md §5.1, §5.2, §5.3, §6).
 *
 * `prisma.actor.findMany`/`consentRequest.findMany`/`consentRequest.createMany`
 * are mocked with small, realistic in-memory behaviour (not just
 * shape-asserted), so these tests prove the actual partition/enqueue logic.
 *
 * T-4 adds `dispatch`/`retry`/`queue` coverage further down, using the
 * shared `createConsentRequestMock` harness (`findFirst`/`count`/`lt`
 * support added for this task) plus a small `actor.findUnique` +
 * `actorAuditLog.create` + `$queryRaw` stub.
 */
import { createHash } from 'crypto';
import { BadRequestException, Logger } from '@nestjs/common';
import { ConsentMethod, ConsentStatus, RegistrationSource } from '@prisma/client';
import { ConsentRequestsService } from './consent-requests.service';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';
import { ActorAuditService } from '../actors/actor-audit.service';
import { MailService } from '../mail/mail.service';
import { ConsentSupersessionService } from './consent-supersession.service';
import { CURRENT_ADMIN_CONSENT_EDITION, computeAdminConsentEditionHash } from './admin-consent-policy';
import { createConsentRequestMock, ConsentRequestMockRow } from '../test/support/consent-request.mock';

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

  // D-25 — a no-op lock: these tests run sequentially, so the lock only needs to exist.
  const $queryRaw = jest.fn(async () => []);

  const tx: { actor: typeof actor; consentRequest: typeof consentRequest; $queryRaw: typeof $queryRaw } = {
    actor,
    consentRequest,
    $queryRaw,
  };
  const $transaction = jest.fn(async (cb: (txArg: typeof tx) => unknown) => cb(tx));

  return { actor, consentRequest, $queryRaw, $transaction, createManyCalls };
}

describe('ConsentRequestsService', () => {
  let actingAdminResolver: ActingAdminResolver;
  let supersessionService: ConsentSupersessionService;
  let actorAuditService: ActorAuditService;
  let mailService: MailService;

  beforeEach(() => {
    actingAdminResolver = {
      resolve: jest.fn().mockResolvedValue(ACTING_EMAIL),
    } as unknown as ActingAdminResolver;
    supersessionService = {
      supersedePendingFor: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConsentSupersessionService;
    actorAuditService = {
      logConsentRequested: jest.fn().mockResolvedValue(undefined),
    } as unknown as ActorAuditService;
    mailService = {
      sendConsentRequest: jest.fn().mockResolvedValue(undefined),
    } as unknown as MailService;
  });

  function buildService(prisma: unknown) {
    return new ConsentRequestsService(
      prisma as unknown as never,
      actingAdminResolver,
      supersessionService,
      actorAuditService,
      mailService,
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

    it('enqueues nothing when nothing is eligible — but STILL opens a transaction to lock the candidate row (D-25)', async () => {
      const prisma = buildPrisma(
        [{ id: 'a-granted', traderId: 'T1', traderName: 'G', email: 'g@example.com', consentStatus: ConsentStatus.GRANTED }],
        [],
      );
      const service = buildService(prisma);

      const result = await service.enqueue({ kind: 'ids', ids: ['a-granted'] }, 'bulk', ACTING_SUB);

      expect(result.queued).toBe(0);
      expect(result.skipped.granted).toBe(1);
      // D-25 (amended 2026-10-05): the lock now runs BEFORE eligibility is
      // known, so a transaction opens for any non-empty candidate set, even
      // one that turns out fully ineligible — this is the behaviour change
      // from T-3's "no transaction when nothing is eligible" assertion,
      // which predates the D-25 lock and is no longer correct.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.consentRequest.createMany).not.toHaveBeenCalled();
    });

    it('enqueues nothing and opens no transaction at all when the target resolves to zero candidate actors', async () => {
      const prisma = buildPrisma([], []);
      const service = buildService(prisma);

      const result = await service.enqueue({ kind: 'filter', filter: {} }, 'bulk', ACTING_SUB);

      expect(result.queued).toBe(0);
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

  // D-25 (design.md §5.2 step 1, amended 2026-10-05) — the row lock runs
  // FIRST, inside `enqueue`'s transaction, before any eligibility read, and
  // two concurrent enqueues targeting the same actor must produce exactly
  // one QUEUED row.
  describe('D-25 — row lock ordering and concurrency', () => {
    it('pins that the lock query runs BEFORE the eligibility read (actor + consentRequest), inside the transaction', async () => {
      const callOrder: string[] = [];
      const actor = {
        findMany: jest.fn(async () => {
          callOrder.push('actor.findMany');
          return [
            {
              id: 'a1',
              traderId: 'T1',
              traderName: 'Actor One',
              email: 'a1@example.com',
              consentStatus: ConsentStatus.UNKNOWN,
            },
          ];
        }),
      };
      const consentRequest = {
        findMany: jest.fn(async () => {
          callOrder.push('consentRequest.findMany');
          return [];
        }),
        createMany: jest.fn(async (args: { data: unknown[] }) => ({ count: args.data.length })),
      };
      const $queryRaw = jest.fn(async () => {
        callOrder.push('$queryRaw (lock)');
        return [];
      });
      const tx = { actor, consentRequest, $queryRaw };
      const prisma = { $transaction: jest.fn(async (cb: (txArg: typeof tx) => unknown) => cb(tx)) };

      const service = buildService(prisma);
      await service.enqueue({ kind: 'ids', ids: ['a1'] }, 'bulk', ACTING_SUB);

      expect(callOrder[0]).toBe('$queryRaw (lock)');
      expect(callOrder.indexOf('$queryRaw (lock)')).toBeLessThan(callOrder.indexOf('actor.findMany'));
      expect(callOrder.indexOf('$queryRaw (lock)')).toBeLessThan(
        callOrder.indexOf('consentRequest.findMany'),
      );
    });

    it('two concurrent bulk enqueues for the same eligible actor produce exactly one QUEUED row', async () => {
      const actorRow = {
        id: 'a1',
        traderId: 'T1',
        traderName: 'Actor One',
        email: 'a1@example.com',
        consentStatus: ConsentStatus.UNKNOWN,
      };
      let requests: Array<{ actorId: string; status: string; createdAt: Date }> = [];

      const actor = {
        findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in.includes(actorRow.id) ? [actorRow] : [],
        ),
      };
      const consentRequest = {
        findMany: jest.fn(async ({ where }: { where: { actorId: { in: string[] } } }) =>
          requests.filter((r) => where.actorId.in.includes(r.actorId)),
        ),
        createMany: jest.fn(async (args: { data: Array<Record<string, unknown>> }) => {
          requests = requests.concat(
            args.data.map((d) => ({ actorId: d.actorId as string, status: 'QUEUED', createdAt: new Date() })),
          );
          return { count: args.data.length };
        }),
      };

      // Two deferred "gates" — call N of `$queryRaw` awaits gate N. The test
      // Simulated lock (call-existence/order guard). Real MySQL `FOR UPDATE`
      // behaviour was probed live — see execution.md § T-4 attempt 2.
      function createDeferred(): { promise: Promise<void>; resolve: () => void } {
        let resolve!: () => void;
        const promise = new Promise<void>((res) => {
          resolve = res;
        });
        return { promise, resolve };
      }
      const gates = [createDeferred(), createDeferred()];
      let queryRawCalls = 0;
      const $queryRaw = jest.fn(async () => {
        const gate = gates[queryRawCalls];
        queryRawCalls += 1;
        await gate.promise;
        return [];
      });

      const tx = { actor, consentRequest, $queryRaw };
      const prisma = { $transaction: jest.fn(async (cb: (txArg: typeof tx) => unknown) => cb(tx)) };
      const service = buildService(prisma);

      const p1 = service.enqueue({ kind: 'ids', ids: ['a1'] }, 'bulk', ACTING_SUB);
      const p2 = service.enqueue({ kind: 'ids', ids: ['a1'] }, 'bulk', ACTING_SUB);

      // Flush microtasks until BOTH calls have reached (and are blocked on)
      // the lock — the vacuity guard: this proves genuine interleaving, not
      // two calls that happened to run one after the other.
      for (let i = 0; i < 10; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
      }
      expect(queryRawCalls).toBe(2);

      gates[0].resolve();
      for (let i = 0; i < 10; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
      }
      // The first transaction has fully committed its createMany before the
      // second is ever granted the lock.
      expect(requests).toHaveLength(1);

      gates[1].resolve();
      const [r1, r2] = await Promise.all([p1, p2]);

      const queuedCounts = [r1.queued, r2.queued].sort();
      expect(queuedCounts).toEqual([0, 1]);
      const blocked = r1.queued === 0 ? r1 : r2;
      expect(blocked.skipped.pending_request).toBe(1);
      expect(requests.filter((r) => r.status === 'QUEUED')).toHaveLength(1);
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

  // T-4 — dispatch / retry / queue (design.md §5.2 steps 2-5, §5.3, §7.1).
  describe('dispatch / retry / queue', () => {
    interface DispatchActor {
      id: string;
      consentStatus: ConsentStatus;
      email: string | null;
    }

    function buildDispatchHarness(actors: DispatchActor[], requests: ConsentRequestMockRow[]) {
      const consentRequestMock = createConsentRequestMock(requests);
      const auditLogRows: Array<Record<string, unknown>> = [];
      const actorAuditLog = {
        create: jest.fn(async (args: { data: Record<string, unknown> }) => {
          const row = { id: `audit-${auditLogRows.length + 1}`, ...args.data };
          auditLogRows.push(row);
          return row;
        }),
      };
      const actor = {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const found = actors.find((a) => a.id === where.id);
          return found ? { consentStatus: found.consentStatus, email: found.email } : null;
        }),
      };
      const $transaction = jest.fn(async (cb: (tx: { consentRequest: typeof consentRequestMock.consentRequest; actorAuditLog: typeof actorAuditLog }) => unknown) =>
        cb({ consentRequest: consentRequestMock.consentRequest, actorAuditLog }),
      );

      const prisma = {
        actor,
        consentRequest: consentRequestMock.consentRequest,
        $transaction,
      };

      return { prisma, getRows: consentRequestMock.getRows, getAuditRows: () => auditLogRows };
    }

    function queuedRow(overrides: Partial<ConsentRequestMockRow>): ConsentRequestMockRow {
      return {
        id: overrides.id ?? 'req-1',
        actorId: overrides.actorId ?? 'a1',
        traderId: 'T1',
        traderName: 'Actor One',
        status: 'QUEUED',
        batchId: 'batch-1',
        recipientEmail: 'a1@example.com',
        editionVersion: 'v1.0',
        editionHash: 'hash',
        requestedBySub: ACTING_SUB,
        requestedByEmail: ACTING_EMAIL,
        createdAt: new Date(),
        claimedAt: null,
        sentAt: null,
        expiresAt: null,
        failureReason: null,
        attempts: 0,
        tokenHash: null,
        respondedAt: null,
        respondentName: null,
        respondentPosition: null,
        respondentEmail: null,
        respondentPhone: null,
        respondentIp: null,
        respondentUserAgent: null,
        supersededAt: null,
        ...overrides,
      };
    }

    const ELIGIBLE_ACTOR: DispatchActor = { id: 'a1', consentStatus: ConsentStatus.UNKNOWN, email: 'a1@example.com' };

    it('sends a QUEUED row: claims it, mints a tokenHash, sends, writes SENT + a CONSENT_REQUESTED audit row', async () => {
      const { prisma, getRows } = buildDispatchHarness(
        [ELIGIBLE_ACTOR],
        [queuedRow({})],
      );
      const service = buildService(prisma);

      const result = await service.dispatch({});

      expect(result).toEqual({ sent: 1, failed: 0, remaining: 0, failures: [] });
      expect(mailService.sendConsentRequest).toHaveBeenCalledTimes(1);
      const [to, token, orgName] = (mailService.sendConsentRequest as jest.Mock).mock.calls[0];
      expect(to).toBe('a1@example.com');
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      expect(orgName).toBe('Actor One');

      const row = getRows()[0];
      expect(row.status).toBe('SENT');
      expect(row.tokenHash).toBeTruthy();
      expect(row.tokenHash).not.toBe(token); // the stored value is a HASH, never the raw token
      // NFR-1's own test clauses, pinned exactly (Reviewer A issue 1):
      // 256 bits (32 bytes) from the CSPRNG, and the stored column is
      // EXACTLY `sha256(token)` hex — not sha1, not a truncated hash, not a
      // weaker byte count (decoded bytes, not the base64url string length).
      expect(Buffer.from(token, 'base64url').length).toBe(32);
      expect(row.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
      expect(row.sentAt).toBeInstanceOf(Date);
      expect(row.expiresAt).toBeInstanceOf(Date);

      // `ActorAuditService` is mocked at the describe level — ITS OWN row
      // shape (actingSub/actingEmail from requestedBySub/requestedByEmail;
      // `changes` exactly `{ requestId, recipientEmail }`) is pinned by
      // `actor-audit.service.spec.ts`'s `logConsentRequested` describe
      // block (added during T-4 rework, Reviewer B issue 2 — there was
      // previously NO such coverage anywhere, and this comment's earlier
      // wording falsely implied there was). This test's job is narrower:
      // prove `dispatch` actually CALLS it, on success, with the claimed
      // row (by `id`/`actorId`) as its argument.
      expect(actorAuditService.logConsentRequested).toHaveBeenCalledTimes(1);
      const [, auditedRow] = (actorAuditService.logConsentRequested as jest.Mock).mock.calls[0];
      expect(auditedRow).toMatchObject({ id: 'req-1', actorId: 'a1' });
    });

    it('a timeout throw is reported with reason "timeout"', async () => {
      const err = new Error('took too long to reach 10.0.0.1');
      err.name = 'TimeoutError';
      (mailService.sendConsentRequest as jest.Mock).mockRejectedValueOnce(err);
      const { prisma } = buildDispatchHarness([ELIGIBLE_ACTOR], [queuedRow({})]);

      const result = await buildService(prisma).dispatch({});

      expect(result.failures).toEqual([{ actorId: 'a1', traderName: 'Actor One', reason: 'timeout' }]);
    });

    it('a transport throw gives FAILED with a non-PII code; retry then requeues it, clearing tokenHash', async () => {
      (mailService.sendConsentRequest as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED 10.0.0.1'));
      const { prisma, getRows } = buildDispatchHarness([ELIGIBLE_ACTOR], [queuedRow({})]);
      const service = buildService(prisma);

      const result = await service.dispatch({});
      expect(result).toEqual({
        sent: 0,
        failed: 1,
        remaining: 0,
        failures: [{ actorId: 'a1', traderName: 'Actor One', reason: 'transport_rejected' }],
      });
      expect(JSON.stringify(result.failures)).not.toMatch(/@|ECONNREFUSED|10\.0\.0\.1/);

      const failedRow = getRows()[0];
      expect(failedRow.status).toBe('FAILED');
      expect(failedRow.failureReason).toBe('transport_rejected');
      expect(failedRow.failureReason).not.toMatch(/ECONNREFUSED|10\.0\.0\.1/);

      const retryResult = await service.retry({});
      expect(retryResult).toEqual({ queued: 1 });
      const requeued = getRows()[0];
      expect(requeued.status).toBe('QUEUED');
      expect(requeued.tokenHash).toBeNull();
    });

    it('eligibility failure at claim (actor already GRANTED) gives SUPERSEDED and sends nothing', async () => {
      const { prisma, getRows } = buildDispatchHarness(
        [{ id: 'a1', consentStatus: ConsentStatus.GRANTED, email: 'a1@example.com' }],
        [queuedRow({})],
      );
      const service = buildService(prisma);

      const result = await service.dispatch({});

      expect(result).toEqual({ sent: 0, failed: 0, remaining: 0, failures: [] });
      expect(mailService.sendConsentRequest).not.toHaveBeenCalled();
      expect(getRows()[0].status).toBe('SUPERSEDED');
    });

    it("FR-7 / C-47 — an actor whose email changed after enqueue gives SUPERSEDED: no send, no audit (the row's recipientEmail is no longer the actor's email)", async () => {
      const { prisma, getRows } = buildDispatchHarness(
        [{ id: 'a1', consentStatus: ConsentStatus.UNKNOWN, email: 'changed@example.com' }],
        [queuedRow({ recipientEmail: 'a1@example.com' })],
      );
      const service = buildService(prisma);

      const result = await service.dispatch({});

      expect(result).toEqual({ sent: 0, failed: 0, remaining: 0, failures: [] });
      expect(mailService.sendConsentRequest).not.toHaveBeenCalled();
      expect(actorAuditService.logConsentRequested).not.toHaveBeenCalled();
      expect(getRows()[0].status).toBe('SUPERSEDED');
    });

    it('FR-7 / C-47 — an actor deleted after enqueue gives SUPERSEDED: no send, no audit', async () => {
      const { prisma, getRows } = buildDispatchHarness([], [queuedRow({})]);
      const service = buildService(prisma);

      const result = await service.dispatch({});

      expect(result).toEqual({ sent: 0, failed: 0, remaining: 0, failures: [] });
      expect(mailService.sendConsentRequest).not.toHaveBeenCalled();
      expect(actorAuditService.logConsentRequested).not.toHaveBeenCalled();
      expect(getRows()[0].status).toBe('SUPERSEDED');
    });

    it('FR-8 / C-55 — a dispatched row expires exactly 30 days after it was sent', async () => {
      const { prisma, getRows } = buildDispatchHarness([ELIGIBLE_ACTOR], [queuedRow({})]);
      const service = buildService(prisma);

      await service.dispatch({});

      const row = getRows()[0];
      expect(row.status).toBe('SENT');
      expect((row.expiresAt as Date).getTime() - (row.sentAt as Date).getTime()).toBe(2_592_000_000);
    });

    it('FR-8 / C-59 — dispatch, retry, dispatch mints a different token and a different hash each time', async () => {
      (mailService.sendConsentRequest as jest.Mock).mockRejectedValueOnce(new Error('boom'));
      const { prisma, getRows } = buildDispatchHarness([ELIGIBLE_ACTOR], [queuedRow({})]);
      const service = buildService(prisma);

      await service.dispatch({}); // first mint: transport fails, row FAILED
      const firstToken = (mailService.sendConsentRequest as jest.Mock).mock.calls[0][1] as string;
      await service.retry({});
      await service.dispatch({}); // second mint, same row
      const secondToken = (mailService.sendConsentRequest as jest.Mock).mock.calls[1][1] as string;

      expect(getRows()[0].status).toBe('SENT');
      expect(secondToken).not.toBe(firstToken);
      expect(getRows()[0].tokenHash).toBe(createHash('sha256').update(secondToken).digest('hex'));
      expect(getRows()[0].tokenHash).not.toBe(createHash('sha256').update(firstToken).digest('hex'));
    });

    it('a stale SENDING row (claimed > 2 minutes ago) becomes FAILED/stale_claim and is never resent', async () => {
      const staleClaimedAt = new Date(Date.now() - 3 * 60 * 1000);
      const { prisma, getRows } = buildDispatchHarness(
        [ELIGIBLE_ACTOR],
        [queuedRow({ id: 'stale-1', status: 'SENDING', claimedAt: staleClaimedAt })],
      );
      const service = buildService(prisma);

      const result = await service.dispatch({});

      expect(mailService.sendConsentRequest).not.toHaveBeenCalled();
      expect(result).toEqual({ sent: 0, failed: 0, remaining: 0, failures: [] });
      const row = getRows()[0];
      expect(row.status).toBe('FAILED');
      expect(row.failureReason).toBe('stale_claim');
    });

    it('a row superseded between claim and result stays SUPERSEDED, with NO audit row (falsifier: removing the result CAS reddens this)', async () => {
      const { prisma, getRows } = buildDispatchHarness(
        [ELIGIBLE_ACTOR],
        [queuedRow({})],
      );
      // The mock mail transport supersedes the SAME row as a side effect
      // WHILE the send is "in flight" — simulating an admin editing the
      // actor concurrently (FR-12) during the 2-3s send window.
      (mailService.sendConsentRequest as jest.Mock).mockImplementationOnce(async () => {
        await prisma.consentRequest.updateMany({
          where: { id: 'req-1', status: 'SENDING' },
          data: { status: 'SUPERSEDED', supersededAt: new Date() },
        });
      });
      const service = buildService(prisma);

      const result = await service.dispatch({});

      expect(result).toEqual({ sent: 0, failed: 0, remaining: 0, failures: [] });
      expect(getRows()[0].status).toBe('SUPERSEDED');
      expect(actorAuditService.logConsentRequested).not.toHaveBeenCalled();
    });

    it('a send that THROWS after the row was superseded mid-send reports no failure (falsifier: failures.push above the count check)', async () => {
      const { prisma, getRows } = buildDispatchHarness([ELIGIBLE_ACTOR], [queuedRow({})]);
      (mailService.sendConsentRequest as jest.Mock).mockImplementationOnce(async () => {
        await prisma.consentRequest.updateMany({
          where: { id: 'req-1', status: 'SENDING' },
          data: { status: 'SUPERSEDED', supersededAt: new Date() },
        });
        throw new Error('broker down');
      });

      const result = await buildService(prisma).dispatch({});

      expect(result).toEqual({ sent: 0, failed: 0, remaining: 0, failures: [] });
      expect(getRows()[0].status).toBe('SUPERSEDED');
    });

    it(
      'two concurrent dispatch() calls over one batch each send a row at most once (FR-6) — ' +
        'DEFERRED transport (real timers), so the two calls genuinely overlap in time',
      async () => {
        const actors: DispatchActor[] = [
          { id: 'a1', consentStatus: ConsentStatus.UNKNOWN, email: 'a1@example.com' },
          { id: 'a2', consentStatus: ConsentStatus.UNKNOWN, email: 'a2@example.com' },
          { id: 'a3', consentStatus: ConsentStatus.UNKNOWN, email: 'a3@example.com' },
          { id: 'a4', consentStatus: ConsentStatus.UNKNOWN, email: 'a4@example.com' },
        ];
        const requests = actors.map((a, i) =>
          queuedRow({ id: `req-${i + 1}`, actorId: a.id, recipientEmail: a.email as string }),
        );
        const { prisma, getRows } = buildDispatchHarness(actors, requests);
        const service = buildService(prisma);

        // Disqualifier guard: an instantly-resolving mock can let ONE
        // dispatch() call's loop fully drain (claim all 4 rows) before the
        // OTHER call's loop ever gets a turn — which would still assert
        // "sent once each" correctly without the claim CAS ever actually
        // being contended. A real, timed delay forces genuine overlap: both
        // loops are provably "in flight" at the same wall-clock moment.
        const callIntervals: Array<{ start: number; end: number }> = [];
        (mailService.sendConsentRequest as jest.Mock).mockImplementation(async () => {
          const start = Date.now();
          await new Promise((resolve) => setTimeout(resolve, 15));
          callIntervals.push({ start, end: Date.now() });
        });

        const [r1, r2] = await Promise.all([service.dispatch({}), service.dispatch({})]);

        // Vacuity guard (KZ-002, Reviewer A issue 2): prove the two
        // dispatch() calls were ACTUALLY concurrent — each sent at least
        // one row — rather than one call silently doing all the work while
        // the other did nothing (which a serialized/synchronous mock could
        // not distinguish from a genuine interleave).
        expect(r1.sent).toBeGreaterThanOrEqual(1);
        expect(r2.sent).toBeGreaterThanOrEqual(1);
        expect(r1.sent + r2.sent).toBe(4);

        // A second, independent proof of real overlap: at least one pair of
        // recorded send windows overlaps in wall-clock time.
        const overlaps = callIntervals.some((a, i) =>
          callIntervals.some((b, j) => i !== j && a.start < b.end && b.start < a.end),
        );
        expect(overlaps).toBe(true);

        expect(mailService.sendConsentRequest).toHaveBeenCalledTimes(4);
        const sentActorIds = getRows()
          .filter((r) => r.status === 'SENT')
          .map((r) => r.actorId)
          .sort();
        expect(sentActorIds).toEqual(['a1', 'a2', 'a3', 'a4']);
        expect(r1.remaining).toBe(0);
        expect(r2.remaining).toBe(0);
      },
      10000,
    );

    it('two concurrent dispatch() calls racing for the SAME single QUEUED row: the claim CAS lets exactly one send it', async () => {
      // A surgical version of the test above: both calls' `findFirst` reads
      // are held back by an explicit barrier until BOTH have been issued,
      // so they are PROVABLY looking at the identical row before either
      // attempts the claim CAS — the exact race condition the claim
      // compare-and-set exists to resolve. One claim must win (count 1),
      // the other must lose (count 0) and send nothing.
      let row: ConsentRequestMockRow = queuedRow({});
      let findFirstCalls = 0;
      let releaseBarrier!: () => void;
      const barrier = new Promise<void>((resolve) => {
        releaseBarrier = resolve;
      });

      const actor = {
        findUnique: jest.fn(async () => ({ consentStatus: ConsentStatus.UNKNOWN, email: row.recipientEmail })),
      };
      const consentRequest = {
        findFirst: jest.fn(async ({ where }: { where: { status: string } }) => {
          findFirstCalls += 1;
          if (findFirstCalls >= 2) {
            releaseBarrier();
          }
          await barrier;
          return row.status === where.status ? { ...row } : null;
        }),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id?: string; status?: string };
            data: Partial<ConsentRequestMockRow> & { attempts?: { increment: number } };
          }) => {
            const idOk = where.id === undefined || where.id === row.id;
            const statusOk = where.status === undefined || where.status === row.status;
            if (!idOk || !statusOk) {
              return { count: 0 };
            }
            const { attempts, ...rest } = data;
            row = { ...row, ...rest };
            if (attempts) {
              row.attempts += attempts.increment;
            }
            return { count: 1 };
          },
        ),
        count: jest.fn(async ({ where }: { where: { status: string } }) => (row.status === where.status ? 1 : 0)),
      };
      const $transaction = jest.fn(async (cb: (tx: unknown) => unknown) =>
        cb({ consentRequest, actorAuditLog: { create: jest.fn() } }),
      );
      const prisma = { actor, consentRequest, $transaction };
      const service = buildService(prisma);

      const [r1, r2] = await Promise.all([service.dispatch({}), service.dispatch({})]);

      // Vacuity guard: both calls genuinely reached `findFirst` BEFORE
      // either proceeded to claim — proving this is a real race, not two
      // calls that happened to run sequentially.
      expect(findFirstCalls).toBeGreaterThanOrEqual(2);
      expect(mailService.sendConsentRequest).toHaveBeenCalledTimes(1);
      expect(r1.sent + r2.sent).toBe(1);
      expect(row.status).toBe('SENT');
    });

    it('a Logger spy across dispatch captures neither the token nor the recipient address', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log');
      try {
        const { prisma } = buildDispatchHarness([ELIGIBLE_ACTOR], [queuedRow({})]);
        const service = buildService(prisma);

        await service.dispatch({});

        // Vacuity guard (KZ-002): the spy must have captured something, or
        // this test would pass even if dispatch logged nothing at all.
        expect(logSpy.mock.calls.length).toBeGreaterThan(0);

        const sentToken = ((mailService.sendConsentRequest as jest.Mock).mock.calls[0]?.[1] ?? '') as string;
        for (const call of logSpy.mock.calls) {
          const line = call.join(' ');
          expect(line).not.toContain('a1@example.com');
          if (sentToken.length > 0) {
            expect(line).not.toContain(sentToken);
          }
        }
      } finally {
        logSpy.mockRestore();
      }
    });

    it('queue() reports queued and failed counts across all batches', async () => {
      const { prisma } = buildDispatchHarness(
        [ELIGIBLE_ACTOR],
        [
          queuedRow({ id: 'r1', status: 'QUEUED' }),
          queuedRow({ id: 'r2', status: 'QUEUED' }),
          queuedRow({ id: 'r3', status: 'FAILED' }),
        ],
      );
      const service = buildService(prisma);

      await expect(service.queue()).resolves.toEqual({ queued: 2, failed: 1 });
    });
  });

  // T-4 (NFR-6) — a delayed fake transport (2.9 s/send) with a fake clock:
  // the step stops claiming after the 7.5 s budget and returns within
  // design.md §5.2's 11.5 s worst case.
  describe('dispatch budget (NFR-6)', () => {
    it('stops claiming after 7.5 s and leaves unclaimed rows QUEUED', async () => {
      jest.useFakeTimers();
      try {
        const actors = Array.from({ length: 5 }, (_, i) => ({
          id: `a${i + 1}`,
          consentStatus: ConsentStatus.UNKNOWN,
          email: `a${i + 1}@example.com`,
        }));
        const requests = actors.map((a, i) =>
          queuedRowFor(a.id, `req-${i + 1}`, new Date(Date.UTC(2026, 0, 1, 0, 0, i)), a.email as string),
        );
        const consentRequestMock = createConsentRequestMock(requests);
        const actor = {
          findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
            const found = actors.find((a) => a.id === where.id);
            return found ? { consentStatus: found.consentStatus, email: found.email } : null;
          }),
        };
        const $transaction = jest.fn(async (cb: (tx: unknown) => unknown) =>
          cb({ consentRequest: consentRequestMock.consentRequest, actorAuditLog: { create: jest.fn() } }),
        );
        const prisma = { actor, consentRequest: consentRequestMock.consentRequest, $transaction };

        const DELAY_MS = 2900;
        (mailService.sendConsentRequest as jest.Mock).mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, DELAY_MS)),
        );

        const service = buildService(prisma);
        const dispatchPromise = service.dispatch({});

        // Advance generously — enough for 3 sends (≈8.7 s) but short of a
        // 4th (≈11.6 s), so this also discriminates the "budget checked
        // after the claim" falsifier, which would claim a 4th row.
        await jest.advanceTimersByTimeAsync(10000);
        const result = await dispatchPromise;

        expect(mailService.sendConsentRequest).toHaveBeenCalledTimes(3);
        expect(result.sent).toBe(3);
        expect(result.remaining).toBe(2);
      } finally {
        jest.useRealTimers();
      }
    }, 20000);

    it('W-6 — a budget-stopped run then its resume sends each of 10 rows exactly once (10 distinct recipients, no repeat)', async () => {
      jest.useFakeTimers();
      try {
        const actors = Array.from({ length: 10 }, (_, i) => ({
          id: `a${i + 1}`,
          consentStatus: ConsentStatus.UNKNOWN,
          email: `a${i + 1}@example.com`,
        }));
        const requests = actors.map((a, i) =>
          queuedRowFor(a.id, `req-${i + 1}`, new Date(Date.UTC(2026, 0, 1, 0, 0, i)), a.email as string),
        );
        const consentRequestMock = createConsentRequestMock(requests);
        const actor = {
          findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
            const found = actors.find((a) => a.id === where.id);
            return found ? { consentStatus: found.consentStatus, email: found.email } : null;
          }),
        };
        const $transaction = jest.fn(async (cb: (tx: unknown) => unknown) =>
          cb({ consentRequest: consentRequestMock.consentRequest, actorAuditLog: { create: jest.fn() } }),
        );
        const prisma = { actor, consentRequest: consentRequestMock.consentRequest, $transaction };
        const service = buildService(prisma);

        // Run 1: 1.6 s per send, so the 7.5 s budget ends it after 5 sends.
        (mailService.sendConsentRequest as jest.Mock).mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 1600)),
        );
        const run1 = service.dispatch({});
        await jest.advanceTimersByTimeAsync(10000);
        const first = await run1;
        expect(first).toMatchObject({ sent: 5, remaining: 5 });

        // Run 2 (the resume): instant sends; only the 5 still QUEUED are claimed.
        (mailService.sendConsentRequest as jest.Mock).mockImplementation(async () => undefined);
        const second = await service.dispatch({});
        expect(second).toMatchObject({ sent: 5, remaining: 0 });

        const recipients = (mailService.sendConsentRequest as jest.Mock).mock.calls.map((c) => c[0]);
        expect(recipients).toHaveLength(10);
        expect(new Set(recipients).size).toBe(10);
        expect(consentRequestMock.getRows().every((r) => r.status === 'SENT')).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    }, 20000);

    function queuedRowFor(
      actorId: string,
      id: string,
      createdAt: Date,
      recipientEmail: string,
    ): ConsentRequestMockRow {
      return {
        id,
        actorId,
        traderId: `T-${actorId}`,
        traderName: `Actor ${actorId}`,
        status: 'QUEUED',
        batchId: 'batch-budget',
        recipientEmail,
        editionVersion: 'v1.0',
        editionHash: 'hash',
        requestedBySub: ACTING_SUB,
        requestedByEmail: ACTING_EMAIL,
        createdAt,
        claimedAt: null,
        sentAt: null,
        expiresAt: null,
        failureReason: null,
        attempts: 0,
        tokenHash: null,
        respondedAt: null,
        respondentName: null,
        respondentPosition: null,
        respondentEmail: null,
        respondentPhone: null,
        respondentIp: null,
        respondentUserAgent: null,
        supersededAt: null,
      };
    }
  });
});
