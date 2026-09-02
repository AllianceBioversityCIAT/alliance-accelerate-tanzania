import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, RegistrationStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { createValidationPipe } from '../common/validation-pipe';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../auth/auth.types';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';
import { MailService } from '../mail/mail.service';
import { APPROVAL_ACKNOWLEDGEMENT_TEXT } from '../registrations/admin-registrations.service';

/**
 * T-8 — End-to-end test for `POST /api/v1/admin/registrations/:id/approve`
 * (FR-12 all six scenarios, FR-14 scenario 1; `design.md` §5, §6.2, §6.3,
 * DD-17, DD-18, DD-23).
 *
 * Spins up a REAL Nest app (`AppModule`) and drives it with supertest over
 * the actual HTTP → controller → service → Prisma-transaction path — the
 * only fake is the database (an in-memory Prisma delegate covering
 * `Registration`, `Actor`, `Crop`, `CropsOnActors`, `ActorAuditLog`) and
 * `MailService` (a spy, so the post-commit dispatch is observable
 * deterministically) — mirrors `admin-actors-crud.e2e.spec.ts`'s
 * established pattern for this module family.
 *
 * **A-34.** `admin-registrations.service.ts`'s `list()` doc states, in the
 * present tense, that PII containment is what *"`admin-registrations.
 * e2e.spec.ts`/`pii-boundary.spec.ts` prove elsewhere"* — this file is what
 * makes that citation true.
 *
 * **A-42.** This suite boots its own `INestApplication` (a fourth
 * app-booting suite alongside `admin-actors-crud.e2e.spec.ts`,
 * `pii-boundary.spec.ts`, `lambda-handler.e2e.spec.ts`); `afterAll` calls
 * `app.close()` so no handle is left dangling into the next suite.
 *
 * **DC-24 / atomicity.** This harness's `$transaction` is a pass-through —
 * it does NOT roll back on a mid-transaction throw (there is no real MySQL
 * underneath it). The forced-failure test below therefore asserts what IS
 * provable over HTTP (the request surfaces as a `500`, and the response
 * carries no partial success shape), never that the mock's in-memory store
 * reverted — that would be a false rollback proof. Real rollback structure
 * is asserted at the unit level (`admin-registrations.service.spec.ts`'s
 * "Atomicity under failure" describe block), against a `tx` object
 * distinguishable from a top-level bypass.
 */

/** Pull the token out of an `Authorization: Bearer <token>` header. */
function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

const TOKEN_USERS: Record<string, AuthUser> = {
  'admin-token': { sub: 'admin-sub-1', username: 'admin-user', groups: ['admin'], role: 'Admin' },
  'staff-token': { sub: 'staff-sub-1', username: 'staff-user', groups: ['staff'], role: 'Staff' },
};

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

/** Fixed 3-crop catalog, matching `admin-actors-crud.e2e.spec.ts`'s convention. */
const CROPS_CATALOG = [
  { id: 'crop-sorghum', name: 'sorghum' },
  { id: 'crop-common_bean', name: 'common_bean' },
  { id: 'crop-groundnut', name: 'groundnut' },
];

/** One PENDING_REVIEW registration row, distinctive per-fixture so cross-row leakage is unmistakable. */
function registrationFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'reg-approve-e2e-1',
    reference: 'REG-2026-0184',
    status: RegistrationStatus.PENDING_REVIEW,
    payload: {
      traderName: 'Meru Agro-Processing & Seeds',
      traderType: 'seed_company',
      contactPerson: 'Grace Mushi — DO NOT PUBLISH',
      position: 'Director',
      district: 'Arusha Urban',
      marketLocation: 'Arusha Central Market',
      sex: 'F',
      region: 'Arusha',
      gpsLatitude: -3.3869,
      gpsLongitude: 36.683,
      crops: ['sorghum', 'common_bean'],
      otherCrops: 'Sunflower — DO NOT PUBLISH',
      capacityTons: 120,
      phone: '+255700000000',
    },
    submitterEmail: 'director@example.com',
    emailVerifiedAt: new Date('2026-01-01T00:05:00Z'),
    consentAcceptedAt: new Date('2026-01-01T00:10:00Z'),
    consentPolicyVersion: 'v3',
    publishedActorId: null,
    reviewedBySub: null,
    reviewedByEmail: null,
    reviewedAt: null,
    rejectionReason: null,
    reviewNote: null,
    duplicateDismissals: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Minimal in-memory Prisma delegate covering exactly what `approve` (and
 * the module's DI graph) needs: `Registration` (conditional update +
 * read + final update), `Actor` (create + refetch-with-crops, plus an
 * empty `findMany` for `DuplicateDetectionService`, unused by `approve`
 * itself but resolved at construction time), `Crop`, `CropsOnActors`,
 * `ActorAuditLog`.
 */
