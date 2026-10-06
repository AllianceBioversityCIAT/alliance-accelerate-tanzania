import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConsentStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { createValidationPipe } from '../common/validation-pipe';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../auth/auth.types';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';
import { createConsentRequestMock, ConsentRequestMockRow } from './support/consent-request.mock';
import {
  CURRENT_ADMIN_CONSENT_EDITION,
  computeAdminConsentEditionHash,
} from '../consent-requests/admin-consent-policy';
import { MailService } from '../mail/mail.service';
import { DOCUMENT_STORAGE } from '../consent-requests/document-storage';

/**
 * T-3 — End-to-end tests for `POST /api/v1/admin/consent-requests/preview`
 * and `POST /api/v1/admin/consent-requests` (design.md §5.1, §5.2 step 1,
 * §6; FR-2, FR-4, FR-5).
 *
 * Spins up the real AppModule with an in-memory Prisma override for `actor`
 * and `consentRequest`, so a FILTER target is proven to resolve through the
 * same `buildAdminActorWhere` predicate `adminList` itself uses.
 */

interface MockActor {
  id: string;
  traderId: string;
  traderName: string;
  email: string | null;
  consentStatus: ConsentStatus;
  region?: string;
  traderType?: string;
}

function fixtureActor(overrides: Partial<MockActor> = {}): MockActor {
  return {
    id: 'actor-1',
    traderId: 'TZ-SEED-0001',
    traderName: 'Default Actor',
    email: 'default@example.com',
    consentStatus: ConsentStatus.UNKNOWN,
    region: 'Arusha',
    traderType: 'seed_company',
    ...overrides,
  };
}

function matchesActorWhere(actor: MockActor, where: Record<string, any> = {}): boolean {
  if (where.id?.in && !where.id.in.includes(actor.id)) return false;
  if (where.region && actor.region !== where.region) return false;
  if (where.traderType && actor.traderType !== where.traderType) return false;
  if (where.consentStatus && actor.consentStatus !== where.consentStatus) return false;
  return true;
}

function buildPrismaMock(initialActors: MockActor[], initialRequests: ConsentRequestMockRow[] = []) {
  let actors = initialActors.map((a) => ({ ...a }));
  const consentRequestMock = createConsentRequestMock(initialRequests);

  const actor = {
    findMany: jest.fn(async (args: { where?: Record<string, any>; select?: any }) =>
      actors.filter((a) => matchesActorWhere(a, args?.where)),
    ),
    // T-4 — the claim-time eligibility recheck (`dispatch`'s own actor read).
    findUnique: jest.fn(async (args: { where: { id: string } }) =>
      actors.find((a) => a.id === args.where.id) ?? null,
    ),
    // T-7 — the document routes must never write the Actor ("no gate bypass",
    // FR-15); these spies are how the e2e proves it.
    update: jest.fn(async () => { throw new Error('actor.update must not be called'); }),
    updateMany: jest.fn(async () => { throw new Error('actor.updateMany must not be called'); }),
  };

  // T-4 (D-25) — a no-op lock: this harness runs every test sequentially
  // (no concurrent enqueue here, that is `consent-requests.service.spec.ts`'s
  // job with a controllable deferred mock), so the row-lock query only needs
  // to exist, never to actually block.
  const $queryRaw = jest.fn(async () => []);

  // T-4 — `dispatch`'s result-write transaction also writes a
  // `CONSENT_REQUESTED` audit row via `ActorAuditService.logConsentRequested`
  // (`tx.actorAuditLog.create`). Minimal stub: records calls, returns them.
  const auditLogRows: Array<Record<string, unknown>> = [];
  const actorAuditLog = {
    create: jest.fn(async (args: { data: Record<string, unknown> }) => {
      const row = { id: `audit-${auditLogRows.length + 1}`, ...args.data };
      auditLogRows.push(row);
      return row;
    }),
  };

  // T-6 — the history read (`actorAuditLog.findMany`/`count`, newest first,
  // no actor lookup) and the stored-document read behind the evidence route.
  Object.assign(actorAuditLog, {
    findMany: jest.fn(async (args: { where: { actorId: string }; take?: number }) =>
      auditLogRows
        .filter((r) => r.actorId === args.where.actorId)
        .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime())
        .slice(0, args.take),
    ),
    count: jest.fn(async (args: { where: { actorId: string } }) =>
      auditLogRows.filter((r) => r.actorId === args.where.actorId).length,
    ),
  });
  let documentRows: Array<Record<string, unknown>> = [];
  const consentDocument = {
    findMany: jest.fn(async (args: { where: { actorId: string; status?: string }; select?: Record<string, boolean> }) => {
      const matches = documentRows
        .filter((r) => r.actorId === args.where.actorId && (!args.where.status || r.status === args.where.status))
        .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());
      if (!args.select) return matches;
      const keys = Object.keys(args.select).filter((k) => args.select![k]);
      return matches.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));
    }),
    // T-7 — the document routes' reads and writes.
    create: jest.fn(async (args: { data: Record<string, unknown> }) => {
      const row = { createdAt: new Date(), storedAt: null, ...args.data };
      documentRows.push(row);
      return row;
    }),
    findUnique: jest.fn(async (args: { where: { id: string }; select?: Record<string, boolean> }) => {
      const row = documentRows.find((r) => r.id === args.where.id);
      if (!row) return null;
      if (!args.select) return row;
      const keys = Object.keys(args.select).filter((k) => args.select![k]);
      return Object.fromEntries(keys.map((k) => [k, row[k]]));
    }),
    updateMany: jest.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const row = documentRows.find((r) => Object.entries(args.where).every(([k, v]) => r[k] === v));
      if (!row) return { count: 0 };
      Object.assign(row, args.data);
      return { count: 1 };
    }),
  };

  const tx = { actor, consentRequest: consentRequestMock.consentRequest, consentDocument, actorAuditLog, $queryRaw };
  const $transaction = jest.fn(async (cb: any) => cb(tx));

  const reset = () => {
    actors = initialActors.map((a) => ({ ...a }));
    consentRequestMock.reset();
    auditLogRows.length = 0;
    documentRows = [];
  };

  return {
    actor,
    consentRequest: consentRequestMock.consentRequest,
    actorAuditLog,
    consentDocument,
    seedDocuments: (rows: Array<Record<string, unknown>>) => {
      documentRows = rows;
    },
    getDocumentRows: () => documentRows,
    $queryRaw,
    $transaction,
    reset,
    getConsentRequestRows: consentRequestMock.getRows,
    getAuditLogRows: () => auditLogRows,
  };
}

