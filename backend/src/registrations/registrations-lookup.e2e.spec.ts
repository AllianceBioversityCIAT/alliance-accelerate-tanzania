// @sdd-spec actors/public-self-registration (T-11)
/**
 * `POST /registrations/lookup` — HTTP e2e proof (FR-6, FR-8, design.md §3.1
 * decision 3–4, §4.4 L-1…L-4).
 *
 * The Leader's Disqualifying clause for this task: a test covering only two
 * of the three byte-identical exits will not catch a distinguishable
 * lockout. This file drives all three — reference-absent, email-mismatch,
 * AND the caller-locked exit — through the REAL HTTP pipeline and compares
 * them at the raw response level (`.status`, `.text`), not through a
 * re-serialized re-derivation of the expected shape.
 *
 * **What this file proves, and what it structurally cannot (rework attempt
 * 2).** A lock and a content-based rejection are DESIGNED to be
 * unobservable apart at the HTTP layer — that is the whole point of L-2 —
 * so "the locked exit fired" is never something this file OBSERVES as a
 * distinct signal; it is built BY CONSTRUCTION (driving a known number of
 * requests to a known cap, asserted via `targetAttempts` below) and then
 * shown to produce the identical bytes as the other two exits. The
 * PERSISTENCE (L-1) and per-reference RESET (L-4, and the L-1×L-4
 * interaction this rework fixes) properties are proven at the unit tier
 * (`registrations.service.spec.ts`), where the counter's internal state is
 * directly inspectable; this file's job is the byte-identity claim alone.
 *
 * **Per-`describe`-block app instances (B28), same discipline
 * `registrations-throttle.e2e.spec.ts` established.** `RegistrationLookupAttempt`
 * is itself a shared, PERSISTENT counter BY DESIGN (L-1) — the entire point
 * of this task — so unlike `registrations-verify.e2e.spec.ts`'s stateless
 * byte-identity checks, driving several `it` blocks against ONE app/fake-DB
 * pair here would let an EARLIER test's lookup attempts count toward a
 * LATER test's cap, since every request in this file shares the same real
 * loopback caller IP (supertest → a local Express server, not through
 * serverless-http, so `req.ip` cannot be varied per request the way
 * `apiGatewayV2Event({ sourceIp })` lets `lambda-handler.e2e.spec.ts` do).
 * Each `describe` block below therefore gets its OWN app instance and its
 * OWN fresh in-memory `RegistrationLookupAttempt` backing store.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { createValidationPipe } from '../common/validation-pipe';
import { PrismaService } from '../prisma/prisma.service';
import { LOOKUP_MAX_ATTEMPTS_PER_WINDOW } from './registrations.service';

const LOOKUP_PATH = '/api/v1/registrations/lookup';

interface AttemptRow {
  ip: string;
  reference: string;
  windowStartIso: string;
  attempts: number;
}

interface RegistrationFixture {
  reference: string;
  status: string;
  reviewNote: string | null;
  submitterEmail: string;
  id: string;
  payload: Record<string, unknown>;
}

interface FakeTx {
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  $queryRaw: (strings: TemplateStringsArray) => Promise<Array<{ newLookupAttempts: number }>>;
}

/**
 * The same fake `$transaction`/`$executeRaw`/`$queryRaw` shape
 * `registrations.service.spec.ts` establishes for `RegistrationLookupAttempt`
 * — a fresh `FakeTx` per call with its OWN session-variable closure, backed
 * by a SHARED `attemptRows` array standing in for the persisted table.
 * Keyed on the COMPOSITE `(ip, reference, windowStart)` (rework attempt 2)
 * — see `registrations.service.ts`'s class doc on `lookupRegistration`.
 */
