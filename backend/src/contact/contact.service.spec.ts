// @sdd-spec contact/contact-channels (T-6)
/**
 * `ContactService.submitContact` unit tests (FR-2, FR-5, FR-7, FR-8,
 * design.md §1, §4.1, §4.4, DD-3).
 *
 * Both collaborators are mocked — `AdminRecipientResolver`'s own cache/
 * pagination/fallback correctness is T-5's suite, `composeReplyTo` and
 * `buildContactMessage`'s own correctness are T-2's and T-3's. This suite's
 * job is the one thing T-6 adds: resolve -> render -> AWAIT the send ->
 * return, the honeypot short-circuit reaching zero dispatches, the `502` on
 * a transport rejection, and that no log line this service emits ever
 * carries `err.message` (only `err.name`/class-name).
 */
import { BadGatewayException } from '@nestjs/common';
import { AdminRecipientResolver } from './admin-recipient.resolver';
import { MailService } from '../mail/mail.service';
import { ContactCreateDto } from './dto/contact-create.dto';
import { ContactService } from './contact.service';

function buildDto(overrides: Partial<ContactCreateDto> = {}): ContactCreateDto {
  const dto = new ContactCreateDto();
  dto.name = 'Jane Requester';
  dto.email = 'jane@example.org';
  dto.organization = 'Acme Cooperative';
  dto.category = 'General inquiry';
  dto.subject = 'A question';
  dto.message = 'Hello, I have a question.';
  dto.privacyAcknowledged = true;
  Object.assign(dto, overrides);
  return dto;
}

describe('ContactService.submitContact', () => {
  let adminRecipientResolver: { resolve: jest.Mock };
  let mailService: { sendContactMessage: jest.Mock };
  let service: ContactService;

  beforeEach(() => {
    adminRecipientResolver = { resolve: jest.fn().mockResolvedValue(['admin1@example.org', 'admin2@example.org']) };
    mailService = { sendContactMessage: jest.fn().mockResolvedValue(undefined) };
    service = new ContactService(
      adminRecipientResolver as unknown as AdminRecipientResolver,
      mailService as unknown as MailService,
    );
  });

  describe('the successful path', () => {
    it('resolves recipients, renders one message, and AWAITS the send before returning', async () => {
      const dto = buildDto();

      await service.submitContact(dto);

      expect(adminRecipientResolver.resolve).toHaveBeenCalledTimes(1);
      expect(mailService.sendContactMessage).toHaveBeenCalledTimes(1);
      const message = mailService.sendContactMessage.mock.calls[0][0];
      expect(message.to).toEqual(['admin1@example.org', 'admin2@example.org']);
      expect(message.replyTo).toContain(dto.email);
      expect(message.text).toContain(dto.message);
    });

    it('propagates the awaited promise — a caller that awaits submitContact only resolves after the send settles', async () => {
      let sendResolved = false;
      mailService.sendContactMessage.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            setImmediate(() => {
              sendResolved = true;
              resolve();
            });
          }),
      );

      await service.submitContact(buildDto());

      expect(sendResolved).toBe(true);
    });
  });

  describe('the honeypot path (FR-8)', () => {
    it('returns with no error, resolves no recipients, and dispatches nothing when the honeypot is filled', async () => {
      const dto = buildDto({ website: 'https://spam.example/' });

      await expect(service.submitContact(dto)).resolves.toBeUndefined();

      expect(adminRecipientResolver.resolve).not.toHaveBeenCalled();
      expect(mailService.sendContactMessage).not.toHaveBeenCalled();
    });

    it('treats an over-long honeypot value identically — still zero dispatches, no thrown error', async () => {
      const dto = buildDto({ website: 'x'.repeat(10_000) });

      await expect(service.submitContact(dto)).resolves.toBeUndefined();

      expect(mailService.sendContactMessage).not.toHaveBeenCalled();
    });

    it('treats an empty string honeypot as NOT filled (dispatches normally)', async () => {
      const dto = buildDto({ website: '' });

      await service.submitContact(dto);

      expect(mailService.sendContactMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('a transport rejection (FR-5, DD-3)', () => {
    it('throws a 502 with a friendly envelope carrying no provider detail', async () => {
      mailService.sendContactMessage.mockRejectedValue(
        Object.assign(new Error('Email address is not verified: someone@example.org'), {
          name: 'MessageRejected',
        }),
      );

      const dto = buildDto();
      await expect(service.submitContact(dto)).rejects.toThrow(BadGatewayException);

      try {
        await service.submitContact(dto);
        fail('expected submitContact to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(BadGatewayException);
        const response = (err as BadGatewayException).getResponse() as Record<string, unknown>;
        expect(response.statusCode).toBe(502);
        expect(JSON.stringify(response)).not.toContain('someone@example.org');
        expect(JSON.stringify(response)).not.toContain('MessageRejected');
        expect(JSON.stringify(response)).not.toContain('Email address is not verified');
      }
    });

    it('never logs err.message — only the error name reaches the logger', async () => {
      const rejection = Object.assign(
        new Error('Email address is not verified: leaked@example.org'),
        { name: 'MessageRejected' },
      );
      mailService.sendContactMessage.mockRejectedValue(rejection);

      const errorSpy = jest.spyOn((service as unknown as { logger: { error: (msg: string) => void } }).logger, 'error');

      await expect(service.submitContact(buildDto())).rejects.toThrow(BadGatewayException);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const loggedLine = errorSpy.mock.calls[0][0];
      expect(loggedLine).toContain('MessageRejected');
      expect(loggedLine).not.toContain('leaked@example.org');
      expect(loggedLine).not.toContain('Email address is not verified');
    });

    it('falls back to "UnknownError" when the rejection is not an Error instance', async () => {
      mailService.sendContactMessage.mockRejectedValue('a plain string rejection');

      const errorSpy = jest.spyOn((service as unknown as { logger: { error: (msg: string) => void } }).logger, 'error');

      await expect(service.submitContact(buildDto())).rejects.toThrow(BadGatewayException);

      expect(errorSpy.mock.calls[0][0]).toContain('UnknownError');
    });
  });
});