const TOKEN_USERS: Record<string, AuthUser> = {
  'admin-token': { sub: 'admin-sub', username: 'admin-user', groups: ['admin'], role: 'Admin' },
  'staff-token': { sub: 'staff-sub', username: 'staff-user', groups: ['staff'], role: 'Staff' },
  'public-token': { sub: 'public-sub', username: 'public-user', groups: [], role: 'Public' },
};

function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

@Injectable()
class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const token = extractBearer(req.headers?.authorization);
    if (!token || !TOKEN_USERS[token]) {
      throw new UnauthorizedException('Invalid token');
    }
    req.user = TOKEN_USERS[token];
    return true;
  }
}

const admin = { Authorization: 'Bearer admin-token' };
const staff = { Authorization: 'Bearer staff-token' };
const pub = { Authorization: 'Bearer public-token' };

describe('Admin consent-requests e2e (HTTP + in-memory Prisma)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;
  let mailServiceMock: { sendConsentRequest: jest.Mock };
  // T-7 — a fake storage adapter; `enabled` is flipped per test for the unconfigured case.
  const storageMock = {
    enabled: true,
    presignUpload: jest.fn(),
    head: jest.fn(),
    copy: jest.fn(),
    remove: jest.fn(),
    presignDownload: jest.fn(),
  };

  const INITIAL_ACTORS: MockActor[] = [
    fixtureActor({ id: 'a-no-email', traderId: 'T1', traderName: 'No Email', email: null, region: 'Arusha' }),
    fixtureActor({ id: 'a-granted', traderId: 'T2', traderName: 'Granted', consentStatus: ConsentStatus.GRANTED, region: 'Arusha' }),
    fixtureActor({ id: 'a-eligible-1', traderId: 'T3', traderName: 'Eligible One', email: 'e1@example.com', region: 'Arusha' }),
    fixtureActor({ id: 'a-eligible-2', traderId: 'T4', traderName: 'Eligible Two', email: 'e2@example.com', region: 'Dodoma' }),
  ];

  beforeAll(async () => {
    prismaMock = buildPrismaMock(INITIAL_ACTORS);
    mailServiceMock = { sendConsentRequest: jest.fn().mockResolvedValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock as unknown as PrismaService)
      .overrideGuard(JwtAuthGuard)
      .useValue(new TestJwtAuthGuard())
      .overrideProvider(ActingAdminResolver)
      .useValue({ resolve: jest.fn().mockResolvedValue('admin@example.com') })
      .overrideProvider(MailService)
      .useValue(mailServiceMock)
      .overrideProvider(DOCUMENT_STORAGE)
      .useValue(storageMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  beforeEach(() => {
    prismaMock.reset();
    mailServiceMock.sendConsentRequest.mockClear();
    storageMock.enabled = true;
    storageMock.presignUpload.mockReset().mockImplementation(async ({ key }: { key: string }) => ({
      url: 'https://bucket.example/',
      fields: { key },
    }));
    storageMock.head.mockReset();
    storageMock.copy.mockReset().mockResolvedValue(undefined);
    storageMock.remove.mockReset().mockResolvedValue(undefined);
    storageMock.presignDownload.mockReset().mockResolvedValue({ url: 'https://bucket.example/get', expiresAt: 'x' });
    prismaMock.actor.update.mockClear();
    prismaMock.actor.updateMany.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/admin/consent-requests/preview', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests/preview')
        .send({ target: { kind: 'ids', ids: ['a-eligible-1'] }, scope: 'bulk' })
        .expect(401);
    });

    it('returns 403 with a Staff token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests/preview')
        .set(staff)
        .send({ target: { kind: 'ids', ids: ['a-eligible-1'] }, scope: 'bulk' })
        .expect(403);
    });

    it('returns 403 with a Public token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests/preview')
        .set(pub)
        .send({ target: { kind: 'ids', ids: ['a-eligible-1'] }, scope: 'bulk' })
        .expect(403);
    });

    it('returns 200 with total/toSend/skipped for an ids target, bulk scope', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests/preview')
        .set(admin)
        .send({
          target: {
            kind: 'ids',
            ids: ['a-no-email', 'a-granted', 'a-eligible-1', 'a-eligible-2'],
          },
          scope: 'bulk',
        })
        .expect(200);

      expect(res.body).toEqual({
        total: 4,
        toSend: 2,
        skipped: { no_email: 1, granted: 1, pending_request: 0, declined: 0 },
      });
    });

    it("a filter target equals adminList's result set (same region)", async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests/preview')
        .set(admin)
        .send({ target: { kind: 'filter', filter: { region: 'Arusha' } }, scope: 'bulk' })
        .expect(200);

      // 3 actors are in Arusha (a-no-email, a-granted, a-eligible-1); only
      // a-eligible-1 is eligible.
      expect(res.body.total).toBe(3);
      expect(res.body.toSend).toBe(1);
    });

    it('rejects a target with neither ids nor filter populated for its own kind — 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests/preview')
        .set(admin)
        .send({ target: { kind: 'ids' }, scope: 'bulk' })
        .expect(400);
    });

    it('rejects an ids array over 1000 entries — 400', async () => {
      const ids = Array.from({ length: 1001 }, (_, i) => `actor-${i}`);
      await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests/preview')
        .set(admin)
        .send({ target: { kind: 'ids', ids }, scope: 'bulk' })
        .expect(400);
    });

    // FR-2: `scope: 'single'` accepts exactly one id; anything wider is a 400.
    describe('scope/target consistency (single requires exactly one id)', () => {
      it('rejects scope "single" with a filter target — 400', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/admin/consent-requests/preview')
          .set(admin)
          .send({ target: { kind: 'filter', filter: {} }, scope: 'single' })
          .expect(400);

        expect(res.body.details).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'scope' })]),
        );
      });

      it('rejects scope "single" with 2 ids — 400', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/admin/consent-requests/preview')
          .set(admin)
          .send({
            target: { kind: 'ids', ids: ['a-eligible-1', 'a-eligible-2'] },
            scope: 'single',
          })
          .expect(400);

        expect(res.body.details).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'scope' })]),
        );
      });

      it('accepts scope "single" with exactly 1 id — 200', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/admin/consent-requests/preview')
          .set(admin)
          .send({ target: { kind: 'ids', ids: ['a-eligible-1'] }, scope: 'single' })
          .expect(200);
      });
    });
  });

  describe('POST /api/v1/admin/consent-requests', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests')
        .send({ target: { kind: 'ids', ids: ['a-eligible-1'] }, scope: 'bulk' })
        .expect(401);
    });

    it('returns 403 with a Staff token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests')
        .set(staff)
        .send({ target: { kind: 'ids', ids: ['a-eligible-1'] }, scope: 'bulk' })
        .expect(403);
    });

    it('enqueues QUEUED rows for every eligible actor and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests')
        .set(admin)
        .send({
          target: { kind: 'ids', ids: ['a-eligible-1', 'a-granted'] },
          scope: 'bulk',
        })
        .expect(201);

      expect(res.body.queued).toBe(1);
      expect(res.body.skipped.granted).toBe(1);
      expect(res.body.batchId).toBeTruthy();

      const rows = prismaMock.getConsentRequestRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: 'a-eligible-1',
        traderId: 'T3',
        status: 'QUEUED',
        batchId: res.body.batchId,
        recipientEmail: 'e1@example.com',
        editionVersion: CURRENT_ADMIN_CONSENT_EDITION.version,
        editionHash: computeAdminConsentEditionHash(CURRENT_ADMIN_CONSENT_EDITION),
        requestedBySub: 'admin-sub',
        requestedByEmail: 'admin@example.com',
      });
    });

    it('two enqueues create one row per actor — the second is blocked once the first is QUEUED (bulk scope)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests')
        .set(admin)
        .send({ target: { kind: 'ids', ids: ['a-eligible-1'] }, scope: 'bulk' })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests')
        .set(admin)
        .send({ target: { kind: 'ids', ids: ['a-eligible-1'] }, scope: 'bulk' })
        .expect(201);

      expect(second.body.queued).toBe(0);
      expect(second.body.skipped.pending_request).toBe(1);
      expect(prismaMock.getConsentRequestRows()).toHaveLength(1);
    });

    it('a single-scope resend supersedes the pending row and creates a new one', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests')
        .set(admin)
        .send({ target: { kind: 'ids', ids: ['a-eligible-1'] }, scope: 'bulk' })
        .expect(201);

      const resend = await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests')
        .set(admin)
        .send({ target: { kind: 'ids', ids: ['a-eligible-1'] }, scope: 'single' })
        .expect(201);

      expect(resend.body.queued).toBe(1);
      const rows = prismaMock.getConsentRequestRows();
      expect(rows).toHaveLength(2);
      expect(rows.filter((r) => r.status === 'SUPERSEDED')).toHaveLength(1);
      expect(rows.filter((r) => r.status === 'QUEUED')).toHaveLength(1);
    });

    // FR-2: `scope: 'single'` accepts exactly one id; anything wider is a 400.
    describe('scope/target consistency (single requires exactly one id)', () => {
      it('rejects scope "single" with a filter target — 400, and creates no row', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/admin/consent-requests')
          .set(admin)
          .send({ target: { kind: 'filter', filter: {} }, scope: 'single' })
          .expect(400);

        expect(res.body.details).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'scope' })]),
        );
        expect(prismaMock.getConsentRequestRows()).toHaveLength(0);
      });

      it('rejects scope "single" with 2 ids — 400, and creates no row', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/admin/consent-requests')
          .set(admin)
          .send({
            target: { kind: 'ids', ids: ['a-eligible-1', 'a-eligible-2'] },
            scope: 'single',
          })
          .expect(400);

        expect(res.body.details).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'scope' })]),
        );
        expect(prismaMock.getConsentRequestRows()).toHaveLength(0);
      });

      it('accepts scope "single" with exactly 1 id — 201', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/admin/consent-requests')
          .set(admin)
          .send({ target: { kind: 'ids', ids: ['a-eligible-1'] }, scope: 'single' })
          .expect(201);

        expect(res.body.queued).toBe(1);
      });
    });
  });

  // T-4 — dispatch / retry / queue (design.md §5.2 steps 2-5, §6).
  describe('POST /api/v1/admin/consent-requests/dispatch', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).post('/api/v1/admin/consent-requests/dispatch').send({}).expect(401);
    });

    it('returns 403 with a Staff token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests/dispatch')
        .set(staff)
        .send({})
        .expect(403);
    });

    it('sends every QUEUED row for the given batch, mints a tokenHash, and writes a CONSENT_REQUESTED audit row', async () => {
      const enqueueRes = await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests')
        .set(admin)
        .send({ target: { kind: 'ids', ids: ['a-eligible-1'] }, scope: 'bulk' })
        .expect(201);
      const { batchId } = enqueueRes.body;

      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests/dispatch')
        .set(admin)
        .send({ batchId })
        .expect(200);

      expect(res.body).toEqual({ sent: 1, failed: 0, remaining: 0, failures: [] });
      expect(mailServiceMock.sendConsentRequest).toHaveBeenCalledTimes(1);
      const [to, token] = mailServiceMock.sendConsentRequest.mock.calls[0];
      expect(to).toBe('e1@example.com');
      expect(typeof token).toBe('string');

      const rows = prismaMock.getConsentRequestRows();
      const sentRow = rows.find((r) => r.actorId === 'a-eligible-1');
      expect(sentRow).toMatchObject({ status: 'SENT' });
      expect(sentRow?.tokenHash).toBeTruthy();
      expect(sentRow?.sentAt).toBeInstanceOf(Date);
      expect(sentRow?.expiresAt).toBeInstanceOf(Date);

      const auditRows = prismaMock.getAuditLogRows();
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]).toMatchObject({
        action: 'CONSENT_REQUESTED',
        actorId: 'a-eligible-1',
        actingSub: 'admin-sub',
      });
    });

    it('a transport failure leaves the row FAILED with a non-PII reason, and retry requeues it', async () => {
      mailServiceMock.sendConsentRequest.mockRejectedValueOnce(new Error('ECONNREFUSED x.x.x.x'));

      const enqueueRes = await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests')
        .set(admin)
        .send({ target: { kind: 'ids', ids: ['a-eligible-2'] }, scope: 'bulk' })
        .expect(201);
      const { batchId } = enqueueRes.body;

      const dispatchRes = await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests/dispatch')
        .set(admin)
        .send({ batchId })
        .expect(200);
      expect(dispatchRes.body).toMatchObject({ sent: 0, failed: 1, remaining: 0 });
      expect(dispatchRes.body.failures).toEqual([
        { actorId: 'a-eligible-2', traderName: expect.any(String), reason: 'transport_rejected' },
      ]);

      const failedRow = prismaMock.getConsentRequestRows().find((r) => r.actorId === 'a-eligible-2');
      expect(failedRow?.status).toBe('FAILED');
      expect(failedRow?.failureReason).toBe('transport_rejected');
      // Never the raw transport error text — it can carry an address.
      expect(failedRow?.failureReason).not.toMatch(/ECONNREFUSED|x\.x\.x\.x/);

      const retryRes = await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests/retry')
        .set(admin)
        .send({ batchId })
        .expect(200);
      expect(retryRes.body).toEqual({ queued: 1 });

      const requeued = prismaMock.getConsentRequestRows().find((r) => r.actorId === 'a-eligible-2');
      expect(requeued?.status).toBe('QUEUED');
      expect(requeued?.tokenHash).toBeNull();
    });
  });

  describe('GET /api/v1/admin/consent-requests/queue', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/v1/admin/consent-requests/queue').expect(401);
    });

    it('reports queued and failed counts across all batches', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/consent-requests')
        .set(admin)
        .send({ target: { kind: 'ids', ids: ['a-eligible-1', 'a-eligible-2'] }, scope: 'bulk' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/consent-requests/queue')
        .set(admin)
        .expect(200);

      expect(res.body).toEqual({ queued: 2, failed: 0 });
    });
  });

  // T-6 — FR-13 (retention), FR-14 (walk-through data, derived EXPIRED), NFR-9.
  describe('GET /api/v1/admin/actors/:id/consent-evidence and /consent-editions/:version', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const GONE_ACTOR = 'a-deleted'; // present in NO actor table row: a deleted actor

    function seedRequest(overrides: Record<string, unknown>) {
      return prismaMock.consentRequest.createMany({
        data: [
          {
            actorId: GONE_ACTOR,
            traderId: 'T-GONE',
            traderName: 'Deleted Actor Ltd',
            batchId: 'b1',
            recipientEmail: 'gone@example.com',
            editionVersion: 'v1.0',
            editionHash: 'f'.repeat(64),
            requestedBySub: 'admin-sub',
            requestedByEmail: 'admin@example.com',
            tokenHash: 'e'.repeat(64),
            ...overrides,
          } as never,
        ],
      });
    }

    it('returns 401 anonymous and 403 Staff on both routes', async () => {
      for (const path of [`/api/v1/admin/actors/${GONE_ACTOR}/consent-evidence`, '/api/v1/admin/consent-editions/v1.0']) {
        await request(app.getHttpServer()).get(path).expect(401);
        await request(app.getHttpServer()).get(path).set(staff).expect(403);
        await request(app.getHttpServer()).get(path).set(pub).expect(403);
      }
    });

    it('a deleted actor with 2 requests and 1 document still returns its evidence AND its history', async () => {
      const now = Date.now();
      await seedRequest({ id: 'req-old', status: 'ACCEPTED', createdAt: new Date(now - 40 * DAY), sentAt: new Date(now - 40 * DAY), respondedAt: new Date(now - 39 * DAY), respondentName: 'Neema' });
      await seedRequest({ id: 'req-new', status: 'SENT', createdAt: new Date(now - 1 * DAY), sentAt: new Date(now - 1 * DAY), expiresAt: new Date(now + 29 * DAY) });
      prismaMock.seedDocuments([
        { id: 'doc-1', actorId: GONE_ACTOR, status: 'STORED', traderId: 'T-GONE', traderName: 'x', fileName: 'consent.pdf', contentType: 'application/pdf', sizeBytes: 2048, storageKey: 'stored/a-deleted/doc-1', uploadedBySub: 'admin-sub', uploadedByEmail: 'admin@example.com', createdAt: new Date(now - 2 * DAY), storedAt: new Date(now - 2 * DAY) },
        { id: 'doc-pending', actorId: GONE_ACTOR, status: 'PENDING', traderId: 'T-GONE', traderName: 'x', fileName: 'half.pdf', contentType: 'application/pdf', sizeBytes: 1, storageKey: 'incoming/doc-pending', uploadedBySub: 'admin-sub', uploadedByEmail: null, createdAt: new Date(now - 1 * DAY), storedAt: null },
      ]);
      prismaMock.getAuditLogRows().push({
        id: 'audit-del', actorId: GONE_ACTOR, traderId: 'T-GONE', traderName: 'Deleted Actor Ltd', action: 'DELETE',
        actingSub: 'admin-sub', actingEmail: 'admin@example.com', changes: { kind: 'snapshot', values: {} },
        acknowledged: null, duplicateConfirmation: null, createdAt: new Date(now),
      });

      const evidence = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${GONE_ACTOR}/consent-evidence`)
        .set(admin)
        .expect(200);
      expect(evidence.body.requests.map((r: { id: string }) => r.id)).toEqual(['req-new', 'req-old']); // newest first
      expect(evidence.body.documents.map((d: { id: string }) => d.id)).toEqual(['doc-1']); // PENDING never listed
      expect(evidence.body.requests[1].respondentName).toBe('Neema');

      const history = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${GONE_ACTOR}/history`)
        .set(admin)
        .expect(200);
      expect(history.body.data.map((e: { id: string }) => e.id)).toEqual(['audit-del']);
    });

    it('the response key set contains no tokenHash (nor storageKey), at any depth', async () => {
      await seedRequest({ id: 'req-1', status: 'SENT', createdAt: new Date(), sentAt: new Date(), expiresAt: new Date(Date.now() + DAY) });
      prismaMock.seedDocuments([
        { id: 'doc-1', actorId: GONE_ACTOR, status: 'STORED', traderId: 'T', traderName: 'x', fileName: 'c.pdf', contentType: 'application/pdf', sizeBytes: 1, storageKey: 'stored/k', uploadedBySub: 's', uploadedByEmail: null, createdAt: new Date(), storedAt: new Date() },
      ]);
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${GONE_ACTOR}/consent-evidence`)
        .set(admin)
        .expect(200);

      expect(res.body.requests).toHaveLength(1);
      expect(Object.keys(res.body.requests[0]).sort()).toEqual(
        [
          'actorId', 'createdAt', 'editionHash', 'editionVersion', 'expiresAt', 'failureReason', 'id',
          'recipientEmail', 'requestedByEmail', 'requestedBySub', 'respondedAt', 'respondentEmail',
          'respondentIp', 'respondentName', 'respondentPhone', 'respondentPosition', 'respondentUserAgent',
          'sentAt', 'status', 'supersededAt',
        ].sort(),
      );
      expect(Object.keys(res.body.documents[0]).sort()).toEqual(
        ['actorId', 'contentType', 'createdAt', 'fileName', 'id', 'sizeBytes', 'storedAt', 'uploadedByEmail', 'uploadedBySub'].sort(),
      );
      expect(res.text).not.toContain('tokenHash');
      expect(res.text).not.toContain('e'.repeat(64)); // the stored hash value
      expect(res.text).not.toContain('stored/k');
    });

    it('a 31-day-old SENT row reads EXPIRED; a fresh SENT row stays SENT', async () => {
      const now = Date.now();
      await seedRequest({ id: 'req-expired', status: 'SENT', createdAt: new Date(now - 31 * DAY), sentAt: new Date(now - 31 * DAY), expiresAt: new Date(now - 1 * DAY) });
      await seedRequest({ id: 'req-fresh', status: 'SENT', createdAt: new Date(now - 1 * DAY), sentAt: new Date(now - 1 * DAY), expiresAt: new Date(now + 29 * DAY) });
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${GONE_ACTOR}/consent-evidence`)
        .set(admin)
        .expect(200);
      const byId = Object.fromEntries(res.body.requests.map((r: { id: string; status: string }) => [r.id, r.status]));
      expect(byId).toEqual({ 'req-expired': 'EXPIRED', 'req-fresh': 'SENT' });
    });

    it('an actor with no evidence returns two empty lists (the panel states "no evidence yet")', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/actors/a-eligible-1/consent-evidence')
        .set(admin)
        .expect(200);
      expect(res.body).toEqual({ requests: [], documents: [] });
    });

    it('GET /consent-editions/:version returns the exact edition text, and 404 for an unknown version', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/admin/consent-editions/v1.0').set(admin).expect(200);
      expect(res.body).toEqual(JSON.parse(JSON.stringify(CURRENT_ADMIN_CONSENT_EDITION)));
      expect(Object.keys(res.body).sort()).toEqual(['acceptanceStatement', 'issuedAt', 'sections', 'version']);
      await request(app.getHttpServer()).get('/api/v1/admin/consent-editions/v9.9').set(admin).expect(404);
    });

    it('the two evidence routes do not shadow each other: :id/history and :id/consent-evidence both resolve', async () => {
      await request(app.getHttpServer()).get(`/api/v1/admin/actors/${GONE_ACTOR}/history`).set(admin).expect(200);
      await request(app.getHttpServer()).get(`/api/v1/admin/actors/${GONE_ACTOR}/consent-evidence`).set(admin).expect(200);
    });
  });

  // T-7 — consent documents (FR-13 trail, FR-15, FR-16; design.md §5.6, §6).
  describe('consent documents', () => {
    const UPLOAD = '/api/v1/admin/actors/a-eligible-1/consent-documents/upload-url';
    const body = { fileName: 'consent.pdf', contentType: 'application/pdf', sizeBytes: 2_097_152 };

    it('Staff gets 403 and anonymous 401 on all four routes', async () => {
      const calls: Array<[string, string]> = [
        ['get', '/api/v1/admin/consent-documents/status'],
        ['post', UPLOAD],
        ['post', '/api/v1/admin/consent-documents/doc-1/confirm'],
        ['get', '/api/v1/admin/consent-documents/doc-1/download-url'],
      ];
      for (const [method, path] of calls) {
        const anon = (request(app.getHttpServer()) as any)[method](path);
        await (method === 'post' ? anon.send(body) : anon).expect(401);
        const staffReq = (request(app.getHttpServer()) as any)[method](path).set(staff);
        await (method === 'post' ? staffReq.send(body) : staffReq).expect(403);
      }
      expect(prismaMock.getDocumentRows()).toHaveLength(0);
      expect(storageMock.presignUpload).not.toHaveBeenCalled();
    });

    it('status reports enabled=true, and enabled=false when storage is unconfigured; upload-url then 503s', async () => {
      const on = await request(app.getHttpServer()).get('/api/v1/admin/consent-documents/status').set(admin).expect(200);
      expect(on.body).toEqual({ enabled: true });

      storageMock.enabled = false;
      const off = await request(app.getHttpServer()).get('/api/v1/admin/consent-documents/status').set(admin).expect(200);
      expect(off.body).toEqual({ enabled: false });
      await request(app.getHttpServer()).post(UPLOAD).set(admin).send(body).expect(503);
      expect(prismaMock.getDocumentRows()).toHaveLength(0);
    });

    it('upload-url validates type, size and name (400) and 404s for an unknown actor', async () => {
      for (const bad of [
        { ...body, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        { ...body, sizeBytes: 10_485_761 },
        { ...body, sizeBytes: 0 },
        { ...body, fileName: '' },
        { contentType: 'application/pdf' },
      ]) {
        await request(app.getHttpServer()).post(UPLOAD).set(admin).send(bad).expect(400);
      }
      await request(app.getHttpServer())
        .post('/api/v1/admin/actors/nobody/consent-documents/upload-url')
        .set(admin)
        .send(body)
        .expect(404);
      expect(prismaMock.getDocumentRows()).toHaveLength(0);
    });

    it('full flow: upload-url, confirm, evidence lists it, download-url; the actor is never written and the PENDING row is not listed before confirm', async () => {
      const up = await request(app.getHttpServer()).post(UPLOAD).set(admin).send(body).expect(201);
      const id = up.body.documentId as string;
      expect(up.body.fields.key).toBe(`incoming/${id}`);

      // PENDING: never listed as evidence, and no download.
      const before = await request(app.getHttpServer()).get('/api/v1/admin/actors/a-eligible-1/consent-evidence').set(admin).expect(200);
      expect(before.body.documents).toEqual([]);
      await request(app.getHttpServer()).get(`/api/v1/admin/consent-documents/${id}/download-url`).set(admin).expect(404);

      storageMock.head.mockResolvedValue({ sizeBytes: 2_097_152, contentType: 'application/pdf' });
      const confirmed = await request(app.getHttpServer()).post(`/api/v1/admin/consent-documents/${id}/confirm`).set(admin).expect(200);
      expect(confirmed.body).toMatchObject({ id, actorId: 'a-eligible-1', fileName: 'consent.pdf', sizeBytes: 2_097_152 });
      expect(confirmed.body).not.toHaveProperty('storageKey');
      expect(storageMock.copy).toHaveBeenCalledWith(`incoming/${id}`, `stored/a-eligible-1/${id}`);

      const after = await request(app.getHttpServer()).get('/api/v1/admin/actors/a-eligible-1/consent-evidence').set(admin).expect(200);
      expect(after.body.documents.map((d: { id: string }) => d.id)).toEqual([id]);

      const dl = await request(app.getHttpServer()).get(`/api/v1/admin/consent-documents/${id}/download-url`).set(admin).expect(200);
      expect(dl.body).toEqual({ url: 'https://bucket.example/get', expiresAt: 'x' });
      expect(storageMock.presignDownload).toHaveBeenCalledWith({ key: `stored/a-eligible-1/${id}`, fileName: 'consent.pdf' });

      // The trail entry, authored by the confirming admin; the actor row untouched.
      const audit = prismaMock.getAuditLogRows().filter((r) => r.action === 'CONSENT_DOCUMENT_UPLOADED');
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actorId: 'a-eligible-1', traderId: 'T3', actingSub: 'admin-sub' });
      expect(prismaMock.actor.update).not.toHaveBeenCalled();
      expect(prismaMock.actor.updateMany).not.toHaveBeenCalled();
    });

    it('confirm with a size/type mismatch is 422, deletes the object and lists nothing; a second confirm is idempotent after success', async () => {
      const up = await request(app.getHttpServer()).post(UPLOAD).set(admin).send({ ...body, sizeBytes: 1_048_576 }).expect(201);
      const id = up.body.documentId as string;

      storageMock.head.mockResolvedValue({ sizeBytes: 12_582_912, contentType: 'image/png' });
      await request(app.getHttpServer()).post(`/api/v1/admin/consent-documents/${id}/confirm`).set(admin).expect(422);
      expect(storageMock.remove).toHaveBeenCalledWith(`incoming/${id}`);
      expect(prismaMock.getAuditLogRows().filter((r) => r.action === 'CONSENT_DOCUMENT_UPLOADED')).toHaveLength(0);

      const ok = await request(app.getHttpServer()).post(UPLOAD).set(admin).send(body).expect(201);
      storageMock.head.mockResolvedValue({ sizeBytes: 2_097_152, contentType: 'application/pdf' });
      const first = await request(app.getHttpServer()).post(`/api/v1/admin/consent-documents/${ok.body.documentId}/confirm`).set(admin).expect(200);
      const second = await request(app.getHttpServer()).post(`/api/v1/admin/consent-documents/${ok.body.documentId}/confirm`).set(admin).expect(200);
      expect(second.body).toEqual(first.body);
      expect(prismaMock.getAuditLogRows().filter((r) => r.action === 'CONSENT_DOCUMENT_UPLOADED')).toHaveLength(1);
    });

    it('confirm still stores the document after the actor is deleted (snapshot traderId in the trail)', async () => {
      const up = await request(app.getHttpServer()).post(UPLOAD).set(admin).send(body).expect(201);
      // The actor goes away between upload-url and confirm.
      prismaMock.actor.findUnique.mockImplementation(async () => null);
      try {
        storageMock.head.mockResolvedValue({ sizeBytes: 2_097_152, contentType: 'application/pdf' });

        await request(app.getHttpServer()).post(`/api/v1/admin/consent-documents/${up.body.documentId}/confirm`).set(admin).expect(200);

        const audit = prismaMock.getAuditLogRows().find((r) => r.action === 'CONSENT_DOCUMENT_UPLOADED');
        expect(audit).toMatchObject({ actorId: 'a-eligible-1', traderId: 'T3', traderName: 'Eligible One' });
      } finally {
        prismaMock.actor.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
          INITIAL_ACTORS.find((a) => a.id === args.where.id) ?? null,
        );
      }
    });
  });
});