function buildPrismaMock(registrationRows: RegistrationFixture[]): {
  prisma: PrismaService;
  attemptRows: AttemptRow[];
  findUniqueSpy: jest.Mock;
} {
  const attemptRows: AttemptRow[] = [];

  const transactionMock = jest.fn(async (callback: (tx: FakeTx) => Promise<number>) => {
    let sessionNewAttempts: number | null = null;
    const tx: FakeTx = {
      $executeRaw: async (strings, ...values) => {
        const sql = strings.join('?');
        if (!sql.includes('RegistrationLookupAttempt')) {
          throw new Error(`Fake tx.$executeRaw: unrecognized SQL: ${sql}`);
        }
        const [ip, reference, windowStart] = values as [string, string, Date];
        const windowStartIso = windowStart.toISOString();
        let row = attemptRows.find(
          (r) => r.ip === ip && r.reference === reference && r.windowStartIso === windowStartIso,
        );
        if (!row) {
          row = { ip, reference, windowStartIso, attempts: 1 };
          attemptRows.push(row);
        } else {
          row.attempts += 1;
        }
        sessionNewAttempts = row.attempts;
        return 1;
      },
      $queryRaw: async (strings) => {
        const sql = strings.join('?');
        if (!sql.includes('@newLookupAttempts')) {
          throw new Error(`Fake tx.$queryRaw: unrecognized SQL: ${sql}`);
        }
        return [{ newLookupAttempts: sessionNewAttempts as number }];
      },
    };
    return callback(tx);
  });

  const findUniqueSpy = jest.fn(async ({ where }: { where: { reference: string } }) => {
    return registrationRows.find((r) => r.reference === where.reference) ?? null;
  });

  const updateSpy = jest.fn(
    async ({
      where,
      data,
    }: {
      where: {
        ip_reference_windowStart: { ip: string; reference: string; windowStart: Date };
      };
      data: { attempts: number };
    }) => {
      const key = where.ip_reference_windowStart;
      const windowStartIso = key.windowStart.toISOString();
      const row = attemptRows.find(
        (r) => r.ip === key.ip && r.reference === key.reference && r.windowStartIso === windowStartIso,
      );
      if (!row) throw new Error('Fake registrationLookupAttempt.update: no row for this key');
      row.attempts = data.attempts;
      return row;
    },
  );

  const prisma = {
    $transaction: transactionMock,
    registration: { findUnique: findUniqueSpy },
    registrationLookupAttempt: { update: updateSpy },
  } as unknown as PrismaService;

  return { prisma, attemptRows, findUniqueSpy };
}

async function buildApp(registrationRows: RegistrationFixture[]) {
  const { prisma, attemptRows, findUniqueSpy } = buildPrismaMock(registrationRows);

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app: INestApplication = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(createValidationPipe());
  await app.init();

  return { app, attemptRows, findUniqueSpy };
}

const EXPECTED_NOT_FOUND_BODY = {
  statusCode: 404,
  error: 'Not Found',
  message: 'No registration was found matching that reference and email.',
};

