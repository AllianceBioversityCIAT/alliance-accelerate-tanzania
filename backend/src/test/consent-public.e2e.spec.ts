import { INestApplication, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ConsentMethod, ConsentRequestStatus, ConsentStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';
import { NEVER_PUBLIC_FIELDS } from '../common/pii-consent.policy';
import { configureBodyParser } from '../common/body-parser.config';
import { configurePayloadCap } from '../common/payload-cap.config';
import { createValidationPipe } from '../common/validation-pipe';
import { ADMIN_CONSENT_EDITIONS, CURRENT_ADMIN_CONSENT_EDITION } from '../consent-requests/admin-consent-policy';
import { buildConsentLinkNotFoundError } from '../consent-requests/consent-public.service';
import { CONSENT_THROTTLE_LIMIT, ConsentThrottleGuard } from '../consent-requests/consent-throttle.guard';
import { hashConsentToken } from '../consent-requests/consent-token.util';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CONSENT_ACTOR_ID,
  CONSENT_NEVER_PUBLIC_VALUES,
  buildConsentPublicHarness,
  consentActorFixture,
  consentRowFixture,
  consentTokenFor,
} from './support/consent-public.fixture';

/**
 * actors/consent-intake/consent-request-email T-5 — HTTP e2e for the two
 * PUBLIC consent-link routes (`POST /api/v1/consent/view`, `…/respond`),
 * through the real `AppModule` with an in-memory Prisma (design.md §5.4).
 *
 * The throttle guard is overridden to a pass-through in the main app (every
 * test here shares one caller IP, and the real guard would 429 the suite) and
 * exercised UNtouched in the dedicated-app describe at the bottom — its own
 * app instance and its own in-memory throttler storage, so neither this
 * file's counters nor `registrations-throttle.e2e.spec.ts`'s can ever make
 * the other flaky.
 */

const T_OPEN = consentTokenFor('open');
const T_EXPIRED = consentTokenFor('expired');
const T_USED = consentTokenFor('used');
const T_SUPERSEDED = consentTokenFor('superseded');
const T_ACTOR_GONE = consentTokenFor('actor-gone');
const T_NEVER_ISSUED = consentTokenFor('never-issued');

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const RESPONDENT = {
  name: 'Respondent Representative',
  position: 'Managing Director',
  email: 'respondent-different@evidence.example',
  phone: '+255 700 999 888',
};

function initialRequests() {
  return [
    consentRowFixture(T_OPEN),
    consentRowFixture(T_EXPIRED, { expiresAt: new Date(Date.now() - MINUTE) }),
    consentRowFixture(T_USED, {
      status: ConsentRequestStatus.ACCEPTED,
      respondedAt: new Date(Date.now() - DAY),
      respondentName: 'Earlier Respondent',
    }),
    consentRowFixture(T_SUPERSEDED, { status: ConsentRequestStatus.SUPERSEDED, supersededAt: new Date() }),
    consentRowFixture(T_ACTOR_GONE, { actorId: 'actor-that-was-deleted' }),
  ];
}

function collectKeys(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((v) => collectKeys(v, into));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      collectKeys(v, into);
    }
  }
  return into;
}

async function buildApp(
  harness: ReturnType<typeof buildConsentPublicHarness>,
  opts: { realThrottle: boolean },
): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(harness.prisma as unknown as PrismaService)
    .overrideProvider(ActingAdminResolver)
    .useValue({ resolve: jest.fn().mockResolvedValue('admin@example.com') })
    .overrideProvider(MailService)
    .useValue({ sendConsentRequest: jest.fn() });
  if (!opts.realThrottle) {
    builder = builder.overrideGuard(ConsentThrottleGuard).useValue({ canActivate: () => true });
  }
  const moduleRef: TestingModule = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(createValidationPipe());
  configurePayloadCap(app);
  configureBodyParser(app);
  await app.init();
  return app;
}

