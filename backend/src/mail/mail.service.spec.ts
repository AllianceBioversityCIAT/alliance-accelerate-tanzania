// @sdd-spec actors/public-self-registration (T-3)
/**
 * `MailService` unit tests (FR-14, NFR-10, design.md §4.9/§4.10).
 *
 * Two concerns, kept in separate `describe` blocks per the Disqualifying
 * clause on this task:
 *
 *  1. **Transport selection is behaviourally distinguishable.** The same
 *     `sendReceipt` call, against the SAME mocked microservice broker, must
 *     reach the broker when `MAIL_TRANSPORT=microservice` and must NOT reach
 *     it — zero calls — when `MAIL_TRANSPORT=no-op`, while resolving
 *     successfully either way. A test that only asserted a connection was
 *     opened would be a presence assertion (KZ-002); this asserts the
 *     `publish` call count on a shared mock.
 *  2. **No PII, code, or body reaches log output — proven, not assumed.**
 *     Each logging test first asserts a log line WAS emitted (an empty log
 *     stream would otherwise pass a naive "no PII" check vacuously), then
 *     asserts what it does not contain.
 *
 * enhancement/email-notification-microservice T-10 (Phase B): this suite
 * used to exercise the SES transport, mocked via `aws-sdk-client-mock`
 * against `SESClient`, before SES was retired. It now exercises
 * `MicroserviceMailTransport` through a hand-rolled `amqplib` mock — the
 * same technique `microservice-mail.transport.spec.ts` uses for its own,
 * much larger, connection-lifecycle suite — because this file's job stays
 * narrower: prove `MailService.dispatch()` reaches whichever transport
 * `MAIL_TRANSPORT` selects, not re-prove that transport's own
 * retry/probe/mutex behaviour.
 */
import { EventEmitter } from 'events';
import * as amqp from 'amqplib';
import { Logger } from '@nestjs/common';

import { MailService } from './mail.service';
import { resetMailTransport } from './mail-transport.factory';
import { resetMicroserviceMailTransportState } from './microservice-mail.transport';

jest.mock('amqplib');

interface FakeChannel extends EventEmitter {
  checkQueue: jest.Mock;
  publish: jest.Mock;
  close: jest.Mock;
}

interface FakeChannelModel extends EventEmitter {
  createConfirmChannel: jest.Mock;
  close: jest.Mock;
}

/** A `checkQueue`-ok, `publish`-ack channel — the happy path every test
 * below needs unless it is specifically exercising a rejection. */
function createWorkingChannel(): FakeChannel {
  const channel = new EventEmitter() as FakeChannel;
  channel.checkQueue = jest
    .fn()
    .mockResolvedValue({ queue: 'accelerate-tz-email', messageCount: 0, consumerCount: 1 });
  channel.publish = jest.fn(
    (
      _exchange: string,
      _routingKey: string,
      _content: Buffer,
      _options: amqp.Options.Publish | undefined,
      callback?: (err: unknown, ok: unknown) => void,
    ) => {
      callback?.(null, {});
      return true;
    },
  );
  channel.close = jest.fn().mockResolvedValue(undefined);
  return channel;
}

/** Same shape, but every `publish` nacks — the "broker rejected the
 * message" path (`MicroserviceMailPublishError`), which is never retried
 * (DD-4: the failure is at-or-after the publish). */
function createRejectingChannel(): FakeChannel {
  const channel = createWorkingChannel();
  channel.publish = jest.fn(
    (
      _exchange: string,
      _routingKey: string,
      _content: Buffer,
      _options: amqp.Options.Publish | undefined,
      callback?: (err: unknown, ok: unknown) => void,
    ) => {
      callback?.(new Error('NACK'), undefined);
      return true;
    },
  );
  return channel;
}

function mockConnect(channel: FakeChannel): void {
  const model = new EventEmitter() as FakeChannelModel;
  model.createConfirmChannel = jest.fn().mockResolvedValue(channel);
  model.close = jest.fn().mockResolvedValue(undefined);
  (amqp.connect as jest.MockedFunction<typeof amqp.connect>).mockResolvedValue(
    model as unknown as amqp.ChannelModel,
  );
}

