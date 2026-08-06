import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA, MODULE_METADATA } from '@nestjs/common/constants';
import {
  ConsentMethod,
  ConsentStatus,
  RegistrationSource,
  RegistrationStatus,
} from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  NEVER_PUBLIC_FIELDS,
  PII_ALLOWLIST,
} from '../common/pii-consent.policy';
import { createValidationPipe } from '../common/validation-pipe';
import { configureBodyParser } from '../common/body-parser.config';
import { configurePayloadCap } from '../common/payload-cap.config';
import { EmailVerificationService } from '../registrations/email-verification.service';
import { MailService } from '../mail/mail.service';
import { CONSENT_POLICY_VERSION } from '../registrations/consent-policy';
import { REGISTRATIONS_THROTTLE_LIMIT } from '../registrations/registrations-throttle.guard';
import { RegistrationsModule } from '../registrations/registrations.module';

/**
 * `actors/registration-source-and-consent` T-9 — End-to-end PII-boundary +
 * consent integration tests (NFR-1, NFR-7), for the `/actors`, `/actors/:id`
 * and `/metrics` public paths.
 *
 * *(Requalified 2026-08-06 during `actors/public-self-registration` T-13 —
 * every bare task id in this file's original header (T-9, T-4/T-5/T-6/T-7)
 * was `registration-source-and-consent`'s own numbering, written before that
 * spec archived. `public-self-registration` T-12/T-13 now edit this SAME
 * file under an unrelated numbering that collides on the same short ids —
 * T-12A2's carried item. Every task id below is spec-qualified from here on
 * so a reader can no longer land on the wrong spec's `tasks.md`.)*
 *
 * The unit specs (`registration-source-and-consent` T-4/T-5/T-6) prove each
 * layer in isolation; THIS suite proves the boundary holds over the REAL
 * HTTP → controller → service → serializer path for every public endpoint.
 * It spins up a real Nest app (`createNestApplication` with the production
 * global prefix `api/v1` + the production `ValidationPipe`) and drives it
 * with supertest, so the only thing faked is the database: a mocked
 * {@link PrismaService} serves in-memory fixtures.
 *
 * The DB is the only seam because no MySQL is reachable here; everything above
 * Prisma is the genuine wiring. Fixtures deliberately include GRANTED actors with
 * EVERY PII field + full GPS populated, plus UNKNOWN and DENIED actors (also fully
 * PII-populated), so the assertions below prove leakage is impossible, not merely
 * absent.
 *
 * Design refs: design.md §10 (DD-1/DD-2/DD-6), §12. Requirements: NFR-1, NFR-7.
 *
 * **`registration-source-and-consent` T-7 scope note.** FR-8/NFR-1 and that
 * spec's `tasks.md` T-7 done-criteria name FOUR public paths: `/actors`,
 * `/actors/:id`, `/actors/geo`, `/metrics`. `/actors/geo` is documented in
 * `docs/trd/trd.md` (QA-1/QA-6) as a planned lightweight map-points endpoint
 * but is **not implemented** anywhere in `backend/src` — there is no
 * controller, route, or service for it. This mirrors the FR-7 scope
 * correction already recorded in that spec's `requirements.md` (the admin
 * export it names is likewise unimplemented). This suite therefore covers
 * the three public paths that exist (`/actors`, `/actors/:id`, `/metrics`);
 * `/actors/geo` cannot be asserted over HTTP until it is built, and building
 * it is out of that spec's scope.
 *
 * **`actors/public-self-registration` T-12/T-13, appended below this
 * describe block as SIBLING top-level `describe`s, never nested inside it.**
 * T-12 corrected THIS block's own bootstrap (below) to the production
 * helpers; T-13 extends the release gate to the `registrations` module's
 * four public paths — a structurally different table with its own forbidden
 * key/value sets (`REGISTRATION_FORBIDDEN_KEYS`,
 * `REGISTRATION_LEAKABLE_VALUES` below), so it does not reuse
 * `FORBIDDEN_KEYS`/`LEAKABLE_PII_VALUES`, which describe `Actor` only. See
 * `design.md` §6.2/DD-2, `requirements.md` FR-8/NFR-1.
 */

/**
 * The complete set of keys that must NEVER appear anywhere in a public response:
 * the UNION of {@link PII_ALLOWLIST} (personally identifiable fields) and
 * {@link NEVER_PUBLIC_FIELDS} (admin-only operational fields that are not PII —
 * `traderId`/`gpsAltitude`/`gpsAccuracy` plus `registration-source-and-consent`
 * T-7's registration-source and consent-provenance fields, DD-6). Iterating
 * the union — rather than a hand-maintained literal list — means a field
 * added to either constant is automatically covered here with no second edit.
 */