describe('Public consent-link routes (HTTP e2e, in-memory Prisma)', () => {
  let app: INestApplication;
  let harness: ReturnType<typeof buildConsentPublicHarness>;

  const view = (token: unknown) => request(app.getHttpServer()).post('/api/v1/consent/view').send({ token });
  const respond = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/consent/respond').send(body);
  const accept = (token: unknown, respondent: Record<string, unknown> = RESPONDENT) =>
    respond({ token, decision: 'ACCEPT', respondent, accepted: true });

  beforeAll(async () => {
    harness = buildConsentPublicHarness([consentActorFixture()], initialRequests());
    app = await buildApp(harness, { realThrottle: false });
  });

  beforeEach(() => harness.reset());

  afterAll(async () => {
    await app.close();
  });

  describe('POST /consent/view', () => {
    it('returns exactly { organization, record, edition, expiresAt } for an open link', async () => {
      const res = await view(T_OPEN);

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(['edition', 'expiresAt', 'organization', 'record']);
      expect(res.body.organization).toBe('Consent Fixture Agro Ltd');
      expect(res.body.edition.version).toBe('v1.0');
      expect(Object.keys(res.body.edition).sort()).toEqual(['acceptanceStatement', 'sections', 'version']);
      expect(res.body.edition.sections.length).toBeGreaterThan(0);
    });

    it('shows the public-detail set for an UNKNOWN actor — contact block and GPS as-if-granted — and no NEVER_PUBLIC field by key or value', async () => {
      const res = await view(T_OPEN);

      expect(res.status).toBe(200);
      // Present: what accepting would publish (FR-9 scenario 1), GPS included (B-1).
      expect(res.body.record).toMatchObject({
        id: CONSENT_ACTOR_ID,
        contactPerson: 'Neema Mushi',
        position: 'Operations Manager',
        phone: '+255755000111',
        email: 'actor-record@consent-fixture.example',
        marketLocation: 'Morogoro Central Market',
        gps: { lat: -6.8211, long: 37.6616 },
      });
      // Absent, by key and by value.
      const keys = collectKeys(res.body);
      for (const forbidden of NEVER_PUBLIC_FIELDS) expect(keys.has(forbidden)).toBe(false);
      expect(keys.has('tokenHash')).toBe(false);
      for (const value of CONSENT_NEVER_PUBLIC_VALUES) expect(res.text).not.toContain(value);
    });

    it('the preview equals GET /actors/:id after the actor accepts, GPS included (DD-11)', async () => {
      const preview = await view(T_OPEN);
      expect(preview.status).toBe(200);
      expect(preview.body.record.gps).not.toBeNull();

      expect((await accept(T_OPEN)).status).toBe(200);
      const published = await request(app.getHttpServer()).get(`/api/v1/actors/${CONSENT_ACTOR_ID}`);

      expect(published.status).toBe(200);
      expect(preview.body.record).toEqual(published.body);
    });

    it('the day-30 boundary: open at T+30d−1min, a miss at T+30d+1min (FR-8)', async () => {
      const sentAt = new Date(Date.now() - 30 * DAY);
      const justOpen = consentTokenFor('day-30-open');
      const justClosed = consentTokenFor('day-30-closed');
      harness.addRequest(consentRowFixture(justOpen, { sentAt, expiresAt: new Date(Date.now() + MINUTE) }));
      harness.addRequest(consentRowFixture(justClosed, { sentAt, expiresAt: new Date(Date.now() - MINUTE) }));

      expect((await view(justOpen)).status).toBe(200);
      expect((await view(justClosed)).status).toBe(404);
    });

    it('does not mutate anything', async () => {
      const before = JSON.stringify([harness.getRequests(), harness.getActors()]);
      await view(T_OPEN);
      expect(JSON.stringify([harness.getRequests(), harness.getActors()])).toBe(before);
      expect(harness.prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('the six dead-end cases are one response (FR-11, NFR-2)', () => {
    const MISS_TOKENS: Array<[string, () => unknown]> = [
      ['unknown token', () => T_NEVER_ISSUED],
      ['expired', () => T_EXPIRED],
      ['already answered', () => T_USED],
      ['superseded', () => T_SUPERSEDED],
      ['actor deleted', () => T_ACTOR_GONE],
      ['malformed: a 1-character token', () => 'a'],
      ['malformed: empty string', () => ''],
      ['malformed: a number', () => 12345],
      ['malformed: an object', () => ({ $ne: null })],
      ['malformed: an array', () => ['x']],
      ['malformed: null', () => null],
      ['malformed: 5000 characters', () => 'z'.repeat(5000)],
      ['malformed: not base64url', () => '!!!not base64url!!!'],
    ];
    const FIXED_BODY = JSON.stringify(buildConsentLinkNotFoundError().getResponse());

    it.each(MISS_TOKENS)('view — %s → the fixed 404 body', async (_label, token) => {
      const res = await view(token());
      expect(res.status).toBe(404);
      expect(res.text).toBe(FIXED_BODY);
    });

    it.each(MISS_TOKENS)('respond — %s → the same fixed 404 body', async (_label, token) => {
      const before = JSON.stringify([harness.getRequests(), harness.getActors()]);
      const res = await respond({ token: token(), decision: 'DECLINE' });
      expect(res.status).toBe(404);
      expect(res.text).toBe(FIXED_BODY);
      expect(JSON.stringify([harness.getRequests(), harness.getActors()])).toBe(before);
    });

    it('a MISSING token (no key at all) is the same miss on both endpoints, never a 400', async () => {
      const v = await request(app.getHttpServer()).post('/api/v1/consent/view').send({});
      const r = await request(app.getHttpServer()).post('/api/v1/consent/respond').send({ decision: 'DECLINE' });
      expect([v.status, r.status]).toEqual([404, 404]);
      expect(v.text).toBe(FIXED_BODY);
      expect(r.text).toBe(FIXED_BODY);
    });

    it('a valid-looking ACCEPT body against each dead link is the same miss (no 400, no state change)', async () => {
      for (const token of [T_EXPIRED, T_USED, T_SUPERSEDED, T_ACTOR_GONE, T_NEVER_ISSUED]) {
        const res = await accept(token);
        expect(res.status).toBe(404);
        expect(res.text).toBe(FIXED_BODY);
      }
      expect(harness.getActor()?.consentStatus).toBe(ConsentStatus.UNKNOWN);
    });

    it('the miss body names no actor field and no organization (FR-11 scenario 2)', async () => {
      const res = await view(T_ACTOR_GONE);
      expect(res.text).not.toContain('Consent Fixture Agro Ltd');
      expect(Object.keys(res.body).sort()).toEqual(['error', 'message', 'statusCode']);
    });
  });

  describe('POST /consent/respond — validation (FR-9, B-5)', () => {
    it('Accept with Position empty is a 400 naming respondent.position and records nothing', async () => {
      const res = await accept(T_OPEN, { ...RESPONDENT, position: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'respondent.position' })]),
      );
      expect(harness.getRequests().find((r) => r.tokenHash === hashConsentToken(T_OPEN))?.status).toBe('SENT');
      expect(harness.getActor()?.consentStatus).toBe(ConsentStatus.UNKNOWN);
    });

    it.each([
      ['no respondent', { token: T_OPEN, decision: 'ACCEPT', accepted: true }, 'respondent'],
      ['accepted false', { token: T_OPEN, decision: 'ACCEPT', respondent: RESPONDENT, accepted: false }, 'accepted'],
      ['accepted missing', { token: T_OPEN, decision: 'ACCEPT', respondent: RESPONDENT }, 'accepted'],
      ['bad email', { token: T_OPEN, decision: 'ACCEPT', respondent: { ...RESPONDENT, email: 'nope' }, accepted: true }, 'respondent.email'],
      ['name over 120', { token: T_OPEN, decision: 'ACCEPT', respondent: { ...RESPONDENT, name: 'n'.repeat(121) }, accepted: true }, 'respondent.name'],
      ['phone over 40', { token: T_OPEN, decision: 'ACCEPT', respondent: { ...RESPONDENT, phone: '1'.repeat(41) }, accepted: true }, 'respondent.phone'],
      ['unknown decision', { token: T_OPEN, decision: 'MAYBE' }, 'decision'],
    ])('%s → 400 naming the field, never token', async (_label, body, field) => {
      const res = await respond(body as Record<string, unknown>);

      expect(res.status).toBe(400);
      expect(res.body.details.map((d: { field: string }) => d.field)).toContain(field);
      expect(JSON.stringify(res.body)).not.toMatch(/token/i);
      expect(harness.getActor()?.consentStatus).toBe(ConsentStatus.UNKNOWN);
    });

    it('a MALFORMED token with an otherwise valid body is a 404, never a 400 (format is never a 400)', async () => {
      const res = await accept('x');
      expect(res.status).toBe(404);
    });

    it('Decline needs nothing: no checkbox, no identity (FR-9 scenario 3)', async () => {
      const res = await respond({ token: T_OPEN, decision: 'DECLINE' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /consent/respond — Accept (FR-10)', () => {
    it('returns 200 { decision } and nothing else — no respondent field, no actor field', async () => {
      const res = await accept(T_OPEN);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ decision: 'ACCEPT' });
      expect(res.text).not.toContain('respondent');
      expect(res.text).not.toContain(RESPONDENT.email);
    });

    it('publishes: GRANTED / EMAIL_LINK / respondedAt / the request id, and the actor appears in GET /actors', async () => {
      const hiddenBefore = await request(app.getHttpServer()).get(`/api/v1/actors/${CONSENT_ACTOR_ID}`);
      expect(hiddenBefore.status).toBe(404);
      const listBefore = await request(app.getHttpServer()).get('/api/v1/actors');
      expect(listBefore.body.data.map((a: { id: string }) => a.id)).not.toContain(CONSENT_ACTOR_ID);

      expect((await accept(T_OPEN)).status).toBe(200);

      const row = harness.getRequests().find((r) => r.tokenHash === hashConsentToken(T_OPEN))!;
      const actor = harness.getActor()!;
      expect(row.status).toBe('ACCEPTED');
      expect(row.respondedAt).toBeInstanceOf(Date);
      expect(actor.consentStatus).toBe(ConsentStatus.GRANTED);
      expect(actor.consentMethod).toBe(ConsentMethod.EMAIL_LINK);
      expect(actor.consentObtainedAt).toEqual(row.respondedAt);
      expect(actor.consentReference).toBe(row.id);

      const listAfter = await request(app.getHttpServer()).get('/api/v1/actors');
      expect(listAfter.body.data.map((a: { id: string }) => a.id)).toContain(CONSENT_ACTOR_ID);
      const detail = await request(app.getHttpServer()).get(`/api/v1/actors/${CONSENT_ACTOR_ID}`);
      expect(detail.status).toBe(200);
      expect(detail.body.phone).toBe('+255755000111');
    });

    it('records the respondent identity, IP and user agent on the request row (evidence)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/consent/respond')
        .set('User-Agent', 'ConsentFixtureBrowser/1.0')
        .send({ token: T_OPEN, decision: 'ACCEPT', respondent: RESPONDENT, accepted: true })
        .expect(200);

      const row = harness.getRequests().find((r) => r.tokenHash === hashConsentToken(T_OPEN))!;
      expect(row).toMatchObject({
        respondentName: RESPONDENT.name,
        respondentPosition: RESPONDENT.position,
        respondentEmail: RESPONDENT.email,
        respondentPhone: RESPONDENT.phone,
        respondentUserAgent: 'ConsentFixtureBrowser/1.0',
      });
      expect(row.respondentIp).toMatch(/127\.0\.0\.1|::1/);
    });

    it("a respondent email/phone that differs from the actor's leaves the actor's record unchanged (D-9)", async () => {
      await accept(T_OPEN).expect(200);

      const actor = harness.getActor()!;
      expect(actor.email).toBe('actor-record@consent-fixture.example');
      expect(actor.phone).toBe('+255755000111');
      // The actor write names exactly the four consent fields — no email, no phone.
      const data = harness.actor.update.mock.calls[0][0].data;
      expect(Object.keys(data).sort()).toEqual([
        'consentMethod',
        'consentObtainedAt',
        'consentReference',
        'consentStatus',
      ]);
    });

    it('writes ONE sentinel-authored audit row: consent-link, no email, the diff and the request id (FR-13)', async () => {
      await accept(T_OPEN).expect(200);

      const rows = harness.getAuditRows();
      expect(rows).toHaveLength(1);
      const row = harness.getRequests().find((r) => r.tokenHash === hashConsentToken(T_OPEN))!;
      expect(rows[0]).toMatchObject({
        action: 'CONSENT_RESPONDED',
        actingSub: 'consent-link',
        actingEmail: null,
        actorId: CONSENT_ACTOR_ID,
      });
      const changes = rows[0].changes as { requestId: string; fields: Record<string, unknown> };
      expect(changes.requestId).toBe(row.id);
      expect(Object.keys(changes.fields).sort()).toEqual([
        'consentMethod',
        'consentObtainedAt',
        'consentReference',
        'consentStatus',
      ]);
      expect(JSON.stringify(rows[0])).not.toContain(RESPONDENT.email);
      expect(JSON.stringify(rows[0])).not.toContain(T_OPEN);
    });
  });

  describe('POST /consent/respond — Decline (FR-10)', () => {
    it('sets DENIED, leaves method/date/reference unchanged, and the actor stays absent from every public read', async () => {
      const res = await respond({ token: T_OPEN, decision: 'DECLINE' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ decision: 'DECLINE' });
      const actor = harness.getActor()!;
      expect(actor.consentStatus).toBe(ConsentStatus.DENIED);
      // Unchanged from the fixture (which now carries non-null provenance).
      const seeded = consentActorFixture();
      expect(actor.consentMethod).toBe(seeded.consentMethod);
      expect(actor.consentObtainedAt).toEqual(seeded.consentObtainedAt);
      expect(actor.consentReference).toBe(seeded.consentReference);
      expect(Object.keys(harness.actor.update.mock.calls[0][0].data)).toEqual(['consentStatus']);
      expect((await request(app.getHttpServer()).get(`/api/v1/actors/${CONSENT_ACTOR_ID}`)).status).toBe(404);
      const list = await request(app.getHttpServer()).get('/api/v1/actors');
      expect(list.body.data.map((a: { id: string }) => a.id)).not.toContain(CONSENT_ACTOR_ID);
      expect(harness.getRequests().find((r) => r.tokenHash === hashConsentToken(T_OPEN))?.status).toBe('DECLINED');
    });

    it('C-73 — a Decline does the same as an Accept: ONE consent-link audit row, and respondedAt, IP and user agent on the request row, identity null (FR-10)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/consent/respond')
        .set('User-Agent', 'ConsentFixtureBrowser/1.0')
        .send({ token: T_OPEN, decision: 'DECLINE', respondent: RESPONDENT })
        .expect(200);

      const rows = harness.getAuditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'CONSENT_RESPONDED',
        actingSub: 'consent-link',
        actingEmail: null,
        actorId: CONSENT_ACTOR_ID,
      });
      const row = harness.getRequests().find((r) => r.tokenHash === hashConsentToken(T_OPEN))!;
      expect((rows[0].changes as { requestId: string }).requestId).toBe(row.id);
      expect(row.status).toBe('DECLINED');
      expect(row.respondedAt).toBeInstanceOf(Date);
      expect(row.respondentUserAgent).toBe('ConsentFixtureBrowser/1.0');
      expect(row.respondentIp).toMatch(/127\.0\.0\.1|::1/);
      expect([row.respondentName, row.respondentPosition, row.respondentEmail, row.respondentPhone]).toEqual([
        null,
        null,
        null,
        null,
      ]);
    });

    it('stores no respondent identity even if one is sent with a Decline', async () => {
      await respond({ token: T_OPEN, decision: 'DECLINE', respondent: RESPONDENT }).expect(200);
      const row = harness.getRequests().find((r) => r.tokenHash === hashConsentToken(T_OPEN))!;
      expect(row.respondentEmail).toBeNull();
      expect(row.respondentName).toBeNull();
    });
  });

  describe('exactly one answer per link (FR-8, FR-10, FR-12)', () => {
    it('a second answer on a used link is the dead end and changes nothing (FR-8 scenario 2)', async () => {
      await accept(T_OPEN).expect(200);
      const snapshot = JSON.stringify([harness.getRequests(), harness.getActors(), harness.getAuditRows()]);

      const second = await respond({ token: T_OPEN, decision: 'DECLINE' });

      expect(second.status).toBe(404);
      expect(JSON.stringify([harness.getRequests(), harness.getActors(), harness.getAuditRows()])).toBe(snapshot);
      expect(harness.getActor()?.consentStatus).toBe(ConsentStatus.GRANTED);
    });

    it('a link superseded by an admin withdrawal never grants, however it is answered (FR-12 AND)', async () => {
      const row = harness.getRequests().find((r) => r.tokenHash === hashConsentToken(T_OPEN))!;
      row.status = ConsentRequestStatus.SUPERSEDED;
      harness.getActor()!.consentStatus = ConsentStatus.DENIED;

      const res = await accept(T_OPEN);

      expect(res.status).toBe(404);
      expect(harness.getActor()?.consentStatus).toBe(ConsentStatus.DENIED);
    });

    it('an actor deleted after the routing read but before the lock is the uniform miss, with nothing written', async () => {
      harness.$queryRaw.mockImplementationOnce(async () => {
        harness.removeActor(); // deleted between the routing read and the locking SELECT
        return [];
      });

      const res = await accept(T_OPEN);

      expect(res.status).toBe(404);
      expect(res.text).toBe(JSON.stringify(buildConsentLinkNotFoundError().getResponse()));
      const row = harness.getRequests().find((r) => r.tokenHash === hashConsentToken(T_OPEN))!;
      expect(row.status).toBe('SENT');
      expect(row.respondedAt).toBeNull();
      expect(harness.consentRequest.updateMany).not.toHaveBeenCalled();
      expect(harness.getAuditRows()).toHaveLength(0);
    });

    it('a failure AFTER the CAS (here the audit write) rolls the whole answer back — request still SENT, actor unchanged', async () => {
      harness.actorAuditLog.create.mockRejectedValueOnce(new Error('audit write failed'));

      const res = await accept(T_OPEN);

      expect(res.status).toBe(500);
      const row = harness.getRequests().find((r) => r.tokenHash === hashConsentToken(T_OPEN))!;
      expect(row.status).toBe('SENT');
      expect(row.respondentEmail).toBeNull();
      expect(harness.getActor()?.consentStatus).toBe(ConsentStatus.UNKNOWN);
    });
  });

  describe('an old request keeps its own edition (FR-1)', () => {
    it('renders the request’s own editionVersion, resolved through the registry by version', async () => {
      expect(ADMIN_CONSENT_EDITIONS.map((e) => e.version)).toContain('v1.0');
      const res = await view(T_OPEN);
      expect(res.body.edition.version).toBe('v1.0');
      expect(res.body.edition.acceptanceStatement).toBe(
        ADMIN_CONSENT_EDITIONS.find((e) => e.version === 'v1.0')!.acceptanceStatement,
      );
      // v1.0 stays what is served even though it is the registry's CURRENT edition today;
      // the "v1.1 registered later" proof lives in consent-public.service.spec.ts.
      expect(CURRENT_ADMIN_CONSENT_EDITION.version).toBeDefined();
    });
  });

  describe('logging (NFR-1)', () => {
    it('a respond captures no token, address or respondent field in any log line', async () => {
      const lines: string[] = [];
      const capture = (chunk: unknown): boolean => {
        lines.push(String(chunk));
        return true;
      };
      const out = jest.spyOn(process.stdout, 'write').mockImplementation(capture);
      const err = jest.spyOn(process.stderr, 'write').mockImplementation(capture);
      // `Test.createTestingModule` installs a logger that swallows non-error
      // output, so the sink is silent here; spying the `Logger` methods
      // captures what every call site WOULD have written, whatever the sink.
      const loggerSpies = (['log', 'warn', 'error', 'debug', 'verbose', 'fatal'] as const).map((m) =>
        jest.spyOn(Logger.prototype, m).mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' '))),
      );
      const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
        jest.spyOn(console, m).mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' '))),
      );
      try {
        await request(app.getHttpServer())
          .post('/api/v1/consent/respond')
          .set('User-Agent', 'LogSpyBrowser/9.9')
          .send({ token: T_OPEN, decision: 'ACCEPT', respondent: RESPONDENT, accepted: true })
          .expect(200);
      } finally {
        out.mockRestore();
        err.mockRestore();
        consoleSpies.forEach((s) => s.mockRestore());
        loggerSpies.forEach((s) => s.mockRestore());
      }

      const logged = lines.join('\n');
      // Vacuity guard: the spy is alive and the service did log its one line.
      expect(logged).toContain('consent response recorded');
      for (const secret of [
        T_OPEN,
        hashConsentToken(T_OPEN),
        RESPONDENT.name,
        RESPONDENT.position,
        RESPONDENT.email,
        RESPONDENT.phone,
        'LogSpyBrowser',
        '127.0.0.1',
      ]) {
        expect(logged).not.toContain(secret);
      }
    });
  });
});

