// @sdd-spec admin/actor-import
/**
 * T-6 — End-to-end tests for the Admin actor bulk-import route
 * `POST /api/v1/admin/actors/import` (FR-2..FR-8, FR-10, FR-11, NFR-1, NFR-4).
 *
 * A real Nest app is bootstrapped from AppModule with the SAME shared discipline
 * as production — the global `api/v1` prefix, the shared ValidationPipe
 * (`createValidationPipe`), and the shared 8 MB JSON body limit
 * (`configureBodyParser`) — so the deployed request envelope and body-size limit
 * are what's exercised here. PrismaService is replaced by an in-memory store,
 * JwtAuthGuard by a token→role test guard, and ActingAdminResolver so no Cognito
 * call is made.
 *
 * Fixtures are REAL `.xlsx` workbooks built in-memory with exceljs and handed to
 * the route as base64, exactly as a browser would after reading a file.
 *
 * Design refs: `docs/specs/admin/actor-import/design.md` §3, §4, §6, §10.
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ConsentStatus, Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import request from 'supertest';

import { AppModule } from '../app.module';
import { createValidationPipe } from '../common/validation-pipe';
import { configureBodyParser } from '../common/body-parser.config';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../auth/auth.types';
import { PII_ALLOWLIST } from '../common/pii-consent.policy';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';
import { TEMPLATE_COLUMNS, TEMPLATE_HEADERS } from '../common/template-columns';

/**
 * Distinctive PII values seeded INTO uploaded rows. FR-11: they must never
 * appear anywhere in an import report body (which echoes only non-PII identity).
 */
const IMPORT_PII_PHONE = '+255-000-IMPORTLEAK';
const IMPORT_PII_EMAIL = 'import-leak-detector@example.test';
const IMPORT_BAD_EMAIL = 'super-secret-leak@bad';

/** Distinctive PII seeded on the public GRANTED actor (public boundary regression). */
const SEED_PII_PHONE = '+255-999-SEEDLEAK';
const SEED_PII_EMAIL = 'seed-leak-detector@example.test';

// ---- xlsx fixture builders -------------------------------------------------

type CellMap = Record<string, string | number>;

/** Build a base64 `.xlsx` from data rows keyed by TEMPLATE_COLUMNS `field`. */
async function buildWorkbook(
  dataRows: CellMap[],
  opts: { sheetName?: string; headers?: string[] } = {},
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheetName ?? 'Data');
  ws.addRow(opts.headers ?? [...TEMPLATE_HEADERS]);
  for (const row of dataRows) {
    ws.addRow(TEMPLATE_COLUMNS.map((col) => row[col.field] ?? ''));
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf).toString('base64');
}

/** A minimal valid data row (required fields only); override as needed. */
function validRow(overrides: CellMap = {}): CellMap {
  return {
    traderId: 'TZ-1',
    traderName: 'Actor One',
    traderType: 'seed_company',
    region: 'Arusha',
    ...overrides,
  };
}

/**
 * Deterministic high-entropy string generator. exceljs stores strings in a
 * zip-compressed sheet, so REPEATED content collapses to almost nothing; only
 * near-random text reliably inflates the encoded workbook past the default body
 * limit, which is what the body-limit proof needs.
 */
function randomText(seed: number, len: number): string {
  let s = (seed * 2654435761) >>> 0;
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i += 1) {
    s = (s * 1103515245 + 12345) >>> 0;
    out += chars[s % chars.length];
  }
  return out;
}

/** Byte length of the JSON request body — the size Express's body parser caps. */
function requestBodyBytes(body: unknown): number {
  return Buffer.byteLength(JSON.stringify(body));
}

/** Express's default JSON body limit that the shared 8 MB limit overrides. */
const DEFAULT_EXPRESS_JSON_LIMIT = 100 * 1024;

// ---- PII boundary scanning (mirrors pii-boundary.spec.ts) ------------------

const FORBIDDEN_KEYS: readonly string[] = [
  ...PII_ALLOWLIST,
  'traderId',
  'gpsAltitude',
  'gpsAccuracy',
];

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