function setMicroserviceEnv(): void {
  process.env.RABBITMQ_URL = 'amqps://user:pass@broker.example.org:5671';
  process.env.EMAIL_QUEUE_NAME = 'accelerate-tz-email';
  process.env.MICROSERVICE_API_KEY = 'clarisa-key-123';
  process.env.EMAIL_SENDER = 'registry@example.org';
}

describe('MailService — transport selection (NFR-10, the Disqualifying clause)', () => {
  let channel: FakeChannel;

  beforeEach(() => {
    (amqp.connect as jest.MockedFunction<typeof amqp.connect>).mockReset();
    channel = createWorkingChannel();
    mockConnect(channel);
    resetMailTransport();
    resetMicroserviceMailTransportState();
    setMicroserviceEnv();
  });

  it(
    'the identical sendReceipt call reaches the mocked broker under ' +
      '"microservice" and reaches it zero times under "no-op" — both resolve successfully',
    async () => {
      // Selecting the no-op transport: the call must resolve, and the send
      // must NOT distinguishably reach the network layer at all.
      process.env.MAIL_TRANSPORT = 'no-op';
      resetMailTransport();
      const noOpService = new MailService();
      await expect(
        noOpService.sendReceipt('applicant@example.org', 'REG-2026-0007'),
      ).resolves.toBeUndefined();
      expect(channel.publish).toHaveBeenCalledTimes(0);

      // Same call, same shared broker mock, only MAIL_TRANSPORT changed: now
      // it DOES reach the broker. This is the sent-vs-not-sent distinction
      // the Disqualifying clause requires — a test that could not fail this
      // way is not evidence.
      process.env.MAIL_TRANSPORT = 'microservice';
      resetMailTransport();
      const microserviceService = new MailService();
      await expect(
        microserviceService.sendReceipt('applicant@example.org', 'REG-2026-0007'),
      ).resolves.toBeUndefined();
      expect(channel.publish).toHaveBeenCalledTimes(1);
    },
  );

  it('the same distinction holds for sendVerificationCode', async () => {
    process.env.MAIL_TRANSPORT = 'no-op';
    resetMailTransport();
    await new MailService().sendVerificationCode('applicant@example.org', '482913');
    expect(channel.publish).toHaveBeenCalledTimes(0);

    process.env.MAIL_TRANSPORT = 'microservice';
    resetMailTransport();
    await new MailService().sendVerificationCode('applicant@example.org', '482913');
    expect(channel.publish).toHaveBeenCalledTimes(1);
  });
});

describe('MailService — logging never carries PII, codes, or body text (NFR-8, DC-14)', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    (amqp.connect as jest.MockedFunction<typeof amqp.connect>).mockReset();
    resetMailTransport();
    resetMicroserviceMailTransportState();
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
    process.env.MAIL_TRANSPORT = 'microservice';
    setMicroserviceEnv();
    resetMailTransport();
    resetMicroserviceMailTransportState();
    mockConnect(createRejectingChannel());

    const service = new MailService();
    const email = 'applicant-secret@example.org';

    await expect(service.sendReceipt(email, 'REG-2026-0099')).rejects.toThrow(
      'The mail broker rejected the message.',
    );

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
      process.env.MAIL_TRANSPORT = 'microservice';
      setMicroserviceEnv();
      resetMailTransport();
      resetMicroserviceMailTransportState();
      mockConnect(createWorkingChannel());

      const service = new MailService();
      const adminEmail = 'admin-secret@example.org';

      await service.sendContactMessage({
        to: [adminEmail],
        subject: 'New contact submission',
        text: 'body',
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
    process.env.MAIL_TRANSPORT = 'microservice';
    setMicroserviceEnv();
    resetMailTransport();
    resetMicroserviceMailTransportState();
    mockConnect(createRejectingChannel());

    const service = new MailService();

    await expect(
      service.sendContactMessage({ to: ['admin@example.org'], subject: 's', text: 't' }),
    ).rejects.toThrow('The mail broker rejected the message.');

    const emitted = emittedText();
    expect(emitted).toContain('kind=contact');
    expect(emitted).toContain('status=failed');
  });
});