const FORBIDDEN_KEYS: readonly string[] = [
  ...PII_ALLOWLIST,
  ...NEVER_PUBLIC_FIELDS,
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
    // `registration-source-and-consent` T-7 — registration source + consent
    // provenance (FR-1/FR-2). Deliberately NON-DEFAULT (defaults are
    // TEAM_MANAGED / NOT_RECORDED / null / null) so a leaked value would be
    // caught: two of these four fields are null on every live row today, and
    // asserting absence of a null value would pass vacuously (per that
    // spec's own T-1 rollout note — 436/436 rows still default).
    registrationSource: RegistrationSource.SELF_REGISTERED,
    consentMethod: ConsentMethod.SIGNED_FORM,
    consentObtainedAt: new Date('2026-02-14T00:00:00Z'),
    consentReference: 'CONSENT-REF-SIGNED-9931',
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
function expectNoPiiKeys(
  value: unknown,
  keys: readonly string[] = FORBIDDEN_KEYS,
  path = '$',
): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => expectNoPiiKeys(item, keys, `${path}[${i}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (keys.includes(key)) {
        throw new Error(
          `PII boundary violation: forbidden key "${key}" found at ${path}.${key}`,
        );
      }
      expectNoPiiKeys(child, keys, `${path}.${key}`);
    }
  }
}

/**
 * Collect every value found under any of the forbidden keys (for direct
 * value scans). `keys` defaults to {@link FORBIDDEN_KEYS} (the `Actor` set)
 * so every pre-existing call site below is unchanged; T-13's registration
 * scan passes {@link REGISTRATION_FORBIDDEN_KEYS} explicitly rather than
 * this function growing a second, hand-duplicated walker for a different
 * table (`design.md` §6.2's own "derive, don't re-enumerate" principle,
 * applied to the test helpers themselves).
 */
function collectForbiddenValues(
  value: unknown,
  keys: readonly string[] = FORBIDDEN_KEYS,
  found: unknown[] = [],
): unknown[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectForbiddenValues(item, keys, found));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (keys.includes(key)) found.push(child);
      collectForbiddenValues(child, keys, found);
    }
  }
  return found;
}

/**
 * The exact PII/never-public *values* seeded into the GRANTED fixtures (must
 * never appear). `registration-source-and-consent` T-7's provenance values
 * are deliberately non-default (`SELF_REGISTERED`/`SIGNED_FORM`/a real date/a
 * reference string) — a
 * default-valued check (`TEAM_MANAGED`, `NOT_RECORDED`, `null`) would pass
 * vacuously since most live rows carry exactly those defaults today.
 */
const LEAKABLE_PII_VALUES = [
  '+255700000000',
  'director@example.com',
  'Director',
  'Arusha Central Market',
  'Needs cold storage',
  'TZ-SEED-0001',
  '1400', // gpsAltitude
  'SELF_REGISTERED', // registrationSource — non-default
  'SIGNED_FORM', // consentMethod — non-default
  '2026-02-14', // consentObtainedAt — non-default (ISO date fragment)
  'CONSENT-REF-SIGNED-9931', // consentReference — non-default
];

// T11-A1 — the lookup route pseudonymises the caller IP with an HMAC under
// `OTP_HMAC_SECRET` before writing its attempt counter, so this gate now needs
// the secret to exercise `POST /registrations/lookup` at all. Module scope,
// not per-`describe`: a missing value surfaces as an opaque 500 rather than a
// clear failure, and this file is a release blocker.
beforeAll(() => {
  process.env.OTP_HMAC_SECRET = 'test-only-hmac-secret-not-a-real-key-0123456789';
});

afterAll(() => {
  delete process.env.OTP_HMAC_SECRET;
});

describe('PII boundary (HTTP e2e, in-memory Prisma)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(buildPrismaMock())
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    // Bootstrap through the SAME shared helpers main.ts/lambda.ts call
    // (createValidationPipe() + configurePayloadCap() + configureBodyParser()),
    // so the `details` array DC-2 inspects CAN be rendered — a bare `new
    // ValidationPipe({...})` would not attach it. (T12-A1, corrected
    // 2026-08-06 during T-13: this block's own requests are all bodyless
    // `GET`s, so nothing here ever TRIGGERS a validation failure — that was
    // true of this suite before T-13 and remains true of this describe
    // block specifically. The `details` envelope is actually exercised, over
    // HTTP, by `actors/public-self-registration` T-13's `400` coverage in
    // the sibling `describe` block below, which submits malformed bodies to
    // `registrations` routes and inspects `details` for a leak — DC-2.)
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createValidationPipe());
    configurePayloadCap(app);
    configureBodyParser(app);
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
      for (const forbiddenValue of LEAKABLE_PII_VALUES) {
        expect(JSON.stringify(wire)).not.toContain(forbiddenValue);
      }
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
      for (const forbiddenValue of LEAKABLE_PII_VALUES) {
        expect(JSON.stringify(wire)).not.toContain(forbiddenValue);
      }
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

// ============================================================================
// @sdd-spec actors/public-self-registration (T-13)
// ============================================================================

/**
 * T-13 — extends this release gate to the `registrations` module's four
 * public paths (FR-8 all 3 scenarios, NFR-1, DC-1, DC-2, `design.md` §6.2,
 * DD-2). Two sibling top-level `describe` blocks below, deliberately NOT
 * nested inside the `registration-source-and-consent` T-9 block above — see
 * that block's own doc comment for why `Registration` gets its OWN key/value
 * sets rather than reusing `FORBIDDEN_KEYS`/`LEAKABLE_PII_VALUES`.
 *
 * **C-9 / DD-2 — the iteration set is DERIVED from the runtime route table,
 * never compared to one.** {@link getRegisteredRoutes} reads Nest's OWN
 * routing metadata — the `PATH_METADATA`/`METHOD_METADATA` every
 * `@Get`/`@Post` decorator writes, the same source Nest's own
 * `RouterExplorer` (and `DiscoveryService`) read to build the real route
 * table.
 *
 * **MODULE-scoped, not controller-scoped (Reviewer FAIL 1, corrected
 * 2026-08-06 during T-13 rework).** The first revision read this metadata
 * off ONE named class, `RegistrationsController` — invisible to a SECOND
 * controller landing in the same module, and `design.md` §4's own file tree
 * already schedules `admin-registrations.controller.ts` into THIS module
 * for 3b. A second controller arriving there would leave the totality
 * assertion green while its routes get zero coverage — C-9 restored through
 * a different door, with the Done-when's "adding a public route to the
 * module fails the suite" false for that route. {@link getRegisteredRoutes}
 * therefore reads `RegistrationsModule`'s own `controllers` array off
 * `MODULE_METADATA.CONTROLLERS`, and unions {@link getControllerRoutes} —
 * the controller-level building block — over every entry. A route on ANY
 * controller this module registers, present or future, is discovered.
 *
 * **Considered and set aside: walking the booted Express app's own router
 * stack.** `design.md` §6.2 names it as an option alongside
 * `DiscoveryService`. Probed empirically against this app (Nest 11 /
 * Express 5): `instance.router.stack` registered every one of this module's
 * routes TWICE, with the bare `POST /registrations` route appearing once as
 * `/api/v1/registrations/` (trailing slash) and once as
 * `/api/v1/registrations`, from the SAME booted instance. **This is a
 * solvable rendering artifact, not an unresolvable one** — a
 * normalize-then-dedupe (strip the trailing slash, collect into a `Set`
 * keyed `${METHOD} ${path}`) would have handled it deterministically, and
 * would ALSO have stayed naturally app-wide (a real advantage the router
 * stack has and decorator metadata does not — see FAIL 1 above, which is
 * exactly the gap that advantage would have closed for free). An earlier
 * revision of this comment overstated the duplication as irresolvable
 * instead of naming that trade honestly, which a Reviewer correctly
 * rejected. Decorator metadata is kept anyway because it needs no booted
 * app at all and is the single source `RouterExplorer`/`DiscoveryService`
 * read from with no app-level rendering to normalize — but it pays for that
 * with having to be explicitly walked module-by-module (`MODULE_METADATA.CONTROLLERS`)
 * rather than getting app-wide coverage for free, which is the fix FAIL 1
 * required.
 *
 * **RA7 — the gate is the TOTALITY assertion, not the enumeration.** A
 * `for (const r of routes) { if (!fixture) continue; }` loop enumerates
 * every route perfectly and proves nothing about one with no fixture —
 * exactly the defect C-9 already found once, restored. `FIXTURE_MAP` below
 * is asserted TOTAL against the derived route list in one dedicated `it`,
 * and **bidirectionally** (Reviewer fold-in): `expect(Object.keys(FIXTURE_MAP).sort())
 * .toEqual(routes.map(routeKey).sort())` catches BOTH a derived route with
 * no matching entry (the original RA7 concern) AND a stale `FIXTURE_MAP`
 * entry matching no derived route (a fixture rotting silently after a
 * rename or removal) — a route added to the controller with no matching
 * entry fails THAT assertion, by name, rather than being silently skipped.
 * The scan loop that CONSUMES the map, further below, does not repeat the
 * `continue` shape either — a missing entry there `throw`s (a failure
 * signal), never skips silently, so the anti-pattern cannot survive by
 * hiding in the second consumer of the same map.
 *
 * **The Disqualifying clause's proof, performed manually against THIS
 * module-scoped code (both runs re-done after the FAIL 1 rework, neither
 * left as a standing test — a permanent throwaway route would itself become
 * an uncovered public path, the opposite of what this gate is for):**
 * 1. A temporary `@Get('t13-throwaway-probe')` handler with no
 *    `FIXTURE_MAP` entry was added to `RegistrationsController`, the suite
 *    was re-run and the totality assertion failed naming exactly
 *    `GET /api/v1/registrations/t13-throwaway-probe`, the handler was
 *    removed, and the suite returned to green.
 * 2. **The actual FAIL 1 gap:** a temporary SECOND controller, registered
 *    in `RegistrationsModule.controllers` alongside `RegistrationsController`,
 *    with one uncovered `@Get` route, was added; the suite was re-run and
 *    the totality assertion failed naming exactly that second controller's
 *    route, `GET /api/v1/registrations/t13-throwaway-second-controller-probe`;
 *    both the temporary controller and its module registration were
 *    removed (`git diff` confirmed clean on both files), and the suite
 *    returned to green.
 *
 * Both runs, verbatim, are recorded in `execution.md` → T-13 — a durable
 * artifact, not a transient report this comment cannot verify survives.
 *
 * **B28 — throttler isolation.** This block's own requests are counted in
 * each `it`'s comment and stay comfortably under `REGISTRATIONS_THROTTLE_LIMIT`
 * (20/60s per handler); the `429` body is asserted in a SEPARATE,
 * dedicated-app `describe` further below — the same isolation
 * `registrations-throttle.e2e.spec.ts` and `registrations-lookup.e2e.spec.ts`
 * already established, so a `429` never shares a `beforeAll`-scoped app
 * (and its in-memory counters) with any other assertion in this file.
 */

interface RegisteredRoute {
  method: string;
  path: string;
}

/**
 * Strip leading/trailing slashes off one path SEGMENT (never the joined
 * whole) — Nest itself stores a bare `@Post()`'s method path as the literal
 * string `"/"` (confirmed via {@link Reflect.getMetadata} against
 * `RegistrationsController.submitRegistration` before this function was
 * written), which must collapse to nothing when joined, not survive as an
 * empty segment between two slashes.
 */
function normalizePathSegment(segment: string): string {
  return segment.replace(/^\/+/, '').replace(/\/+$/, '');
}

/** Join a global prefix, a controller path, and a method path exactly the way Nest's own `RouterExplorer` would, using only the pieces this file needs (no query strings, no versioning, no wildcards — this module uses none of those). */
function joinRoutePath(globalPrefix: string, controllerPath: string, methodPath: string): string {
  const segments = [globalPrefix, controllerPath, methodPath]
    .map(normalizePathSegment)
    .filter((segment) => segment.length > 0);
  return `/${segments.join('/')}`;
}

/**
 * Reads the routes Nest itself will register for ONE `controller`, straight
 * off the `PATH_METADATA`/`METHOD_METADATA` its `@Get`/`@Post` decorators
 * wrote — the metadata SOURCE, not a rendering of it. Needs no booted app
 * at all: the decorators already ran when the controller class was
 * imported. **Controller-scoped by design** — this is a building block;
 * {@link getRegisteredRoutes} below is the totality boundary, and it is
 * MODULE-scoped (Reviewer FAIL 1) precisely so this function is never
 * called against a single hardcoded class from the totality path.
 */
function getControllerRoutes(
  controller: { new (...args: never[]): unknown },
  globalPrefix: string,
): RegisteredRoute[] {
  const controllerPath: string = Reflect.getMetadata(PATH_METADATA, controller) ?? '';
  const prototype = (controller as { prototype: object }).prototype as Record<string, unknown>;
  const routes: RegisteredRoute[] = [];
  for (const propertyName of Object.getOwnPropertyNames(prototype)) {
    if (propertyName === 'constructor') continue;
    const handler = prototype[propertyName];
    if (typeof handler !== 'function') continue;

    const methodPathRaw: string | string[] | undefined = Reflect.getMetadata(
      PATH_METADATA,
      handler,
    );
    const requestMethod: RequestMethod | undefined = Reflect.getMetadata(METHOD_METADATA, handler);
    if (methodPathRaw === undefined || requestMethod === undefined) continue; // not a route handler

    const methodPaths = Array.isArray(methodPathRaw) ? methodPathRaw : [methodPathRaw];
    for (const methodPath of methodPaths) {
      routes.push({
        method: RequestMethod[requestMethod],
        path: joinRoutePath(globalPrefix, controllerPath, methodPath),
      });
    }
  }
  return routes;
}

/**
 * MODULE-scoped route derivation — the actual totality boundary (Reviewer
 * FAIL 1). Reads `moduleClass`'s own `controllers` array off
 * `MODULE_METADATA.CONTROLLERS` and unions {@link getControllerRoutes} over
 * EVERY entry, so a route on ANY controller this module registers — one
 * today, or a second one `design.md` §4 already schedules for 3b — is
 * discovered automatically. Needs no booted app at all: every decorator
 * this reads already ran when the module was imported — kept inside
 * `beforeAll` below purely for proximity to where it is used.
 */
function getRegisteredRoutes(
  moduleClass: { new (...args: never[]): unknown },
  globalPrefix: string,
): RegisteredRoute[] {
  const controllers: Array<{ new (...args: never[]): unknown }> =
    Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, moduleClass) ?? [];
  return controllers.flatMap((controller) => getControllerRoutes(controller, globalPrefix));
}

