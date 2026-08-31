// @sdd-spec contact/contact-channels (T-8)
/**
 * T-8 — FR-7's zero-writes gate (design.md §1, §10's "E2E — DC-4
 * zero-writes" row; requirements.md FR-7, §8 DC-4).
 *
 * **Why this test exists at all — FR-7 is disciplinary, not structural
 * (design.md §1).** `PrismaModule` is `@Global()`
 * (`prisma/prisma.module.ts`), so `PrismaService` is injectable into
 * `ContactService` with NO import anywhere in `ContactModule` and Nest
 * resolves it anyway. The absence of a Prisma import in this module's files
 * is a convention an author can follow or silently drop; it prevents
 * nothing at runtime. THIS test is the only mechanism that can catch a
 * regression where a future edit to `contact.service.ts` starts issuing a
 * query — there is no structural barrier to that at all.
 *
 * **Compiles the REAL `AppModule`, never a standalone `ContactModule`
 * (requirements.md §8 DC-4, design.md §10).** `ContactModule` alone does not
 * import `PrismaModule` — `PrismaService` would simply be ABSENT from that
 * compiled graph, and `.overrideProvider(PrismaService)` against an absent
 * provider is a silent no-op: Nest raises nothing, the override is just
 * never wired to anything, and every assertion below would pass whether or
 * not `ContactService` ever touched a database. Compiling `AppModule`
 * (which imports `ContactModule` INTO the same graph `PrismaModule` is
 * global to) is what makes the override — and therefore this whole gate —
 * real, exactly as `pii-boundary.spec.ts` already establishes for the
 * `actors`/`registrations` release gates this file is a sibling to.
 *
 * **The override models Prisma's DELEGATE shape
 * (`prisma.actor.create`, `prisma.registration.findMany`, …), never flat
 * methods.** `ContactService` (and anything else running on this request
 * path) would call a nested delegate method, never a method on
 * `PrismaService` itself — a flat mock (`{ create: jest.fn() }` at the top
 * level) would not intercept a real violation and this gate would pass
 * unconditionally against the exact defect it exists to catch. Every model
 * FR-7's own scenario names — `Actor`, `Registration`, `CropsOnActors`,
 * `ActorAuditLog` — gets its own delegate, and every delegate carries every
 * read/write method Prisma generates, because FR-7's clause is "must NOT
 * issue any database query" (not merely "no write") — see that
 * requirement's own note on why "no query" is the only clause DC-4's spy can
 * actually express.
 *
 * **Four paths, one assertion shape each (FR-7 scenario, KZ-007).** Success,
 * validation-failure, filled-honeypot and throttled must each independently
 * hold zero Prisma calls — the four are not redundant with each other, since
 * a defect could plausibly live in exactly one of them (e.g. a query added
 * only on the success path, invisible to the other three).
 *
 * `MailService` and `AdminRecipientResolver` are provider-overridden purely
 * so this suite never depends on live SES or Cognito — neither override
 * touches whether a Prisma call happens, which is this file's only concern.
 * `pii-boundary.spec.ts`'s sibling T-8 `describe` block is the leakage gate;
 * this file is the write gate. They are deliberately two files, matching
 * `design.md` §10's two separate rows.
 */
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { createValidationPipe } from '../common/validation-pipe';
import { configureBodyParser } from '../common/body-parser.config';
import { configurePayloadCap } from '../common/payload-cap.config';
import { MailService } from '../mail/mail.service';
import { AdminRecipientResolver } from './admin-recipient.resolver';
import { CONTACT_CATEGORIES } from './contact-categories';

const CONTACT_PATH = '/api/v1/contact';

const FIXED_ADMIN_RECIPIENTS = ['dc4-admin-one@example.org', 'dc4-admin-two@example.org'];

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'DC-4 Fixture Requester',
    email: 'dc4-fixture-requester@example.org',
    organization: 'DC-4 Fixture Organization',
    category: CONTACT_CATEGORIES[0],
    subject: 'DC-4 fixture subject',
    message: 'DC-4 fixture message body, exercised across all four gated paths.',
    privacyAcknowledged: true,
    ...overrides,
  };
}

/**
 * Every delegate method Prisma generates for a model — read AND write —
 * because FR-7's clause is "must NOT issue any database query", not merely
 * "no write" (requirements.md FR-7's own note on why "no query" is the
 * clause DC-4 can actually express). A method this list omits would be a
 * blind spot no assertion below could ever see.
 */
const PRISMA_DELEGATE_METHODS = [
  'create',
  'createMany',
  'findMany',
  'findFirst',
  'findUnique',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'groupBy',
  'aggregate',
] as const;

type MockDelegate = Record<(typeof PRISMA_DELEGATE_METHODS)[number], jest.Mock>;

