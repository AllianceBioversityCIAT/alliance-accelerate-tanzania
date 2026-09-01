// @sdd-spec actors/public-self-registration (T-3)
/**
 * `MailService` unit tests (FR-14, NFR-10, design.md §4.9/§4.10).
 *
 * Two concerns, kept in separate `describe` blocks per the Disqualifying
 * clause on this task:
 *
 *  1. **Transport selection is behaviourally distinguishable.** The same
 *     `sendReceipt` call, against the SAME mocked SES client, must reach SES
 *     when `MAIL_TRANSPORT=ses` and must NOT reach it — zero calls — when
 *     `MAIL_TRANSPORT=no-op`, while resolving successfully either way. A test
 *     that only asserted an SES client was constructed would be a presence
 *     assertion (KZ-002); this asserts the call count on a shared mock.
 *  2. **No PII, code, or body reaches log output — proven, not assumed.**
 *     Each logging test first asserts a log line WAS emitted (an empty log
 *     stream would otherwise pass a naive "no PII" check vacuously), then
 *     asserts what it does not contain.
 */
import { Logger } from '@nestjs/common';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { mockClient } from 'aws-sdk-client-mock';

import { MailService } from './mail.service';
import { resetMailTransport } from './mail-transport.factory';
import { resetSesClient } from './ses-mail.transport';

const sesMock = mockClient(SESClient);

describe('MailService — transport selection (NFR-10, the Disqualifying clause)', () => {
  beforeEach(() => {
    sesMock.reset();
    resetMailTransport();
    resetSesClient();
    process.env.MAIL_SENDER_ADDRESS = 'registry@example.org';
    process.env.AWS_REGION = 'eu-west-1';
  });

  it(
    'the identical sendReceipt call reaches the mocked SES client under ' +
      '"ses" and reaches it zero times under "no-op" — both resolve successfully',
    async () => {
      sesMock.on(SendEmailCommand).resolves({ MessageId: 'test-message-id' });

      // Selecting the no-op transport: the call must resolve, and the send
      // must NOT distinguishably reach the network layer at all.
      process.env.MAIL_TRANSPORT = 'no-op';
      resetMailTransport();
      const noOpService = new MailService();
      await expect(
        noOpService.sendReceipt('applicant@example.org', 'REG-2026-0007'),
      ).resolves.toBeUndefined();
      expect(sesMock.calls()).toHaveLength(0);

      // Same call, same shared SES mock, only MAIL_TRANSPORT changed: now it
      // DOES reach SES. This is the sent-vs-not-sent distinction the
      // Disqualifying clause requires — a test that could not fail this way
      // is not evidence.
      process.env.MAIL_TRANSPORT = 'ses';
      resetMailTransport();
      const sesService = new MailService();
      await expect(
        sesService.sendReceipt('applicant@example.org', 'REG-2026-0007'),
      ).resolves.toBeUndefined();
      expect(sesMock.calls()).toHaveLength(1);
    },
  );

  it('the same distinction holds for sendVerificationCode', async () => {
    sesMock.on(SendEmailCommand).resolves({ MessageId: 'test-message-id' });

    process.env.MAIL_TRANSPORT = 'no-op';
    resetMailTransport();
    await new MailService().sendVerificationCode('applicant@example.org', '482913');
    expect(sesMock.calls()).toHaveLength(0);

    process.env.MAIL_TRANSPORT = 'ses';
    resetMailTransport();
    await new MailService().sendVerificationCode('applicant@example.org', '482913');
    expect(sesMock.calls()).toHaveLength(1);
  });
});

