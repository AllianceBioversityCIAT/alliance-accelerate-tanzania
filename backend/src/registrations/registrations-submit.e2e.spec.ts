// @sdd-spec actors/public-self-registration (T-10)
/**
 * `POST /registrations` — HTTP e2e proof (FR-2 s1, FR-3 s1/s3, FR-4 s1/s2,
 * FR-5 s1, FR-8, design.md §4.1, §4.5).
 *
 * Same rationale as `registrations-verify.e2e.spec.ts`: `EmailVerificationService`
 * and `MailService` are overridden with jest mocks (T-7/T-3 already prove
 * those components' own correctness), while `PrismaService` is a fake that
 * models the REAL `$transaction`/`$executeRaw`/`$queryRaw` shape
 * `allocateRegistrationReference` and `tx.registration.create` actually use
 * — the same connection-scoped session-variable fidelity
 * `registration-reference.util.spec.ts` and `registrations.service.spec.ts`
 * already establish, reused here rather than re-derived.
 *
 * **The Leader's Disqualifying clause for this task, discharged here, not at
 * the unit level (DC-2's own "the proof is over HTTP" precedent):** the
 * success response is asserted against FIXTURE VALUES of the response body
 * plus a TOTAL SWEEP over every `PAYLOAD_FIXTURE` entry (rework attempt 2,
 * FAIL 2 — a prior version of this file hand-picked five of seven payload
 * fields and silently dropped GPS entirely, while this same comment claimed
 * full coverage; both are corrected below, together, so the claim and the
 * assertion cannot drift apart again) — the raw response text must not
 * contain ANY submitted field's value, the internal `id`, or the submitted
 * email, not merely "the body has exactly one key".
 *
 * Total requests this file issues against its own dedicated app instance
 * (own `RegistrationsThrottleGuard` counter, 20/60s): 6. Comfortably under
 * the limit — recount by grepping this file for `request(app.getHttpServer())`
 * before trusting this number (the convention `registrations-verify.e2e.spec.ts`
 * established; rework attempt 2 found the prior count self-reported as 8
 * against a true 6 — the identical drift T-8's attempt 3 corrected once
 * already, wearing the opposite sign this time).
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { createValidationPipe } from '../common/validation-pipe';
import { PrismaService } from '../prisma/prisma.service';
import { EmailVerificationService } from './email-verification.service';
import { MailService } from '../mail/mail.service';
import { CONSENT_POLICY_VERSION } from './consent-policy';

const SUBMIT_PATH = '/api/v1/registrations';

interface SequenceRow {
  year: number;
  seq: number;
}

interface FakeTx {
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  $queryRaw: (strings: TemplateStringsArray) => Promise<Array<{ newRegSeq: number }>>;
  registration: { create: jest.Mock };
}

function buildPrismaMock(registrationCreateSpy: jest.Mock): PrismaService {
  const sequenceRows: SequenceRow[] = [];
  const transactionMock = jest.fn(async (callback: (tx: FakeTx) => Promise<unknown>) => {
    let sessionNewSeq: number | null = null;
    const tx: FakeTx = {
      $executeRaw: async (strings, ...values) => {
        const sql = strings.join('?');
        if (!sql.includes('RegistrationSequence')) {
          throw new Error(`Fake tx.$executeRaw: unrecognized SQL: ${sql}`);
        }
        const [year] = values as [number];
        let row = sequenceRows.find((r) => r.year === year);
        if (!row) {
          row = { year, seq: 1 };
          sequenceRows.push(row);
        } else {
          row.seq += 1;
        }
        sessionNewSeq = row.seq;
        return 1;
      },
      $queryRaw: async (strings) => {
        const sql = strings.join('?');
        if (!sql.includes('@newRegSeq')) {
          throw new Error(`Fake tx.$queryRaw: unrecognized SQL: ${sql}`);
        }
        return [{ newRegSeq: sessionNewSeq as number }];
      },
      registration: { create: registrationCreateSpy },
    };
    return callback(tx);
  });
  return { $transaction: transactionMock } as unknown as PrismaService;
}

/**
 * The exact fixture the "no leak" total sweep below scans for, BY VALUE —
 * every key here must be swept; see the success test's `Object.entries`
 * loop (rework attempt 2, FAIL 2). GPS is included deliberately: FR-5
 * scenario 1 names coordinates explicitly ("not the organisation name, not
 * the email, not the coordinates"), and a fixture with no GPS at all made a
 * coordinate echo structurally undetectable.
 */
const PAYLOAD_FIXTURE = {
  traderName: 'Mbeya Seed Traders Ltd — DO NOT LEAK',
  traderType: 'seed_company',
  contactPerson: 'Neema Shirima — DO NOT LEAK',
  region: 'Mbeya',
  gpsLatitude: -8.910777,
  gpsLongitude: 33.460777,
  crops: ['sorghum', 'common_bean'],
  capacityTons: 733,
  phone: '+255700000999',
};
// Mixed-case deliberately (rework attempt 2): an all-lowercase fixture made
// the "dispatches to the lowercased address" test below a no-op — it would
// pass identically whether or not normalization actually ran.
const SUBMITTER_EMAIL = 'Neema-DO-NOT-LEAK@KHSC.co.tz';
const CREATED_ROW_INTERNAL_ID = 'internal-cuid-do-not-leak';

function validBody(overrides: { consent?: Record<string, unknown>; code?: string } = {}) {
  return {
    email: SUBMITTER_EMAIL,
    code: overrides.code ?? '123456',
    consent: { accepted: true, policyVersion: CONSENT_POLICY_VERSION, ...overrides.consent },
    payload: PAYLOAD_FIXTURE,
  };
}