/** `${METHOD} ${path}` — the key `FIXTURE_MAP` and the totality check share. */
function routeKey(method: string, path: string): string {
  return `${method} ${path}`;
}

/**
 * Registration-specific forbidden KEYS (`design.md` §6.2: "payload keys,
 * submitterEmail, id, reviewedBySub, reviewedByEmail"), widened to every
 * `RegistrationPayloadDto` leaf field so a payload value is caught even if
 * it ever reached a response OUTSIDE the `payload` wrapper key. Distinct
 * from {@link FORBIDDEN_KEYS} on purpose: several names here (`region`,
 * `crops`, `sex`) are legitimately PUBLIC `Actor` fields, but no
 * registration-route response may EVER contain them regardless of what is
 * public elsewhere — reusing the `Actor` set here would silently under-cover
 * this table, the opposite failure of the one DD-2 already prevents for the
 * `Actor` scan.
 */
const REGISTRATION_FORBIDDEN_KEYS: readonly string[] = [
  // Registration columns never public (design.md §2.2, §6.2).
  'payload',
  'submitterEmail',
  'id',
  'emailVerifiedAt',
  'consentAcceptedAt',
  'consentPolicyVersion',
  'publishedActorId',
  'reviewedBySub',
  'reviewedByEmail',
  'reviewedAt',
  'rejectionReason',
  'duplicateDismissals',
  // RegistrationPayloadDto leaf fields (design.md §4.1) — the literal-pick
  // serializer (§6.2 layer 1) never emits any of these under any key name.
  'traderName',
  'traderType',
  'contactPerson',
  'position',
  'district',
  'marketLocation',
  'sex',
  'region',
  'gpsLatitude',
  'gpsLongitude',
  'crops',
  'otherCrops',
  'capacityTons',
  'phone',
  // The OTP-verified submitter address as it names itself in the REQUEST —
  // never a legitimate RESPONSE key on any of this module's four paths.
  'email',
];

