// @sdd-spec import-export/partner-profile-onboarding
/**
 * T-11 — Worked-example fixture + preview assertions, and the PII release gate
 * (FR-2, FR-3, FR-5, FR-7, FR-10, NFR-1).
 *
 * This suite does NOT teach the importer anything new — T-1..T-4 already
 * shipped every behavior exercised here. What T-11 adds is a **PII-scrubbed**
 * fixture that reproduces the *structure* of the anomalies measured in the
 * client workbook (`requirements.md` §3.1) and drives it through the same
 * real-app + in-memory-Prisma harness as `admin-actor-import.e2e.spec.ts`,
 * asserting this spec's named scenarios rather than re-testing the importer
 * in general.
 *
 * **Dependency-order note (see `execution.md` T-11).** `T-7` (`mapping.md`) is
 * blocked on the source workbook and is NOT done. Nothing here depends on it:
 * the fixture is built from `TEMPLATE_COLUMNS` (the importer accepts no other
 * shape). Five of the six dirt classes below are enumerated in T-11's own
 * scope line and in `requirements.md` §3.1; the sixth (DMS coordinates, Class
 * 6) closes T-11's half of FR-10's scenario from `tasks.md`'s
 * coverage-closure table (`tasks.md:222`) — T-8 owns the mapping-side half —
 * added in this rework pass. None is derived from a mapping decision.
 *
 * **NFR-9 — no client PII.** Every trader id, name, and phone number below is
 * synthetic. The one district/region pairing used (`Mbozi` → `Songwe`) is a
 * public Tanzanian administrative fact, already committed in
 * `DISTRICT_TO_REGION`; district names are not among NFR-9's categories
 * (phone, email, contact-person name, individual producer name), and reusing
 * an already-committed value adds no disclosure.
 *
 * **What this suite does NOT claim (`design.md` §7.1, §12.1):**
 *   - FR-6's at-scale public-invisibility clause. This suite mocks Prisma and
 *     structurally cannot observe an onboarded dataset at scale. That clause
 *     is discharged by T-9's operator-run post-commit check, never here.
 *   - Whether any mapping decision (district→region, trader type, contaminated
 *     row disposition) is *correct* — that is `mapping.md`'s job (T-7/T-8),
 *     with no automated gate (§12.1 items 1-4). This suite proves the
 *     importer's *mechanics* behave as FR-2/FR-3/FR-5/FR-7 specify.
 *   - Key determinism across two MAPPING runs (`design.md` §12.1 item 6).
 *     The idempotency describe below re-POSTs a byte-identical workbook,
 *     which holds key generation constant BY CONSTRUCTION — it proves the
 *     upload half of FR-2 (identical keys → zero creates on re-commit), not
 *     whether re-running the mapping by hand reproduces the same keys. That
 *     property is verified only by re-running and diffing, owned by T-7/T-8,
 *     never by this suite.
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import request from 'supertest';

import { AppModule } from '../app.module';
import { createValidationPipe } from '../common/validation-pipe';
import { configureBodyParser } from '../common/body-parser.config';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../auth/auth.types';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';
import { TEMPLATE_COLUMNS, TEMPLATE_HEADERS } from '../common/template-columns';
import { DISTRICT_TO_REGION } from '../common/normalize';

// ---- xlsx fixture builder (mirrors admin-actor-import.e2e.spec.ts) ---------

type CellMap = Record<string, string | number>;

async function buildWorkbook(dataRows: CellMap[]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data');
  ws.addRow([...TEMPLATE_HEADERS]);
  for (const row of dataRows) {
    ws.addRow(TEMPLATE_COLUMNS.map((col) => row[col.field] ?? ''));
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf).toString('base64');
}

// ---- the six dirt classes (requirements.md §3.1, `tasks.md` T-11 scope) ---

/**
 * Class 1 — "dirty districts" (FR-3 district-rescue scenario).
 *
 * `DISTRICT_TO_REGION` is NOT consumed by the importer (`design.md` DD-1) —
 * region derivation happens by hand at mapping time, and `mapping.md` (T-7,
 * blocked) publishes the result into the canonical template's Region column.
 * This row supplies the value mapping.md WOULD have written for a
 * `Bulk buyers_beans`-shaped organisation whose own Region cell was blank and
 * whose District cell read "Mbozi" — sourced from the shipped constant so the
 * fixture is traceable, never invented. The assertion is the scenario's own
 * clause: the derived region is CREATED, not quarantined.
 */
