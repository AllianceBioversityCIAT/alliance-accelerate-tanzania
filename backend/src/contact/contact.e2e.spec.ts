// @sdd-spec contact/contact-channels (T-7)
/**
 * T-7 — HTTP e2e proof of `POST /api/v1/contact`: submission, honeypot,
 * throttle (FR-2, FR-5, FR-6, FR-8, NFR-2, NFR-7, design.md §3 amendment 3,
 * §4.1.1, §4.2, §4.4, §10; requirements.md §8 DC-5).
 *
 * **Module-compilation choice, per T-6's forward pointer.** `ContactModule`
 * imports no `ThrottlerModule`, so a `TestingModule` compiling only
 * `ContactModule` cannot resolve `ThrottlerGuard`'s `InjectThrottlerOptions`
 * token — that dependency is satisfied today only because `AppModule` also
 * imports `RegistrationsModule`, whose `ThrottlerModule.forRoot(...)` is
 * `@Global()`. This suite therefore compiles the REAL `AppModule` (the
 * `admin-actors-crud.e2e.spec.ts` / `pii-boundary.spec.ts` pattern), never a
 * standalone `ContactModule` graph — the same reasoning
 * `registrations-throttle.e2e.spec.ts`'s `ThrottleDbTestModule` states for
 * why IT registers `ThrottlerModule.forRoot(...)` itself. Compiling
 * `AppModule` is also what makes the throttle proof below meaningful: it
 * proves `@Throttle({ default: { limit: 5, ttl: 60_000 } })` actually
 * overrides `RegistrationsModule`'s inherited 20/60 s registration in the
 * SAME running application, not merely in an isolated module that never
 * shares a global token with anything.
 *
 * Three provider overrides, none of which touch production wiring:
 *
 * - `PrismaService` -> `{}` (the same minimal override
 *   `registrations-throttle.e2e.spec.ts`'s Block A already uses to boot
 *   `AppModule` with no real database — `ContactService` never queries
 *   Prisma at all, so nothing here needs it to do anything).
 * - `MailService` -> a jest-mocked `sendContactMessage`, the dispatch
 *   assertion seam design.md §10 names ("a `MailService` provider override
 *   asserting the exact `MailMessage`") — recipients, honeypot silence, and
 *   throttle dispatch counts are all read off this mock's call history,
 *   never off `getRecordedSends()` (the no-op transport never carries `to`).
 * - `AdminRecipientResolver` -> a jest-mocked `resolve()` returning a FIXED,
 *   known recipient list, so "reaches every resolved admin" is a real
 *   equality assertion against a value this file controls, not merely "a
 *   send happened."
 *
 * **Throttle isolation across many `it` blocks in one file.** The suite
 * shares ONE compiled app (one `ThrottlerStorageService` instance) across
 * every `describe` below, because `@Throttle({ limit: 5, ttl: 60_000 })` is
 * tight enough that the validation/honeypot/transport cases below would
 * exhaust it in a handful of tests if hits accumulated. `afterEach` clears
 * the shared `ThrottlerStorage`'s internal map after EVERY test (including
 * the throttle test itself, which is unaffected since the clear happens
 * only once that test has already finished), so every test — the
 * discriminating throttle test included — starts from a clean bucket.
 * `ThrottlerGuard.generateKey` hashes `${class}-${handler}-${name}-${ip}`
 * (`node_modules/@nestjs/throttler/dist/throttler.guard.js`), which is
 * SPECIFIC to `ContactController`; clearing this app's storage cannot reach
 * `registrations-throttle.e2e.spec.ts`'s own, independently compiled
 * `ThrottlerStorageService` instance in a separate test file/process.
 */
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { createValidationPipe } from '../common/validation-pipe';
import { configureBodyParser } from '../common/body-parser.config';
import { configurePayloadCap, REGISTRATIONS_PAYLOAD_CAP_BYTES } from '../common/payload-cap.config';
import { MailService } from '../mail/mail.service';
import { MailMessage } from '../mail/mail-transport.interface';
import { AdminRecipientResolver } from './admin-recipient.resolver';
import {
  CONTACT_CATEGORIES,
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_ORGANIZATION_MAX_LENGTH,
  CONTACT_SUBJECT_MAX_LENGTH,
} from './contact-categories';

const CONTACT_PATH = '/api/v1/contact';

/** Fixed, known recipient set — the "reaches every resolved admin" assertion below is an equality check against THIS value. */
const FIXED_ADMIN_RECIPIENTS = ['admin-one@example.org', 'admin-two@example.org'];

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Asha Mwakalinga',
    email: 'asha@example.org',
    organization: 'Mbeya Farmers Cooperative',
    category: CONTACT_CATEGORIES[0],
    subject: 'Question about registering',
    message: 'I would like to know how to register our cooperative.',
    privacyAcknowledged: true,
    ...overrides,
  };
}