describe('POST /registrations/lookup (T-11) — byte-identity across ALL THREE exits, including the locked one', () => {
  let app: INestApplication;
  let attemptRows: AttemptRow[];
  let findUniqueSpy: jest.Mock;

  // Requests this block issues against its OWN, ISOLATED app instance (own
  // RegistrationsThrottleGuard counter, 20/60s per handler, AND own fresh
  // RegistrationLookupAttempt store): 1 (absent, a DIFFERENT reference —
  // rework attempt 2: its own counter row is now disjoint from the one
  // driven to the cap below) + LOOKUP_MAX_ATTEMPTS_PER_WINDOW (mismatch
  // guesses against the TARGET reference, bringing THAT reference's own
  // counter to exactly the cap) + 1 (the locked exit, same target
  // reference) = LOOKUP_MAX_ATTEMPTS_PER_WINDOW + 2. Comfortably under the
  // 20 per-handler throttle limit as long as LOOKUP_MAX_ATTEMPTS_PER_WINDOW
  // < 18. All three sentinel exits are captured inside ONE `it`,
  // deliberately, so the exact sequence is never left to test ordering (the
  // B28 hazard `registrations-throttle.e2e.spec.ts` already documents for
  // this shared, persistent counter).
  beforeAll(async () => {
    const built = await buildApp([
      {
        reference: 'REG-2026-0184',
        status: 'PENDING_REVIEW',
        reviewNote: null,
        submitterEmail: 'neema@khsc.co.tz',
        id: 'internal-cuid-should-never-leak',
        payload: { traderName: 'Should Never Leak Ltd' },
      },
    ]);
    app = built.app;
    attemptRows = built.attemptRows;
    findUniqueSpy = built.findUniqueSpy;
  });

  afterAll(async () => {
    await app.close();
  });

  it(
    'reference-absent, email-mismatch, and caller-locked (against the SAME reference the mismatch ' +
      'targeted) all produce the LITERAL SAME raw response text — not merely deep-equal parsed ' +
      'bodies, which would miss a key-order or whitespace difference a byte-level client could ' +
      "observe (the rigor registrations-verify.e2e.spec.ts already established for this module's " +
      'other byte-identity proofs)',
    async () => {
      // Exit 1: a reference that does not exist. A DIFFERENT reference from
      // the one this test drives to the cap below — under the composite
      // key, its counter row is entirely disjoint and contributes nothing
      // toward that lock.
      const absent = await request(app.getHttpServer())
        .post(LOOKUP_PATH)
        .send({ reference: 'REG-2026-9999', email: 'neema@khsc.co.tz' });
      expect(absent.status).toBe(404);

      // Exit 2 AND the start of the lock-driving sequence: every one of the
      // next LOOKUP_MAX_ATTEMPTS_PER_WINDOW requests targets
      // `REG-2026-0184` specifically, with a wrong email, so THAT
      // reference's own counter — and only that one — climbs to the cap.
      let mismatch: request.Response | undefined;
      for (let i = 0; i < LOOKUP_MAX_ATTEMPTS_PER_WINDOW; i++) {
        const res = await request(app.getHttpServer())
          .post(LOOKUP_PATH)
          .send({ reference: 'REG-2026-0184', email: 'wrong@example.com' });
        expect(res.status).toBe(404);
        if (i === 0) mismatch = res;
      }
      // Self-verifying: the fake's own persisted state confirms the target
      // reference's counter is at EXACTLY the cap before the next request —
      // not inferred from a hardcoded loop bound alone.
      const targetAttemptsRow = attemptRows.find((r) => r.reference === 'REG-2026-0184');
      expect(targetAttemptsRow?.attempts).toBe(LOOKUP_MAX_ATTEMPTS_PER_WINDOW);

      // The (cap + 1)-th request against THIS reference — submitting the
      // genuinely CORRECT pair this time — is the locked exit.
      const findUniqueCallsBeforeLock = findUniqueSpy.mock.calls.length;
      const locked = await request(app.getHttpServer())
        .post(LOOKUP_PATH)
        .send({ reference: 'REG-2026-0184', email: 'neema@khsc.co.tz' });
      expect(locked.status).toBe(404);
      // The lock check pre-empted the correctness check entirely — even
      // though this request submitted the CORRECT pair, `findUnique` was
      // never called for it.
      expect(findUniqueSpy.mock.calls.length).toBe(findUniqueCallsBeforeLock);

      // Pinned to the literal expected body first, individually, THEN
      // cross-compared — pinning alone rules out all three being
      // identically wrong in some OTHER way; cross-comparison on raw
      // `.text` (never `.body`) is what a byte-level client would actually
      // observe.
      expect(absent.body).toEqual(EXPECTED_NOT_FOUND_BODY);
      expect(mismatch?.body).toEqual(EXPECTED_NOT_FOUND_BODY);
      expect(locked.body).toEqual(EXPECTED_NOT_FOUND_BODY);
      expect(absent.text).toBe(mismatch?.text);
      expect(mismatch?.text).toBe(locked.text);
      expect(absent.headers['content-type']).toBe(mismatch?.headers['content-type']);
      expect(mismatch?.headers['content-type']).toBe(locked.headers['content-type']);
    },
  );
});

describe('POST /registrations/lookup (T-11) — success case', () => {
  let app: INestApplication;

  // 1 request against its own, isolated app instance.
  beforeAll(async () => {
    const built = await buildApp([
      {
        reference: 'REG-2026-0184',
        status: 'PENDING_REVIEW',
        reviewNote: null,
        submitterEmail: 'neema@khsc.co.tz',
        id: 'internal-cuid-should-never-leak',
        payload: { traderName: 'Should Never Leak Ltd' },
      },
    ]);
    app = built.app;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 { status } — nothing else — for a correct, case-insensitively matching pair', async () => {
    const res = await request(app.getHttpServer())
      .post(LOOKUP_PATH)
      .send({ reference: 'REG-2026-0184', email: 'NEEMA@KHSC.CO.TZ' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'PENDING_REVIEW' });
    // The raw response text never carries the internal id, the fixture
    // payload's value, or the stored submitter email — even though this is
    // a passing/success case, where it would be easiest to forget the sweep.
    expect(res.text).not.toContain('internal-cuid-should-never-leak');
    expect(res.text).not.toContain('Should Never Leak Ltd');
    expect(res.text).not.toContain('neema@khsc.co.tz');
  });
});

describe('POST /registrations/lookup (T-11) — malformed body', () => {
  let app: INestApplication;

  // 2 requests against its own app instance.
  beforeAll(async () => {
    const built = await buildApp([]);
    app = built.app;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a malformed email with 400 (shape validation, not a lookup outcome — FR-6 does not cover it)', async () => {
    const res = await request(app.getHttpServer())
      .post(LOOKUP_PATH)
      .send({ reference: 'REG-2026-0184', email: 'not-an-email' });

    expect(res.status).toBe(400);
  });

  it('rejects a missing reference with 400', async () => {
    const res = await request(app.getHttpServer())
      .post(LOOKUP_PATH)
      .send({ email: 'neema@khsc.co.tz' });

    expect(res.status).toBe(400);
  });
});
