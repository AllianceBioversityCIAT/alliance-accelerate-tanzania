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
  };

  const tx = { actor, consentRequest: consentRequestMock.consentRequest };
  const $transaction = jest.fn(async (cb: any) => cb(tx));

  const reset = () => {
    actors = initialActors.map((a) => ({ ...a }));
    consentRequestMock.reset();
  };

  return {
    actor,
    consentRequest: consentRequestMock.consentRequest,
    $transaction,
    reset,
    getConsentRequestRows: consentRequestMock.getRows,
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

  const INITIAL_ACTORS: MockActor[] = [
    fixtureActor({ id: 'a-no-email', traderId: 'T1', traderName: 'No Email', email: null, region: 'Arusha' }),
    fixtureActor({ id: 'a-granted', traderId: 'T2', traderName: 'Granted', consentStatus: ConsentStatus.GRANTED, region: 'Arusha' }),
    fixtureActor({ id: 'a-eligible-1', traderId: 'T3', traderName: 'Eligible One', email: 'e1@example.com', region: 'Arusha' }),
    fixtureActor({ id: 'a-eligible-2', traderId: 'T4', traderName: 'Eligible Two', email: 'e2@example.com', region: 'Dodoma' }),
  ];

  beforeAll(async () => {
    prismaMock = buildPrismaMock(INITIAL_ACTORS);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock as unknown as PrismaService)
      .overrideGuard(JwtAuthGuard)
      .useValue(new TestJwtAuthGuard())
      .overrideProvider(ActingAdminResolver)
      .useValue({ resolve: jest.fn().mockResolvedValue('admin@example.com') })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  beforeEach(() => {
    prismaMock.reset();
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
});
