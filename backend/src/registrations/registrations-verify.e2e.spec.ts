// @sdd-spec actors/public-self-registration (T-8)
/**
 * `POST /registrations/verify` — HTTP e2e proof (FR-4, FR-8, design.md §3.1
 * decision 1).
 *
 * The Leader's Disqualifying clause for this task: testing only known-vs-
 * unknown leaves the over-cap branch — the one C-3 was raised for —
 * unexercised. Three inputs are driven here, and compared at the RAW
 * response level (`.text`, headers), not through a re-serialized `.body`,
 * since a key-order or whitespace difference a byte-level client could
 * observe would survive a JSON round-trip undetected.
 *
 * **Two branches, three inputs — recorded honestly (rework attempt 2).**
 * "Known" and "unknown" address take the IDENTICAL code path here:
 * `RegistrationsService.requestVerificationCode` never queries anything
 * keyed on registry membership, so there is no mechanism by which those two
 * inputs could diverge. Only the over-cap input exercises a genuinely
 * different branch (delete the `catch` in `RegistrationsService` and it
 * `500`s). Both inputs are kept as a forward guard against a future
 * membership check being added without this suite catching the regression,
 * not because they currently prove a second discriminating mechanism.
 *
 * `EmailVerificationService` and `MailService` are overridden with jest
 * mocks rather than driven through the real Prisma-backed service: T-7 and
 * T-3 already prove those components' own correctness, and control here is
 * what lets this suite force the over-cap branch deterministically and
 * inject a mail send that never settles. `PrismaService.registration.create`
 * is spied on directly so "zero Registration rows" is a structural
 * assertion, not an inference — and every request that spy is checked
 * against also asserts its own HTTP status, so a silently-failed request
 * (500/404/429) cannot pass this suite by accident (rework attempt 2, FAIL
 * 5/6).
 *
 * **Removed in rework attempt 2: a paired capped-vs-uncapped timing
 * comparison.** It mocked `issueCode` and injected the SAME artificial delay
 * into both the resolve and the reject path, which proves that construction
 * equal by definition — it measured the mock, not the endpoint — and it also
 * shared this file's one `app` instance/throttle counter with every other
 * test, silently turning several of its own samples into 429s the loop never
 * checked.
 *
 * **`fix/otp-mail-lambda-freeze` (2026-09-03) superseded the paragraph above
 * this one.** This file used to additionally claim the response "does not
 * wait on mail" — true of the ORIGINAL fire-and-forget design, and exactly
 * the property that design's own silent-drop production bug traced back to
 * (`RegistrationsService`'s class doc has the incident). The send is now
 * awaited, and `VERIFICATION_CODE_RESPONSE_FLOOR_MS` pads BOTH branches to
 * the same fixed real-time floor to keep FR-4's timing property. **The two
 * tests in "the timing mitigation" describe block below prove the CURRENT
 * shape at the HTTP layer**: the response no longer arrives before the mail
 * dispatch settles, and the rate-limited and accepted paths take comparably
 * long real wall-clock time (a real-HTTP companion to the unit suite's
 * deterministic, fake-timer proof of the exact same properties in
 * `registrations.service.spec.ts`).
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { createValidationPipe } from '../common/validation-pipe';
import { PrismaService } from '../prisma/prisma.service';
import {
  EmailVerificationSendLimitExceededError,
  EmailVerificationService,
} from './email-verification.service';
import { MailService } from '../mail/mail.service';
import { VERIFICATION_CODE_RESPONSE_FLOOR_MS } from './registrations.service';

const VERIFY_PATH = '/api/v1/registrations/verify';

/** A macrotask tick — lets a fire-and-forget promise chain settle before assertions. */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('POST /registrations/verify (T-8)', () => {
  let app: INestApplication;
  let issueCodeMock: jest.Mock;
  let sendMock: jest.Mock;
  let registrationCreateSpy: jest.Mock;

  // Total requests this whole file issues against the ONE app instance
  // below (shared `RegistrationsThrottleGuard` counter, 20/60s, keyed per
  // caller): 3 (byte-identity) + 3 (zero-rows) + 2 (mail dispatched / not
  // dispatched) + 1 (malformed 400) + 1 (malformed envelope) + 1 (over-191
  // length) + 1 (slow-mail await proof) + 2 (rate-limited/accepted
  // comparable-window proof) = 14. `fix/otp-mail-lambda-freeze` added the
  // last 2 (the timing describe block used to be a single request). Recount
  // by grepping this file for `request(app.getHttpServer())` call sites
  // before trusting this number — attempt 2's comment understated this same
  // total (rework attempt 3). Comfortably under the 20 limit — no separate
  // app instance needed per `registrations-throttle.e2e.spec.ts`'s pattern,
  // but every request below asserts its own status precisely so a silent
  // throttle regression here would fail loudly rather than pass on an
  // unchecked assumption (FAIL 4).
  //
  // **Real wall-clock cost, not throttle budget:** every request that
  // reaches `RegistrationsService.requestVerificationCode` now pays
  // `VERIFICATION_CODE_RESPONSE_FLOOR_MS` (900 ms) of real time before
  // responding — this file uses the app's real HTTP stack, not the unit
  // suite's fake timers, so that time is genuinely spent. ~11 padded
  // requests × 900 ms is a few seconds added to this file's run, well
  // inside `testTimeout: 20000` per test (`package.json`).
  beforeAll(async () => {
    issueCodeMock = jest.fn();
    sendMock = jest.fn().mockResolvedValue(undefined);
    registrationCreateSpy = jest.fn();

    const prismaMock = {
      registration: { create: registrationCreateSpy },
    } as unknown as PrismaService;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(EmailVerificationService)
      .useValue({ issueCode: issueCodeMock } as unknown as EmailVerificationService)
      .overrideProvider(MailService)
      .useValue({ sendVerificationCode: sendMock } as unknown as MailService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    // The SAME shared pipe main.ts/lambda.ts install — required for the
    // malformed-email 400 to actually fire (pii-boundary.spec.ts's own
    // corrected pattern; a bare `new ValidationPipe({...})` would not match
    // production behaviour).
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    issueCodeMock.mockReset();
    sendMock.mockReset().mockResolvedValue(undefined);
    registrationCreateSpy.mockClear();
  });

  describe('byte-identity across known, unknown, and over-cap addresses', () => {
    it('returns the identical 202/empty response for all three, pinned to literal bytes', async () => {
      issueCodeMock.mockResolvedValueOnce({ code: '111111', expiresAt: new Date() });
      const known = await request(app.getHttpServer())
        .post(VERIFY_PATH)
        .send({ email: 'known@example.com' });

      issueCodeMock.mockResolvedValueOnce({ code: '222222', expiresAt: new Date() });
      const unknown = await request(app.getHttpServer())
        .post(VERIFY_PATH)
        .send({ email: 'unknown-nonexistent@example.com' });

      issueCodeMock.mockRejectedValueOnce(new EmailVerificationSendLimitExceededError());
      const overCap = await request(app.getHttpServer())
        .post(VERIFY_PATH)
        .send({ email: 'over-cap@example.com' });

      for (const res of [known, unknown, overCap]) {
        expect(res.status).toBe(202);
      }

      // Pinned to a literal, not merely to cross-equality — a bug that made
      // ALL THREE identically wrong (e.g. all three 200, or all three
      // carrying a stray body) would pass a bare `.toBe(known.text)` chain.
      expect(known.text).toBe('');
      expect(unknown.text).toBe('');
      expect(overCap.text).toBe('');

      // Express sets Content-Length: 0 for this handler's undefined return
      // (verified directly against this app, not assumed) — pinned as a
      // literal for the same reason as `.text` above.
      expect(known.headers['content-length']).toBe('0');
      expect(unknown.headers['content-length']).toBe('0');
      expect(overCap.headers['content-length']).toBe('0');
    });

    it('creates zero Registration rows on any of the three paths (each request\'s own status checked)', async () => {
      issueCodeMock.mockResolvedValueOnce({ code: '111111', expiresAt: new Date() });
      const known = await request(app.getHttpServer())
        .post(VERIFY_PATH)
        .send({ email: 'known@example.com' });

      issueCodeMock.mockResolvedValueOnce({ code: '222222', expiresAt: new Date() });
      const unknown = await request(app.getHttpServer())
        .post(VERIFY_PATH)
        .send({ email: 'unknown-nonexistent@example.com' });

      issueCodeMock.mockRejectedValueOnce(new EmailVerificationSendLimitExceededError());
      const overCap = await request(app.getHttpServer())
        .post(VERIFY_PATH)
        .send({ email: 'over-cap@example.com' });

      // Without this, all three could 500/404/429 and the spy assertion
      // below would still pass vacuously (FAIL 5).
      expect(known.status).toBe(202);
      expect(unknown.status).toBe(202);
      expect(overCap.status).toBe(202);

      await tick();
      expect(registrationCreateSpy).not.toHaveBeenCalled();
    });

    it(
      'dispatches mail on the uncapped path (positive anchor — a no-op MailService override would ' +
        'otherwise make every negative assertion in this file pass vacuously, FAIL 6) and never ' +
        'dispatches it on the over-cap path (nothing was issued to send)',
      async () => {
        issueCodeMock.mockResolvedValueOnce({ code: '111111', expiresAt: new Date() });
        const known = await request(app.getHttpServer())
          .post(VERIFY_PATH)
          .send({ email: 'known@example.com' });
        expect(known.status).toBe(202);
        await tick();
        expect(sendMock).toHaveBeenCalledWith('known@example.com', '111111');

        sendMock.mockClear();
        issueCodeMock.mockRejectedValueOnce(new EmailVerificationSendLimitExceededError());
        const overCap = await request(app.getHttpServer())
          .post(VERIFY_PATH)
          .send({ email: 'over-cap@example.com' });
        expect(overCap.status).toBe(202);
        await tick();

        expect(sendMock).not.toHaveBeenCalled();
      },
    );
  });

  describe('malformed email', () => {
    it('rejects with 400 before ever calling issueCode — no existence check precedes format validation', async () => {
      const res = await request(app.getHttpServer())
        .post(VERIFY_PATH)
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(issueCodeMock).not.toHaveBeenCalled();
    });

    it('the 400 envelope carries no indication of address existence — only field-shape detail', async () => {
      const res = await request(app.getHttpServer())
        .post(VERIFY_PATH)
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
      expect(JSON.stringify(res.body)).not.toMatch(/exist|registry|known/i);
    });

    it(
      'rejects a WELL-FORMED email over 191 characters with 400 — without @MaxLength(191), this ' +
        'would pass @IsEmail() (RFC 5321 allows up to 254) and reach issueCode\'s insert against ' +
        'EmailVerification.email / EmailSendBudget.email, both bare Prisma String → VARCHAR(191) ' +
        'columns, and MySQL error 1406 would surface as a 500 (rework attempt 2, required fix)',
      async () => {
        // 4 labels of 60 'a's + '.com', local part "user@" — 252 chars total,
        // confirmed against the underlying `validator.isEmail` to be format-
        // valid (i.e. this is exercising the LENGTH bound, not the format one).
        const overLongEmail = `user@${Array(4).fill('a'.repeat(60)).join('.')}.com`;
        expect(overLongEmail.length).toBeGreaterThan(191);

        const res = await request(app.getHttpServer())
          .post(VERIFY_PATH)
          .send({ email: overLongEmail });

        expect(res.status).toBe(400);
        expect(issueCodeMock).not.toHaveBeenCalled();
      },
    );
  });

  describe(
    "the timing mitigation (T-7's carried risk: response latency as an oracle) — " +
      'fix/otp-mail-lambda-freeze: the send is now AWAITED, and the timing property is restored ' +
      'by a constant-time floor instead of by never awaiting',
    () => {
      it(
        'does not return 202 until the mail dispatch settles — the send is genuinely awaited now, ' +
          'not fire-and-forget. (This describe block used to assert the OPPOSITE — "returns 202 ' +
          'WITHOUT waiting for a mail dispatch that never settles" — which was the shape of the ' +
          'production bug: Lambda could freeze the container before that fire-and-forget promise ' +
          "settled, silently dropping the OTP. See RegistrationsService's class doc for the incident.)",
        async () => {
          issueCodeMock.mockResolvedValueOnce({ code: '333333', expiresAt: new Date() });
          let sendSettled = false;
          sendMock.mockReturnValueOnce(
            new Promise<void>((resolve) => {
              // Resolved from a real macrotask, well before the response
              // floor would elapse on its own — this proves ORDERING
              // (send-settles-before-response), not merely that the
              // response eventually arrives.
              setTimeout(() => {
                sendSettled = true;
                resolve();
              }, 10);
            }),
          );

          const res = await request(app.getHttpServer())
            .post(VERIFY_PATH)
            .send({ email: 'slow-mail@example.com' });

          expect(res.status).toBe(202);
          expect(res.text).toBe('');
          // Deterministic given the ordering above: if the response could
          // arrive before the send settles (the old, buggy shape), this
          // would be reachable with `sendSettled` still false. It cannot be
          // — the controller `await`s this method (registrations.controller.ts),
          // and this method now `await`s the send before it can resolve.
          expect(sendSettled).toBe(true);
        },
      );

      it(
        'pads the rate-limited and the accepted path to a comparable real wall-clock window — ' +
          'neither one exits early, and the accepted path (which now pays a real, awaited mail ' +
          'dispatch) does not run measurably longer than the rate-limited one',
        async () => {
          issueCodeMock.mockRejectedValueOnce(new EmailVerificationSendLimitExceededError());
          const rateLimitedStartedAt = Date.now();
          const rateLimited = await request(app.getHttpServer())
            .post(VERIFY_PATH)
            .send({ email: 'capped-timing@example.com' });
          const rateLimitedElapsedMs = Date.now() - rateLimitedStartedAt;
          expect(rateLimited.status).toBe(202);

          issueCodeMock.mockResolvedValueOnce({ code: '444444', expiresAt: new Date() });
          const acceptedStartedAt = Date.now();
          const accepted = await request(app.getHttpServer())
            .post(VERIFY_PATH)
            .send({ email: 'accepted-timing@example.com' });
          const acceptedElapsedMs = Date.now() - acceptedStartedAt;
          expect(accepted.status).toBe(202);

          // Both must reach (approximately) the floor — a small negative
          // slack absorbs scheduler granularity rather than an exact `>=`,
          // which would be the one way this specific assertion could flake.
          const slackMs = 25;
          expect(rateLimitedElapsedMs).toBeGreaterThanOrEqual(
            VERIFICATION_CODE_RESPONSE_FLOOR_MS - slackMs,
          );
          expect(acceptedElapsedMs).toBeGreaterThanOrEqual(
            VERIFICATION_CODE_RESPONSE_FLOOR_MS - slackMs,
          );

          // "Comparable", not identical — a real HTTP round trip carries
          // scheduler/GC jitter the unit suite's fake timers do not. A wide
          // but still meaningful bound: within 300 ms of each other, versus
          // the multi-second gap an UNPADDED SES round trip could otherwise
          // add to only the accepted path (the exact oracle FR-4 forbids).
          expect(Math.abs(rateLimitedElapsedMs - acceptedElapsedMs)).toBeLessThan(300);
        },
      );
    },
  );
});