describe('POST /api/v1/contact (T-7 — submission, honeypot, throttle e2e)', () => {
  let app: NestExpressApplication;
  let sendContactMessageMock: jest.Mock<Promise<void>, [MailMessage]>;
  let resolveMock: jest.Mock<Promise<string[]>, []>;
  let throttlerStorage: ThrottlerStorageService;

  beforeAll(async () => {
    sendContactMessageMock = jest.fn().mockResolvedValue(undefined);
    resolveMock = jest.fn().mockResolvedValue(FIXED_ADMIN_RECIPIENTS);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({} as unknown as PrismaService)
      .overrideProvider(MailService)
      .useValue({
        sendContactMessage: sendContactMessageMock,
        sendVerificationCode: jest.fn(),
        sendReceipt: jest.fn(),
      } as unknown as MailService)
      .overrideProvider(AdminRecipientResolver)
      .useValue({
        resolve: resolveMock,
        resetCache: jest.fn(),
      } as unknown as AdminRecipientResolver)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createValidationPipe());
    // Production ordering (main.ts/lambda.ts): cap BEFORE body parser.
    configurePayloadCap(app);
    configureBodyParser(app);
    await app.init();

    throttlerStorage = moduleRef.get<ThrottlerStorageService>(ThrottlerStorage);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    sendContactMessageMock.mockReset();
    sendContactMessageMock.mockResolvedValue(undefined);
    resolveMock.mockReset();
    resolveMock.mockResolvedValue(FIXED_ADMIN_RECIPIENTS);
    // Clean throttle bucket for the NEXT test — see file header. Clearing
    // here (never mid-test) cannot corrupt the discriminating throttle
    // test's own within-one-`it` request sequence below.
    throttlerStorage.storage.clear();
  });

  describe('Valid submission reaches every resolved admin (FR-2 scenario 1, FR-3)', () => {
    it('delivers ONE message addressed to every resolved admin recipient — not merely "a send happened"', async () => {
      const res = await request(app.getHttpServer()).post(CONTACT_PATH).send(validBody());

      expect(res.status).toBe(202);
      expect(sendContactMessageMock).toHaveBeenCalledTimes(1);
      const [message] = sendContactMessageMock.mock.calls[0];
      expect(message.to).toEqual(FIXED_ADMIN_RECIPIENTS);
    });
  });

  describe('Off-list category rejected server-side (FR-2 scenario 2)', () => {
    it('rejects a category outside the fixed set with 400 and dispatches nothing', async () => {
      const res = await request(app.getHttpServer())
        .post(CONTACT_PATH)
        .send(validBody({ category: 'Not a real category' }));

      expect(res.status).toBe(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'category' })]),
      );
      expect(sendContactMessageMock).not.toHaveBeenCalled();
    });
  });

  describe('Privacy acknowledgement gate (FR-6)', () => {
    it('rejects privacyAcknowledged: false with 400, details[].field naming it, and no dispatch', async () => {
      const res = await request(app.getHttpServer())
        .post(CONTACT_PATH)
        .send(validBody({ privacyAcknowledged: false }));

      expect(res.status).toBe(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'privacyAcknowledged' })]),
      );
      expect(sendContactMessageMock).not.toHaveBeenCalled();
    });
  });

  describe('Missing required fields rejected (FR-2 scenario 1)', () => {
    it.each(['name', 'email', 'category', 'subject', 'message', 'privacyAcknowledged'])(
      'rejects a submission missing required field "%s" with 400 naming it',
      async (field) => {
        const body = validBody();
        delete body[field];

        const res = await request(app.getHttpServer()).post(CONTACT_PATH).send(body);

        expect(res.status).toBe(400);
        expect(res.body.details).toEqual(
          expect.arrayContaining([expect.objectContaining({ field })]),
        );
        expect(sendContactMessageMock).not.toHaveBeenCalled();
      },
    );
  });

  describe('Over-long fields rejected (FR-2 scenario 1, design.md §4.1.1 length caps)', () => {
    it.each([
      ['name', 'x'.repeat(CONTACT_NAME_MAX_LENGTH + 1)],
      ['organization', 'x'.repeat(CONTACT_ORGANIZATION_MAX_LENGTH + 1)],
      ['subject', 'x'.repeat(CONTACT_SUBJECT_MAX_LENGTH + 1)],
      ['message', 'x'.repeat(CONTACT_MESSAGE_MAX_LENGTH + 1)],
      ['email', `${'x'.repeat(CONTACT_EMAIL_MAX_LENGTH)}@example.com`],
    ])('rejects an over-long "%s" with 400 naming it', async (field, value) => {
      const res = await request(app.getHttpServer())
        .post(CONTACT_PATH)
        .send(validBody({ [field]: value }));

      expect(res.status).toBe(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field })]),
      );
      expect(sendContactMessageMock).not.toHaveBeenCalled();
    });
  });

  describe('Empty string on the three required strings rejected (design.md §4.1.1 @MinLength(1))', () => {
    it.each(['name', 'subject', 'message'])(
      'rejects an empty string "%s" with 400 naming it — a bare @IsString()+@MaxLength() would accept ""',
      async (field) => {
        const res = await request(app.getHttpServer())
          .post(CONTACT_PATH)
          .send(validBody({ [field]: '' }));

        expect(res.status).toBe(400);
        expect(res.body.details).toEqual(
          expect.arrayContaining([expect.objectContaining({ field })]),
        );
        expect(sendContactMessageMock).not.toHaveBeenCalled();
      },
    );
  });

  describe('Over-cap request body rejected before parsing (NFR-2, 32 KB, /api/v1/contact in CAPPED_PATH_PREFIXES)', () => {
    it('rejects a request whose body exceeds the 32 KB cap with 413, before validation ever runs', async () => {
      const oversized = { ...validBody(), _padding: 'x'.repeat(REGISTRATIONS_PAYLOAD_CAP_BYTES) };

      const res = await request(app.getHttpServer()).post(CONTACT_PATH).send(oversized);

      // 413, not 400 — this is the payload-cap middleware (Express-level,
      // ahead of Nest's router), not the ValidationPipe. A 400 here would
      // mean the oversized body was parsed and validated first.
      expect(res.status).toBe(413);
      expect(sendContactMessageMock).not.toHaveBeenCalled();
    });
  });

  describe('Transport rejection returns 502 with no provider detail (FR-5, design.md §3 amendment 3)', () => {
    it('never leaks the SDK error name, message text, or a recipient address into the 502 body', async () => {
      const leaking = new Error(
        'Email address: admin-two@example.org is not verified in the SES sandbox (MessageRejected)',
      );
      leaking.name = 'MessageRejected';
      sendContactMessageMock.mockRejectedValueOnce(leaking);

      const res = await request(app.getHttpServer()).post(CONTACT_PATH).send(validBody());

      expect(res.status).toBe(502);
      const raw = res.text;
      expect(raw).not.toContain('MessageRejected');
      expect(raw).not.toContain('admin-two@example.org');
      expect(raw).not.toContain('not verified');
      expect(raw).not.toContain('SES');
    });
  });

  describe('Honeypot (FR-8)', () => {
    it('a filled honeypot returns the IDENTICAL 202 and dispatches zero messages', async () => {
      const res = await request(app.getHttpServer())
        .post(CONTACT_PATH)
        .send(validBody({ website: 'http://spam.example' }));

      expect(res.status).toBe(202);
      expect(sendContactMessageMock).not.toHaveBeenCalled();
    });

    it('an over-long honeypot value still returns 202 — NEVER a 400 naming the field (the self-identifying-trap defect)', async () => {
      const res = await request(app.getHttpServer())
        .post(CONTACT_PATH)
        .send(validBody({ website: 'x'.repeat(10_000) }));

      expect(res.status).toBe(202);
      expect(sendContactMessageMock).not.toHaveBeenCalled();
    });

    it('website: "" (empty string) means "not provided" — the submission still dispatches (T-4\'s accepted position)', async () => {
      const res = await request(app.getHttpServer()).post(CONTACT_PATH).send(validBody({ website: '' }));

      expect(res.status).toBe(202);
      expect(sendContactMessageMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Throttle — 5 requests / 60 s, discriminating (FR-8 scenario 2, NFR-2, requirements.md §8 DC-5)', () => {
    it(
      'serves the first 5 requests (dispatch count advances 1..5), then rejects the 6th with 429 ' +
        'while the dispatch count stays at 5 — fails against a controller with no guard at all, ' +
        'where the 6th would dispatch and the count would reach 6',
      async () => {
        for (let i = 0; i < 5; i++) {
          const res = await request(app.getHttpServer()).post(CONTACT_PATH).send(validBody());
          expect(res.status).toBe(202);
          expect(sendContactMessageMock).toHaveBeenCalledTimes(i + 1);
        }

        const sixth = await request(app.getHttpServer()).post(CONTACT_PATH).send(validBody());

        expect(sixth.status).toBe(429);
        expect(sixth.body).toEqual(
          expect.objectContaining({ statusCode: 429, error: 'Too Many Requests' }),
        );
        // The disqualifying assertion (KZ-002): the 6th request must NOT
        // have reached the handler — the dispatch count must stay at 5, not
        // advance to 6.
        expect(sendContactMessageMock).toHaveBeenCalledTimes(5);
      },
    );
  });
});