function collectForbiddenValues(value: unknown, found: unknown[] = []): unknown[] {
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

// ---- fixtures + in-memory Prisma -------------------------------------------

const CROPS_CATALOG = [
  { id: 'crop-sorghum', name: 'sorghum' },
  { id: 'crop-common_bean', name: 'common_bean' },
  { id: 'crop-groundnut', name: 'groundnut' },
];

/** Public GRANTED actor (with distinctive PII) + one private existing actor. */
const INITIAL_ACTORS: Record<string, unknown>[] = [
  {
    id: 'actor-pub-1',
    traderId: 'TZ-PUB-1',
    traderName: 'Public Granted Trader',
    region: 'Arusha',
    district: 'Arusha Urban',
    traderType: 'seed_company',
    sex: 'M',
    position: 'Director',
    marketLocation: 'Arusha Central Market',
    technicalSupport: 'Needs cold storage',
    phone: SEED_PII_PHONE,
    email: SEED_PII_EMAIL,
    capacityTons: 1850,
    gpsLatitude: -3.3869,
    gpsLongitude: 36.683,
    gpsAltitude: 1400,
    gpsAccuracy: 5,
    consentStatus: ConsentStatus.GRANTED,
    crops: [{ crop: { name: 'sorghum' } }],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'actor-exist-1',
    traderId: 'TZ-EXIST-1',
    traderName: 'Existing Registry Trader',
    region: 'Dodoma',
    district: null,
    traderType: 'cooperative',
    consentStatus: ConsentStatus.UNKNOWN,
    crops: [{ crop: { name: 'groundnut' } }],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
];

/**
 * Minimal in-memory Prisma delegate covering the import (dedupe + chunked
 * commit + audit), the admin list/detail/history reads used to verify results,
 * and the public read used for the boundary regression.
 */
function buildPrismaMock(initialActors: Record<string, unknown>[]) {
  let actors: Record<string, unknown>[] = [];
  let auditLog: Record<string, unknown>[] = [];
  let cropLinks: Array<{ actorId: string; cropId: string }> = [];
  let actorSeq = 0;
  let auditSeq = 0;

  function seed(): void {
    actors = initialActors.map((a) => ({ ...a }));
    auditLog = [];
    cropLinks = [];
    actorSeq = 0;
    auditSeq = 0;
    for (const actor of actors) {
      const names = (
        (actor.crops as { crop?: { name?: string } }[] | undefined) ?? []
      )
        .map((link) => link.crop?.name)
        .filter((name): name is string => typeof name === 'string');
      for (const name of names) {
        const crop = CROPS_CATALOG.find((c) => c.name === name);
        if (crop) cropLinks.push({ actorId: actor.id as string, cropId: crop.id });
      }
      delete actor.crops;
    }
  }

  const nextActorId = (): string =>
    `actor-mock-${String((actorSeq += 1)).padStart(4, '0')}`;
  const nextAuditId = (): string =>
    `audit-mock-${String((auditSeq += 1)).padStart(4, '0')}`;

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

    // traderId equality or `{ in: [...] }` — used by import DB dedupe.
    if (where.traderId) {
      if (typeof where.traderId === 'string') {
        if (actor.traderId !== where.traderId) return false;
      } else if (Array.isArray(where.traderId.in)) {
        if (!where.traderId.in.includes(actor.traderId)) return false;
      }
    }

    if (where.id?.in && Array.isArray(where.id.in)) {
      if (!where.id.in.includes(actor.id)) return false;
    }
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

  function attachCrops(
    actor: Record<string, unknown> | null | undefined,
    include?: any,
  ): Record<string, unknown> | null {
    if (!actor) return null;
    if (!include?.crops) return actor;
    const links = cropLinks
      .filter((link) => link.actorId === actor.id)
      .map((link) => ({
        actorId: actor.id,
        cropId: link.cropId,
        crop: CROPS_CATALOG.find((c) => c.id === link.cropId),
      }));
    return { ...actor, crops: links };
  }

  function applyOrderBy(
    items: Record<string, unknown>[],
    orderBy: any,
  ): Record<string, unknown>[] {
    if (!orderBy) return items;
    const clauses: Array<{ field: string; dir: 'asc' | 'desc' }> = [];
    const normalize = (o: any) => {
      if (Array.isArray(o)) o.forEach((entry) => normalize(entry));
      else if (o && typeof o === 'object') {
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

  function applyPagination(
    items: Record<string, unknown>[],
    args: { skip?: number; take?: number },
  ): Record<string, unknown>[] {
    const skip = args?.skip ?? 0;
    const take = args?.take ?? items.length;
    return items.slice(skip, skip + take);
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
      }) => {
        const filtered = actors.filter((a) => matchesWhere(a, args?.where));
        const ordered = applyOrderBy(filtered, args?.orderBy);
        const page = applyPagination(ordered, args);
        return page.map((a) => attachCrops(a, args?.include) ?? a);
      },
    ),
    count: jest.fn(async (args: { where?: Record<string, any> }) =>
      actors.filter((a) => matchesWhere(a, args?.where)).length,
    ),
    findUnique: jest.fn(async (args: { where: { id: string }; include?: any }) => {
      const found = actors.find((a) => a.id === args.where.id) ?? null;
      return attachCrops(found, args?.include);
    }),
    create: jest.fn(async (args: { data: Record<string, unknown> }) => {
      const data = args.data;
      if (actors.some((a) => a.traderId === data.traderId)) {
        throwUniqueViolation(['traderId']);
      }
      const now = new Date();
      const created = {
        district: null,
        sex: null,
        position: null,
        marketLocation: null,
        capacityTons: null,
        technicalSupport: null,
        phone: null,
        email: null,
        gpsLatitude: null,
        gpsLongitude: null,
        gpsAltitude: null,
        gpsAccuracy: null,
        consentStatus: ConsentStatus.UNKNOWN,
        ...data,
        id: nextActorId(),
        createdAt: now,
        updatedAt: now,
      };
      actors.push(created);
      return created;
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
  };

  const crop = {
    findMany: jest.fn(
      async (args: { where?: { name?: { in: string[] } | string } }) => {
        let filtered = CROPS_CATALOG;
        const name = args.where?.name;
        if (name && typeof name === 'object' && 'in' in name) {
          const wanted = new Set(name.in);
          filtered = filtered.filter((c) => wanted.has(c.name));
        } else if (typeof name === 'string') {
          filtered = filtered.filter((c) => c.name === name);
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
          filtered = filtered.filter((e) => e.actorId === args.where!.actorId);
        }
        return applyPagination(applyOrderBy(filtered, args?.orderBy), args);
      },
    ),
    count: jest.fn(async (args: { where?: { actorId?: string } }) => {
      if (args.where?.actorId) {
        return auditLog.filter((e) => e.actorId === args.where!.actorId).length;
      }
      return auditLog.length;
    }),
    createMany: jest.fn(async (args: { data: Record<string, unknown>[] }) => {
      for (const row of args.data) {
        auditLog.push({ ...row, id: nextAuditId(), createdAt: new Date() });
      }
      return { count: args.data.length };
    }),
  };

  const tx = { actor, cropsOnActors, crop, actorAuditLog };
  const $transaction = jest.fn(async (arg: any) => {
    if (typeof arg === 'function') return arg(tx);
    return Promise.all(arg);
  });

  seed();
  return { actor, cropsOnActors, crop, actorAuditLog, $transaction, reset: seed };
}

// ---- role tokens + test guard ---------------------------------------------

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

const IMPORT_URL = '/api/v1/admin/actors/import';

// ---- suite -----------------------------------------------------------------

describe('Admin actor import e2e (HTTP + in-memory Prisma)', () => {
  let app: NestExpressApplication;
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

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createValidationPipe());
    // Same shared 8 MB JSON body limit as production (main.ts / lambda.ts).
    configureBodyParser(app);
    await app.init();
  });

  beforeEach(() => {
    prismaMock.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  /** Find a report row by its Excel row number. */
  const rowByNumber = (body: any, n: number) =>
    body.rows.find((r: { rowNumber: number }) => r.rowNumber === n);

  describe('RBAC (FR-10)', () => {
    let previewBody: { fileName: string; fileBase64: string; mode: string };

    beforeAll(async () => {
      previewBody = {
        fileName: 'actors.xlsx',
        fileBase64: await buildWorkbook([validRow({ traderId: 'TZ-RBAC' })]),
        mode: 'preview',
      };
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).post(IMPORT_URL).send(previewBody).expect(401);
    });

    it('returns 403 with a Staff token', async () => {
      await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(staff)
        .send(previewBody)
        .expect(403);
    });

    it('returns 403 with a Public token', async () => {
      await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(pub)
        .send(previewBody)
        .expect(403);
    });

    it('returns 200 with an Admin token', async () => {
      const res = await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(admin)
        .send(previewBody)
        .expect(200);
      expect(res.body.mode).toBe('preview');
    });
  });

  describe('Preview writes nothing (FR-3)', () => {
    it('classifies rows but leaves the registry unchanged', async () => {
      const before = await request(app.getHttpServer())
        .get('/api/v1/admin/actors')
        .set(admin)
        .expect(200);
      expect(before.body.total).toBe(2);

      const fileBase64 = await buildWorkbook([
        validRow({ traderId: 'TZ-P-1', traderName: 'Prospect One' }),
        validRow({ traderId: 'TZ-P-2', traderName: 'Prospect Two' }),
      ]);

      const res = await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(admin)
        .send({ fileName: 'actors.xlsx', fileBase64, mode: 'preview' })
        .expect(200);

      expect(res.body.mode).toBe('preview');
      expect(res.body.totals).toMatchObject({
        rows: 2,
        toCreate: 2,
        created: 0,
      });
      expect(res.body.rows.map((r: { outcome: string }) => r.outcome)).toEqual([
        'create',
        'create',
      ]);

      const after = await request(app.getHttpServer())
        .get('/api/v1/admin/actors')
        .set(admin)
        .expect(200);
      expect(after.body.total).toBe(2);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('Commit lifecycle with a mixed fixture (FR-4..FR-8, FR-11)', () => {
    /** row2 create+crops+PII, row3 create, row4 dup-exists, row5/6 in-file dup,
     * row7 invalid (region+email), row8 create+GPS warning. */
    const mixedRows = (): CellMap[] => [
      validRow({
        traderId: 'TZ-IMP-1',
        traderName: 'Import One',
        phone: IMPORT_PII_PHONE,
        email: IMPORT_PII_EMAIL,
        cropSorghum: 'YES',
        cropGroundnut: 'YES',
      }),
      validRow({ traderId: 'TZ-IMP-2', traderName: 'Import Two', region: 'Dodoma' }),
      validRow({ traderId: 'TZ-EXIST-1', traderName: 'Dup Of Existing' }),
      validRow({ traderId: 'TZ-DUP', traderName: 'Dup First', region: 'Tanga' }),
      validRow({ traderId: 'TZ-DUP', traderName: 'Dup Second', region: 'Tanga' }),
      validRow({
        traderId: 'TZ-BAD',
        traderName: 'Bad Row',
        region: 'Atlantis',
        email: IMPORT_BAD_EMAIL,
      }),
      validRow({ traderId: 'TZ-GPS', traderName: 'Gps Row', region: 'Iringa', gpsLatitude: 999 }),
    ];

    it('creates valid rows with crops + IMPORT audit, skips/fails the rest, and never echoes PII', async () => {
      const fileBase64 = await buildWorkbook(mixedRows());

      const res = await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(admin)
        .send({ fileName: 'actors.xlsx', fileBase64, mode: 'commit' })
        .expect(200);

      expect(res.body.mode).toBe('commit');
      expect(res.body.totals).toEqual({
        rows: 7,
        toCreate: 4,
        created: 4,
        skipped: 2,
        failed: 1,
        warnings: 1,
      });

      // Per-row outcomes tied to Excel row numbers.
      expect(rowByNumber(res.body, 2).outcome).toBe('created');
      expect(rowByNumber(res.body, 3).outcome).toBe('created');
      expect(rowByNumber(res.body, 4).outcome).toBe('skipped-exists');
      expect(rowByNumber(res.body, 5).outcome).toBe('created');
      expect(rowByNumber(res.body, 6).outcome).toBe('skipped-duplicate-in-file');
      expect(rowByNumber(res.body, 7).outcome).toBe('failed');
      expect(rowByNumber(res.body, 8).outcome).toBe('created');

      // Failed row carries both field errors (names only).
      const failed = rowByNumber(res.body, 7);
      const failedFields = failed.errors.map((e: { field: string }) => e.field).sort();
      expect(failedFields).toEqual(['email', 'region']);

      // GPS row imported with a cleared-GPS warning (DR-5), not failed.
      expect(rowByNumber(res.body, 8).warnings).toContain(
        'GPS out of range — imported with GPS cleared',
      );

      // FR-11: no PII value anywhere in the report body.
      const bodyText = JSON.stringify(res.body);
      for (const secret of [IMPORT_PII_PHONE, IMPORT_PII_EMAIL, IMPORT_BAD_EMAIL]) {
        expect(bodyText).not.toContain(secret);
      }

      // Created actor exists with its crop links + PII (admin view) + UNKNOWN consent.
      const impOneId = rowByNumber(res.body, 2).actorId as string;
      expect(impOneId).toBeDefined();
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${impOneId}`)
        .set(admin)
        .expect(200);
      expect(detail.body.crops.sort()).toEqual(['groundnut', 'sorghum']);
      expect(detail.body.phone).toBe(IMPORT_PII_PHONE);
      expect(detail.body.consentStatus).toBe('UNKNOWN');

      // FR-8: exactly one IMPORT audit entry, retrievable via the history route.
      const history = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${impOneId}/history`)
        .set(admin)
        .expect(200);
      expect(history.body.total).toBe(1);
      expect(history.body.data[0].action).toBe('IMPORT');
      expect(history.body.data[0].actingSub).toBe('admin-sub');
      expect(history.body.data[0].actingEmail).toBe('admin@example.com');

      // GPS row's actor has its GPS cleared.
      const gpsId = rowByNumber(res.body, 8).actorId as string;
      const gpsDetail = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${gpsId}`)
        .set(admin)
        .expect(200);
      expect(gpsDetail.body.gpsLatitude).toBeNull();
      expect(gpsDetail.body.gpsLongitude).toBeNull();

      // FR-4: the pre-existing actor was NOT modified.
      const existing = await request(app.getHttpServer())
        .get('/api/v1/admin/actors/actor-exist-1')
        .set(admin)
        .expect(200);
      expect(existing.body.traderName).toBe('Existing Registry Trader');

      // Net new actors: 4 created on top of the 2 seeded.
      const list = await request(app.getHttpServer())
        .get('/api/v1/admin/actors')
        .set(admin)
        .expect(200);
      expect(list.body.total).toBe(6);
    });
  });

  describe('Re-upload idempotence (FR-4)', () => {
    it('creates on the first commit and creates nothing on the second', async () => {
      const fileBase64 = await buildWorkbook([
        validRow({ traderId: 'TZ-ID-1', traderName: 'Idem One' }),
        validRow({ traderId: 'TZ-ID-2', traderName: 'Idem Two' }),
        validRow({ traderId: 'TZ-ID-3', traderName: 'Idem Three' }),
      ]);
      const body = { fileName: 'actors.xlsx', fileBase64, mode: 'commit' };

      const first = await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(admin)
        .send(body)
        .expect(200);
      expect(first.body.totals).toMatchObject({ created: 3, skipped: 0, failed: 0 });

      const second = await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(admin)
        .send(body)
        .expect(200);
      expect(second.body.totals).toMatchObject({ created: 0, skipped: 3, failed: 0 });
      expect(
        second.body.rows.every(
          (r: { outcome: string }) => r.outcome === 'skipped-exists',
        ),
      ).toBe(true);
    });
  });

  describe('Consent gate (FR-6)', () => {
    it('fails GRANTED rows on commit without acknowledgement', async () => {
      const fileBase64 = await buildWorkbook([
        validRow({ traderId: 'TZ-GR-1', consentStatus: 'GRANTED' }),
      ]);

      const res = await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(admin)
        .send({ fileName: 'actors.xlsx', fileBase64, mode: 'commit' })
        .expect(200);

      expect(res.body.totals).toMatchObject({ created: 0, failed: 1 });
      expect(res.body.rows[0].outcome).toBe('failed');
      expect(res.body.rows[0].errors[0].field).toBe('consentStatus');
    });

    it('imports GRANTED rows and records acknowledged on the audit when acknowledged', async () => {
      const fileBase64 = await buildWorkbook([
        validRow({ traderId: 'TZ-GR-2', consentStatus: 'GRANTED' }),
      ]);

      const res = await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(admin)
        .send({
          fileName: 'actors.xlsx',
          fileBase64,
          mode: 'commit',
          acknowledged: true,
        })
        .expect(200);

      expect(res.body.totals).toMatchObject({ created: 1, failed: 0 });
      const actorId = res.body.rows[0].actorId as string;

      const history = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${actorId}/history`)
        .set(admin)
        .expect(200);
      expect(history.body.data[0].action).toBe('IMPORT');
      expect(history.body.data[0].acknowledged).toBe(true);
    });
  });

  describe('Bad inputs → 400 (FR-2, NFR-1)', () => {
    it('rejects a .csv fileName', async () => {
      const fileBase64 = await buildWorkbook([validRow()]);
      await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(admin)
        .send({ fileName: 'actors.csv', fileBase64, mode: 'preview' })
        .expect(400);
    });

    it('rejects a non-base64 payload', async () => {
      await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(admin)
        .send({ fileName: 'actors.xlsx', fileBase64: '@@@not-base64@@@', mode: 'preview' })
        .expect(400);
    });

    it('rejects a corrupt (non-xlsx) buffer with a clean 400', async () => {
      const fileBase64 = Buffer.from('this is definitely not a workbook').toString(
        'base64',
      );
      const res = await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(admin)
        .send({ fileName: 'actors.xlsx', fileBase64, mode: 'preview' })
        .expect(400);
      expect(res.body.message).toMatch(/not a valid \.xlsx/i);
    });

    it('rejects a workbook with more than 1,000 data rows AND proves the raised body limit', async () => {
      // High-entropy per-row notes so the JSON request body exceeds Express's
      // default ~100 kB limit — if the shared 8 MB limit were NOT applied, this
      // request would be rejected with 413 before ever reaching the service.
      const rows = Array.from({ length: 1001 }, (_, i) =>
        validRow({
          traderId: `TZ-CAP-${i + 1}`,
          traderName: `Capacity Row ${i + 1}`,
          technicalSupport: randomText(i + 1, 160),
        }),
      );
      const fileBase64 = await buildWorkbook(rows);
      const body = { fileName: 'actors.xlsx', fileBase64, mode: 'preview' };

      // Proof the request body is over the default limit it would otherwise hit.
      expect(requestBodyBytes(body)).toBeGreaterThan(DEFAULT_EXPRESS_JSON_LIMIT);

      const res = await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(admin)
        .send(body)
        .expect(400);
      // The 400 came from the SERVICE (row cap), not a 413 from the body parser.
      expect(res.body.message).toMatch(/maximum is 1000/i);
    });

    // NOTE: the oversized decoded-payload guard (> 4 MB) is covered as a unit in
    // actor-import.service.spec.ts ('rejects a decoded file larger than 4 MB');
    // building a > 4 MB fixture over HTTP here would only re-test the same guard.
  });

  describe('Large valid commit over the raised body limit (NFR-6)', () => {
    it('accepts a multi-chunk payload larger than the default limit and commits it', async () => {
      const rows = Array.from({ length: 250 }, (_, i) =>
        validRow({
          traderId: `TZ-BIG-${i + 1}`,
          traderName: `Big Row ${i + 1}`,
          technicalSupport: randomText(1000 + i, 480),
        }),
      );
      const fileBase64 = await buildWorkbook(rows);
      const body = { fileName: 'actors.xlsx', fileBase64, mode: 'commit' };
      expect(requestBodyBytes(body)).toBeGreaterThan(DEFAULT_EXPRESS_JSON_LIMIT);

      const res = await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(admin)
        .send(body)
        .expect(200);
      expect(res.body.totals).toMatchObject({ created: 250, failed: 0 });
    });
  });

  describe('Public read + PII boundary regression (FR-11)', () => {
    it('GET /api/v1/actors returns only the GRANTED actor with no PII', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/actors')
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.data[0].id).toBe('actor-pub-1');

      const wire = JSON.parse(JSON.stringify(res.body));
      expectNoPiiKeys(wire);
      expect(collectForbiddenValues(wire)).toHaveLength(0);
      const bodyText = JSON.stringify(wire);
      for (const secret of [SEED_PII_PHONE, SEED_PII_EMAIL, 'TZ-PUB-1']) {
        expect(bodyText).not.toContain(secret);
      }
    });

    it('public read is unaffected by a prior import commit', async () => {
      const fileBase64 = await buildWorkbook([
        validRow({ traderId: 'TZ-AFTER-1', traderName: 'After Import' }),
      ]);
      await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(admin)
        .send({ fileName: 'actors.xlsx', fileBase64, mode: 'commit' })
        .expect(200);

      // Imported actors default to UNKNOWN → still only the seeded GRANTED actor.
      const res = await request(app.getHttpServer())
        .get('/api/v1/actors')
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].id).toBe('actor-pub-1');
    });
  });
});