/**
 * A fully-populated Registration row shape, standing in for the Prisma
 * `Registration` model — every non-public field carries a distinctive,
 * greppable "DO NOT LEAK" value (or, for numerics, a value long enough not
 * to collide with an unrelated digit run elsewhere) so a leak of ANY of
 * them is unmistakable in a failure message, mirroring the `fixtureActor`
 * convention above.
 */
interface RegistrationFixtureRow {
  id: string;
  reference: string;
  status: RegistrationStatus;
  payload: {
    traderName: string;
    traderType: string;
    contactPerson: string;
    position: string;
    district: string;
    marketLocation: string;
    sex: string;
    region: string;
    gpsLatitude: number;
    gpsLongitude: number;
    crops: string[];
    otherCrops: string;
    capacityTons: number;
    phone: string;
  };
  submitterEmail: string;
  emailVerifiedAt: Date;
  consentAcceptedAt: Date;
  consentPolicyVersion: string;
  publishedActorId: string | null;
  reviewedBySub: string;
  reviewedByEmail: string;
  reviewedAt: Date;
  rejectionReason: string | null;
  reviewNote: string;
  duplicateDismissals: null;
  createdAt: Date;
  updatedAt: Date;
}

const APPROVED_REGISTRATION_ROW: RegistrationFixtureRow = {
  id: 'reg-approved-internal-id-do-not-leak',
  reference: 'REG-2026-9101',
  status: RegistrationStatus.APPROVED,
  payload: {
    traderName: 'Approved Fixture Traders — DO NOT LEAK',
    traderType: 'seed_company',
    contactPerson: 'Approved Fixture Contact Person — DO NOT LEAK',
    position: 'Approved Fixture Position — DO NOT LEAK',
    district: 'Approved Fixture District — DO NOT LEAK',
    marketLocation: 'Approved Fixture Market — DO NOT LEAK',
    sex: 'F',
    region: 'Mbeya',
    gpsLatitude: -8.9001234,
    gpsLongitude: 33.4601234,
    crops: ['sorghum'],
    otherCrops: 'Approved Fixture Other Crop — DO NOT LEAK',
    capacityTons: 84213,
    phone: '+255700003001',
  },
  submitterEmail: 'approved-fixture-do-not-leak@example.com',
  emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
  consentAcceptedAt: new Date('2026-01-01T00:00:00Z'),
  consentPolicyVersion: 'v-approved-fixture-do-not-leak',
  publishedActorId: 'actor-approved-fixture-do-not-leak',
  reviewedBySub: 'cognito-sub-approved-fixture-do-not-leak',
  reviewedByEmail: 'admin-approved-fixture-do-not-leak@example.com',
  reviewedAt: new Date('2026-01-02T00:00:00Z'),
  rejectionReason: null,
  reviewNote: 'Approved fixture review note — visible ONLY via its OWN lookup response',
  duplicateDismissals: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

const REJECTED_REGISTRATION_ROW: RegistrationFixtureRow = {
  id: 'reg-rejected-internal-id-do-not-leak',
  reference: 'REG-2026-9102',
  status: RegistrationStatus.REJECTED,
  payload: {
    traderName: 'Rejected Fixture Traders — DO NOT LEAK',
    traderType: 'ngo',
    contactPerson: 'Rejected Fixture Contact Person — DO NOT LEAK',
    position: 'Rejected Fixture Position — DO NOT LEAK',
    district: 'Rejected Fixture District — DO NOT LEAK',
    marketLocation: 'Rejected Fixture Market — DO NOT LEAK',
    sex: 'M',
    region: 'Dodoma',
    gpsLatitude: -6.1701234,
    gpsLongitude: 35.7401234,
    crops: ['groundnut'],
    otherCrops: 'Rejected Fixture Other Crop — DO NOT LEAK',
    capacityTons: 71349,
    phone: '+255700003002',
  },
  submitterEmail: 'rejected-fixture-do-not-leak@example.com',
  emailVerifiedAt: new Date('2026-01-03T00:00:00Z'),
  consentAcceptedAt: new Date('2026-01-03T00:00:00Z'),
  consentPolicyVersion: 'v-rejected-fixture-do-not-leak',
  publishedActorId: null,
  reviewedBySub: 'cognito-sub-rejected-fixture-do-not-leak',
  reviewedByEmail: 'admin-rejected-fixture-do-not-leak@example.com',
  reviewedAt: new Date('2026-01-04T00:00:00Z'),
  rejectionReason: 'DUPLICATE_OF_EXISTING_RECORD_FIXTURE_DO_NOT_LEAK',
  reviewNote: 'Rejected fixture review note — visible ONLY via its OWN lookup response',
  duplicateDismissals: null,
  createdAt: new Date('2026-01-03T00:00:00Z'),
  updatedAt: new Date('2026-01-04T00:00:00Z'),
};

/**
 * The `POST /registrations` submission fixture — its own PII values, kept
 * distinct from the two lookup fixtures above so a cross-endpoint leak
 * cannot hide behind a value shared between them.
 */
const SUBMIT_PAYLOAD_FIXTURE = {
  traderName: 'Submit Fixture Traders — DO NOT LEAK',
  traderType: 'seed_company',
  contactPerson: 'Submit Fixture Contact Person — DO NOT LEAK',
  position: 'Submit Fixture Position — DO NOT LEAK',
  district: 'Submit Fixture District — DO NOT LEAK',
  marketLocation: 'Submit Fixture Market — DO NOT LEAK',
  sex: 'F',
  region: 'Mbeya',
  gpsLatitude: -8.9123456,
  gpsLongitude: 33.4612345,
  crops: ['sorghum'],
  otherCrops: 'Submit Fixture Other Crop — DO NOT LEAK',
  capacityTons: 63187,
  phone: '+255700009911',
};
const SUBMIT_SUBMITTER_EMAIL = 'submit-fixture-do-not-leak@example.com';
const SUBMIT_CREATED_ROW_ID = 'submit-created-internal-id-do-not-leak';

function submitBodyFixture(): Record<string, unknown> {
  return {
    email: SUBMIT_SUBMITTER_EMAIL,
    code: '123456',
    consent: { accepted: true, policyVersion: CONSENT_POLICY_VERSION },
    payload: SUBMIT_PAYLOAD_FIXTURE,
  };
}

/**
 * Extract every non-public field VALUE off a {@link RegistrationFixtureRow}
 * as strings, for the direct substring scan below. `status` and
 * `reviewNote` are deliberately EXCLUDED — both are the one thing the
 * public lookup MAY legitimately return for THIS row's own successful
 * lookup (design.md §2.2), asserted PRESENT (not absent) by the
 * approved/rejected cross-check test further below. `sex`/`traderType`/
 * `region`/`crops` are also excluded from this VALUE list (though not from
 * {@link REGISTRATION_FORBIDDEN_KEYS} above): those are short,
 * closed-vocabulary values (`'F'`, `'seed_company'`, `'Mbeya'`) with a real
 * risk of colliding with unrelated content elsewhere and producing a false
 * failure — the KEY-based scan already forbids them appearing under their
 * own name regardless of value, which is the safer signal for that shape.
 */
function nonPublicValues(row: RegistrationFixtureRow): string[] {
  const raw: Array<string | number | null> = [
    row.id,
    row.submitterEmail,
    row.reviewedBySub,
    row.reviewedByEmail,
    row.reviewedAt.toISOString(),
    row.rejectionReason,
    row.publishedActorId,
    row.consentPolicyVersion,
    row.payload.traderName,
    row.payload.contactPerson,
    row.payload.position,
    row.payload.district,
    row.payload.marketLocation,
    row.payload.otherCrops,
    row.payload.phone,
    row.payload.capacityTons,
    row.payload.gpsLatitude,
    row.payload.gpsLongitude,
  ];
  return raw.filter((v): v is string | number => v !== null).map((v) => String(v));
}

/**
 * The union of every non-public value across BOTH lookup fixtures and the
 * submit fixture — the value sweep every registration-route response is
 * checked against (design.md §6.2: "asserted as values … from an approved
 * and a rejected fixture").
 */
const REGISTRATION_LEAKABLE_VALUES: readonly string[] = [
  ...nonPublicValues(APPROVED_REGISTRATION_ROW),
  ...nonPublicValues(REJECTED_REGISTRATION_ROW),
  SUBMIT_CREATED_ROW_ID,
  SUBMIT_SUBMITTER_EMAIL,
  SUBMIT_PAYLOAD_FIXTURE.traderName,
  SUBMIT_PAYLOAD_FIXTURE.contactPerson,
  SUBMIT_PAYLOAD_FIXTURE.position,
  SUBMIT_PAYLOAD_FIXTURE.district,
  SUBMIT_PAYLOAD_FIXTURE.marketLocation,
  SUBMIT_PAYLOAD_FIXTURE.otherCrops,
  SUBMIT_PAYLOAD_FIXTURE.phone,
  String(SUBMIT_PAYLOAD_FIXTURE.capacityTons),
  String(SUBMIT_PAYLOAD_FIXTURE.gpsLatitude),
  String(SUBMIT_PAYLOAD_FIXTURE.gpsLongitude),
];

/**
 * Assert `res`'s parsed body (key scan) and raw wire text (value scan)
 * carry neither a {@link REGISTRATION_FORBIDDEN_KEYS} key nor a
 * {@link REGISTRATION_LEAKABLE_VALUES} value — the same two-layer scan this
 * file already established for `Actor`, reused via the now-parameterised
 * `expectNoPiiKeys`/`collectForbiddenValues`, over the `registrations`
 * module's OWN sets.
 */
function expectRegistrationResponseClean(res: request.Response): void {
  const wire = JSON.parse(JSON.stringify(res.body ?? {}));
  expectNoPiiKeys(wire, REGISTRATION_FORBIDDEN_KEYS);
  expect(collectForbiddenValues(wire, REGISTRATION_FORBIDDEN_KEYS)).toHaveLength(0);
  for (const leakableValue of REGISTRATION_LEAKABLE_VALUES) {
    expect(res.text).not.toContain(leakableValue);
  }
}

interface SequenceRow {
  year: number;
  seq: number;
}

interface LookupAttemptRow {
  ip: string;
  reference: string;
  windowStartIso: string;
  attempts: number;
}

interface FakeRegistrationTx {
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  $queryRaw: (strings: TemplateStringsArray) => Promise<Array<Record<string, unknown>>>;
  registration: { create: jest.Mock };
}

/**
 * A Prisma mock covering every `registrations` write/read path T-13's
 * fixtures exercise: `RegistrationSequence`'s allocator (submit),
 * `RegistrationLookupAttempt`'s composite counter (lookup), and
 * `registration.findUnique`/`create`. Combines the two fake `$transaction`
 * shapes `registrations-submit.e2e.spec.ts` and
 * `registrations-lookup.e2e.spec.ts` each already establish independently —
 * reused here rather than re-derived, since both raw-SQL dispatch patterns
 * (`RegistrationSequence` / `RegistrationLookupAttempt`) are already proven
 * against real concurrent load elsewhere in this spec's own test suite;
 * T-13 only needs them to behave consistently, not to re-prove them.
 */
function buildRegistrationPrismaMock(
  registrationCreateSpy: jest.Mock,
): Partial<PrismaService> {
  const sequenceRows: SequenceRow[] = [];
  const lookupAttemptRows: LookupAttemptRow[] = [];

  const transactionMock = jest.fn(
    async (callback: (tx: FakeRegistrationTx) => Promise<unknown>) => {
      let sessionNewRegSeq: number | null = null;
      let sessionNewLookupAttempts: number | null = null;
      const tx: FakeRegistrationTx = {
        $executeRaw: async (strings, ...values) => {
          const sql = strings.join('?');
          if (sql.includes('RegistrationSequence')) {
            const [year] = values as [number];
            let row = sequenceRows.find((r) => r.year === year);
            if (!row) {
              row = { year, seq: 1 };
              sequenceRows.push(row);
            } else {
              row.seq += 1;
            }
            sessionNewRegSeq = row.seq;
            return 1;
          }
          if (sql.includes('RegistrationLookupAttempt')) {
            const [ip, reference, windowStart] = values as [string, string, Date];
            const windowStartIso = windowStart.toISOString();
            let row = lookupAttemptRows.find(
              (r) => r.ip === ip && r.reference === reference && r.windowStartIso === windowStartIso,
            );
            if (!row) {
              row = { ip, reference, windowStartIso, attempts: 1 };
              lookupAttemptRows.push(row);
            } else {
              row.attempts += 1;
            }
            sessionNewLookupAttempts = row.attempts;
            return 1;
          }
          throw new Error(`Fake tx.$executeRaw: unrecognized SQL: ${sql}`);
        },
        $queryRaw: async (strings) => {
          const sql = strings.join('?');
          if (sql.includes('@newRegSeq')) return [{ newRegSeq: sessionNewRegSeq }];
          if (sql.includes('@newLookupAttempts')) {
            return [{ newLookupAttempts: sessionNewLookupAttempts }];
          }
          throw new Error(`Fake tx.$queryRaw: unrecognized SQL: ${sql}`);
        },
        registration: { create: registrationCreateSpy },
      };
      return callback(tx);
    },
  );

  const findUniqueSpy = jest.fn(async ({ where }: { where: { reference: string } }) => {
    if (where.reference === APPROVED_REGISTRATION_ROW.reference) return APPROVED_REGISTRATION_ROW;
    if (where.reference === REJECTED_REGISTRATION_ROW.reference) return REJECTED_REGISTRATION_ROW;
    return null;
  });

  const lookupAttemptUpdateSpy = jest.fn(
    async ({
      where,
    }: {
      where: { ip_reference_windowStart: { ip: string; reference: string; windowStart: Date } };
    }) => {
      const key = where.ip_reference_windowStart;
      const windowStartIso = key.windowStart.toISOString();
      const row = lookupAttemptRows.find(
        (r) => r.ip === key.ip && r.reference === key.reference && r.windowStartIso === windowStartIso,
      );
      if (row) row.attempts = 0;
      return row ?? null;
    },
  );

  return {
    $transaction: transactionMock,
    registration: { create: registrationCreateSpy, findUnique: findUniqueSpy },
    registrationLookupAttempt: { update: lookupAttemptUpdateSpy },
  } as unknown as Partial<PrismaService>;
}

describe(
  'PII boundary (HTTP e2e) — registrations module (T-13, release gate: FR-8, NFR-1, DC-1, DC-2)',
  () => {
    let app: NestExpressApplication;
    let registrationCreateSpy: jest.Mock;
    let verifyCodeMock: jest.Mock;
    let consumeCodeMock: jest.Mock;
    let issueCodeMock: jest.Mock;
    let sendVerificationCodeMock: jest.Mock;
    let sendReceiptMock: jest.Mock;
    let routes: RegisteredRoute[];

    beforeAll(async () => {
      registrationCreateSpy = jest.fn().mockResolvedValue({ id: SUBMIT_CREATED_ROW_ID });
      verifyCodeMock = jest.fn();
      consumeCodeMock = jest.fn();
      issueCodeMock = jest.fn();
      sendVerificationCodeMock = jest.fn().mockResolvedValue(undefined);
      sendReceiptMock = jest.fn().mockResolvedValue(undefined);

      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PrismaService)
        .useValue(buildRegistrationPrismaMock(registrationCreateSpy))
        .overrideProvider(EmailVerificationService)
        .useValue({
          verifyCode: verifyCodeMock,
          consumeCode: consumeCodeMock,
          issueCode: issueCodeMock,
        } as unknown as EmailVerificationService)
        .overrideProvider(MailService)
        .useValue({
          sendVerificationCode: sendVerificationCodeMock,
          sendReceipt: sendReceiptMock,
        } as unknown as MailService)
        .compile();

      app = moduleRef.createNestApplication<NestExpressApplication>();
      // T-12's corrected, production-matching bootstrap — required so this
      // gate's own `400` coverage (below) actually renders the `details`
      // array DC-2 exists to inspect.
      app.setGlobalPrefix('api/v1');
      app.useGlobalPipes(createValidationPipe());
      configurePayloadCap(app);
      configureBodyParser(app);
      await app.init();

      routes = getRegisteredRoutes(RegistrationsModule, 'api/v1');
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      verifyCodeMock.mockReset().mockResolvedValue({ outcome: 'MATCHED', id: 'ev-fixture-row' });
      consumeCodeMock.mockReset().mockResolvedValue(true);
      issueCodeMock.mockReset().mockResolvedValue({ code: '654321', expiresAt: new Date() });
      sendVerificationCodeMock.mockReset().mockResolvedValue(undefined);
      sendReceiptMock.mockReset().mockResolvedValue(undefined);
      registrationCreateSpy.mockClear();
    });

    it(
      'discovers at least one registered route under /api/v1/registrations — guards against the ' +
        'derivation itself silently returning nothing, which would make every test below vacuous',
      () => {
        expect(routes.length).toBeGreaterThan(0);
      },
    );

    describe('every registered public route has a fixture (RA7 — the totality assertion)', () => {
      const FIXTURE_MAP: Record<string, () => request.Test> = {
        [routeKey('GET', '/api/v1/registrations/consent-policy')]: () =>
          request(app.getHttpServer()).get('/api/v1/registrations/consent-policy'),
        [routeKey('POST', '/api/v1/registrations/verify')]: () =>
          request(app.getHttpServer())
            .post('/api/v1/registrations/verify')
            .send({ email: 'route-scan-probe@example.com' }),
        [routeKey('POST', '/api/v1/registrations')]: () =>
          request(app.getHttpServer()).post('/api/v1/registrations').send(submitBodyFixture()),
        [routeKey('POST', '/api/v1/registrations/lookup')]: () =>
          request(app.getHttpServer())
            .post('/api/v1/registrations/lookup')
            .send({
              reference: APPROVED_REGISTRATION_ROW.reference,
              email: APPROVED_REGISTRATION_ROW.submitterEmail,
            }),
      };

      it(
        'FIXTURE_MAP has EXACTLY one entry per route this module registers, on ANY controller — a ' +
          'route added anywhere in RegistrationsModule with no matching entry fails HERE, by name, ' +
          "rather than being silently skipped (RA7 + Reviewer's bidirectional fold-in); the two " +
          'throwaway-route proofs (same controller, then a second controller) are recorded in ' +
          "execution.md → T-13, not kept in this file",
        () => {
          // Bidirectional (Reviewer fold-in): this single assertion catches
          // BOTH a derived route with no fixture (RA7's original concern)
          // AND a stale fixture matching no derived route (rot after a
          // rename/removal) — the `missing`-only form below is subsumed,
          // not dropped, since a sorted-array mismatch reports both
          // directions in one diff.
          const derivedKeys = routes.map((r) => routeKey(r.method, r.path)).sort();
          const fixtureKeys = Object.keys(FIXTURE_MAP).sort();
          expect(fixtureKeys).toEqual(derivedKeys);
        },
      );

      it(
        "every discovered route's fixture response is PII-clean (FR-8 scenario 1, DC-1) — 1 request " +
          'per route, 4 requests total against this describe block\'s own throttle bucket',
        async () => {
          for (const route of routes) {
            const key = routeKey(route.method, route.path);
            const send = FIXTURE_MAP[key];
            // The totality test above is the actual gate for a MISSING
            // entry; this throws rather than silently skipping so the
            // anti-pattern cannot hide by moving to this SECOND consumer of
            // the same map (RA7).
            if (!send) {
              throw new Error(
                `RA7: no FIXTURE_MAP entry for ${key} — the totality test above should have caught this first.`,
              );
            }
            const res = await send();
            expect([200, 201, 202]).toContain(res.status);
            expectRegistrationResponseClean(res);
          }
        },
      );
    });

    describe('approved and rejected registrations stay non-public (FR-8 scenario 3)', () => {
      it(
        "the APPROVED fixture's lookup returns ONLY its own status+reviewNote — no payload, no id, " +
          "no reviewer identity, and NOT the REJECTED fixture's reviewNote/id/email",
        async () => {
          const res = await request(app.getHttpServer())
            .post('/api/v1/registrations/lookup')
            .send({
              reference: APPROVED_REGISTRATION_ROW.reference,
              email: APPROVED_REGISTRATION_ROW.submitterEmail,
            });

          expect(res.status).toBe(200);
          expect(res.body).toEqual({
            status: 'APPROVED',
            reviewNote: APPROVED_REGISTRATION_ROW.reviewNote,
          });
          expectRegistrationResponseClean(res);
          expect(res.text).not.toContain(REJECTED_REGISTRATION_ROW.reviewNote);
          expect(res.text).not.toContain(REJECTED_REGISTRATION_ROW.id);
          expect(res.text).not.toContain(REJECTED_REGISTRATION_ROW.submitterEmail);
        },
      );

      it(
        "the REJECTED fixture's lookup returns ONLY its own status+reviewNote — no payload, no id, " +
          "no reviewer identity, and NOT the APPROVED fixture's reviewNote/id/email",
        async () => {
          const res = await request(app.getHttpServer())
            .post('/api/v1/registrations/lookup')
            .send({
              reference: REJECTED_REGISTRATION_ROW.reference,
              email: REJECTED_REGISTRATION_ROW.submitterEmail,
            });

          expect(res.status).toBe(200);
          expect(res.body).toEqual({
            status: 'REJECTED',
            reviewNote: REJECTED_REGISTRATION_ROW.reviewNote,
          });
          expectRegistrationResponseClean(res);
          expect(res.text).not.toContain(APPROVED_REGISTRATION_ROW.reviewNote);
          expect(res.text).not.toContain(APPROVED_REGISTRATION_ROW.id);
          expect(res.text).not.toContain(APPROVED_REGISTRATION_ROW.submitterEmail);
        },
      );
    });

    describe('the 400 envelope leaks nothing stored (DC-2)', () => {
      it(
        'POST /registrations/verify — a malformed email 400s with a `details` array that reflects ' +
          'only the malformed INPUT, never a stored fixture value',
        async () => {
          const res = await request(app.getHttpServer())
            .post('/api/v1/registrations/verify')
            .send({ email: 'not-an-email' });

          expect(res.status).toBe(400);
          // Reviewer FAIL 2: the test NAME claims a `details` array; prove
          // it rather than merely asserting the status. Without this, the
          // test stays green under a reverted-to-C-8 bootstrap (a bare
          // `new ValidationPipe({...})`, which T-12 exists to have fixed)
          // that no longer renders `details` at all.
          expect(Array.isArray(res.body.details)).toBe(true);
          expect(res.body.details.length).toBeGreaterThan(0);
          expectRegistrationResponseClean(res);
        },
      );

      it(
        'POST /registrations — an unrecognised consent.policyVersion 400s with a `details` array, ' +
          'creates zero rows, and leaks neither fixture registration nor the submit fixture itself',
        async () => {
          const body = submitBodyFixture();
          (body.consent as Record<string, unknown>).policyVersion = 'v0.0-not-a-real-version';

          const res = await request(app.getHttpServer()).post('/api/v1/registrations').send(body);

          expect(res.status).toBe(400);
          // Reviewer FAIL 2, correction: this is NOT the same proof as the
          // malformed-email test above, and a later reader must not delete
          // this one believing it redundant. The malformed-email test goes
          // through `RegistrationVerifyDto` → the GLOBAL PIPE →
          // `createValidationPipe`'s `exceptionFactory` — that is the one
          // that actually catches a C-8 revert to a bare
          // `new ValidationPipe({...})`, since THAT would emit
          // `message: string[]` with no `details` at all. This request
          // never reaches the pipe's semantic-version check: `policyVersion`
          // shape-validates fine, and `assertConsentAccepted`
          // (`registrations.service.ts`) builds its OWN `details` array and
          // throws its own `BadRequestException`, independent of which pipe
          // is installed. The assertion below is still worth having — it
          // locks `assertConsentAccepted`'s envelope shape — but it does NOT
          // exercise DC-2's C-8 regression; the malformed-email test is the
          // one that does.
          expect(Array.isArray(res.body.details)).toBe(true);
          expect(res.body.details.length).toBeGreaterThan(0);
          expectRegistrationResponseClean(res);
          expect(registrationCreateSpy).not.toHaveBeenCalled();
        },
      );

      it(
        'POST /registrations — a REJECTED verification code 400s (design.md §3.1 decision 2\'s ' +
          'byte-identical rejection), creates zero rows, and leaks nothing',
        async () => {
          verifyCodeMock.mockResolvedValueOnce({ outcome: 'REJECTED' });

          const res = await request(app.getHttpServer())
            .post('/api/v1/registrations')
            .send(submitBodyFixture());

          expect(res.status).toBe(400);
          expectRegistrationResponseClean(res);
          expect(registrationCreateSpy).not.toHaveBeenCalled();
        },
      );
    });
  },
);

