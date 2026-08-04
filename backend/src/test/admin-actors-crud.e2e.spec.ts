import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConsentStatus, Prisma } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { createValidationPipe } from '../common/validation-pipe';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../auth/auth.types';
import { PII_ALLOWLIST } from '../common/pii-consent.policy';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';

/**
 * T-6 — End-to-end tests for Admin single-actor CRUD + audit history
 * (FR-1..FR-7, FR-11, FR-12, NFR-1, NFR-4, NFR-5).
 *
 * Spins up a real Nest app with AppModule, overrides PrismaService with an
 * in-memory fixture store that supports the new CRUD operations and audit log,
 * overrides JwtAuthGuard with a test guard that populates req.user from the
 * Bearer token, and overrides ActingAdminResolver so no Cognito call is made.
 *
 * Design refs: docs/specs/admin/actor-crud-audit/design.md §3, §4, §6, §10.
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
    // T-3 — registration source & consent provenance (FR-1, FR-2). Defaults
    // mirror the Prisma column defaults, so a plain fixtureActor() is a
    // LEGACY row exactly like the 436/436 live actors that are
    // GRANTED + NOT_RECORDED today (design.md FR-9, R-9).
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

/** Initial fixtures: one public GRANTED actor for duplicate / public regression tests. */
const INITIAL_ACTORS: Record<string, unknown>[] = [
  fixtureActor(),
  fixtureActor({
    id: 'actor-unknown-1',
    traderId: 'TZ-UNK-0002',
    traderName: 'Unconsented Trader (UNKNOWN)',
    region: 'Dodoma',
    traderType: 'cooperative',
    consentStatus: ConsentStatus.UNKNOWN,
    crops: [{ crop: { name: 'groundnut' } }],
  }),
];

/** Fixed 3-crop catalog used to resolve crop names → ids. */
const CROPS_CATALOG = [
  { id: 'crop-sorghum', name: 'sorghum' },
  { id: 'crop-common_bean', name: 'common_bean' },
  { id: 'crop-groundnut', name: 'groundnut' },
];

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

/**
 * Minimal in-memory Prisma delegate that supports the CRUD + audit history paths
 * exercised by this spec. It emulates the same query shapes the production
 * services issue, including crop links, unique-constraint errors, and audit-log
 * pagination.
 */
