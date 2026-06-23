import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConsentStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { PII_ALLOWLIST } from '../common/pii-consent.policy';

/**
 * T-9 — End-to-end PII-boundary + consent integration tests (NFR-1, NFR-7).
 *
 * The unit specs (T-4/T-5/T-6) prove each layer in isolation; THIS suite proves
 * the boundary holds over the REAL HTTP → controller → service → serializer path
 * for every public endpoint. It spins up a real Nest app (`createNestApplication`
 * with the production global prefix `api/v1` + the production `ValidationPipe`)
 * and drives it with supertest, so the only thing faked is the database: a
 * mocked {@link PrismaService} serves in-memory fixtures.
 *
 * The DB is the only seam because no MySQL is reachable here; everything above
 * Prisma is the genuine wiring. Fixtures deliberately include GRANTED actors with
 * EVERY PII field + full GPS populated, plus UNKNOWN and DENIED actors (also fully
 * PII-populated), so the assertions below prove leakage is impossible, not merely
 * absent.
 *
 * Design refs: design.md §10 (DD-1/DD-2/DD-6), §12. Requirements: NFR-1, NFR-7.
 */

/**
 * The complete set of keys that must NEVER appear anywhere in a public response:
 * the PII allowlist (the single source of truth) plus the non-public columns the
 * serializer accepts but never emits.
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
    // PII — populated on purpose; MUST NOT surface in any public response.
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
 * In-memory fixture set: three GRANTED actors (different regions/types/crops so
 * the metric distincts are non-trivial), plus one UNKNOWN and one DENIED actor —
 * all fully PII-populated. The non-granted rows MUST be invisible everywhere.
 */
const ACTORS: Record<string, unknown>[] = [
  fixtureActor(),
  fixtureActor({
    id: 'actor-granted-2',
    traderId: 'TZ-COOP-0002',
    traderName: 'Dodoma Farmers Cooperative',
    region: 'Dodoma',
    traderType: 'cooperative',
    gpsLatitude: -6.173,
    gpsLongitude: 35.7416,
    crops: [{ crop: { name: 'groundnut' } }],
  }),
  fixtureActor({
    id: 'actor-granted-3',
    traderId: 'TZ-NGO-0003',
    traderName: 'Mbeya Seed NGO',
    region: 'Mbeya',
    traderType: 'ngo',
    gpsLatitude: -8.9094,
    gpsLongitude: 33.4608,
    crops: [{ crop: { name: 'common_bean' } }],
  }),
  fixtureActor({
    id: 'actor-unknown-1',
    traderId: 'TZ-UNK-0004',
    traderName: 'Unconsented Trader (UNKNOWN)',
    region: 'Iringa',
    traderType: 'offtaker',
    consentStatus: ConsentStatus.UNKNOWN,
    crops: [{ crop: { name: 'sorghum' } }],
  }),
  fixtureActor({
    id: 'actor-denied-1',
    traderId: 'TZ-DEN-0005',
    traderName: 'Opted-out Trader (DENIED)',
    region: 'Tanga',
    traderType: 'informal_trader',
    consentStatus: ConsentStatus.DENIED,
    crops: [{ crop: { name: 'groundnut' } }],
  }),
];

const GRANTED = ACTORS.filter(
  (a) => a.consentStatus === ConsentStatus.GRANTED,
);

/**
 * A minimal in-memory Prisma `actor` delegate that evaluates the SAME query
 * shapes the production services issue (consent WHERE, region/traderType/crop
 * filters, pagination, groupBy distincts). It is deliberately faithful to the
 * real semantics so the consent filtering under test is exercised, not bypassed.
 */
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
  if (where.crops?.some?.crop?.name) {
    const wanted = where.crops.some.crop.name;
    const names = (actor.crops as { crop?: { name?: string } }[] | undefined)
      ?.map((c) => c.crop?.name)
      .filter(Boolean);
    if (!names?.includes(wanted)) return false;
  }
  return true;
}

function buildPrismaMock(): Partial<PrismaService> {
  const actor = {
    findMany: jest.fn(
      async (args: {
        where?: Record<string, any>;
        skip?: number;
        take?: number;
      }) => {
        const filtered = ACTORS.filter((a) => matchesWhere(a, args?.where));
        const skip = args?.skip ?? 0;
        const take = args?.take ?? filtered.length;
        return filtered.slice(skip, skip + take);
      },
    ),
    count: jest.fn(async (args: { where?: Record<string, any> }) => {
      return ACTORS.filter((a) => matchesWhere(a, args?.where)).length;
    }),
    findUnique: jest.fn(async (args: { where: { id: string } }) => {
      return ACTORS.find((a) => a.id === args.where.id) ?? null;
    }),
    groupBy: jest.fn(
      async (args: { by: string[]; where?: Record<string, any> }) => {
        const filtered = ACTORS.filter((a) => matchesWhere(a, args?.where));
        const key = args.by[0];
        const seen = new Map<unknown, Record<string, unknown>>();
        for (const a of filtered) {
          if (!seen.has(a[key])) seen.set(a[key], { [key]: a[key] });
        }
        return Array.from(seen.values());
      },
    ),
  };
  return { actor } as unknown as Partial<PrismaService>;
}