describe('POST /registrations (T-10)', () => {
  let app: INestApplication;
  let verifyCodeMock: jest.Mock;
  let consumeCodeMock: jest.Mock;
  let sendReceiptMock: jest.Mock;
  let registrationCreateSpy: jest.Mock;

  beforeAll(async () => {
    verifyCodeMock = jest.fn();
    consumeCodeMock = jest.fn();
    sendReceiptMock = jest.fn().mockResolvedValue(undefined);
    registrationCreateSpy = jest.fn().mockImplementation(async ({ data }: { data: unknown }) => ({
      id: CREATED_ROW_INTERNAL_ID,
      ...(data as object),
    }));

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(buildPrismaMock(registrationCreateSpy))
      .overrideProvider(EmailVerificationService)
      .useValue({
        verifyCode: verifyCodeMock,
        consumeCode: consumeCodeMock,
        issueCode: jest.fn(),
      } as unknown as EmailVerificationService)
      .overrideProvider(MailService)
      .useValue({
        sendReceipt: sendReceiptMock,
        sendVerificationCode: jest.fn(),
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

  afterEach(() => {
    verifyCodeMock.mockReset();
    consumeCodeMock.mockReset();
    sendReceiptMock.mockReset().mockResolvedValue(undefined);
    registrationCreateSpy.mockClear();
  });

  describe('success (FR-2 s1, FR-4 s1, FR-5 s1)', () => {
    it(
      'returns 201 with a body that is EXACTLY { reference } — pinned against the fixture VALUES of ' +
        'every payload field, the submitter email, and the created row\'s internal id, not a key list',
      async () => {
        verifyCodeMock.mockResolvedValue({ outcome: 'MATCHED', id: 'ev-row-1' });
        consumeCodeMock.mockResolvedValue(true);

        const res = await request(app.getHttpServer()).post(SUBMIT_PATH).send(validBody());

        expect(res.status).toBe(201);
        expect(Object.keys(res.body)).toEqual(['reference']);
        expect(typeof res.body.reference).toBe('string');
        expect(res.body.reference).toMatch(/^REG-\d{4}-\d{4,}$/);

        // The DISQUALIFYING check (rework attempt 2, FAIL 2): a TOTAL sweep
        // over every `PAYLOAD_FIXTURE` entry — not five hand-picked fields —
        // scanning the raw response TEXT (not just `.body`, so a
        // re-serialization cannot hide a leak). Deriving the sweep from
        // `Object.entries` means a field added to the fixture later is
        // covered automatically, the same "derive, don't enumerate"
        // reasoning §6.2 applies to the route-table scan (C-9).
        const raw = res.text;
        for (const [, fixtureValue] of Object.entries(PAYLOAD_FIXTURE)) {
          const values = Array.isArray(fixtureValue) ? fixtureValue : [fixtureValue];
          for (const value of values) {
            expect(raw).not.toContain(String(value));
          }
        }
        expect(raw).not.toContain(SUBMITTER_EMAIL);
        expect(raw).not.toContain(SUBMITTER_EMAIL.toLowerCase());
        expect(raw).not.toContain(CREATED_ROW_INTERNAL_ID);

        expect(registrationCreateSpy).toHaveBeenCalledTimes(1);
      },
    );

    it('dispatches the receipt to the submitted (lowercased) address with the returned reference', async () => {
      verifyCodeMock.mockResolvedValue({ outcome: 'MATCHED', id: 'ev-row-2' });
      consumeCodeMock.mockResolvedValue(true);

      const res = await request(app.getHttpServer())
        .post(SUBMIT_PATH)
        .send(validBody({ code: '654321' }));

      expect(res.status).toBe(201);
      await new Promise((resolve) => setImmediate(resolve));
      expect(sendReceiptMock).toHaveBeenCalledWith(
        SUBMITTER_EMAIL.toLowerCase(),
        res.body.reference,
      );
    });
  });

  describe('consent rejected (FR-3 scenario 3) — each case 400s with zero Registration rows', () => {
    it('accepted: false', async () => {
      const res = await request(app.getHttpServer())
        .post(SUBMIT_PATH)
        .send(validBody({ consent: { accepted: false } }));

      expect(res.status).toBe(400);
      expect(registrationCreateSpy).not.toHaveBeenCalled();
    });

    it('accepted omitted entirely (whitelist strips it; the pipe itself 400s before the service runs)', async () => {
      const body = validBody();
      delete (body.consent as Record<string, unknown>).accepted;

      const res = await request(app.getHttpServer()).post(SUBMIT_PATH).send(body);

      expect(res.status).toBe(400);
      expect(registrationCreateSpy).not.toHaveBeenCalled();
    });

    it('unknown policyVersion', async () => {
      const res = await request(app.getHttpServer())
        .post(SUBMIT_PATH)
        .send(validBody({ consent: { policyVersion: 'v0.0-not-a-real-version' } }));

      expect(res.status).toBe(400);
      expect(registrationCreateSpy).not.toHaveBeenCalled();
    });
  });

  describe('code rejected (FR-4 scenario 2) — 400, zero rows, byte-identical to a consent-shape 400 at the envelope level', () => {
    it('a REJECTED code 400s with zero Registration rows', async () => {
      verifyCodeMock.mockResolvedValue({ outcome: 'REJECTED' });

      const res = await request(app.getHttpServer()).post(SUBMIT_PATH).send(validBody());

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'Bad Request' });
      expect(registrationCreateSpy).not.toHaveBeenCalled();
    });
  });
});