const DERIVED_REGION = DISTRICT_TO_REGION.get('mbozi');
if (!DERIVED_REGION) {
  throw new Error(
    'Fixture assumption broken: DISTRICT_TO_REGION no longer has an entry for "mbozi" — update the district-rescue row.',
  );
}

const districtRescueRow: CellMap = {
  traderId: 'PPO-1',
  traderName: 'Fixture District-Rescue Org',
  traderType: 'bulk_buyer',
  region: DERIVED_REGION,
  district: 'Mbozi',
};

/**
 * Class 2 — "a contaminated row" (FR-4). Reproduces the SHAPE of the measured
 * `Offtaker_Groundnuts` anomaly — a phone number sitting in the Trader Type
 * cell (a column-shifted row) — with a synthetic digit string. The importer
 * validates shape, not meaning (`design.md` §1 consequence 2): it cannot tell
 * a column-shifted phone from a nonsense value, so it quarantines on
 * `traderType` exactly as it would any unrecognized taxonomy value.
 */
const contaminatedRow: CellMap = {
  traderId: 'PPO-2',
  traderName: 'Fixture Contaminated Org',
  traderType: '+255700000091',
  region: 'Arusha',
};

/**
 * Class 3 — "an unnormalizable phone" (FR-5 `null` branch, T-3). `020 7946
 * 0958` is Ofcom's UK range reserved for fictional/dramatic use — obviously
 * synthetic, and not a shape `normalizePhone()` recognizes as Tanzanian, so it
 * exercises the same `null` + warning path as a genuinely foreign number would
 * (`design.md` §4.1 / §10.1 F-1).
 */
const unnormalizablePhoneRow: CellMap = {
  traderId: 'PPO-3',
  traderName: 'Fixture Unnormalizable-Phone Org',
  traderType: 'offtaker',
  region: 'Arusha',
  phone: '+44 20 7946 0958',
};

/**
 * Class 4 — "a duplicate key" (FR-2). Reproduces the SHAPE of the measured
 * `Offtaker_Sorghum` intra-sheet duplicate ids: two rows sharing one
 * `traderId`. The first wins (`dedupeInFile`); the second is
 * `skipped-duplicate-in-file`.
 */
const duplicateKeyRowA: CellMap = {
  traderId: 'PPO-DUP',
  traderName: 'Fixture Duplicate Org A',
  traderType: 'seed_company',
  region: 'Dodoma',
};
const duplicateKeyRowB: CellMap = {
  traderId: 'PPO-DUP',
  traderName: 'Fixture Duplicate Org B',
  traderType: 'seed_company',
  region: 'Dodoma',
};

/**
 * Class 5 — "a blank required field" (FR-3 "quarantine on absent district").
 * A blank Region cell is what `mapping.md` would leave when a source
 * district has no entry in `DISTRICT_TO_REGION` — FR-3's "never guess" rule
 * means the cell stays blank rather than being filled with a placeholder, and
 * the importer's existing required-field check quarantines it on `region`.
 */
const blankRegionRow: CellMap = {
  traderId: 'PPO-5',
  traderName: 'Fixture Blank-Region Org',
  traderType: 'offtaker',
  region: '',
};

/**
 * Class 6 — "DMS coordinates blanked, actor still imports" (FR-10). A GPS
 * cell holding a degrees-minutes-seconds STRING rather than a decimal is a
 * shape `Number()` cannot parse: `resolveGps` → `numOrNull`
 * (`actor-import.service.ts:712-741`) yields `NaN`, which is non-finite, so
 * `numOrNull` returns `null`; `isValidLatitude(null)` is false, so ALL four
 * GPS values are cleared and `GPS_CLEARED_WARNING` (`:75`) is recorded —
 * never a coerced number, never a quarantined row (DR-5, `design.md` DD-10).
 * DMS is one instance of the non-numeric shape; nothing here is DMS-specific
 * — any unparseable string exercises the identical path.
 *
 * The latitude's minutes component (75) is deliberately out of range: 75
 * minutes cannot resolve to any location on Earth, so the coordinate is
 * provably not a place, closing the "is this a real spot in Tanzania?"
 * question outright rather than leaving it merely unverified against the 71
 * DMS cells in the source workbook (`design.md` DD-10; NFR-9) — provenance
 * does not need checking when the value cannot correspond to anywhere.
 */
