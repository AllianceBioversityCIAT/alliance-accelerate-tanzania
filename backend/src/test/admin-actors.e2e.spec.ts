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
import { PII_ALLOWLIST } from '../common/pii-consent.policy';

/**
 * T-4 — End-to-end tests for Admin bulk actor operations (FR-1, FR-3, FR-4,
 * FR-5, FR-6, FR-7, NFR-1, NFR-4, NFR-5).
 *
 * Spins up a real Nest app with AppModule, overrides PrismaService with an
 * in-memory fixture store, and overrides JwtAuthGuard with a test guard that
 * populates req.user from the Bearer token. Proves the Admin routes are
 * RBAC-gated and that the public read path + PII boundary are unchanged.
 *
 * Design refs: docs/specs/admin/bulk-actor-operations/design.md §4, §10.
 */

/**
 * The complete set of keys that must NEVER appear anywhere in a public response:
 * the PII allowlist plus the non-public columns the public serializer accepts
 * but never emits. Mirrors pii-boundary.spec.ts exactly.
 */
const FORBIDDEN_KEYS: readonly string[] = [
  ...PII_ALLOWLIST,
  'traderId',
  'gpsAltitude',
  'gpsAccuracy',
];

/** A fully Prisma-shaped Actor row with EVERY PII field + full GPS populated. */
function fixtureActor(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'actor-granted-1',
    traderId: 'TZ-SEED-0001',
    traderName: 'Meru Agro-Processing & Seeds',
    region: 'Arusha',
    district: 'Arusha Urban',
    traderType: 'seed_company',
    sex: 'M',
    position: 'Director',
    marketLocation: 'Arusha Central Market',
    technicalSupport: 'Needs cold storage',
    phone: '+255700000000',
    email: 'director@example.com',
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

/**
 * In-memory fixture set: one GRANTED, one DENIED, one UNKNOWN actor — all fully
 * PII-populated. The non-granted rows MUST be invisible to public reads and
 * fully visible (with PII) to Admin reads.
 */
const ACTORS: Record<string, unknown>[] = [
  fixtureActor(),
  fixtureActor({
    id: 'actor-denied-1',
    traderId: 'TZ-DEN-0002',
    traderName: 'Opted-out Cooperative (DENIED)',
    region: 'Dodoma',
    traderType: 'cooperative',
    consentStatus: ConsentStatus.DENIED,
    crops: [{ crop: { name: 'groundnut' } }],
  }),
  fixtureActor({
    id: 'actor-unknown-1',
    traderId: 'TZ-UNK-0003',
    traderName: 'Unconsented Trader (UNKNOWN)',
    region: 'Iringa',
    traderType: 'offtaker',
    consentStatus: ConsentStatus.UNKNOWN,
    crops: [{ crop: { name: 'sorghum' } }],
  }),
];

const GRANTED_IDS = ACTORS.filter(
  (a) => a.consentStatus === ConsentStatus.GRANTED,
).map((a) => a.id as string);

/** Pull the token out of an `Authorization: Bearer <token>` header. */
function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

const TOKEN_USERS: Record<string, AuthUser> = {
  'admin-token': {
    sub: 'admin-sub',
    username: 'admin-user',
    groups: ['admin'],
    role: 'Admin',
  },
  'staff-token': {
    sub: 'staff-sub',
    username: 'staff-user',
    groups: ['staff'],
    role: 'Staff',
  },
  'public-token': {
    sub: 'public-sub',
    username: 'public-user',
    groups: [],
    role: 'Public',
  },
};

/**
 * Test guard replacing Cognito JWT verification. Maps known Bearer tokens to
 * fixed req.user identities; missing or unknown tokens throw 401.
 */
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

/**
 * Minimal in-memory Prisma `actor` delegate that evaluates the SAME query shapes
 * the production services issue (consent WHERE, region/traderType filters,
 * pagination, id.in, updateMany, deleteMany, $transaction). Adapted from
 * pii-boundary.spec.ts with write operations added.
 */
function buildPrismaMock(initialActors: Record<string, unknown>[]) {
  let actors = [...initialActors];

  function matchesWhere(
    actor: Record<string, unknown>,
    where: Record<string, any> | undefined,
  ): boolean {
    if (!where) return true;

    if (where.consentStatus && actor.consentStatus !== where.consentStatus) {
      return false;
    }
    if (where.region && actor.region !== where.region) return false;
    if (where.traderType && actor.traderType !== where.traderType) return false;

    if (where.id?.in && Array.isArray(where.id.in)) {
      if (!where.id.in.includes(actor.id)) return false;
    }
    if (where.id?.equals && actor.id !== where.id.equals) return false;

    if (where.crops?.some?.crop?.name) {
      const wanted = where.crops.some.crop.name;
      const names = (actor.crops as { crop?: { name?: string } }[] | undefined)
        ?.map((c) => c.crop?.name)
        .filter(Boolean);
      if (!names?.includes(wanted)) return false;
    }

    if (where.OR && Array.isArray(where.OR)) {
      return where.OR.some((clause: Record<string, any>) =>
        Object.entries(clause).every(([field, op]) => {
          if (op && typeof op === 'object' && 'contains' in op) {
            const value = actor[field];
            return (
              typeof value === 'string' &&
              value.toLowerCase().includes((op.contains as string).toLowerCase())
            );
          }
          return actor[field] === op;
        }),
      );
    }

    return true;
  }

  function applyPagination(
    items: Record<string, unknown>[],
    args: { skip?: number; take?: number },
  ): Record<string, unknown>[] {
    const skip = args?.skip ?? 0;
    const take = args?.take ?? items.length;
    return items.slice(skip, skip + take);
  }

  const actor = {
    findMany: jest.fn(
      async (args: {
        where?: Record<string, any>;
        skip?: number;
        take?: number;
        include?: any;
        orderBy?: any;
        select?: any;
      }) => {
        const filtered = actors.filter((a) => matchesWhere(a, args?.where));
        return applyPagination(filtered, args);
      },
    ),
    count: jest.fn(async (args: { where?: Record<string, any> }) => {
      return actors.filter((a) => matchesWhere(a, args?.where)).length;
    }),
    findUnique: jest.fn(async (args: { where: { id: string } }) => {
      return actors.find((a) => a.id === args.where.id) ?? null;
    }),
    findFirst: jest.fn(async (args: { where?: Record<string, any> }) => {
      return actors.find((a) => matchesWhere(a, args?.where)) ?? null;
    }),
    groupBy: jest.fn(
      async (args: { by: string[]; where?: Record<string, any> }) => {
        const filtered = actors.filter((a) => matchesWhere(a, args?.where));
        const key = args.by[0];
        const seen = new Map<unknown, Record<string, unknown>>();
        for (const a of filtered) {
          if (!seen.has(a[key])) seen.set(a[key], { [key]: a[key] });
        }
        return Array.from(seen.values());
      },
    ),
    updateMany: jest.fn(
      async (args: {
        where?: Record<string, any>;
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        actors = actors.map((a) => {
          if (matchesWhere(a, args.where)) {
            count++;
            return { ...a, ...args.data };
          }
          return a;
        });
        return { count };
      },
    ),
    deleteMany: jest.fn(async (args: { where?: Record<string, any> }) => {
      const before = actors.length;
      actors = actors.filter((a) => !matchesWhere(a, args.where));
      return { count: before - actors.length };
    }),
  };

  const actorAuditLog = {
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    create: jest.fn(async (args: { data: Record<string, unknown> }) => args.data),
    createMany: jest.fn(async () => ({ count: 0 })),
  };

  const tx = { actor, actorAuditLog };

  const $transaction = jest.fn(async (arg: any) => {
    if (typeof arg === 'function') {
      return await arg(tx);
    }
    return Promise.all(arg);
  });

  const reset = () => {
    actors = [...initialActors];
  };

  return { actor, actorAuditLog, $transaction, reset };
}

/** Recursively scan JSON, asserting no forbidden key appears anywhere. */
function expectNoPiiKeys(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => expectNoPiiKeys(item, `${path}[${i}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.includes(key)) {
        throw new Error(
          `PII boundary violation: forbidden key "${key}" found at ${path}.${key}`,
        );
      }
      expectNoPiiKeys(child, `${path}.${key}`);
    }
  }
}

/** Collect every value found under any of the forbidden keys. */
function collectForbiddenValues(
  value: unknown,
  found: unknown[] = [],
): unknown[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectForbiddenValues(item, found));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.includes(key)) found.push(child);
      collectForbiddenValues(child, found);
    }
  }
  return found;
}

/** The exact PII values seeded into the fixtures (must never appear publicly). */
const LEAKABLE_PII_VALUES = [
  '+255700000000',
  'director@example.com',
  'Director',
  'Arusha Central Market',
  'Needs cold storage',
  'TZ-SEED-0001',
  '1400', // gpsAltitude
];

/** 501 unique ids used to assert the bounded batch-size validation (FR-8). */
const OVER_CAP_IDS = Array.from({ length: 501 }, (_, i) => `id-${i}`);

describe('Admin actors e2e (HTTP + in-memory Prisma)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  beforeAll(async () => {
    prismaMock = buildPrismaMock(ACTORS);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock as unknown as PrismaService)
      .overrideGuard(JwtAuthGuard)
      .useValue(new TestJwtAuthGuard())
      .compile();

    app = moduleRef.createNestApplication();
    // Mirror production bootstrap (main.ts / lambda.ts) exactly.
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

  const admin = { Authorization: 'Bearer admin-token' };
  const staff = { Authorization: 'Bearer staff-token' };
  const pub = { Authorization: 'Bearer public-token' };

  describe('GET /api/v1/admin/actors', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/actors')
        .expect(401);
    });

    it('returns 403 with a Staff token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/actors')
        .set(staff)
        .expect(403);
    });

    it('returns 403 with a Public token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/actors')
        .set(pub)
        .expect(403);
    });

    it('returns 200 for Admin with PII + consentStatus for every status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/actors')
        .set(admin)
        .expect(200);

      expect(res.body.total).toBe(ACTORS.length);
      expect(res.body.data).toHaveLength(ACTORS.length);

      const byStatus = Object.fromEntries(
        res.body.data.map((a: { id: string; consentStatus: string }) => [
          a.id,
          a.consentStatus,
        ]),
      );
      expect(byStatus['actor-granted-1']).toBe('GRANTED');
      expect(byStatus['actor-denied-1']).toBe('DENIED');
      expect(byStatus['actor-unknown-1']).toBe('UNKNOWN');

      // PII must be present on a non-granted row (FR-1).
      const denied = res.body.data.find(
        (a: { id: string }) => a.id === 'actor-denied-1',
      );
      expect(denied).toMatchObject({
        phone: '+255700000000',
        email: 'director@example.com',
        sex: 'M',
        position: 'Director',
        marketLocation: 'Arusha Central Market',
        technicalSupport: 'Needs cold storage',
        gpsAltitude: 1400,
        gpsAccuracy: 5,
      });
    });

    it('filters by consentStatus for Admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/actors?consentStatus=DENIED')
        .set(admin)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.data[0].id).toBe('actor-denied-1');
    });

    it('filters by region and traderType for Admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/actors?region=Arusha&traderType=seed_company')
        .set(admin)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.data[0].id).toBe('actor-granted-1');
    });
  });

  describe('PATCH /api/v1/admin/actors/bulk/consent', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/bulk/consent')
        .send({ ids: ['actor-denied-1'], consentStatus: 'GRANTED' })
        .expect(401);
    });

    it('returns 403 with a Staff token', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/bulk/consent')
        .set(staff)
        .send({ ids: ['actor-denied-1'], consentStatus: 'GRANTED' })
        .expect(403);
    });

    it('returns 403 with a Public token', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/bulk/consent')
        .set(pub)
        .send({ ids: ['actor-denied-1'], consentStatus: 'GRANTED' })
        .expect(403);
    });

    it('returns 400 when unlocking without acknowledged: true', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/bulk/consent')
        .set(admin)
        .send({ ids: ['actor-denied-1'], consentStatus: 'GRANTED' })
        .expect(400);
    });

    it('unlocks with acknowledged: true and reports notFound ids', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/bulk/consent')
        .set(admin)
        .send({
          ids: ['actor-denied-1', 'missing-1'],
          consentStatus: 'GRANTED',
          acknowledged: true,
        })
        .expect(200);

      expect(res.body).toEqual({
        requested: 2,
        applied: 1,
        notFound: ['missing-1'],
      });

      // The unlocked actor now appears in public reads.
      const pubRes = await request(app.getHttpServer())
        .get('/api/v1/actors')
        .expect(200);
      const ids = pubRes.body.data.map((a: { id: string }) => a.id);
      expect(ids).toContain('actor-denied-1');
    });

    it('locks actors and they disappear from public reads', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/bulk/consent')
        .set(admin)
        .send({
          ids: ['actor-granted-1'],
          consentStatus: 'DENIED',
        })
        .expect(200);

      expect(res.body).toEqual({
        requested: 1,
        applied: 1,
        notFound: [],
      });

      const pubRes = await request(app.getHttpServer())
        .get('/api/v1/actors')
        .expect(200);
      const ids = pubRes.body.data.map((a: { id: string }) => a.id);
      expect(ids).not.toContain('actor-granted-1');
    });

    it('returns 400 when ids exceeds the maximum batch size', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/bulk/consent')
        .set(admin)
        .send({ ids: OVER_CAP_IDS, consentStatus: 'DENIED' })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('no more than 500');
    });
  });

  describe('POST /api/v1/admin/actors/bulk/delete', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/actors/bulk/delete')
        .send({ ids: ['actor-unknown-1'] })
        .expect(401);
    });

    it('returns 403 with a Staff token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/actors/bulk/delete')
        .set(staff)
        .send({ ids: ['actor-unknown-1'] })
        .expect(403);
    });

    it('returns 403 with a Public token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/actors/bulk/delete')
        .set(pub)
        .send({ ids: ['actor-unknown-1'] })
        .expect(403);
    });

    it('deletes actors and reports notFound ids', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/actors/bulk/delete')
        .set(admin)
        .send({ ids: ['actor-unknown-1', 'missing-1'] })
        .expect(200);

      expect(res.body).toEqual({
        requested: 2,
        applied: 1,
        notFound: ['missing-1'],
      });

      // The deleted actor is gone from the Admin list too.
      const adminRes = await request(app.getHttpServer())
        .get('/api/v1/admin/actors')
        .set(admin)
        .expect(200);
      const ids = adminRes.body.data.map((a: { id: string }) => a.id);
      expect(ids).not.toContain('actor-unknown-1');
    });

    it('returns 400 when ids exceeds the maximum batch size', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/actors/bulk/delete')
        .set(admin)
        .send({ ids: OVER_CAP_IDS })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('no more than 500');
    });
  });

  describe('Public read regression', () => {
    it('GET /api/v1/actors returns only GRANTED actors', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/actors')
        .expect(200);

      expect(res.body.total).toBe(GRANTED_IDS.length);
      const ids = res.body.data
        .map((a: { id: string }) => a.id)
        .sort();
      expect(ids).toEqual([...GRANTED_IDS].sort());

      const bodyText = JSON.stringify(res.body);
      expect(bodyText).not.toContain('actor-denied-1');
      expect(bodyText).not.toContain('actor-unknown-1');
    });

    it('deep-scan: no PII allowlist key anywhere in public response', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/actors')
        .expect(200);

      const wire = JSON.parse(JSON.stringify(res.body));
      expectNoPiiKeys(wire);
      expect(collectForbiddenValues(wire)).toHaveLength(0);
      const bodyText = JSON.stringify(wire);
      for (const piiValue of LEAKABLE_PII_VALUES) {
        expect(bodyText).not.toContain(piiValue);
      }
    });

    it('exposes exact { lat, long } GPS for GRANTED actors only', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/actors')
        .expect(200);

      for (const item of res.body.data) {
        expect(item.gps).toEqual({
          lat: expect.any(Number),
          long: expect.any(Number),
        });
        expect(Object.keys(item.gps)).toEqual(['lat', 'long']);
      }
    });
  });
});
