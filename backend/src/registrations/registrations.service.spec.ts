// @sdd-spec actors/public-self-registration (T-8)
/**
 * `RegistrationsService.requestVerificationCode` unit tests (FR-4, FR-8,
 * design.md §3.1 decision 1).
 *
 * Both collaborators are mocked — `EmailVerificationService.issueCode`'s own
 * correctness (V-1…V-6) is T-7's suite; `MailService`'s send/log behaviour is
 * T-3's. This suite's job is the ONE thing T-8 adds: does the cap's domain
 * error get swallowed into an identical success, and is the mail dispatch
 * kept out of the awaited path (the timing mitigation the Leader's brief
 * demands be proven, not asserted).
 */
import {
  BadRequestException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  EmailVerificationSendLimitExceededError,
  EmailVerificationService,
} from './email-verification.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { LOOKUP_MAX_ATTEMPTS_PER_WINDOW, RegistrationsService } from './registrations.service';
import { CONSENT_POLICY_VERSION } from './consent-policy';
import * as ConsentPolicy from './consent-policy';
import {
  MAX_REFERENCE_ALLOCATION_ATTEMPTS,
  buildRegistrationReference,
} from './registration-reference.util';
import { RegistrationCreateDto } from './dto/registration-create.dto';

/** A macrotask tick — lets any pending microtask/fire-and-forget chain settle. */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('RegistrationsService.requestVerificationCode', () => {
  let emailVerificationService: { issueCode: jest.Mock };
  let mailService: { sendVerificationCode: jest.Mock };
  let service: RegistrationsService;

  beforeEach(() => {
    emailVerificationService = { issueCode: jest.fn() };
    mailService = { sendVerificationCode: jest.fn().mockResolvedValue(undefined) };
    // `requestVerificationCode` never touches Prisma — an empty stub is
    // enough to satisfy the constructor for THIS describe block.
    service = new RegistrationsService(
      emailVerificationService as unknown as EmailVerificationService,
      mailService as unknown as MailService,
      {} as unknown as PrismaService,
    );
  });

  describe('the under-cap path', () => {
    it('issues a code and dispatches it by mail to the submitted address', async () => {
      emailVerificationService.issueCode.mockResolvedValue({
        code: '123456',
        expiresAt: new Date(),
      });

      await service.requestVerificationCode('Applicant@Example.com');
      await tick();

      expect(emailVerificationService.issueCode).toHaveBeenCalledWith('Applicant@Example.com');
      expect(mailService.sendVerificationCode).toHaveBeenCalledWith(
        'Applicant@Example.com',
        '123456',
      );
    });

    it('resolves without waiting for the mail dispatch to settle (the timing mitigation)', async () => {
      emailVerificationService.issueCode.mockResolvedValue({
        code: '123456',
        expiresAt: new Date(),
      });
      // A send that never resolves within this test's lifetime — if
      // `requestVerificationCode` awaited it, this test would time out.
      let resolveSend!: () => void;
      mailService.sendVerificationCode.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
      );

      await service.requestVerificationCode('slow-mail@example.com');

      // Reaching this line at all — with the send promise still pending —
      // is the proof. Clean up so the suite doesn't leak an open handle.
      resolveSend();
    });

    it('never throws when the mail dispatch itself fails — logged, not surfaced', async () => {
      emailVerificationService.issueCode.mockResolvedValue({
        code: '123456',
        expiresAt: new Date(),
      });
      mailService.sendVerificationCode.mockRejectedValue(new Error('SES unavailable'));

      await expect(service.requestVerificationCode('anyone@example.com')).resolves.toBeUndefined();
      await tick(); // let the rejected fire-and-forget promise's .catch run
    });
  });

  describe('mail-failure logging never leaks the address (FAIL 1 regression)', () => {
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it(
      'does not emit the applicant email even when the transport error embeds it verbatim ' +
        '(the real shape of SES MessageRejected under this repo\'s documented sandbox config — ' +
        'see ses-mail.transport.ts / backend/CLAUDE.md)',
      async () => {
        const applicantEmail = 'applicant@example.com';
        emailVerificationService.issueCode.mockResolvedValue({
          code: '123456',
          expiresAt: new Date(),
        });
        const sesLikeError = new Error(
          `Email address is not verified. The following identities failed the check in ` +
            `region EU-WEST-1: ${applicantEmail}`,
        );
        sesLikeError.name = 'MessageRejected';
        mailService.sendVerificationCode.mockRejectedValue(sesLikeError);

        await service.requestVerificationCode(applicantEmail);
        await tick();

        expect(errorSpy).toHaveBeenCalledTimes(1);
        const [emittedLine] = errorSpy.mock.calls[0] as [string];
        expect(emittedLine).not.toContain(applicantEmail);
        // Bounded discriminator IS expected — the error's class name, never its message.
        expect(emittedLine).toContain('MessageRejected');
      },
    );

    it('falls back to a bounded "UnknownError" discriminator for a non-Error rejection', async () => {
      emailVerificationService.issueCode.mockResolvedValue({
        code: '123456',
        expiresAt: new Date(),
      });
      mailService.sendVerificationCode.mockRejectedValue('applicant@example.com: rejected');

      await service.requestVerificationCode('applicant@example.com');
      await tick();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [emittedLine] = errorSpy.mock.calls[0] as [string];
      expect(emittedLine).not.toContain('applicant@example.com');
      expect(emittedLine).toContain('UnknownError');
    });
  });

  describe('the over-cap path (design.md §3.1 decision 1 — enforced silently)', () => {
    it('resolves (never throws) when the per-email cap is exceeded', async () => {
      emailVerificationService.issueCode.mockRejectedValue(
        new EmailVerificationSendLimitExceededError(),
      );

      await expect(
        service.requestVerificationCode('over-cap@example.com'),
      ).resolves.toBeUndefined();
    });

    it('never dispatches mail when the cap is exceeded — nothing was issued to send', async () => {
      emailVerificationService.issueCode.mockRejectedValue(
        new EmailVerificationSendLimitExceededError(),
      );

      await service.requestVerificationCode('over-cap@example.com');
      await tick();

      expect(mailService.sendVerificationCode).not.toHaveBeenCalled();
    });
  });

  describe('an unexpected failure (not the cap)', () => {
    it('propagates unchanged — this is not part of the byte-identity surface, which covers ' +
      'only known/unknown/over-cap addresses, not infrastructure failures', async () => {
      const boom = new Error('database unavailable');
      emailVerificationService.issueCode.mockRejectedValue(boom);

      await expect(service.requestVerificationCode('anyone@example.com')).rejects.toThrow(boom);
    });
  });
});