/**
 * B28 — isolated from every describe block above: its OWN app instance and
 * its OWN in-memory `ThrottlerStorageService`, so a `429` here can never be
 * order-dependent on any other assertion's request count. Two `it`s share
 * this one app because `RegistrationsThrottleGuard`'s key is
 * `sha256(class + handler + ip)` (`registrations-throttle.guard.ts`) — a
 * DIFFERENT handler gets a disjoint counter, so `GET /consent-policy` and
 * `POST /lookup` cannot bleed into each other even sharing one app.
 */
describe('PII boundary (HTTP e2e) — registrations module, 429 isolation (T-13, B28)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(buildRegistrationPrismaMock(jest.fn()))
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createValidationPipe());
    configurePayloadCap(app);
    configureBodyParser(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it(
    `rejects the (REGISTRATIONS_THROTTLE_LIMIT + 1)-th GET /api/v1/registrations/consent-policy ` +
      'with a 429 whose body is PII-clean over this module\'s forbidden key/value sets — this route ' +
      "carries no PII of its own, so this proves the FILTER'S OWN output is clean, not merely that " +
      'this particular route has nothing to leak',
    async () => {
      for (let i = 0; i < REGISTRATIONS_THROTTLE_LIMIT; i++) {
        await request(app.getHttpServer()).get('/api/v1/registrations/consent-policy').expect(200);
      }

      const throttled = await request(app.getHttpServer()).get(
        '/api/v1/registrations/consent-policy',
      );

      expect(throttled.status).toBe(429);
      expectRegistrationResponseClean(throttled);
    },
  );

  it(
    `rejects the (REGISTRATIONS_THROTTLE_LIMIT + 1)-th POST /api/v1/registrations/lookup with a 429 ` +
      'that leaks neither fixture registration — the PII-adjacent path, not the static one above',
    async () => {
      for (let i = 0; i < REGISTRATIONS_THROTTLE_LIMIT; i++) {
        // Reviewer FAIL 3: assert a status on every priming request — the
        // T-8 lesson (six requests silently 429'd inside that task's own
        // evidence). A bare unchecked `await` here would let this test pass
        // even if the guard started rejecting early.
        await request(app.getHttpServer())
          .post('/api/v1/registrations/lookup')
          .send({ reference: 'REG-2026-0000', email: 'no-such-registration@example.com' })
          .expect(404);
      }

      const throttled = await request(app.getHttpServer())
        .post('/api/v1/registrations/lookup')
        .send({
          reference: APPROVED_REGISTRATION_ROW.reference,
          email: APPROVED_REGISTRATION_ROW.submitterEmail,
        });

      expect(throttled.status).toBe(429);
      expectRegistrationResponseClean(throttled);
    },
  );
});