function buildMockDelegate(): MockDelegate {
  const delegate = {} as MockDelegate;
  for (const method of PRISMA_DELEGATE_METHODS) {
    delegate[method] = jest.fn().mockResolvedValue(undefined);
  }
  return delegate;
}

/**
 * The four models FR-7's own scenario names verbatim: "no `Actor`,
 * `Registration`, `CropsOnActors` or `ActorAuditLog` row is created,
 * modified or deleted." Prisma's generated client property names
 * (confirmed against existing callers across `backend/src`, e.g.
 * `actor-audit.service.ts`'s `prisma.actorAuditLog.createMany`,
 * `actors.service.ts`'s `prisma.cropsOnActors.createMany`) are camelCase off
 * the model name, never the model name verbatim.
 */
const PRISMA_MODEL_NAMES = ['actor', 'registration', 'cropsOnActors', 'actorAuditLog'] as const;

type MockPrisma = Record<(typeof PRISMA_MODEL_NAMES)[number], MockDelegate>;

function buildNoWritesPrismaMock(): MockPrisma {
  const mock = {} as MockPrisma;
  for (const model of PRISMA_MODEL_NAMES) {
    mock[model] = buildMockDelegate();
  }
  return mock;
}

/** Sum of every call, across every method, across every model — the single number every assertion below checks is zero. */
function totalPrismaCallCount(mock: MockPrisma): number {
  let total = 0;
  for (const model of PRISMA_MODEL_NAMES) {
    for (const method of PRISMA_DELEGATE_METHODS) {
      total += mock[model][method].mock.calls.length;
    }
  }
  return total;
}

/** Clears call history only (never the resolved-value implementation) between tests sharing one app/mock instance. */
function clearPrismaMock(mock: MockPrisma): void {
  for (const model of PRISMA_MODEL_NAMES) {
    for (const method of PRISMA_DELEGATE_METHODS) {
      mock[model][method].mockClear();
    }
  }
}

describe(
  'POST /api/v1/contact — zero-writes gate (contact/contact-channels T-8, FR-7, ' +
    'requirements.md §8 DC-4, release gate)',
  () => {
    let app: NestExpressApplication;
    let prismaMock: MockPrisma;
    let sendContactMessageMock: jest.Mock;
    let resolveMock: jest.Mock;
    let throttlerStorage: ThrottlerStorageService;

    beforeAll(async () => {
      prismaMock = buildNoWritesPrismaMock();
      sendContactMessageMock = jest.fn().mockResolvedValue(undefined);
      resolveMock = jest.fn().mockResolvedValue(FIXED_ADMIN_RECIPIENTS);

      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PrismaService)
        .useValue(prismaMock as unknown as PrismaService)
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
      clearPrismaMock(prismaMock);
      sendContactMessageMock.mockReset().mockResolvedValue(undefined);
      resolveMock.mockReset().mockResolvedValue(FIXED_ADMIN_RECIPIENTS);
      // Clean throttle bucket for the NEXT test (contact.e2e.spec.ts's own
      // established pattern) — the last `it` below drives 6 requests
      // against a 5/60s limit and must never inherit hits from an earlier test.
      throttlerStorage.storage.clear();
    });

    it('a successful submission issues zero Prisma queries across every FR-7-named model', async () => {
      const res = await request(app.getHttpServer()).post(CONTACT_PATH).send(validBody());

      expect(res.status).toBe(202);
      expect(sendContactMessageMock).toHaveBeenCalledTimes(1);
      expect(totalPrismaCallCount(prismaMock)).toBe(0);
    });

    it('a validation-rejected submission issues zero Prisma queries', async () => {
      const res = await request(app.getHttpServer())
        .post(CONTACT_PATH)
        .send(validBody({ category: 'Not a real category' }));

      expect(res.status).toBe(400);
      expect(sendContactMessageMock).not.toHaveBeenCalled();
      expect(totalPrismaCallCount(prismaMock)).toBe(0);
    });

    it('a filled-honeypot submission issues zero Prisma queries', async () => {
      const res = await request(app.getHttpServer())
        .post(CONTACT_PATH)
        .send(validBody({ website: 'http://spam.example' }));

      expect(res.status).toBe(202);
      expect(sendContactMessageMock).not.toHaveBeenCalled();
      expect(totalPrismaCallCount(prismaMock)).toBe(0);
    });

    it(
      'a throttled (429) submission issues zero Prisma queries — proven across the 5 allowed ' +
        'requests too, not merely the 6th that gets rejected',
      async () => {
        for (let i = 0; i < 5; i++) {
          const res = await request(app.getHttpServer()).post(CONTACT_PATH).send(validBody());
          expect(res.status).toBe(202);
        }

        const sixth = await request(app.getHttpServer()).post(CONTACT_PATH).send(validBody());

        expect(sixth.status).toBe(429);
        expect(totalPrismaCallCount(prismaMock)).toBe(0);
      },
    );
  },
);