describe('Public consent-link routes — throttle (NFR-4), dedicated app', () => {
  let app: INestApplication;
  let harness: ReturnType<typeof buildConsentPublicHarness>;

  beforeAll(async () => {
    harness = buildConsentPublicHarness([consentActorFixture()], initialRequests());
    app = await buildApp(harness, { realThrottle: true });
  });

  afterAll(async () => {
    await app.close();
  });

  it(`request ${CONSENT_THROTTLE_LIMIT + 1} within the window on /view is a 429 that reveals nothing, and never reaches Prisma`, async () => {
    for (let i = 0; i < CONSENT_THROTTLE_LIMIT; i++) {
      const res = await request(app.getHttpServer()).post('/api/v1/consent/view').send({ token: T_NEVER_ISSUED });
      expect(res.status).toBe(404);
    }
    const lookups = harness.consentRequest.findUnique.mock.calls.length;

    const over = await request(app.getHttpServer()).post('/api/v1/consent/view').send({ token: T_OPEN });

    expect(over.status).toBe(429);
    expect(over.body).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: expect.any(String),
    });
    expect(over.text).not.toContain(T_OPEN);
    expect(harness.consentRequest.findUnique.mock.calls.length).toBe(lookups);
  });

  it(`request ${CONSENT_THROTTLE_LIMIT + 1} on /respond is a 429 and opens no transaction`, async () => {
    for (let i = 0; i < CONSENT_THROTTLE_LIMIT; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/consent/respond')
        .send({ token: T_NEVER_ISSUED, decision: 'DECLINE' });
      expect(res.status).toBe(404);
    }
    const transactions = harness.prisma.$transaction.mock.calls.length;

    const over = await request(app.getHttpServer())
      .post('/api/v1/consent/respond')
      .send({ token: T_OPEN, decision: 'DECLINE' });

    expect(over.status).toBe(429);
    expect(harness.prisma.$transaction.mock.calls.length).toBe(transactions);
    expect(harness.getActor()?.consentStatus).toBe(ConsentStatus.UNKNOWN);
  });
});