function buildPrismaMock(initialActors: Record<string, unknown>[]) {
  let actors = initialActors.map((a) => ({ ...a }));
  let auditLog: Record<string, unknown>[] = [];
  let cropLinks: Array<{ actorId: string; cropId: string }> = [];

  // Seed initial crop links from the fixture crops arrays.
  for (const actor of actors) {
    const names = ((actor.crops as { crop?: { name?: string } }[] | undefined) ?? [])
      .map((link) => link.crop?.name)
      .filter((name): name is string => typeof name === 'string');
    for (const name of names) {
      const crop = CROPS_CATALOG.find((c) => c.name === name);
      if (crop) {
        cropLinks.push({ actorId: actor.id as string, cropId: crop.id });
      }
    }
    // The actor row itself no longer carries the computed crops property;
    // findMany/findUnique attach it on demand.
    delete actor.crops;
  }

  let actorSeq = 0;
  let auditSeq = 0;

  function nextActorId(): string {
    actorSeq += 1;
    return `actor-mock-${String(actorSeq).padStart(4, '0')}`;
  }

  function nextAuditId(): string {
    auditSeq += 1;
    return `audit-mock-${String(auditSeq).padStart(4, '0')}`;
  }

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
    if (where.id && typeof where.id === 'string' && actor.id !== where.id) {
      return false;
    }

    if (where.crops?.some?.crop?.name) {
      const wanted = where.crops.some.crop.name;
      const names = cropLinks
        .filter((link) => link.actorId === actor.id)
        .map((link) => CROPS_CATALOG.find((c) => c.id === link.cropId)?.name)
        .filter((name): name is string => typeof name === 'string');
      if (!names.includes(wanted)) return false;
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

  function attachCrops(
    actor: Record<string, unknown> | null | undefined,
    include?: any,
  ): Record<string, unknown> | null {
    if (!actor) return null;
    if (!include?.crops) return actor;

    const links = cropLinks
      .filter((link) => link.actorId === actor.id)
      .map((link) => {
        const crop = CROPS_CATALOG.find((c) => c.id === link.cropId);
        return { actorId: actor.id, cropId: link.cropId, crop };
      });
    return { ...actor, crops: links };
  }

  function applyOrderBy(
    items: Record<string, unknown>[],
    orderBy: any,
  ): Record<string, unknown>[] {
    if (!orderBy) return items;

    const clauses: Array<{ field: string; dir: 'asc' | 'desc' }> = [];
    const normalize = (o: any) => {
      if (Array.isArray(o)) {
        o.forEach((entry) => normalize(entry));
      } else if (o && typeof o === 'object') {
        for (const [field, dir] of Object.entries(o)) {
          clauses.push({ field, dir: dir as 'asc' | 'desc' });
        }
      }
    };
    normalize(orderBy);

    return [...items].sort((a, b) => {
      for (const { field, dir } of clauses) {
        const av = a[field];
        const bv = b[field];
        if (av === bv) continue;
        if (av == null) return dir === 'asc' ? -1 : 1;
        if (bv == null) return dir === 'asc' ? 1 : -1;
        const cmp = av < bv ? -1 : 1;
        return dir === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }

  function throwUniqueViolation(target: string[]): never {
    throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '0.0.0',
      meta: { target },
    });
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
        const ordered = applyOrderBy(filtered, args?.orderBy);
        const page = applyPagination(ordered, args);
        return page.map((a) => attachCrops(a, args?.include) ?? a);
      },
    ),
    count: jest.fn(async (args: { where?: Record<string, any> }) => {
      return actors.filter((a) => matchesWhere(a, args?.where)).length;
    }),
    findUnique: jest.fn(async (args: { where: { id: string }; include?: any }) => {
      const found = actors.find((a) => a.id === args.where.id) ?? null;
      return attachCrops(found, args?.include);
    }),
    findFirst: jest.fn(async (args: { where?: Record<string, any> }) => {
      const found = actors.find((a) => matchesWhere(a, args?.where)) ?? null;
      return found;
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
    create: jest.fn(async (args: { data: Record<string, unknown> }) => {
      const data = args.data;
      if (actors.some((a) => a.traderId === data.traderId)) {
        throwUniqueViolation(['traderId']);
      }
      const now = new Date();
      const created = {
        ...data,
        id: nextActorId(),
        createdAt: now,
        updatedAt: now,
      };
      actors.push(created);
      return created;
    }),
    update: jest.fn(
      async (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const idx = actors.findIndex((a) => a.id === args.where.id);
        if (idx === -1) throwUniqueViolation(['id']);
        actors[idx] = { ...actors[idx], ...args.data, updatedAt: new Date() };
        return actors[idx];
      },
    ),
    delete: jest.fn(async (args: { where: { id: string } }) => {
      const idx = actors.findIndex((a) => a.id === args.where.id);
      if (idx === -1) throwUniqueViolation(['id']);
      const removed = actors[idx];
      actors.splice(idx, 1);
      cropLinks = cropLinks.filter((link) => link.actorId !== args.where.id);
      return removed;
    }),
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
      const removed = actors.filter((a) => matchesWhere(a, args.where));
      actors = actors.filter((a) => !matchesWhere(a, args.where));
      for (const a of removed) {
        cropLinks = cropLinks.filter((link) => link.actorId !== a.id);
      }
      return { count: before - actors.length };
    }),
  };

  const cropsOnActors = {
    createMany: jest.fn(
      async (args: { data: Array<{ actorId: string; cropId: string }> }) => {
        for (const link of args.data) {
          cropLinks.push({ actorId: link.actorId, cropId: link.cropId });
        }
        return { count: args.data.length };
      },
    ),
    deleteMany: jest.fn(async (args: { where?: { actorId?: string } }) => {
      const before = cropLinks.length;
      if (args.where?.actorId) {
        cropLinks = cropLinks.filter(
          (link) => link.actorId !== args.where!.actorId,
        );
      }
      return { count: before - cropLinks.length };
    }),
  };

  const crop = {
    findMany: jest.fn(
      async (args: {
        where?: { name?: { in: string[] } | string };
        select?: any;
      }) => {
        let filtered = CROPS_CATALOG;
        if (args.where?.name && typeof args.where.name === 'object' && 'in' in args.where.name) {
          const wanted = new Set(args.where.name.in as string[]);
          filtered = filtered.filter((c) => wanted.has(c.name));
        } else if (typeof args.where?.name === 'string') {
          filtered = filtered.filter((c) => c.name === args.where!.name);
        }
        return filtered.map((c) => ({ ...c }));
      },
    ),
  };

  const actorAuditLog = {
    findMany: jest.fn(
      async (args: {
        where?: { actorId?: string };
        orderBy?: any;
        skip?: number;
        take?: number;
      }) => {
        let filtered = auditLog;
        if (args.where?.actorId) {
          filtered = filtered.filter(
            (entry) => entry.actorId === args.where!.actorId,
          );
        }
        const ordered = applyOrderBy(filtered, args?.orderBy);
        return applyPagination(ordered, args);
      },
    ),
    count: jest.fn(async (args: { where?: { actorId?: string } }) => {
      if (args.where?.actorId) {
        return auditLog.filter((entry) => entry.actorId === args.where!.actorId)
          .length;
      }
      return auditLog.length;
    }),
    create: jest.fn(
      async (args: { data: Record<string, unknown> }) => {
        const created = {
          ...args.data,
          id: nextAuditId(),
          createdAt: new Date(),
        };
        auditLog.push(created);
        return created;
      },
    ),
    createMany: jest.fn(async (args: { data: Record<string, unknown>[] }) => {
      for (const row of args.data) {
        auditLog.push({
          ...row,
          id: nextAuditId(),
          createdAt: new Date(),
        });
      }
      return { count: args.data.length };
    }),
  };

  const tx = { actor, cropsOnActors, crop, actorAuditLog };

  const $transaction = jest.fn(async (arg: any) => {
    if (typeof arg === 'function') {
      return await arg(tx);
    }
    return Promise.all(arg);
  });

  const reset = () => {
    actors = initialActors.map((a) => ({ ...a }));
    auditLog = [];
    cropLinks = [];
    actorSeq = 0;
    auditSeq = 0;

    for (const actorRow of actors) {
      const names = (
        (actorRow.crops as { crop?: { name?: string } }[] | undefined) ?? []
      )
        .map((link) => link.crop?.name)
        .filter((name): name is string => typeof name === 'string');
      for (const name of names) {
        const cropItem = CROPS_CATALOG.find((c) => c.name === name);
        if (cropItem) {
          cropLinks.push({ actorId: actorRow.id as string, cropId: cropItem.id });
        }
      }
      delete actorRow.crops;
    }
  };

  return { actor, cropsOnActors, crop, actorAuditLog, $transaction, reset };
}