const dmsCoordinatesRow: CellMap = {
  traderId: 'PPO-6',
  traderName: 'Fixture DMS-Coordinates Org',
  traderType: 'seed_company',
  region: 'Mbeya',
  gpsLatitude: "8°75'13\"S",
  gpsLongitude: "33°75'39\"E",
};

/** Excel rows 2..8, in this fixed order (Excel row number = index + 2). */
const mixedFixtureRows = (): CellMap[] => [
  districtRescueRow, // row 2
  contaminatedRow, // row 3
  unnormalizablePhoneRow, // row 4
  duplicateKeyRowA, // row 5
  duplicateKeyRowB, // row 6
  blankRegionRow, // row 7
  dmsCoordinatesRow, // row 8
];

// ---- minimal in-memory Prisma (trimmed from admin-actor-import.e2e.spec.ts) ---

function buildPrismaMock() {
  let actors: Record<string, unknown>[] = [];
  let auditLog: Record<string, unknown>[] = [];
  let actorSeq = 0;

  const nextActorId = (): string =>
    `actor-mock-${String((actorSeq += 1)).padStart(4, '0')}`;

  function attachCrops(
    found: Record<string, unknown> | null | undefined,
    include?: any,
  ): Record<string, unknown> | null {
    if (!found) return null;
    if (!include?.crops) return found;
    return { ...found, crops: [] };
  }

  function throwUniqueViolation(target: string[]): never {
    throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '0.0.0',
      meta: { target },
    });
  }

  const actor = {
    findMany: jest.fn(async (args: { where?: Record<string, any> }) => {
      const where = args?.where;
      if (where?.traderId?.in) {
        const wanted = new Set(where.traderId.in as string[]);
        return actors.filter((a) => wanted.has(a.traderId as string));
      }
      return [...actors];
    }),
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
    createMany: jest.fn(async (args: { data: unknown[] }) => ({
      count: args.data.length,
    })),
  };

  const crop = {
    // T-4's `loadCropIds()` runs on every commit regardless of whether any row
    // sets a crop column — none of this fixture's rows do, so an empty catalog
    // is correct and sufficient.
    findMany: jest.fn(async () => []),
  };

  const actorAuditLog = {
    createMany: jest.fn(async (args: { data: Record<string, unknown>[] }) => {
      for (const row of args.data) auditLog.push({ ...row });
      return { count: args.data.length };
    }),
  };

  const tx = { actor, cropsOnActors, crop, actorAuditLog };
  const $transaction = jest.fn(async (arg: any) => {
    if (typeof arg === 'function') return arg(tx);
    return Promise.all(arg);
  });

  return {
    actor,
    cropsOnActors,
    crop,
    actorAuditLog,
    $transaction,
    reset: () => {
      actors = [];
      auditLog = [];
      actorSeq = 0;
      actor.findMany.mockClear();
      actor.create.mockClear();
      $transaction.mockClear();
    },
  };
}

// ---- role token + test guard (mirrors admin-actor-import.e2e.spec.ts) -----

const ADMIN_USER: AuthUser = {
  sub: 'admin-sub',
  username: 'admin-user',
  groups: ['admin'],
  role: 'Admin',
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
    if (token !== 'admin-token') {
      throw new UnauthorizedException('Invalid token');
    }
    req.user = ADMIN_USER;
    return true;
  }
}

const admin = { Authorization: 'Bearer admin-token' };
const IMPORT_URL = '/api/v1/admin/actors/import';

// ---- suite -----------------------------------------------------------------

