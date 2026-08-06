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
import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  EmailVerificationSendLimitExceededError,
  EmailVerificationService,
} from './email-verification.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegistrationsService } from './registrations.service';
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