const admin = { Authorization: 'Bearer admin-token' };
const staff = { Authorization: 'Bearer staff-token' };
const pub = { Authorization: 'Bearer public-token' };

/** Valid create payload that does not require consent acknowledgement. */
const validCreatePayload = (): Record<string, unknown> => ({
  traderId: 'TZ-NEW-0001',
  traderName: 'New Seed Actor',
  region: 'Arusha',
  district: 'Arusha Urban',
  traderType: 'seed_company',
  sex: 'M',
  position: 'Manager',
  marketLocation: 'Arusha Market',
  capacityTons: 500,
  technicalSupport: 'Irrigation support',
  phone: '+255711111111',
  email: 'manager@example.com',
  gpsLatitude: -3.4,
  gpsLongitude: 36.7,
  gpsAltitude: 1300,
  gpsAccuracy: 4,
  consentStatus: 'UNKNOWN',
  crops: ['sorghum', 'common_bean'],
});

describe('Admin actors CRUD e2e (HTTP + in-memory Prisma)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

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

  describe('POST /api/v1/admin/actors', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/actors')
        .send(validCreatePayload())
        .expect(401);
    });

    it('returns 403 with a Staff token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/actors')
        .set(staff)
        .send(validCreatePayload())
        .expect(403);
    });

    it('returns 403 with a Public token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/actors')
        .set(pub)
        .send(validCreatePayload())
        .expect(403);
    });

    it('creates an actor and returns 201 with the Admin projection', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/actors')
        .set(admin)
        .send(validCreatePayload())
        .expect(201);

      expect(res.body.traderId).toBe('TZ-NEW-0001');
      expect(res.body.traderName).toBe('New Seed Actor');
      expect(res.body.consentStatus).toBe('UNKNOWN');
      expect(res.body.crops).toEqual(['sorghum', 'common_bean']);
      expect(res.body.phone).toBe('+255711111111');
      expect(res.body.email).toBe('manager@example.com');
      expect(res.body.id).toMatch(/^actor-mock-/);
    });

    it('returns 400 when consentStatus GRANTED is submitted without acknowledgement', async () => {
      const payload = {
        ...validCreatePayload(),
        consentStatus: 'GRANTED',
        acknowledged: false,
      };
      await request(app.getHttpServer())
        .post('/api/v1/admin/actors')
        .set(admin)
        .send(payload)
        .expect(400);
    });

    it('returns 400 with per-field details for DTO validation failures (W-1 envelope)', async () => {
      const payload = {
        ...validCreatePayload(),
        region: 'Not-A-Region',
        email: 'not-an-email',
      };
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/actors')
        .set(admin)
        .send(payload)
        .expect(400);

      expect(res.body.message).toBe('Validation failed');
      expect(Array.isArray(res.body.details)).toBe(true);
      const fields = (res.body.details as { field: string; message: string }[]).map(
        (d) => d.field,
      );
      expect(fields).toContain('region');
      expect(fields).toContain('email');
      for (const d of res.body.details as { field: string; message: string }[]) {
        expect(typeof d.field).toBe('string');
        expect(typeof d.message).toBe('string');
      }
    });

    it('returns 409 for a duplicate traderId', async () => {
      const payload = { ...validCreatePayload(), traderId: 'TZ-SEED-0001' };
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/actors')
        .set(admin)
        .send(payload)
        .expect(409);

      expect(res.body.message).toMatch(/traderId already exists/i);
    });
  });

  describe('GET /api/v1/admin/actors/:id', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/actors/actor-granted-1')
        .expect(401);
    });

    it('returns 403 with a Staff token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/actors/actor-granted-1')
        .set(staff)
        .expect(403);
    });

    it('returns 403 with a Public token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/actors/actor-granted-1')
        .set(pub)
        .expect(403);
    });

    it('returns 200 with the full Admin projection for an existing actor', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/actors/actor-granted-1')
        .set(admin)
        .expect(200);

      expect(res.body.id).toBe('actor-granted-1');
      expect(res.body.traderId).toBe('TZ-SEED-0001');
      expect(res.body.phone).toBe('+255700000000');
      expect(res.body.email).toBe('director@example.com');
      expect(res.body.consentStatus).toBe('GRANTED');
      expect(res.body.crops).toEqual(['sorghum', 'common_bean']);
    });

    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/actors/does-not-exist')
        .set(admin)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/admin/actors/:id', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/actor-granted-1')
        .send({ region: 'Dodoma' })
        .expect(401);
    });

    it('returns 403 with a Staff token', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/actor-granted-1')
        .set(staff)
        .send({ region: 'Dodoma' })
        .expect(403);
    });

    it('returns 403 with a Public token', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/actor-granted-1')
        .set(pub)
        .send({ region: 'Dodoma' })
        .expect(403);
    });

    it('returns 400 when transitioning to GRANTED without acknowledgement', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/actor-unknown-1')
        .set(admin)
        .send({ consentStatus: 'GRANTED' })
        .expect(400);
    });

    it('partially updates an actor and returns the Admin projection', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/actor-granted-1')
        .set(admin)
        .send({ region: 'Dodoma', phone: '+255799999999' })
        .expect(200);

      expect(res.body.id).toBe('actor-granted-1');
      expect(res.body.region).toBe('Dodoma');
      expect(res.body.phone).toBe('+255799999999');
      // Unchanged fields are preserved.
      expect(res.body.traderName).toBe('Meru Agro-Processing & Seeds');
      expect(res.body.email).toBe('director@example.com');
    });

    it('replaces crop assignments when crops is supplied', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/actor-granted-1')
        .set(admin)
        .send({ crops: ['groundnut'] })
        .expect(200);

      expect(res.body.crops).toEqual(['groundnut']);
    });

    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/does-not-exist')
        .set(admin)
        .send({ region: 'Dodoma' })
        .expect(404);
    });
  });

  describe('DELETE /api/v1/admin/actors/:id', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/admin/actors/actor-granted-1')
        .expect(401);
    });

    it('returns 403 with a Staff token', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/admin/actors/actor-granted-1')
        .set(staff)
        .expect(403);
    });

    it('returns 403 with a Public token', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/admin/actors/actor-granted-1')
        .set(pub)
        .expect(403);
    });

    it('deletes an actor and returns the confirmation envelope', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/admin/actors/actor-granted-1')
        .set(admin)
        .expect(200);

      expect(res.body).toEqual({ deleted: true, id: 'actor-granted-1' });

      await request(app.getHttpServer())
        .get('/api/v1/admin/actors/actor-granted-1')
        .set(admin)
        .expect(404);
    });

    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/admin/actors/does-not-exist')
        .set(admin)
        .expect(404);
    });
  });

  describe('GET /api/v1/admin/actors/:id/history', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/actors/actor-granted-1/history')
        .expect(401);
    });

    it('returns 403 with a Staff token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/actors/actor-granted-1/history')
        .set(staff)
        .expect(403);
    });

    it('returns 403 with a Public token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/actors/actor-granted-1/history')
        .set(pub)
        .expect(403);
    });

    it('returns a paginated audit history for an actor', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/actor-granted-1')
        .set(admin)
        .send({ region: 'Dodoma' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/actors/actor-granted-1/history')
        .set(admin)
        .expect(200);

      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(20);
      expect(res.body.total).toBe(1);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].action).toBe('UPDATE');
      expect(res.body.data[0].actorId).toBe('actor-granted-1');
      expect(res.body.data[0].actingSub).toBe('admin-sub');
      expect(res.body.data[0].actingEmail).toBe('admin@example.com');
      expect(res.body.data[0].changes.kind).toBe('diff');
      expect(res.body.data[0].changes.fields.region).toEqual({
        from: 'Arusha',
        to: 'Dodoma',
      });
    });

    it('respects page and pageSize query parameters', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/actor-granted-1')
        .set(admin)
        .send({ region: 'Dodoma' })
        .expect(200);
      await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/actor-granted-1')
        .set(admin)
        .send({ region: 'Mbeya' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/actors/actor-granted-1/history?page=1&pageSize=1')
        .set(admin)
        .expect(200);

      expect(res.body.total).toBe(2);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].changes.fields.region.to).toBe('Mbeya');
    });
  });

  describe('Full lifecycle with history-after-delete', () => {
    it('create → detail → update → history → delete → history still returns entries', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/admin/actors')
        .set(admin)
        .send(validCreatePayload())
        .expect(201);

      const id = createRes.body.id as string;

      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${id}`)
        .set(admin)
        .expect(200);
      expect(detailRes.body.traderName).toBe('New Seed Actor');

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/actors/${id}`)
        .set(admin)
        .send({ region: 'Dodoma', crops: ['groundnut'] })
        .expect(200);

      const historyRes1 = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${id}/history`)
        .set(admin)
        .expect(200);
      expect(historyRes1.body.total).toBe(2);
      const updateEntry1 = historyRes1.body.data.find(
        (e: { action: string }) => e.action === 'UPDATE',
      );
      expect(updateEntry1).toBeDefined();
      expect(updateEntry1.changes.fields.region).toEqual({
        from: 'Arusha',
        to: 'Dodoma',
      });
      expect(updateEntry1.changes.fields.crops).toEqual({
        from: ['sorghum', 'common_bean'],
        to: ['groundnut'],
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/actors/${id}`)
        .set(admin)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${id}`)
        .set(admin)
        .expect(404);

      const historyRes2 = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${id}/history`)
        .set(admin)
        .expect(200);
      expect(historyRes2.body.total).toBe(3);
      expect(historyRes2.body.data.map((e: { action: string }) => e.action)).toEqual([
        'DELETE',
        'UPDATE',
        'CREATE',
      ]);
      expect(historyRes2.body.data[0].actorId).toBe(id);
      expect(historyRes2.body.data[0].traderId).toBe('TZ-NEW-0001');
      expect(historyRes2.body.data[0].traderName).toBe('New Seed Actor');
      expect(historyRes2.body.data[0].changes.kind).toBe('snapshot');
    });
  });

  /**
   * T-3 — Registration source & consent provenance wired into admin create
   * and update (FR-1, FR-2, FR-3, NFR-6). `isConsentProvenanceSatisfied`
   * itself (the full §4.1 truth table) is unit-tested in
   * `consent-provenance.policy.spec.ts` (T-2); these are the per-path,
   * over-HTTP integration tests design.md §12 calls for.
   */
  describe('Registration source & consent provenance (FR-1, FR-2, FR-3, NFR-6)', () => {
    it('round-trips all four fields on create — write then read back (R-1)', async () => {
      const payload = {
        ...validCreatePayload(),
        consentStatus: 'GRANTED',
        acknowledged: true,
        registrationSource: 'SELF_REGISTERED',
        consentMethod: 'SIGNED_FORM',
        consentObtainedAt: '2026-01-01T00:00:00.000Z',
        consentReference: 'DOC-CREATE-1',
      };

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/admin/actors')
        .set(admin)
        .send(payload)
        .expect(201);

      expect(createRes.body.registrationSource).toBe('SELF_REGISTERED');
      expect(createRes.body.consentMethod).toBe('SIGNED_FORM');
      expect(createRes.body.consentObtainedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(createRes.body.consentReference).toBe('DOC-CREATE-1');

      // The read-back, not the 201, is what proves SCALAR_FIELDS was updated (R-1).
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${createRes.body.id}`)
        .set(admin)
        .expect(200);

      expect(getRes.body.registrationSource).toBe('SELF_REGISTERED');
      expect(getRes.body.consentMethod).toBe('SIGNED_FORM');
      expect(getRes.body.consentObtainedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(getRes.body.consentReference).toBe('DOC-CREATE-1');
    });

    it('round-trips all four fields on update — write then read back (R-1)', async () => {
      const patchRes = await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/actor-unknown-1')
        .set(admin)
        .send({
          consentStatus: 'GRANTED',
          acknowledged: true,
          registrationSource: 'SELF_REGISTERED',
          consentMethod: 'EMAIL',
          consentObtainedAt: '2026-02-01T00:00:00.000Z',
          consentReference: 'EMAIL-THREAD-99',
        })
        .expect(200);

      expect(patchRes.body.registrationSource).toBe('SELF_REGISTERED');
      expect(patchRes.body.consentMethod).toBe('EMAIL');
      expect(patchRes.body.consentObtainedAt).toBe('2026-02-01T00:00:00.000Z');
      expect(patchRes.body.consentReference).toBe('EMAIL-THREAD-99');

      const getRes = await request(app.getHttpServer())
        .get('/api/v1/admin/actors/actor-unknown-1')
        .set(admin)
        .expect(200);

      expect(getRes.body.registrationSource).toBe('SELF_REGISTERED');
      expect(getRes.body.consentMethod).toBe('EMAIL');
      expect(getRes.body.consentObtainedAt).toBe('2026-02-01T00:00:00.000Z');
      expect(getRes.body.consentReference).toBe('EMAIL-THREAD-99');
    });

    it('defaults registrationSource=TEAM_MANAGED, consentMethod=NOT_RECORDED, consentObtainedAt/consentReference=null when never set (FR-1, FR-2)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/actors/actor-unknown-1')
        .set(admin)
        .expect(200);

      expect(res.body.registrationSource).toBe('TEAM_MANAGED');
      expect(res.body.consentMethod).toBe('NOT_RECORDED');
      expect(res.body.consentObtainedAt).toBeNull();
      expect(res.body.consentReference).toBeNull();
    });

    it('rejects create with GRANTED but no provenance — field-level 400 (FR-3)', async () => {
      const payload = {
        ...validCreatePayload(),
        consentStatus: 'GRANTED',
        acknowledged: true,
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/actors')
        .set(admin)
        .send(payload)
        .expect(400);

      const fields = (res.body.details as { field: string }[]).map((d) => d.field);
      expect(fields).toEqual(
        expect.arrayContaining(['consentMethod', 'consentObtainedAt']),
      );
    });

    it('rejects an update transitioning into GRANTED without provenance — field-level 400 (FR-3)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/actor-unknown-1')
        .set(admin)
        .send({ consentStatus: 'GRANTED', acknowledged: true })
        .expect(400);

      const fields = (res.body.details as { field: string }[]).map((d) => d.field);
      expect(fields).toEqual(
        expect.arrayContaining(['consentMethod', 'consentObtainedAt']),
      );

      // acknowledged alone must not have moved the status (DD-2 — independent gates).
      const getRes = await request(app.getHttpServer())
        .get('/api/v1/admin/actors/actor-unknown-1')
        .set(admin)
        .expect(200);
      expect(getRes.body.consentStatus).toBe('UNKNOWN');
    });

    it(
      'allows editing district on a legacy GRANTED + NOT_RECORDED actor when the ' +
        'request body is the FULL object ActorForm.buildDto() actually sends (R-9, DD-3 — ' +
        'the highest-value test in this spec)',
      async () => {
        // Mirrors frontend/components/admin/ActorForm.tsx buildDto() (~L186-207)
        // exactly: a full-object PATCH that always resends consentStatus,
        // built from actor-granted-1's OWN current values with only
        // `district` changed — NOT a sparse `{ district: ... }` body, which
        // would pass vacuously and prove nothing about R-9.
        const fullBodyLikeActorForm = {
          traderId: 'TZ-SEED-0001',
          traderName: 'Meru Agro-Processing & Seeds',
          region: 'Arusha',
          traderType: 'seed_company',
          consentStatus: 'GRANTED',
          district: 'Mbeya Rural', // <- the only field the Admin actually changed
          sex: 'M',
          position: 'Director',
          marketLocation: 'Arusha Central Market',
          capacityTons: 1850,
          technicalSupport: 'Needs cold storage',
          phone: '+255700000000',
          email: 'director@example.com',
          gpsLatitude: -3.3869,
          gpsLongitude: 36.683,
          gpsAltitude: 1400,
          gpsAccuracy: 5,
          crops: ['sorghum', 'common_bean'],
        };

        const res = await request(app.getHttpServer())
          .patch('/api/v1/admin/actors/actor-granted-1')
          .set(admin)
          .send(fullBodyLikeActorForm)
          .expect(200);

        expect(res.body.district).toBe('Mbeya Rural');
        expect(res.body.consentStatus).toBe('GRANTED');
        // Unchanged BECAUSE no value changed, not because it was skipped.
        expect(res.body.consentMethod).toBe('NOT_RECORDED');
        expect(res.body.consentObtainedAt).toBeNull();
      },
    );

    it('rejects stripping consent evidence from a GRANTED actor while it remains GRANTED (FR-3)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/admin/actors')
        .set(admin)
        .send({
          ...validCreatePayload(),
          traderId: 'TZ-EVIDENCED-1',
          consentStatus: 'GRANTED',
          acknowledged: true,
          consentMethod: 'SIGNED_FORM',
          consentObtainedAt: '2026-01-01T00:00:00.000Z',
          consentReference: 'DOC-EVIDENCED-1',
        })
        .expect(201);

      const id = createRes.body.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/actors/${id}`)
        .set(admin)
        .send({ consentMethod: 'NOT_RECORDED' })
        .expect(400);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${id}`)
        .set(admin)
        .expect(200);
      // Stored evidence is unchanged after the rejected write.
      expect(getRes.body.consentMethod).toBe('SIGNED_FORM');
    });

    it('allows un-publish-then-strip: moving consentStatus off GRANTED while clearing provenance (FR-3)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/admin/actors')
        .set(admin)
        .send({
          ...validCreatePayload(),
          traderId: 'TZ-EVIDENCED-2',
          consentStatus: 'GRANTED',
          acknowledged: true,
          consentMethod: 'SIGNED_FORM',
          consentObtainedAt: '2026-01-01T00:00:00.000Z',
          consentReference: 'DOC-EVIDENCED-2',
        })
        .expect(201);

      const id = createRes.body.id as string;

      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/actors/${id}`)
        .set(admin)
        .send({
          consentStatus: 'DENIED',
          consentMethod: 'NOT_RECORDED',
          consentObtainedAt: null,
          consentReference: null,
        })
        .expect(200);

      expect(patchRes.body.consentStatus).toBe('DENIED');
      expect(patchRes.body.consentMethod).toBe('NOT_RECORDED');
      expect(patchRes.body.consentObtainedAt).toBeNull();
    });

    it('produces an ActorAuditLog diff row for an update touching only provenance fields (NFR-6)', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/actor-granted-1')
        .set(admin)
        .send({
          consentMethod: 'SIGNED_FORM',
          consentObtainedAt: '2026-01-01T00:00:00.000Z',
          consentReference: 'DOC-AUDIT-1',
        })
        .expect(200);

      const historyRes = await request(app.getHttpServer())
        .get('/api/v1/admin/actors/actor-granted-1/history')
        .set(admin)
        .expect(200);

      const updateEntry = historyRes.body.data.find(
        (e: { action: string }) => e.action === 'UPDATE',
      );
      expect(updateEntry).toBeDefined();
      expect(updateEntry.changes.fields.consentMethod).toEqual({
        from: 'NOT_RECORDED',
        to: 'SIGNED_FORM',
      });
      expect(updateEntry.changes.fields.consentObtainedAt).toEqual({
        from: null,
        to: '2026-01-01T00:00:00.000Z',
      });
      expect(updateEntry.changes.fields.consentReference).toEqual({
        from: null,
        to: 'DOC-AUDIT-1',
      });
    });

    it('rejects a registrationSource value outside the enum — 400 (FR-1)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/actors')
        .set(admin)
        .send({ ...validCreatePayload(), registrationSource: 'NOT_A_SOURCE' })
        .expect(400);
    });

    it('rejects a consentMethod value outside the enum — 400 (FR-2)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/actors')
        .set(admin)
        .send({ ...validCreatePayload(), consentMethod: 'CARRIER_PIGEON' })
        .expect(400);
    });

    it('rejects a consentObtainedAt in the future — 400 (FR-2)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/actors')
        .set(admin)
        .send({ ...validCreatePayload(), consentObtainedAt: '2099-01-01T00:00:00.000Z' })
        .expect(400);
    });

    it('rejects a consentReference longer than 255 characters — 400 (NFR-3)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/actors')
        .set(admin)
        .send({ ...validCreatePayload(), consentReference: 'x'.repeat(256) })
        .expect(400);
    });

    /**
     * validation-report.md R-2/E-1 — `@IsDateString()` alone accepts a bare
     * `YYYY-MM-DD` date-only string, which reaches Prisma untransformed and
     * raises an unhandled 500 (`PrismaClientValidationError` is not a
     * `PrismaClientKnownRequestError`, so `mapPrismaError` rethrows it). Both
     * frontend callers already build a full instant before sending
     * (`ActorForm.tsx`'s `dateOnlyToInstant`), so this is unreachable through
     * the UI — but reachable by any direct Admin API call. These two tests
     * assert the DTO rejects it with a clean, field-level 400 BEFORE the
     * request ever reaches Prisma, on both write paths.
     */
    it('rejects a date-only consentObtainedAt on create — field-level 400, not a 500 (R-2/E-1)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/actors')
        .set(admin)
        .send({ ...validCreatePayload(), consentObtainedAt: '2026-01-15' })
        .expect(400);

      expect(res.body.message).toBe('Validation failed');
      expect(Array.isArray(res.body.details)).toBe(true);
      const detail = (res.body.details as { field: string; message: string }[]).find(
        (d) => d.field === 'consentObtainedAt',
      );
      expect(detail).toBeDefined();
      // Names the actual problem (a full instant is required) rather than a
      // generic "must be a valid date" (R-10 — one message per fault).
      expect(detail!.message).toMatch(/full RFC-3339 instant/i);
      expect(detail!.message).toMatch(/date-only/i);
    });

    it('rejects a date-only consentObtainedAt on update — field-level 400, not a 500 (R-2/E-1)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/admin/actors/actor-unknown-1')
        .set(admin)
        .send({ consentObtainedAt: '2026-01-15' })
        .expect(400);

      expect(res.body.message).toBe('Validation failed');
      const detail = (res.body.details as { field: string; message: string }[]).find(
        (d) => d.field === 'consentObtainedAt',
      );
      expect(detail).toBeDefined();
      expect(detail!.message).toMatch(/full RFC-3339 instant/i);
      expect(detail!.message).toMatch(/date-only/i);
    });

    /**
     * validation-report.md R-2/E-2 — `consentReference: ''` used to read as
     * *changed* against a stored `null` in `isConsentProvenanceSatisfied`'s
     * comparison, wrongly firing the FR-3 guard and rejecting an edit that
     * changed nothing relevant. `actor-granted-1` is exactly the legacy shape
     * FR-9 describes: GRANTED + NOT_RECORDED + null date + null reference,
     * live on 436/436 actors today — this is the reachable, user-facing half
     * of R-2, unlike E-1 above.
     *
     * Delta-round item 2 — the original fix (`value === '' ? null : value`)
     * did not trim, so `'   '` (whitespace-only) would still read as
     * *changed* against stored `null` and re-fire the same guard, one space
     * away from the bug just closed. Covering both `''` and `'   '` proves
     * the fix actually trims first, matching the doc comment's claimed
     * `trim() || null` parity with `ActorForm.tsx`.
     */
    it.each([
      ['an empty string', ''],
      ['a whitespace-only string', '   '],
    ])(
      'allows %s consentReference on a legacy GRANTED + NOT_RECORDED actor ' +
        'without re-triggering the FR-3 guard (R-2/E-2)',
      async (_label, submitted) => {
        const res = await request(app.getHttpServer())
          .patch('/api/v1/admin/actors/actor-granted-1')
          .set(admin)
          .send({ consentReference: submitted })
          .expect(200);

        expect(res.body.consentStatus).toBe('GRANTED');
        expect(res.body.consentMethod).toBe('NOT_RECORDED');
        expect(res.body.consentObtainedAt).toBeNull();
        // Both '' and '   ' are trimmed and normalized to null, not stored
        // as a literal empty/whitespace string.
        expect(res.body.consentReference).toBeNull();
      },
    );
  });

  describe('Public read + PII boundary regression', () => {
    it('GET /api/v1/actors returns only GRANTED actors', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/actors')
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.data[0].id).toBe('actor-granted-1');
      const ids = res.body.data.map((a: { id: string }) => a.id);
      expect(ids).not.toContain('actor-unknown-1');
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
