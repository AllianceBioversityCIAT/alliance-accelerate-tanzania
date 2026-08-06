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
import { Logger } from '@nestjs/common';
import {
  EmailVerificationSendLimitExceededError,
  EmailVerificationService,
} from './email-verification.service';
import { MailService } from '../mail/mail.service';
import { RegistrationsService } from './registrations.service';

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
    service = new RegistrationsService(
      emailVerificationService as unknown as EmailVerificationService,
      mailService as unknown as MailService,
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