// @sdd-spec actors/public-self-registration (T-10)
/**
 * `RegistrationsService.submitRegistration` unit tests (FR-2 s1, FR-3 s1/s3,
 * FR-4 s1/s2, FR-5 s1, design.md §4.1, §4.5).
 *
 * `EmailVerificationService.verifyCode`/`consumeCode` are mocked — their own
 * correctness (V-1…V-6) is T-7's suite. `MailService.sendReceipt`'s own
 * send/log behaviour is T-3's. This suite's job is what T-10 adds: the
 * consent gate, the verify-before-transact ordering (V-1a survives), the
 * consume-inside-the-write-transaction ordering (A23 holds), the A-1…A-5
 * reference-allocation properties AS USED by this method (the mechanism's
 * own properties are `registration-reference.util.spec.ts`'s job), and the
 * `{ reference }`-only response shape.
 *
 * The fake Prisma below models the SAME MySQL session-variable connection
 * scoping `email-verification.service.spec.ts` and
 * `registration-reference.util.spec.ts` already establish for the sibling
 * atomic-counter mechanism — reused here, not re-derived, because
 * `allocateRegistrationReference` (called from inside this service) makes
 * the exact same `$executeRaw`/`$queryRaw` calls those files already model.
 */
describe('RegistrationsService.submitRegistration', () => {
  interface SequenceRow {
    year: number;
    seq: number;
  }

  interface FakeTx {
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
    $queryRaw: (
      strings: TemplateStringsArray,
    ) => Promise<Array<{ newRegSeq: number }>>;
    registration: { create: jest.Mock };
  }

  let sequenceRows: SequenceRow[];
  let registrationCreateSpy: jest.Mock;
  let transactionSpy: jest.Mock;
  let emailVerificationService: { verifyCode: jest.Mock; consumeCode: jest.Mock };
  let mailService: { sendReceipt: jest.Mock };
  let service: RegistrationsService;

  /**
   * `createImpl` lets a test override `tx.registration.create`'s behaviour
   * (e.g. throw a `P2002` on the first call) while the counter/session-
   * variable machinery below stays identical across every test.
   */
  function buildFakePrisma(
    createImpl: (data: unknown) => Promise<unknown> = async () => ({}),
  ): PrismaService {
    registrationCreateSpy = jest.fn(createImpl);
    transactionSpy = jest.fn(async (callback: (tx: FakeTx) => Promise<unknown>) => {
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
    return { $transaction: transactionSpy } as unknown as PrismaService;
  }

  function validDto(
    overrides: {
      email?: string;
      code?: string;
      consent?: Partial<{ accepted: boolean; policyVersion: string }>;
      payload?: Record<string, unknown>;
    } = {},
  ): RegistrationCreateDto {
    return {
      email: overrides.email ?? 'Neema@KHSC.co.tz',
      code: overrides.code ?? '123456',
      consent: {
        accepted: true,
        policyVersion: CONSENT_POLICY_VERSION,
        ...overrides.consent,
      },
      payload: {
        traderName: 'Mbeya Seed Traders Ltd',
        traderType: 'seed_company',
        contactPerson: 'Neema Shirima',
        region: 'Mbeya',
        crops: ['sorghum', 'common_bean'],
        capacityTons: 120,
        phone: '+255700000000',
        ...overrides.payload,
      },
    } as unknown as RegistrationCreateDto;
  }

  beforeEach(() => {
    sequenceRows = [];
    emailVerificationService = {
      verifyCode: jest.fn().mockResolvedValue({ outcome: 'MATCHED', id: 'ev-row-1' }),
      consumeCode: jest.fn().mockResolvedValue(true),
    };
    mailService = { sendReceipt: jest.fn().mockResolvedValue(undefined) };
    service = new RegistrationsService(
      emailVerificationService as unknown as EmailVerificationService,
      mailService as unknown as MailService,
      buildFakePrisma(),
    );
  });

  describe('consent check (FR-3 scenario 3) — each case 400s with zero rows, before the code is ever checked', () => {
    it('accepted: false — 400, zero rows, verifyCode never called', async () => {
      await expect(
        service.submitRegistration(validDto({ consent: { accepted: false } })),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(emailVerificationService.verifyCode).not.toHaveBeenCalled();
      expect(transactionSpy).not.toHaveBeenCalled();
    });

    it('accepted missing (undefined) — 400, zero rows, verifyCode never called', async () => {
      const dto = validDto();
      // @ts-expect-error — simulating a crafted request the DTO pipe would
      // normally reject first; this suite proves the SERVICE's own check is
      // not relying on the pipe alone.
      delete dto.consent.accepted;

      await expect(service.submitRegistration(dto)).rejects.toBeInstanceOf(BadRequestException);

      expect(emailVerificationService.verifyCode).not.toHaveBeenCalled();
      expect(transactionSpy).not.toHaveBeenCalled();
    });

    it('unknown policyVersion — 400, zero rows, verifyCode never called', async () => {
      await expect(
        service.submitRegistration(
          validDto({ consent: { policyVersion: 'v0.0-not-a-real-version' } }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(emailVerificationService.verifyCode).not.toHaveBeenCalled();
      expect(transactionSpy).not.toHaveBeenCalled();
    });

    it('the 400 envelope carries a per-field details entry, in the shared error shape', async () => {
      try {
        await service.submitRegistration(validDto({ consent: { accepted: false } }));
        throw new Error('expected submitRegistration to reject');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse() as {
          statusCode: number;
          error: string;
          details: Array<{ field: string }>;
        };
        expect(response.statusCode).toBe(400);
        expect(response.error).toBe('Bad Request');
        expect(response.details.some((d) => d.field === 'consent.accepted')).toBe(true);
      }
    });
  });

  describe('code verification (FR-4 s1/s2, V-1a) — rejected outside any transaction', () => {
    it('a REJECTED code 400s with zero rows and no transaction is ever opened', async () => {
      emailVerificationService.verifyCode.mockResolvedValue({ outcome: 'REJECTED' });

      await expect(service.submitRegistration(validDto())).rejects.toBeInstanceOf(
        BadRequestException,
      );

      // V-1a's structural guarantee AS USED here: this method opens no
      // `$transaction` at all on the mismatch path, so there is nothing for
      // this `400` to roll back — `EmailVerificationService.verifyCode`'s
      // OWN attempt-counter write (proven durable in its own suite) is
      // never at risk from this caller.
      expect(transactionSpy).not.toHaveBeenCalled();
    });

    it('a lost consume-race (consumeCode returns false) collapses into the IDENTICAL rejection shape as a REJECTED verifyCode (V-4/V-5 extended to this endpoint)', async () => {
      emailVerificationService.consumeCode.mockResolvedValue(false);

      let mismatchResponse: unknown;
      try {
        await service.submitRegistration(validDto());
        throw new Error('expected submitRegistration to reject');
      } catch (err) {
        mismatchResponse = (err as BadRequestException).getResponse();
      }

      emailVerificationService.verifyCode.mockResolvedValue({ outcome: 'REJECTED' });
      let rejectedResponse: unknown;
      try {
        await service.submitRegistration(validDto());
        throw new Error('expected submitRegistration to reject');
      } catch (err) {
        rejectedResponse = (err as BadRequestException).getResponse();
      }

      expect(mismatchResponse).toEqual(rejectedResponse);
      // No Registration row: the consume-race loser's transaction throws
      // before `registration.create` is ever reached.
      expect(registrationCreateSpy).not.toHaveBeenCalled();
    });
  });

  describe('success — one transaction, A23 (consume + create together), reference allocation, and the exact stored values', () => {
    it('stores consentPolicyVersion and consentAcceptedAt equal to the submitted values, submitterEmail as the OTP-verified (lowercased) address, and returns ONLY { reference }', async () => {
      const now = new Date('2026-08-06T10:15:00Z');
      jest.useFakeTimers().setSystemTime(now);

      try {
        const dto = validDto({
          email: 'Neema@KHSC.co.tz',
          consent: { accepted: true, policyVersion: CONSENT_POLICY_VERSION },
        });

        const result = await service.submitRegistration(dto);

        // FR-5 s1 / DC-2: the response is a literal `{ reference }` object —
        // asserted against the fixture VALUE the mechanism actually
        // produced, not merely "has a reference key".
        const expectedReference = buildRegistrationReference(2026, 1);
        expect(result).toEqual({ reference: expectedReference });
        expect(Object.keys(result)).toEqual(['reference']);

        expect(registrationCreateSpy).toHaveBeenCalledTimes(1);
        const createArg = registrationCreateSpy.mock.calls[0][0] as {
          data: {
            reference: string;
            submitterEmail: string;
            emailVerifiedAt: Date;
            consentAcceptedAt: Date;
            consentPolicyVersion: string;
            payload: Record<string, unknown>;
          };
        };
        expect(createArg.data.reference).toBe(expectedReference);
        // Lowercased — matching EmailVerification.email's own normalization
        // (schema.prisma's "submitterEmail … Lowercased").
        expect(createArg.data.submitterEmail).toBe('neema@khsc.co.tz');
        expect(createArg.data.consentPolicyVersion).toBe(CONSENT_POLICY_VERSION);
        expect(createArg.data.consentAcceptedAt).toEqual(now);
        expect(createArg.data.emailVerifiedAt).toEqual(now);

        // Positive sweep, not a 1-of-7-keys spot check: every field the
        // applicant submitted is persisted VERBATIM, plus the schema-version
        // marker (R2-A4) and every OMITTED optional field normalized to an
        // explicit `null`, never a missing key (T9-A4).
        expect(createArg.data.payload).toEqual({
          schemaVersion: 1,
          traderName: 'Mbeya Seed Traders Ltd',
          traderType: 'seed_company',
          contactPerson: 'Neema Shirima',
          position: null,
          district: null,
          marketLocation: null,
          sex: null,
          region: 'Mbeya',
          gpsLatitude: null,
          gpsLongitude: null,
          crops: ['sorghum', 'common_bean'],
          otherCrops: null,
          capacityTons: 120,
          phone: '+255700000000',
        });

        // A23: consume and create ran inside the SAME `$transaction` call.
        expect(emailVerificationService.consumeCode).toHaveBeenCalledTimes(1);
        expect(transactionSpy).toHaveBeenCalledTimes(2); // allocation's own tx + the consume-and-create tx
      } finally {
        jest.useRealTimers();
      }
    });

    it(
      'accepts and stores a KNOWN version that DIFFERS from the current CONSENT_POLICY_VERSION ' +
        '(DD-7/§4.2: superseded versions stay accepted) — falsifies a hardcoded ' +
        '`=== CONSENT_POLICY_VERSION` implementation, which the tautological single-version ' +
        'fixture above cannot',
      async () => {
        const supersededVersion = 'v0.9-superseded-test-only';
        const isKnownSpy = jest
          .spyOn(ConsentPolicy, 'isKnownConsentPolicyVersion')
          .mockImplementation(
            (v: string) => v === supersededVersion || v === CONSENT_POLICY_VERSION,
          );

        try {
          const dto = validDto({ consent: { policyVersion: supersededVersion } });
          await service.submitRegistration(dto);

          expect(registrationCreateSpy).toHaveBeenCalledTimes(1);
          const createArg = registrationCreateSpy.mock.calls[0][0] as {
            data: { consentPolicyVersion: string };
          };
          expect(createArg.data.consentPolicyVersion).toBe(supersededVersion);
        } finally {
          isKnownSpy.mockRestore();
        }
      },
    );

    it('dispatches the receipt email AFTER the transaction resolves, fire-and-forget (DD-9)', async () => {
      let resolveSend!: () => void;
      mailService.sendReceipt.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
      );

      const result = await service.submitRegistration(validDto());

      // Reaching this line with the send still pending IS the proof — if
      // the method awaited the send, this call would hang.
      expect(mailService.sendReceipt).toHaveBeenCalledWith('neema@khsc.co.tz', result.reference);
      resolveSend();
    });

    it('never dispatches mail when the transaction itself never commits (consent rejected before any write)', async () => {
      await expect(
        service.submitRegistration(validDto({ consent: { accepted: false } })),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mailService.sendReceipt).not.toHaveBeenCalled();
    });
  });

  describe(
    'receipt-failure logging never leaks the address (rework attempt 2, FAIL 3 — mirrors ' +
      "T-8's already-reviewed pair for the identical hazard on this SECOND fire-and-forget mail path)",
    () => {
      let errorSpy: jest.SpyInstance;

      beforeEach(() => {
        errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      });

      afterEach(() => {
        errorSpy.mockRestore();
      });

      it(
        'does not emit the applicant email even when the transport error embeds it verbatim ' +
          "(SES MessageRejected's real shape — see ses-mail.transport.ts / backend/CLAUDE.md), " +
          "and the submission ITSELF still succeeds (FR-14's 3a half: a send failure must not " +
          'fail a submission)',
        async () => {
          const applicantEmail = 'neema@khsc.co.tz';
          const sesLikeError = new Error(
            `Email address is not verified. The following identities failed the check in ` +
              `region EU-WEST-1: ${applicantEmail}`,
          );
          sesLikeError.name = 'MessageRejected';
          mailService.sendReceipt.mockRejectedValue(sesLikeError);

          const result = await service.submitRegistration(validDto());
          await tick();

          expect(result.reference).toMatch(/^REG-\d{4}-\d{4,}$/);
          expect(errorSpy).toHaveBeenCalledTimes(1);
          const [emittedLine] = errorSpy.mock.calls[0] as [string];
          expect(emittedLine).not.toContain(applicantEmail);
          expect(emittedLine).toContain('MessageRejected');
          expect(emittedLine).toContain(result.reference);
        },
      );

      it('falls back to a bounded "UnknownError" discriminator for a non-Error rejection', async () => {
        const applicantEmail = 'neema@khsc.co.tz';
        mailService.sendReceipt.mockRejectedValue(`${applicantEmail}: rejected`);

        await service.submitRegistration(validDto());
        await tick();

        expect(errorSpy).toHaveBeenCalledTimes(1);
        const [emittedLine] = errorSpy.mock.calls[0] as [string];
        expect(emittedLine).not.toContain(applicantEmail);
        expect(emittedLine).toContain('UnknownError');
      });
    },
  );

  describe('A-3 — the @unique constraint is the backstop, not the strategy: a collision is retried, bounded, never a raw 500', () => {
    function p2002(): Prisma.PrismaClientKnownRequestError {
      return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`reference`)', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['reference'] },
      });
    }

    it('a collision on the first attempt is retried transparently with a FRESH reference — the applicant never sees an error', async () => {
      let calls = 0;
      service = new RegistrationsService(
        emailVerificationService as unknown as EmailVerificationService,
        mailService as unknown as MailService,
        buildFakePrisma(async () => {
          calls += 1;
          if (calls === 1) throw p2002();
          return {};
        }),
      );

      const now = new Date('2026-08-06T10:15:00Z');
      const result = await service.submitRegistration(validDto());

      expect(calls).toBe(2);
      // Attempt 1 abandoned seq 1 (a gap — A-2 tolerates this, see
      // registration-reference.util.ts); attempt 2 got a genuinely FRESH
      // seq 2, never re-attempting the identical value that just collided.
      expect(registrationCreateSpy.mock.calls[0][0].data.reference).toBe(
        buildRegistrationReference(now.getUTCFullYear(), 1),
      );
      expect(registrationCreateSpy.mock.calls[1][0].data.reference).toBe(
        buildRegistrationReference(now.getUTCFullYear(), 2),
      );
      expect(result.reference).toBe(buildRegistrationReference(now.getUTCFullYear(), 2));

      // consumeCode ran again on the retry, re-consuming the SAME code —
      // never a second issued code, never a second burned attempt.
      expect(emailVerificationService.consumeCode).toHaveBeenCalledTimes(2);
      expect(emailVerificationService.consumeCode.mock.calls[0][1]).toBe(
        emailVerificationService.consumeCode.mock.calls[1][1],
      );
    });

    it(
      `bounds the retry at MAX_REFERENCE_ALLOCATION_ATTEMPTS (${MAX_REFERENCE_ALLOCATION_ATTEMPTS}) and, on ` +
        'exhaustion, throws a controlled 503 in the documented envelope — NEVER the raw P2002 ' +
        '(rework attempt 2, FAIL 1: an unhandled throw here serialises as a bodyless-of-`error` 500, ' +
        'the exact envelope defect §4.4 required the throttler filter to fix)',
      async () => {
        const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

        try {
          service = new RegistrationsService(
            emailVerificationService as unknown as EmailVerificationService,
            mailService as unknown as MailService,
            buildFakePrisma(async () => {
              throw p2002();
            }),
          );

          let caught: unknown;
          try {
            await service.submitRegistration(validDto());
            throw new Error('expected submitRegistration to reject');
          } catch (err) {
            caught = err;
          }

          expect(caught).toBeInstanceOf(ServiceUnavailableException);
          const response = (caught as ServiceUnavailableException).getResponse() as {
            statusCode: number;
            error: string;
            message: string;
          };
          expect(response.statusCode).toBe(503);
          expect(response.error).toBe('Service Unavailable');
          expect(typeof response.message).toBe('string');

          expect(registrationCreateSpy).toHaveBeenCalledTimes(MAX_REFERENCE_ALLOCATION_ATTEMPTS);

          // The alarm hook a raw throw would not give an operator: a
          // distinct, greppable line carrying ONLY `year`/`attempts` — no
          // email, no payload field, no code.
          const exhaustionLine = (errorSpy.mock.calls as [string][]).find(([line]) =>
            line.includes('registration reference allocation exhausted'),
          )?.[0];
          expect(exhaustionLine).toBeDefined();
          expect(exhaustionLine).toContain(`attempts=${MAX_REFERENCE_ALLOCATION_ATTEMPTS}`);
          expect(exhaustionLine).toMatch(/year=\d{4}/);
        } finally {
          errorSpy.mockRestore();
        }
      },
    );
  });
});

// @sdd-spec actors/public-self-registration (T-11)
/**
 * `RegistrationsService.lookupRegistration` unit tests (FR-6, FR-8,
 * design.md §3.1 decision 3–4, §4.4 L-1…L-4).
 *
 * Each constraint (L-1…L-4) gets its OWN named describe block and its OWN
 * evidence, per KZ-001 — a scenario-and-clause granularity, not a single
 * green test standing in for all four. `RegistrationLookupAttempt`'s atomic
 * counter is modelled by the SAME fake `$transaction`/session-variable
 * shape `email-verification.service.spec.ts` and
 * `registration-reference.util.spec.ts` already establish for the sibling
 * `EmailSendBudget`/`RegistrationSequence` mechanisms — reused here because
 * `incrementLookupAttempts` makes the exact same `$executeRaw`/`$queryRaw`
 * call shape.
 */
describe('RegistrationsService.lookupRegistration', () => {
  interface AttemptRow {
    ip: string;
    reference: string;
    windowStartIso: string;
    attempts: number;
  }

  interface RegistrationRow {
    reference: string;
    status: string;
    reviewNote: string | null;
    submitterEmail: string;
    // Present so a leak of ANY of these would be visible in a test that
    // asserts the full response object, never just its key set.
    id: string;
    payload: Record<string, unknown>;
    reviewedBySub: string | null;
    reviewedByEmail: string | null;
  }

  let attemptRows: AttemptRow[];
  let registrationRows: RegistrationRow[];
  let findUniqueSpy: jest.Mock;
  let updateSpy: jest.Mock;
  let transactionSpy: jest.Mock;
  let service: RegistrationsService;

  /** Look up this test's own recorded counter row — never ambiguous, since every seeded row carries both `ip` AND `reference`. */
  function attemptsFor(ip: string, reference: string): number | undefined {
    return attemptRows.find((r) => r.ip === ip && r.reference === reference)?.attempts;
  }

  /**
   * Mirrors `registrations.service.spec.ts`'s existing `buildFakePrisma` for
   * `RegistrationSequence` exactly, for the sibling `RegistrationLookupAttempt`
   * mechanism: a fresh fake `tx` per `$transaction` call, each with its OWN
   * `sessionNewAttempts` closure (connection-scoped session-variable
   * fidelity), backed by a SHARED `attemptRows` array standing in for the
   * persisted table survives-cold-starts property L-1 depends on. Keyed on
   * the COMPOSITE `(ip, reference, windowStart)` (rework attempt 2) — see
   * `registrations.service.ts`'s class doc on `lookupRegistration` for why a
   * per-caller-ONLY key was rejected.
   */
  function buildFakePrisma(): PrismaService {
    transactionSpy = jest.fn(async (callback: (tx: unknown) => Promise<number>) => {
      let sessionNewAttempts: number | null = null;
      const tx = {
        $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
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
        $queryRaw: async (strings: TemplateStringsArray) => {
          const sql = strings.join('?');
          if (!sql.includes('@newLookupAttempts')) {
            throw new Error(`Fake tx.$queryRaw: unrecognized SQL: ${sql}`);
          }
          return [{ newLookupAttempts: sessionNewAttempts as number }];
        },
      };
      return callback(tx);
    });

    findUniqueSpy = jest.fn(async ({ where }: { where: { reference: string } }) => {
      return registrationRows.find((r) => r.reference === where.reference) ?? null;
    });

    updateSpy = jest.fn(
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
        if (!row) {
          throw new Error('Fake registrationLookupAttempt.update: no row for this key');
        }
        row.attempts = data.attempts;
        return row;
      },
    );

    return {
      $transaction: transactionSpy,
      registration: { findUnique: findUniqueSpy },
      registrationLookupAttempt: { update: updateSpy },
    } as unknown as PrismaService;
  }

  function seedRegistration(overrides: Partial<RegistrationRow> = {}): RegistrationRow {
    const row: RegistrationRow = {
      reference: 'REG-2026-0184',
      status: 'PENDING_REVIEW',
      reviewNote: null,
      submitterEmail: 'neema@khsc.co.tz',
      id: 'internal-cuid-should-never-leak',
      payload: { traderName: 'Mbeya Seed Traders Ltd' },
      reviewedBySub: 'admin-sub-should-never-leak',
      reviewedByEmail: 'admin@example.com',
      ...overrides,
    };
    registrationRows.push(row);
    return row;
  }

  beforeEach(() => {
    attemptRows = [];
    registrationRows = [];
    service = new RegistrationsService(
      {} as unknown as EmailVerificationService,
      {} as unknown as MailService,
      buildFakePrisma(),
    );
  });

  describe('L-1 — the bound survives cold starts and spans containers', () => {
    it(
      'a BRAND NEW service instance still sees the SAME accumulated attempt count for the SAME ' +
        '(caller, reference) pair, off the SAME backing store — this rules out PER-INSTANCE state ' +
        '(e.g. a field on `RegistrationsService` itself); it does NOT, on its own, rule out a ' +
        'module-level in-memory singleton, which would still be per-container and still the C-4 ' +
        'shape L-1 exists to close. The actual cross-container evidence is structural, not this ' +
        'test alone: `incrementLookupAttempts` writes through `tx.$executeRaw` against a real, ' +
        'named SQL table (`RegistrationLookupAttempt`, guarded by the "unrecognized SQL" throw ' +
        'above, so this fake cannot silently degrade into an in-memory stand-in), that table is ' +
        'declared in a committed migration, and the identical technique was proven under genuine ' +
        'concurrent load against dev RDS for the sibling `EmailSendBudget`/`RegistrationSequence` ' +
        'mechanisms in T-7/T-10.',
      async () => {
        seedRegistration();
        const wrongEmailAttempts = LOOKUP_MAX_ATTEMPTS_PER_WINDOW - 1;
        for (let i = 0; i < wrongEmailAttempts; i++) {
          await expect(
            service.lookupRegistration('REG-2026-0184', 'wrong@example.com', '203.0.113.5'),
          ).rejects.toBeInstanceOf(NotFoundException);
        }

        // A fresh instance, but the SAME underlying (fake-persisted) Prisma
        // — this is the point: nothing about `RegistrationsService`'s own
        // construction resets the counter, because the counter lives in the
        // DB-backed table, not in this class's memory.
        const freshContainerService = new RegistrationsService(
          {} as unknown as EmailVerificationService,
          {} as unknown as MailService,
          {
            $transaction: transactionSpy,
            registration: { findUnique: findUniqueSpy },
            registrationLookupAttempt: { update: updateSpy },
          } as unknown as PrismaService,
        );

        // One more wrong attempt from the SAME caller pushes them to EXACTLY
        // the cap-th attempt (still allowed to run the lookup) — proving the
        // count truly carried over from the "old container".
        await expect(
          freshContainerService.lookupRegistration(
            'REG-2026-0184',
            'wrong@example.com',
            '203.0.113.5',
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(attemptsFor('203.0.113.5', 'REG-2026-0184')).toBe(LOOKUP_MAX_ATTEMPTS_PER_WINDOW);

        // And the VERY NEXT call — the (cap+1)-th — is the locked exit.
        await expect(
          freshContainerService.lookupRegistration(
            'REG-2026-0184',
            'wrong@example.com',
            '203.0.113.5',
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(attemptsFor('203.0.113.5', 'REG-2026-0184')).toBe(
          LOOKUP_MAX_ATTEMPTS_PER_WINDOW + 1,
        );
      },
    );

    it(
      'the ATOMIC INCREMENT STATEMENT is not a check-then-act read+write — of N truly concurrent ' +
        'calls from the SAME caller against the SAME reference, the counter advances by exactly N, ' +
        "never fewer. This proves the FAKE's single-statement shape is not read-then-write (the " +
        "exact defect that defeated EmailSendBudget's first two attempts, per " +
        'email-verification.service.ts) — it does NOT, on its own, prove MySQL-level atomicity of ' +
        'the real `INSERT … ON DUPLICATE KEY UPDATE` under contention; that is inherited from the ' +
        "IDENTICAL technique's dev-RDS load runs in T-7 (EmailSendBudget) and T-10 " +
        '(RegistrationSequence), not re-measured here.',
      async () => {
        seedRegistration();
        const concurrentCalls = 5;

        const results = await Promise.allSettled(
          Array.from({ length: concurrentCalls }, () =>
            service.lookupRegistration('REG-2026-0184', 'wrong@example.com', '198.51.100.9'),
          ),
        );

        // All 5 are wrong-email guesses — every one rejects.
        expect(results.every((r) => r.status === 'rejected')).toBe(true);
        expect(attemptsFor('198.51.100.9', 'REG-2026-0184')).toBe(concurrentCalls);
      },
    );
  });

  describe('L-2 — byte-identity across all three exits, including the locked one', () => {
    it('reference-absent, email-mismatch, and caller-over-cap (against ONE reference) all throw the IDENTICAL 404 body', async () => {
      seedRegistration({ reference: 'REG-2026-0200', submitterEmail: 'known@example.com' });

      // Exit 1: reference does not exist at all. A distinct IP, and a
      // reference this test never targets again — its OWN counter row is
      // irrelevant to the lock driven below (rework attempt 2: keying now
      // includes `reference`, so a counter on `REG-2026-9999` cannot
      // contribute to a lock on `REG-2026-0200`).
      let absentResponse: unknown;
      try {
        await service.lookupRegistration('REG-2026-9999', 'known@example.com', '203.0.113.10');
        throw new Error('expected rejection');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        absentResponse = (err as NotFoundException).getResponse();
      }

      // Exit 2: reference exists, email does not match.
      let mismatchResponse: unknown;
      try {
        await service.lookupRegistration('REG-2026-0200', 'wrong@example.com', '203.0.113.11');
        throw new Error('expected rejection');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        mismatchResponse = (err as NotFoundException).getResponse();
      }

      // Exit 3: this caller is over the lookup-attempt cap for the ONE
      // reference this sub-test cares about — every guess below targets
      // `REG-2026-0200` specifically, since the counter is now per
      // (ip, reference): guessing against a DIFFERENT reference would not
      // advance this one at all.
      const lockedCallerIp = '203.0.113.12';
      for (let i = 0; i < LOOKUP_MAX_ATTEMPTS_PER_WINDOW; i++) {
        try {
          await service.lookupRegistration('REG-2026-0200', 'guess@example.com', lockedCallerIp);
        } catch {
          // expected on every call in this loop.
        }
      }
      expect(attemptsFor(lockedCallerIp, 'REG-2026-0200')).toBe(LOOKUP_MAX_ATTEMPTS_PER_WINDOW);

      // The (cap + 1)-th request against THIS reference — submitting the
      // genuinely CORRECT email this time — is the locked exit.
      let lockedResponse: unknown;
      try {
        await service.lookupRegistration('REG-2026-0200', 'known@example.com', lockedCallerIp);
        throw new Error('expected rejection');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        lockedResponse = (err as NotFoundException).getResponse();
      }

      const expectedBody = {
        statusCode: 404,
        error: 'Not Found',
        message: 'No registration was found matching that reference and email.',
      };
      expect(absentResponse).toEqual(expectedBody);
      expect(mismatchResponse).toEqual(expectedBody);
      expect(lockedResponse).toEqual(expectedBody);
      // Cross-equality alone would pass if all three were identically WRONG
      // in some other way; pinning to the literal expected body rules that
      // out for each individually too.
    });

    it(
      'a LOCKED caller submitting the CORRECT reference+email still gets the 404 — the lock check ' +
        'runs before correctness is ever evaluated, so "locked" and "was right" are not a second, ' +
        'subtler distinguishable outcome',
      async () => {
        seedRegistration({ reference: 'REG-2026-0300', submitterEmail: 'known@example.com' });
        const lockedCallerIp = '203.0.113.20';

        for (let i = 0; i < LOOKUP_MAX_ATTEMPTS_PER_WINDOW; i++) {
          try {
            await service.lookupRegistration(
              'REG-2026-0300',
              'guess@example.com',
              lockedCallerIp,
            );
          } catch {
            // expected — driving this caller over the cap for THIS reference.
          }
        }
        findUniqueSpy.mockClear();

        await expect(
          service.lookupRegistration('REG-2026-0300', 'known@example.com', lockedCallerIp),
        ).rejects.toBeInstanceOf(NotFoundException);
        // The correctness check never ran at all once locked — not merely
        // "ran and was overridden".
        expect(findUniqueSpy).not.toHaveBeenCalled();
      },
    );
  });

  describe('L-3 — an attacker cannot deny a legitimate applicant access to their OWN status', () => {
    it(
      "an attacker's caller IP locking itself out against a real applicant's reference does NOT " +
        "lock out the real applicant's own (DIFFERENT) caller IP looking up the SAME reference",
      async () => {
        seedRegistration({ reference: 'REG-2026-0400', submitterEmail: 'applicant@example.com' });
        const attackerIp = '198.51.100.50';
        const applicantIp = '198.51.100.51';

        // The attacker guesses wrong emails against the applicant's
        // reference until THEY are locked.
        for (let i = 0; i <= LOOKUP_MAX_ATTEMPTS_PER_WINDOW; i++) {
          try {
            await service.lookupRegistration('REG-2026-0400', 'guess@example.com', attackerIp);
          } catch {
            // expected on every one of these.
          }
        }
        expect(attemptsFor(attackerIp, 'REG-2026-0400')).toBeGreaterThan(
          LOOKUP_MAX_ATTEMPTS_PER_WINDOW,
        );

        // The genuine applicant, from THEIR OWN IP, still succeeds — a
        // reference-keyed (or shared) bound would have failed this.
        const result = await service.lookupRegistration(
          'REG-2026-0400',
          'applicant@example.com',
          applicantIp,
        );
        expect(result).toEqual({ status: 'PENDING_REVIEW' });
      },
    );
  });

  describe('L-4 — a successful lookup does not leave the caller closer to a lockout against THAT reference', () => {
    it(
      'after (cap - 1) failed guesses followed by ONE success, the attempt counter for that ' +
        "(caller, reference) pair is reset to 0 — not merely 'not incremented further', an actual " +
        'reset — proven both on the stored value and behaviourally (the caller can make cap MORE ' +
        'failed guesses against the SAME reference afterward before being locked again)',
      async () => {
        seedRegistration({ reference: 'REG-2026-0500', submitterEmail: 'applicant@example.com' });
        const callerIp = '198.51.100.60';

        for (let i = 0; i < LOOKUP_MAX_ATTEMPTS_PER_WINDOW - 1; i++) {
          await expect(
            service.lookupRegistration('REG-2026-0500', 'wrong@example.com', callerIp),
          ).rejects.toBeInstanceOf(NotFoundException);
        }
        expect(attemptsFor(callerIp, 'REG-2026-0500')).toBe(LOOKUP_MAX_ATTEMPTS_PER_WINDOW - 1);

        await service.lookupRegistration('REG-2026-0500', 'applicant@example.com', callerIp);

        // The direct, internal proof: the stored counter is genuinely 0,
        // not merely unchanged from its pre-success value.
        expect(attemptsFor(callerIp, 'REG-2026-0500')).toBe(0);

        // The behavioural proof: this caller can now absorb
        // LOOKUP_MAX_ATTEMPTS_PER_WINDOW - 1 MORE failed guesses against the
        // SAME reference (a fresh full budget) without being locked —
        // impossible if the earlier failed attempts had survived the success.
        for (let i = 0; i < LOOKUP_MAX_ATTEMPTS_PER_WINDOW - 1; i++) {
          await expect(
            service.lookupRegistration('REG-2026-0500', 'wrong-again@example.com', callerIp),
          ).rejects.toBeInstanceOf(NotFoundException);
        }
        // Still not locked — the NEXT one (the cap-th SINCE the reset) is
        // still a content-based rejection, not yet the lock.
        expect(attemptsFor(callerIp, 'REG-2026-0500')).toBe(LOOKUP_MAX_ATTEMPTS_PER_WINDOW - 1);
      },
    );
  });

  describe(
    'L-1 × L-4 interaction (rework attempt 2 — the FAIL this rework fixes) — a reset earned by a ' +
      "match on the attacker's OWN reference must never reset a DIFFERENT reference's budget",
    () => {
      it(
        'REGRESSION: ONE genuinely successful lookup of the attacker\'s OWN (unrelated) reference, ' +
          'interleaved partway through a run of wrong-email guesses against a VICTIM reference, ' +
          "does NOT reset — or otherwise affect — the victim reference's attempt counter; the " +
          'victim reference still locks at exactly the cap, counting every guess actually made ' +
          "against it (including the guesses made both BEFORE and AFTER the interleaved success). " +
          "One interleave is sufficient to distinguish the two mechanisms — under attempt 1's " +
          'per-caller-ONLY key, this exact sequence would have reset the SHARED counter back to 0 ' +
          'partway through, so the victim reference would never have reached the cap at all.',
        async () => {
          seedRegistration({ reference: 'REG-2026-0900', submitterEmail: 'victim@example.com' });
          seedRegistration({ reference: 'REG-2026-0901', submitterEmail: 'attacker@example.com' });
          const attackerIp = '198.51.100.77';

          // 9 wrong guesses against the victim's reference — one short of
          // the cap.
          for (let i = 0; i < LOOKUP_MAX_ATTEMPTS_PER_WINDOW - 1; i++) {
            await expect(
              service.lookupRegistration('REG-2026-0900', `guess-${i}@example.com`, attackerIp),
            ).rejects.toBeInstanceOf(NotFoundException);
          }
          expect(attemptsFor(attackerIp, 'REG-2026-0900')).toBe(
            LOOKUP_MAX_ATTEMPTS_PER_WINDOW - 1,
          );

          // THE INTERLEAVE: one genuinely successful lookup of the
          // attacker's OWN reference — this is the exact call that used to
          // reset the (attempt-1) SHARED counter.
          const own = await service.lookupRegistration(
            'REG-2026-0901',
            'attacker@example.com',
            attackerIp,
          );
          expect(own).toEqual({ status: 'PENDING_REVIEW' });
          // The attacker's own reference's counter is 0 — freshly reset by
          // its own success, exactly as L-4 requires for THAT reference —
          // and, critically, the victim reference's counter (asserted next)
          // is UNAFFECTED by this reset.
          expect(attemptsFor(attackerIp, 'REG-2026-0901')).toBe(0);
          expect(attemptsFor(attackerIp, 'REG-2026-0900')).toBe(
            LOOKUP_MAX_ATTEMPTS_PER_WINDOW - 1,
          );

          // The 10th guess against the victim's reference — bringing it to
          // EXACTLY the cap.
          await expect(
            service.lookupRegistration('REG-2026-0900', 'guess-final@example.com', attackerIp),
          ).rejects.toBeInstanceOf(NotFoundException);
          expect(attemptsFor(attackerIp, 'REG-2026-0900')).toBe(LOOKUP_MAX_ATTEMPTS_PER_WINDOW);

          // The victim reference is now genuinely locked — even the
          // CORRECT pair is refused.
          await expect(
            service.lookupRegistration('REG-2026-0900', 'victim@example.com', attackerIp),
          ).rejects.toBeInstanceOf(NotFoundException);
        },
      );
    },
  );

  describe(
    'case-insensitive email comparison is THIS METHOD\'S OWN behaviour, not the MySQL ' +
      "utf8mb4_unicode_ci collation's (R2-A3) — `findUnique` here is a plain in-memory mock that " +
      'never touches a real database or its collation, so a match below can ONLY be produced by ' +
      'this method\'s own `normalizeEmail()` call',
    () => {
      it('matches an email submitted in a DIFFERENT case than the stored (already-lowercased) value', async () => {
        seedRegistration({ reference: 'REG-2026-0600', submitterEmail: 'neema@khsc.co.tz' });

        const result = await service.lookupRegistration(
          'REG-2026-0600',
          'NEEMA@KHSC.CO.TZ',
          '203.0.113.30',
        );

        expect(result).toEqual({ status: 'PENDING_REVIEW' });
      });

      it('trims surrounding whitespace the same way normalizeEmail does for storage', async () => {
        seedRegistration({ reference: 'REG-2026-0601', submitterEmail: 'neema@khsc.co.tz' });

        const result = await service.lookupRegistration(
          'REG-2026-0601',
          '  Neema@KHSC.co.tz  ',
          '203.0.113.31',
        );

        expect(result).toEqual({ status: 'PENDING_REVIEW' });
      });
    },
  );

  describe('the success response — status and reviewNote ONLY, from FIXTURE values (not a key list)', () => {
    it('returns { status } alone when reviewNote is null — no stray reviewNote key at all', async () => {
      seedRegistration({
        reference: 'REG-2026-0700',
        submitterEmail: 'applicant@example.com',
        status: 'AWAITING_APPLICANT',
        reviewNote: null,
      });

      const result = await service.lookupRegistration(
        'REG-2026-0700',
        'applicant@example.com',
        '203.0.113.40',
      );

      expect(result).toEqual({ status: 'AWAITING_APPLICANT' });
      expect(Object.keys(result)).toEqual(['status']);
    });

    it('returns { status, reviewNote } when a note exists — pinned to the fixture VALUES', async () => {
      seedRegistration({
        reference: 'REG-2026-0701',
        submitterEmail: 'applicant@example.com',
        status: 'REJECTED',
        reviewNote: 'Duplicate of an existing registry record.',
      });

      const result = await service.lookupRegistration(
        'REG-2026-0701',
        'applicant@example.com',
        '203.0.113.41',
      );

      expect(result).toEqual({
        status: 'REJECTED',
        reviewNote: 'Duplicate of an existing registry record.',
      });
      expect(Object.keys(result).sort()).toEqual(['reviewNote', 'status']);
    });

    it(
      'never carries payload, id, submitterEmail, reviewedBySub, or reviewedByEmail — asserted ' +
        'against the fixture object as a whole, not a key subtraction, so a renamed leaked key would ' +
        'still be caught',
      async () => {
        seedRegistration({
          reference: 'REG-2026-0702',
          submitterEmail: 'applicant@example.com',
          status: 'APPROVED',
          reviewNote: 'Welcome to the registry.',
          id: 'internal-cuid-should-never-leak',
          payload: { traderName: 'Should Never Leak Ltd', phone: '+255700000099' },
          reviewedBySub: 'admin-sub-should-never-leak',
          reviewedByEmail: 'admin-should-never-leak@example.com',
        });

        const result = await service.lookupRegistration(
          'REG-2026-0702',
          'applicant@example.com',
          '203.0.113.42',
        );

        expect(result).toEqual({
          status: 'APPROVED',
          reviewNote: 'Welcome to the registry.',
        });
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain('internal-cuid-should-never-leak');
        expect(serialized).not.toContain('Should Never Leak Ltd');
        expect(serialized).not.toContain('admin-sub-should-never-leak');
        expect(serialized).not.toContain('admin-should-never-leak@example.com');
      },
    );
  });
});