function buildPrismaMock(initialRegistrations: Record<string, unknown>[]) {
  let registrations = initialRegistrations.map((r) => ({ ...r }));
  let actors: Record<string, unknown>[] = [];
  let cropLinks: Array<{ actorId: string; cropId: string }> = [];
  let auditLog: Record<string, unknown>[] = [];
  let actorSeq = 0;
  let auditSeq = 0;

  function throwTraderIdCollision(): never {
    throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '0.0.0',
      meta: { target: ['traderId'] },
    });
  }

  const registrationDelegate = {
    // T-10, A-53 — `AdminRegistrationsService.list`'s two read calls.
    // `buildPrismaMock` is shared by every describe block in this file
    // (including the A-53 `GET /admin/registrations` block further below),
    // so both must exist even though the approve-e2e block's own tests
    // never call `list()`.
    findMany: jest.fn(async () => registrations.map((r) => ({ ...r }))),
    count: jest.fn(async () => registrations.length),
    updateMany: jest.fn(
      async (args: {
        where: { id: string; status: RegistrationStatus };
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        registrations = registrations.map((r) => {
          if (r.id === args.where.id && r.status === args.where.status) {
            count += 1;
            return { ...r, ...args.data };
          }
          return r;
        });
        return { count };
      },
    ),
    findUnique: jest.fn(async (args: { where: { id: string }; select?: unknown }) => {
      const found = registrations.find((r) => r.id === args.where.id);
      return found ? { ...found } : null;
    }),
    update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      registrations = registrations.map((r) =>
        r.id === args.where.id ? { ...r, ...args.data } : r,
      );
      return { ...registrations.find((r) => r.id === args.where.id) };
    }),
  };

  const actorDelegate = {
    findMany: jest.fn(async () => []),
    create: jest.fn(async (args: { data: Record<string, unknown> }) => {
      if (actors.some((a) => a.traderId === args.data.traderId)) {
        throwTraderIdCollision();
      }
      actorSeq += 1;
      const now = new Date('2026-01-05T00:00:00Z');
      const created = { id: `actor-approve-e2e-${actorSeq}`, ...args.data, createdAt: now, updatedAt: now };
      actors.push(created);
      return created;
    }),
    findUnique: jest.fn(async (args: { where: { id: string }; include?: unknown }) => {
      const found = actors.find((a) => a.id === args.where.id);
      if (!found) return null;
      const links = cropLinks
        .filter((l) => l.actorId === args.where.id)
        .map((l) => ({ crop: { name: CROPS_CATALOG.find((c) => c.id === l.cropId)?.name } }));
      return { ...found, crops: links };
    }),
  };

  const cropsOnActorsDelegate = {
    createMany: jest.fn(async (args: { data: Array<{ actorId: string; cropId: string }> }) => {
      cropLinks.push(...args.data);
      return { count: args.data.length };
    }),
  };

  const cropDelegate = {
    findMany: jest.fn(async (args: { where: { name: { in: string[] } } }) => {
      const wanted = new Set(args.where.name.in);
      return CROPS_CATALOG.filter((c) => wanted.has(c.name));
    }),
  };

  const actorAuditLogDelegate = {
    create: jest.fn(async (args: { data: Record<string, unknown> }) => {
      auditSeq += 1;
      const created = { id: `audit-approve-e2e-${auditSeq}`, createdAt: new Date(), ...args.data };
      auditLog.push(created);
      return created;
    }),
  };

  interface TxShape {
    registration: typeof registrationDelegate;
    actor: typeof actorDelegate;
    cropsOnActors: typeof cropsOnActorsDelegate;
    crop: typeof cropDelegate;
    actorAuditLog: typeof actorAuditLogDelegate;
  }

  const tx: TxShape = {
    registration: registrationDelegate,
    actor: actorDelegate,
    cropsOnActors: cropsOnActorsDelegate,
    crop: cropDelegate,
    actorAuditLog: actorAuditLogDelegate,
  };

  const $transaction = jest.fn(async (cb: (tx: TxShape) => unknown) => cb(tx));

  return {
    registration: registrationDelegate,
    actor: actorDelegate,
    cropsOnActors: cropsOnActorsDelegate,
    crop: cropDelegate,
    actorAuditLog: actorAuditLogDelegate,
    $transaction,
    /** Test-only accessors — never part of the production `PrismaService` surface. */
    _getActors: () => actors,
    _getAuditLog: () => auditLog,
    _getRegistrations: () => registrations,
    _seedCollidingActor: (traderId: string) => {
      actors.push({ id: 'actor-preexisting-collision', traderId, traderName: 'Pre-existing Actor' });
    },
    _addRegistration: (row: Record<string, unknown>) => {
      registrations.push(row);
    },
  };
}