describe('Partner Profile onboarding — worked-example fixture (T-11)', () => {
  let app: NestExpressApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  beforeAll(async () => {
    prismaMock = buildPrismaMock();

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
    configureBodyParser(app);
    await app.init();
  });

  beforeEach(() => {
    prismaMock.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  const rowByNumber = (body: any, n: number) =>
    body.rows.find((r: { rowNumber: number }) => r.rowNumber === n);

  describe('Preview classifies the six dirt classes and writes nothing (FR-3, FR-7, FR-10)', () => {
    it('reports the expected per-row outcomes and breakdown, asserted against the Prisma mock', async () => {
      const fileBase64 = await buildWorkbook(mixedFixtureRows());

      const res = await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(admin)
        .send({ fileName: 'partner-profile-fixture.xlsx', fileBase64, mode: 'preview' })
        .expect(200);

      expect(res.body.mode).toBe('preview');

      // Class 1 — dirty district: derived region is a prospective create, NOT
      // quarantined (FR-3 district-rescue scenario's own "BUT NOT" clause).
      expect(rowByNumber(res.body, 2).outcome).toBe('create');

      // Class 2 — contaminated row: quarantined on `traderType`, the field the
      // importer's shape check actually fails on (not a bespoke "column-shifted"
      // code — the importer cannot distinguish the two, per design.md §1).
      expect(rowByNumber(res.body, 3).outcome).toBe('failed');
      expect(rowByNumber(res.body, 3).errors.map((e: any) => e.field)).toEqual([
        'traderType',
      ]);

      // Class 3 — unnormalizable phone: still a create (FR-5 forbids rejecting
      // an organisation over an unusable phone), with a warning naming the
      // column and NOT the input's digits.
      const row4 = rowByNumber(res.body, 4);
      expect(row4.outcome).toBe('create');
      expect(row4.warnings.join(' ')).toMatch(/phone/i);
      expect(row4.warnings.join(' ')).toMatch(/imported with phone cleared/i);
      for (const digits of ['02079460958', '442079460958', '7946', '0958']) {
        expect(JSON.stringify(row4.warnings)).not.toContain(digits);
      }

      // Class 4 — duplicate key: first wins as a create, second is
      // `skipped-duplicate-in-file`.
      expect(rowByNumber(res.body, 5).outcome).toBe('create');
      expect(rowByNumber(res.body, 6).outcome).toBe('skipped-duplicate-in-file');

      // Class 5 — blank required field (quarantine on absent district):
      // quarantined on `region`, never guessed.
      expect(rowByNumber(res.body, 7).outcome).toBe('failed');
      expect(rowByNumber(res.body, 7).errors.map((e: any) => e.field)).toEqual([
        'region',
      ]);

      // Class 6 — DMS-shaped GPS coordinates: still a create (FR-10 forbids
      // rejecting an actor over unusable location data), with a warning
      // naming GPS as cleared.
      const row8 = rowByNumber(res.body, 8);
      expect(row8.outcome).toBe('create');
      expect(row8.warnings).toEqual(['GPS out of range — imported with GPS cleared']);

      // FR-7 regression pin at the HTTP boundary — the discriminating cases
      // (count-descending order, multi-error attribution) live in
      // `actor-import.service.spec.ts`'s T-4 block.
      expect(res.body.totals).toMatchObject({
        rows: 7,
        toCreate: 4,
        created: 0,
        skipped: 1,
        failed: 2,
      });
      expect(res.body.failureBreakdown).toEqual([
        { reason: 'region', count: 1 },
        { reason: 'skipped-duplicate-in-file', count: 1 },
        { reason: 'traderType', count: 1 },
      ]);

      // Preview writes nothing — asserted against the DATABASE MOCK, not by
      // re-reading this same report (KZ-002: a report cannot prove itself).
      expect(prismaMock.actor.create).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('Commit persists exactly the create-eligible rows (FR-2, FR-3, FR-5, FR-7, FR-10)', () => {
    it('creates 4 rows, clears the unnormalizable phone in the stored record, and leaves the rest unwritten', async () => {
      const fileBase64 = await buildWorkbook(mixedFixtureRows());

      const res = await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(admin)
        .send({ fileName: 'partner-profile-fixture.xlsx', fileBase64, mode: 'commit' })
        .expect(200);

      expect(res.body.totals).toMatchObject({
        rows: 7,
        toCreate: 4,
        created: 4,
        skipped: 1,
        failed: 2,
      });

      // The database mock actually received exactly 4 creates — not inferred
      // from `totals.created`, but from the mock's own call count.
      expect(prismaMock.actor.create).toHaveBeenCalledTimes(4);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

      // Class 1 — the derived-region row round-trips with the derived region.
      const districtRescueId = rowByNumber(res.body, 2).actorId as string;
      const districtRescueDetail = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${districtRescueId}`)
        .set(admin)
        .expect(200);
      expect(districtRescueDetail.body.region).toBe(DERIVED_REGION);

      // Class 3 — phone stored as an explicit null (never the raw foreign
      // number), proving the `null` branch, not merely the warning text.
      const phoneRowId = rowByNumber(res.body, 4).actorId as string;
      const phoneDetail = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${phoneRowId}`)
        .set(admin)
        .expect(200);
      expect(phoneDetail.body.phone).toBeNull();

      // Class 6, half 1 — the GET proves the READ surface exposes no
      // coordinate for this actor.
      const dmsRowId = rowByNumber(res.body, 8).actorId as string;
      const dmsDetail = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${dmsRowId}`)
        .set(admin)
        .expect(200);
      expect(dmsDetail.body.gpsLatitude).toBeNull();
      expect(dmsDetail.body.gpsLongitude).toBeNull();

      // Class 6, half 2 — half 1 alone is laundered: `toNullableNumber`
      // (`admin-actor.serializer.ts:127-134`) collapses BOTH a correctly
      // cleared value AND a wrongly persisted non-numeric string down to the
      // same `null` on read, so the GET cannot tell the two apart. This
      // reaches past the serializer to the mock's captured call args
      // (mirrors `actor-import.service.spec.ts:313-316`) to prove the DMS
      // string never reached the column in the first place. A regression
      // that coerced it to a finite number (e.g. `parseFloat` → `8`) or one
      // that persisted the raw string (`"8°75'13\"S"`) would each leave the
      // key present on this call's `data` holding that value; the cleared
      // path (`actor-import.service.ts:619` → `resolveGps` returns `{}` →
      // `buildCreateData` drops `undefined` scalars) omits the key
      // entirely, so `not.toHaveProperty` rejects both regressions.
      const dmsCreateCall = prismaMock.actor.create.mock.calls.find(
        (call) => call[0].data.traderId === 'PPO-6',
      );
      expect(dmsCreateCall).toBeDefined();
      const dmsCreateData = dmsCreateCall![0].data;
      expect(dmsCreateData).not.toHaveProperty('gpsLatitude');
      expect(dmsCreateData).not.toHaveProperty('gpsLongitude');
      expect(dmsCreateData).not.toHaveProperty('gpsAltitude');
      expect(dmsCreateData).not.toHaveProperty('gpsAccuracy');

      // Classes 2 and 5 never became actors at all.
      expect(rowByNumber(res.body, 3).actorId).toBeUndefined();
      expect(rowByNumber(res.body, 7).actorId).toBeUndefined();
    });
  });

  describe('Idempotent re-upload (FR-2 scenario, upload half: an unchanged workbook re-POSTed in commit mode creates nothing)', () => {
    it('creates on the first commit and yields zero creates with every row skipped-exists on the second', async () => {
      const cleanRows: CellMap[] = [
        { traderId: 'PPO-IDEM-1', traderName: 'Idempotency Org A', traderType: 'seed_company', region: 'Arusha' },
        { traderId: 'PPO-IDEM-2', traderName: 'Idempotency Org B', traderType: 'seed_company', region: 'Dodoma' },
      ];
      const fileBase64 = await buildWorkbook(cleanRows);
      const body = {
        fileName: 'partner-profile-fixture-idempotency.xlsx',
        fileBase64,
        mode: 'commit',
      };

      const first = await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(admin)
        .send(body)
        .expect(200);
      expect(first.body.totals).toMatchObject({ created: 2, skipped: 0, failed: 0 });
      expect(first.body.rows.map((r: { outcome: string }) => r.outcome)).toEqual([
        'created',
        'created',
      ]);

      const firstActorId = first.body.rows[0].actorId as string;
      const beforeSecondRun = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${firstActorId}`)
        .set(admin)
        .expect(200);

      // The mapping step is held constant BY CONSTRUCTION, not exercised:
      // this re-POSTs the EXACT fileBase64, byte for byte, so key generation
      // never re-runs. See the file-header "does NOT claim" block.
      const second = await request(app.getHttpServer())
        .post(IMPORT_URL)
        .set(admin)
        .send(body)
        .expect(200);

      expect(second.body.totals).toMatchObject({ created: 0, skipped: 2, failed: 0 });
      expect(second.body.rows.map((r: { outcome: string }) => r.outcome)).toEqual([
        'skipped-exists',
        'skipped-exists',
      ]);

      // Zero NEW creates reached the database mock on the second run.
      expect(prismaMock.actor.create).toHaveBeenCalledTimes(2); // total across both runs

      // The existing record is byte-identical — the importer has no upsert
      // mode (FR-2's own clause), asserted by comparing the full record.
      const afterSecondRun = await request(app.getHttpServer())
        .get(`/api/v1/admin/actors/${firstActorId}`)
        .set(admin)
        .expect(200);
      expect(afterSecondRun.body).toEqual(beforeSecondRun.body);
    });
  });
});