/**
 * Recursively scan an arbitrary JSON value, asserting no key in {@link
 * FORBIDDEN_KEYS} appears anywhere — at any depth, in any object. Reused across
 * all three endpoints so the boundary is checked identically everywhere.
 */
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

/** Collect every value found under any of the forbidden keys (for direct value scans). */
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

/** The exact PII *values* seeded into the GRANTED fixtures (must never appear). */
const LEAKABLE_PII_VALUES = [
  '+255700000000',
  'director@example.com',
  'Director',
  'Arusha Central Market',
  'Needs cold storage',
  'TZ-SEED-0001',
  '1400', // gpsAltitude
];

describe('PII boundary (HTTP e2e, in-memory Prisma)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(buildPrismaMock())
      .compile();

    app = moduleRef.createNestApplication();
    // Mirror production bootstrap (main.ts / lambda.ts) exactly.
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/actors', () => {
    it('returns ONLY GRANTED actors, never UNKNOWN/DENIED', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/actors')
        .expect(200);

      expect(res.body.total).toBe(GRANTED.length);
      const ids = res.body.data.map((a: { id: string }) => a.id).sort();
      expect(ids).toEqual(
        GRANTED.map((a) => a.id as string).sort(),
      );
      // Non-granted ids must be wholly absent.
      const bodyText = JSON.stringify(res.body);
      expect(bodyText).not.toContain('actor-unknown-1');
      expect(bodyText).not.toContain('actor-denied-1');
    });

    it('deep-scan: no PII allowlist key (nor traderId/altitude/accuracy) anywhere', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/actors')
        .expect(200);

      // Re-parse the wire payload so we scan exactly what the client receives.
      const wire = JSON.parse(JSON.stringify(res.body));
      expectNoPiiKeys(wire);
      expect(collectForbiddenValues(wire)).toHaveLength(0);
      for (const piiValue of LEAKABLE_PII_VALUES) {
        expect(JSON.stringify(wire)).not.toContain(piiValue);
      }
    });

    it('exposes exact { lat, long } GPS for GRANTED actors only — no altitude/accuracy', async () => {
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

  describe('GET /api/v1/actors/:id', () => {
    it('returns a GRANTED actor PII-clean with exact GPS', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/actors/actor-granted-1')
        .expect(200);

      const wire = JSON.parse(JSON.stringify(res.body));
      expectNoPiiKeys(wire);
      expect(collectForbiddenValues(wire)).toHaveLength(0);
      expect(wire.id).toBe('actor-granted-1');
      expect(wire.gps).toEqual({ lat: -3.3869, long: 36.683 });
      expect(Object.keys(wire.gps)).toEqual(['lat', 'long']);
    });

    it('404s for an UNKNOWN-consent actor (indistinguishable from missing)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/actors/actor-unknown-1')
        .expect(404);
    });

    it('404s for a DENIED-consent actor', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/actors/actor-denied-1')
        .expect(404);
    });

    it('404s for an absent id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/actors/does-not-exist')
        .expect(404);
    });
  });

  describe('GET /api/v1/metrics', () => {
    it('deep-scan: aggregate payload carries no PII keys', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/metrics')
        .expect(200);

      const wire = JSON.parse(JSON.stringify(res.body));
      expectNoPiiKeys(wire);
      expect(collectForbiddenValues(wire)).toHaveLength(0);
    });

    it('counts GRANTED actors only — excludes UNKNOWN/DENIED', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/metrics')
        .expect(200);

      // 3 GRANTED actors across 3 distinct regions and 3 distinct traderTypes.
      expect(res.body.actorsMapped).toBe(3);
      expect(res.body.regionsCovered).toBe(3);
      expect(res.body.actorTypes).toBe(3);
      // GRANTED crops: sorghum(1), common_bean(2), groundnut(1) → all 3 tracked.
      // The UNKNOWN(sorghum) and DENIED(groundnut) rows must NOT inflate counts.
      expect(res.body.cropsTracked).toBe(3);
    });

    it('matches the frontend Metrics contract shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/metrics')
        .expect(200);

      expect(res.body).toEqual({
        actorsMapped: expect.any(Number),
        cropsTracked: expect.any(Number),
        regionsCovered: expect.any(Number),
        actorTypes: expect.any(Number),
        crops: expect.arrayContaining([
          { slug: 'sorghum', mappedActors: expect.any(Number) },
          { slug: 'common_bean', mappedActors: expect.any(Number) },
          { slug: 'groundnut', mappedActors: expect.any(Number) },
        ]),
      });
      expect(res.body.crops).toHaveLength(3);
      // Per-slug GRANTED counts (UNKNOWN/DENIED excluded).
      const bySlug = Object.fromEntries(
        res.body.crops.map((c: { slug: string; mappedActors: number }) => [
          c.slug,
          c.mappedActors,
        ]),
      );
      expect(bySlug).toEqual({ sorghum: 1, common_bean: 2, groundnut: 1 });
    });
  });
});