describe('Admin registrations approve e2e (HTTP + in-memory Prisma) — T-8, FR-12', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;
  let sendApprovalMock: jest.Mock;

  beforeAll(async () => {
    prismaMock = buildPrismaMock([registrationFixture()]);
    sendApprovalMock = jest.fn().mockResolvedValue(undefined);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock as unknown as PrismaService)
      .overrideGuard(JwtAuthGuard)
      .useValue(new TestJwtAuthGuard())
      .overrideProvider(ActingAdminResolver)
      .useValue({ resolve: jest.fn().mockResolvedValue('reviewer@example.org') })
      .overrideProvider(MailService)
      .useValue({
        sendApproval: sendApprovalMock,
        sendVerificationCode: jest.fn().mockResolvedValue(undefined),
        sendReceipt: jest.fn().mockResolvedValue(undefined),
      } as unknown as MailService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    sendApprovalMock.mockClear();
  });

  it('401s an anonymous caller', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/registrations/reg-approve-e2e-1/approve')
      .send({ acknowledgement: APPROVAL_ACKNOWLEDGEMENT_TEXT })
      .expect(401);
  });

  it('403s a Staff caller', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/registrations/reg-approve-e2e-1/approve')
      .set(staff)
      .send({ acknowledgement: APPROVAL_ACKNOWLEDGEMENT_TEXT })
      .expect(403);
  });

  it('400s a misspelled acknowledgement, server-side, and creates no Actor', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/registrations/reg-approve-e2e-1/approve')
      .set(admin)
      .send({ acknowledgement: 'i confirm consent is on file' })
      .expect(400);

    expect(Array.isArray(res.body.details)).toBe(true);
    expect(prismaMock._getActors()).toHaveLength(0);
  });

  it('404s an unknown registration id', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/registrations/reg-does-not-exist/approve')
      .set(admin)
      .send({ acknowledgement: APPROVAL_ACKNOWLEDGEMENT_TEXT })
      .expect(404);
  });

  it(
    'the happy path: 200, publishes an Actor with correct provenance and the exact publishable ' +
      'subset, marks the registration APPROVED, writes an acknowledged audit row, and dispatches ' +
      'the notification AFTER the response — FR-12 scenario 1, FR-14 scenario 1',
    async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/registrations/reg-approve-e2e-1/approve')
        .set(admin)
        .send({ acknowledgement: APPROVAL_ACKNOWLEDGEMENT_TEXT })
        .expect(200);

      expect(res.body.registration).toMatchObject({
        id: 'reg-approve-e2e-1',
        reference: 'REG-2026-0184',
        status: 'APPROVED',
      });
      expect(res.body.registration.publishedActorId).toBe(res.body.actor.id);

      const actor = res.body.actor;
      // §6.3/DD-18 — the projection, over the real HTTP response.
      expect(actor.traderId).toBe('SR-2026-0184');
      expect(actor.traderName).toBe('Meru Agro-Processing & Seeds');
      expect(actor.position).toBe('Director');
      expect(actor.email).toBe('director@example.com'); // submitterEmail, not a payload field
      expect(actor.technicalSupport).toBeNull();
      expect(actor.gpsAltitude).toBeNull();
      expect(actor.gpsAccuracy).toBeNull();
      expect(JSON.stringify(actor)).not.toContain('Grace Mushi');
      expect(JSON.stringify(actor)).not.toContain('Sunflower');
      // NFR-2 — provenance carried verbatim from the stored acceptance.
      expect(actor.registrationSource).toBe('SELF_REGISTERED');
      expect(actor.consentStatus).toBe('GRANTED');
      expect(actor.consentMethod).toBe('PORTAL_CHECKBOX');
      expect(actor.consentObtainedAt).toBe('2026-01-01T00:10:00.000Z');
      expect(actor.consentReference).toBe('REG-2026-0184');

      // DEC-1 — acknowledged: true on the audit row this approval writes.
      const auditRows = prismaMock._getAuditLog();
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].acknowledged).toBe(true);
      expect(auditRows[0].action).toBe('REGISTRATION_APPROVE');

      // FR-14 scenario 1 — dispatched, with the reference and the verified address.
      expect(sendApprovalMock).toHaveBeenCalledWith('director@example.com', 'REG-2026-0184');
    },
  );

  it('409s a second approval of the SAME registration — "already adjudicated"', async () => {
    // The happy-path test above already approved reg-approve-e2e-1 against
    // the SHARED `prismaMock` (this suite's `app` — and its store — persist
    // across `it`s, matching `admin-actors-crud.e2e.spec.ts`'s convention;
    // `beforeEach` only resets the mail spy, never the store).
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/registrations/reg-approve-e2e-1/approve')
      .set(admin)
      .send({ acknowledgement: APPROVAL_ACKNOWLEDGEMENT_TEXT })
      .expect(409);

    expect(res.body.message).toContain('already been adjudicated');
    expect(prismaMock._getActors()).toHaveLength(1); // unchanged — no second Actor
  });

  it('409s on a traderId collision, naming the colliding key, distinguishable from "already adjudicated"', async () => {
    prismaMock._addRegistration(
      registrationFixture({
        id: 'reg-approve-e2e-collision',
        reference: 'REG-2026-0299',
        submitterEmail: 'collision@example.com',
      }),
    );
    prismaMock._seedCollidingActor('SR-2026-0299');

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/registrations/reg-approve-e2e-collision/approve')
      .set(admin)
      .send({ acknowledgement: APPROVAL_ACKNOWLEDGEMENT_TEXT })
      .expect(409);

    expect(res.body.message).toContain('SR-2026-0299');
    expect(res.body.message).not.toContain('already been adjudicated');
  });

  it(
    'a forced mid-transaction failure (the audit write) surfaces as a 500, never a 200/partial ' +
      'success shape — DC-24: this only proves the throw propagates over HTTP, never that the ' +
      "mock's in-memory store rolled back (it does not — see this file's class doc)",
    async () => {
      prismaMock._addRegistration(
        registrationFixture({
          id: 'reg-approve-e2e-force-fail',
          reference: 'REG-2026-0355',
          submitterEmail: 'force-fail@example.com',
        }),
      );
      prismaMock.actorAuditLog.create.mockRejectedValueOnce(new Error('forced audit failure'));

      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/registrations/reg-approve-e2e-force-fail/approve')
        .set(admin)
        .send({ acknowledgement: APPROVAL_ACKNOWLEDGEMENT_TEXT });

      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(res.body.registration).toBeUndefined();
      expect(sendApprovalMock).not.toHaveBeenCalledWith('force-fail@example.com', 'REG-2026-0355');
    },
  );

  it('row isolation: approving one registration never touches or leaks a second, unrelated registration', async () => {
    prismaMock._addRegistration(
      registrationFixture({
        id: 'reg-approve-e2e-sibling',
        reference: 'REG-2026-0410',
        submitterEmail: 'sibling@example.com',
        payload: {
          ...(registrationFixture().payload as Record<string, unknown>),
          traderName: 'Dodoma Sibling Traders — DO NOT LEAK',
          phone: '+255799999999',
        },
      }),
    );
    prismaMock._addRegistration(
      registrationFixture({
        id: 'reg-approve-e2e-main2',
        reference: 'REG-2026-0420',
        submitterEmail: 'main2@example.com',
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/registrations/reg-approve-e2e-main2/approve')
      .set(admin)
      .send({ acknowledgement: APPROVAL_ACKNOWLEDGEMENT_TEXT })
      .expect(200);

    // The sibling registration's data must never appear in this response.
    expect(res.text).not.toContain('Dodoma Sibling Traders');
    expect(res.text).not.toContain('sibling@example.com');

    const siblingRow = prismaMock
      ._getRegistrations()
      .find((r) => r.id === 'reg-approve-e2e-sibling');
    expect(siblingRow?.status).toBe(RegistrationStatus.PENDING_REVIEW);
  });
});

/**
 * `admin/registration-review-queue` T-10, `execution.md` A-53 (carried
 * forward from T-8's review). No test previously proved an
 * Admin-authenticated `GET /admin/registrations` 200 body is PII-clean
 * over HTTP: T-8's e2e above issues no `GET` at all, and
 * `pii-boundary.spec.ts`'s own contract JSDoc forbids adding an
 * Admin-authenticated request builder to `FIXTURE_MAP` — correctly, since a
 * 200 with real PII to a legitimately-authorized Admin is this spec's
 * INTENDED behaviour, not a leak that release gate exists to catch. That
 * claim therefore rested only on `admin-registrations.service.spec.ts`'s
 * unit-level assertion. This closes it at the HTTP level: a real
 * `AppModule`, the real guard stack, the real
 * `AdminRegistrationsService.list` → `toAdminRegistrationListRow`
 * projection, driven with supertest — asserting the response carries
 * EXACTLY the eight-key list projection (`id` plus the seven fields FR-9
 * scenario 1 names: `reference`, `applicant`, `traderType`, `region`,
 * `submittedAt`, `status`, `duplicateCandidateCount`), and that the raw
 * wire body (`res.text`) carries none of the fixture's non-projected PII
 * VALUES — never merely their absent key names, matching this file's own
 * "row isolation" test's value-sweep convention above.
 */
describe('Admin registrations list e2e (HTTP + in-memory Prisma) — T-10, A-53', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  beforeAll(async () => {
    prismaMock = buildPrismaMock([registrationFixture()]);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock as unknown as PrismaService)
      .overrideGuard(JwtAuthGuard)
      .useValue(new TestJwtAuthGuard())
      .overrideProvider(ActingAdminResolver)
      .useValue({ resolve: jest.fn().mockResolvedValue('reviewer@example.org') })
      .overrideProvider(MailService)
      .useValue({
        sendApproval: jest.fn().mockResolvedValue(undefined),
        sendVerificationCode: jest.fn().mockResolvedValue(undefined),
        sendReceipt: jest.fn().mockResolvedValue(undefined),
      } as unknown as MailService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it(
    'an authenticated Admin GET /admin/registrations 200s with a well-formed body carrying ' +
      'ONLY the eight-key list projection, and neither submitterEmail, payload PII beyond that ' +
      'projection, nor duplicateDismissals reaches the wire (A-53)',
    async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/registrations')
        .set(admin)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.data).toHaveLength(1);
      const row = res.body.data[0];
      expect(Object.keys(row).sort()).toEqual(
        [
          'id',
          'reference',
          'applicant',
          'traderType',
          'region',
          'submittedAt',
          'status',
          'duplicateCandidateCount',
        ].sort(),
      );
      expect(row.id).toBe('reg-approve-e2e-1');
      expect(row.reference).toBe('REG-2026-0184');
      expect(row.applicant).toBe('Meru Agro-Processing & Seeds');
      expect(row.traderType).toBe('seed_company');
      expect(row.region).toBe('Arusha');
      expect(row.status).toBe('PENDING_REVIEW');
      expect(row.duplicateCandidateCount).toBe(0);

      // By VALUE, not merely by absent key — a renamed field must still
      // fail this. `Registration.select` in `list()` fetches `payload` and
      // `submitterEmail` whole (detection needs them), so the containment
      // this asserts is a property of the PROJECTION, not of what was
      // queried.
      expect(res.text).not.toContain('director@example.com'); // submitterEmail
      expect(res.text).not.toContain('Grace Mushi'); // payload.contactPerson
      expect(res.text).not.toContain('Director'); // payload.position
      expect(res.text).not.toContain('Arusha Urban'); // payload.district
      expect(res.text).not.toContain('Arusha Central Market'); // payload.marketLocation
      expect(res.text).not.toContain('+255700000000'); // payload.phone
      expect(res.text).not.toContain('Sunflower'); // payload.otherCrops
      expect(res.text).not.toContain('-3.3869'); // payload.gpsLatitude
      expect(res.text).not.toContain('36.683'); // payload.gpsLongitude
      // `duplicateDismissals` is `null` on this fixture, so a value sweep
      // would pass vacuously (the same reasoning `pii-boundary.spec.ts`
      // applies to registration-source/consent fields) — a KEY scan is the
      // only signal that actually catches this column reaching the wire.
      expect(res.text).not.toContain('duplicateDismissals');
    },
  );

  // R13 — `@Max(MAX_PAGE_SIZE)` on `AdminRegistrationListQueryDto.pageSize`
  // (`dto/admin-registration-list-query.dto.ts`) was previously exercised
  // ONLY by a service-level test that bypasses the validation pipe entirely
  // (`admin-registrations.service.spec.ts`'s "caps pageSize at the max"
  // test calls the service directly and asserts its own `Math.min` clamp —
  // deleting `@Max` leaves that test green). This drives the real HTTP →
  // ValidationPipe path, the only place `@Max` can actually be exercised.
  it('400s a pageSize above the cap (NFR-9, @Max(MAX_PAGE_SIZE) over real HTTP)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/registrations?pageSize=101')
      .set(admin)
      .expect(400);

    expect(Array.isArray(res.body.details)).toBe(true);
  });
});