describe('MailService — logging never carries PII, codes, or body text (NFR-8, DC-14)', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    sesMock.reset();
    resetMailTransport();
    resetSesClient();
    process.env.MAIL_TRANSPORT = 'no-op';
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  /** Flatten every captured call's arguments into one searchable string. */
  function emittedText(): string {
    return [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((args) => args.map((a: unknown) => String(a)).join(' '))
      .join('\n');
  }

  it('emits attempt + outcome lines for the verification code, none containing the address or the code', async () => {
    const service = new MailService();
    const email = 'applicant-secret@example.org';
    const code = '482913';

    await service.sendVerificationCode(email, code);

    // Prove a line WAS emitted first — an empty stream would pass the
    // absence checks below vacuously (this is the trap the task names).
    const totalCalls = logSpy.mock.calls.length + errorSpy.mock.calls.length;
    expect(totalCalls).toBeGreaterThan(0);

    const emitted = emittedText();
    expect(emitted).not.toContain(email);
    expect(emitted).not.toContain(code);
    // Sanity: the lines are about this send, not merely absent of everything.
    expect(emitted).toContain('verification-code');
    expect(emitted).toContain('status=sent');
  });

  it('emits attempt + outcome lines for the receipt carrying the reference, never the address or body', async () => {
    const service = new MailService();
    const email = 'applicant-secret@example.org';
    const reference = 'REG-2026-0042';

    await service.sendReceipt(email, reference);

    const totalCalls = logSpy.mock.calls.length + errorSpy.mock.calls.length;
    expect(totalCalls).toBeGreaterThan(0);

    const emitted = emittedText();
    expect(emitted).not.toContain(email);
    // The reference IS the non-PII correlator the spec is built around — it
    // must be present, unlike the address.
    expect(emitted).toContain(reference);
  });

  it(
    'admin/registration-review-queue A-55 — emits attempt + outcome lines for kind=approval ' +
      'carrying the reference, never the address',
    async () => {
      const service = new MailService();
      const email = 'director-secret@example.org';
      const reference = 'REG-2026-0184';

      await service.sendApproval(email, reference);

      const totalCalls = logSpy.mock.calls.length + errorSpy.mock.calls.length;
      expect(totalCalls).toBeGreaterThan(0);

      const emitted = emittedText();
      expect(emitted).not.toContain(email);
      expect(emitted).toContain('kind=approval');
      expect(emitted).toContain(reference);
      expect(emitted).toContain('status=sent');
      // FR-14 scenario 2 — "log the send attempt AND its outcome": the
      // outcome line alone (`status=sent`) is not sufficient evidence of
      // this, since `kind=approval` appears on both lines. Assert the
      // attempt line explicitly so deleting it cannot leave this test green.
      expect(emitted).toContain('mail send attempt kind=approval');
    },
  );

  it(
    'admin/registration-review-queue A-55 — emits attempt + outcome lines for kind=rejection ' +
      'carrying the reference, never the address',
    async () => {
      const service = new MailService();
      const email = 'director-secret@example.org';
      const reference = 'REG-2026-0299';

      await service.sendRejection(email, reference);

      const totalCalls = logSpy.mock.calls.length + errorSpy.mock.calls.length;
      expect(totalCalls).toBeGreaterThan(0);

      const emitted = emittedText();
      expect(emitted).not.toContain(email);
      expect(emitted).toContain('kind=rejection');
      expect(emitted).toContain(reference);
      expect(emitted).toContain('status=sent');
      // FR-14 scenario 2 — same discrimination as the approval test above:
      // the outcome line alone is not evidence of the attempt line.
      expect(emitted).toContain('mail send attempt kind=rejection');
    },
  );

  it('logs a failed outcome (still without PII) when the transport rejects', async () => {
    process.env.MAIL_TRANSPORT = 'ses';
    process.env.MAIL_SENDER_ADDRESS = 'registry@example.org';
    process.env.AWS_REGION = 'eu-west-1';
    resetMailTransport();
    resetSesClient();
    sesMock.on(SendEmailCommand).rejects(new Error('Throttling'));

    const service = new MailService();
    const email = 'applicant-secret@example.org';

    await expect(service.sendReceipt(email, 'REG-2026-0099')).rejects.toThrow('Throttling');

    const totalCalls = logSpy.mock.calls.length + errorSpy.mock.calls.length;
    expect(totalCalls).toBeGreaterThan(0);

    const emitted = emittedText();
    expect(emitted).not.toContain(email);
    expect(emitted).toContain('status=failed');
  });

  it(
    'sendContactMessage (contact/contact-channels T-1) logs kind=contact with ' +
      'reference=n/a and never the recipient address',
    async () => {
      process.env.MAIL_TRANSPORT = 'ses';
      process.env.MAIL_SENDER_ADDRESS = 'registry@example.org';
      process.env.AWS_REGION = 'eu-west-1';
      resetMailTransport();
      resetSesClient();
      sesMock.on(SendEmailCommand).resolves({ MessageId: 'test-message-id' });

      const service = new MailService();
      const adminEmail = 'admin-secret@example.org';

      await service.sendContactMessage({
        to: [adminEmail],
        subject: 'New contact submission',
        text: 'body',
        replyTo: 'Jane Requester <jane@example.org>',
      });

      const totalCalls = logSpy.mock.calls.length + errorSpy.mock.calls.length;
      expect(totalCalls).toBeGreaterThan(0);

      const emitted = emittedText();
      expect(emitted).not.toContain(adminEmail);
      expect(emitted).toContain('kind=contact');
      expect(emitted).toContain('reference=n/a');
      expect(emitted).toContain('status=sent');
    },
  );

  it('sendContactMessage rethrows a transport failure unchanged', async () => {
    process.env.MAIL_TRANSPORT = 'ses';
    process.env.MAIL_SENDER_ADDRESS = 'registry@example.org';
    process.env.AWS_REGION = 'eu-west-1';
    resetMailTransport();
    resetSesClient();
    sesMock.on(SendEmailCommand).rejects(new Error('Throttling'));

    const service = new MailService();

    await expect(
      service.sendContactMessage({ to: ['admin@example.org'], subject: 's', text: 't' }),
    ).rejects.toThrow('Throttling');

    const emitted = emittedText();
    expect(emitted).toContain('kind=contact');
    expect(emitted).toContain('status=failed');
  });
});
