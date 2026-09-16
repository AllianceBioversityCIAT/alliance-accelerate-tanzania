// @sdd-spec enhancement/email-notification-microservice (T-2)
// @sdd-spec enhancement/email-notification-microservice (T-4)
/**
 * `buildMicroserviceEnvelope` unit tests (design.md §4.2; FR-2, FR-4, DD-8) —
 * pure-function coverage only, no AMQP, no network, no mocked SDK.
 *
 * T-4 (below, same file so the `microservice-mail` test-path filter covers
 * both) adds the connection/publish lifecycle: `MicroserviceMailTransport`
 * against a hand-rolled `amqplib` mock (design.md §4.3, §4.4, DD-3, DD-4,
 * DD-5, DD-11), plus `mail-transport.factory.ts`'s exhaustive-switch guard
 * (the inherited constraint from T-3's review).
 */
import { EventEmitter } from 'events';
import * as amqp from 'amqplib';
import { Logger } from '@nestjs/common';
import * as mailConfigModule from './mail.config';
import { MailTransportKind } from './mail.config';
import { getMailTransport, resetMailTransport } from './mail-transport.factory';
import { SesMailTransport, resetSesClient } from './ses-mail.transport';
import { NoOpMailTransport } from './no-op-mail.transport';
import {
  MAIL_LOCK_WAIT_TIMEOUT_MS,
  MAIL_PROBE_TIMEOUT_MS,
  MAIL_SEND_TIMEOUT_MS,
} from './mail-timing';
import {
  buildMicroserviceEnvelope,
  MicroserviceEnvelopeConfig,
  MicroserviceMailConnectionError,
  MicroserviceMailLockTimeoutError,
  MicroserviceMailPublishError,
  MicroserviceMailQueueNotFoundError,
  MicroserviceMailTimeoutError,
  MicroserviceMailTransport,
  resetMicroserviceMailTransportState,
} from './microservice-mail.transport';
import { MailMessage } from './mail-transport.interface';

jest.mock('amqplib');

const config: MicroserviceEnvelopeConfig = {
  apiKey: 'test-api-key',
  senderAddress: 'registry@example.org',
  senderName: 'ACCELERATE Tanzania Seed Registry -',
};

describe('buildMicroserviceEnvelope (design.md §4.2)', () => {
  it('builds the exact envelope for a text-only message', () => {
    const message: MailMessage = {
      to: 'applicant@example.org',
      subject: 'Registration received — REG-2026-0007',
      text: 'Your reference is REG-2026-0007.',
    };

    expect(buildMicroserviceEnvelope(message, config)).toEqual({
      pattern: 'send',
      data: {
        apiKey: 'test-api-key',
        data: {
          from: {
            email: 'registry@example.org',
            name: 'ACCELERATE Tanzania Seed Registry -',
          },
          emailBody: {
            subject: 'Registration received — REG-2026-0007',
            to: ['applicant@example.org'],
            message: {
              text: 'Your reference is REG-2026-0007.',
            },
          },
        },
      },
    });
  });

  it('maps html to message.socketFile and keeps text as the fallback part', () => {
    const message: MailMessage = {
      to: 'applicant@example.org',
      subject: 'Registration received',
      text: 'Plain-text fallback.',
      html: '<p>Rich HTML body.</p>',
    };

    const envelope = buildMicroserviceEnvelope(message, config);

    expect(envelope.data.data.emailBody.message).toEqual({
      text: 'Plain-text fallback.',
      socketFile: '<p>Rich HTML body.</p>',
    });
  });

  it('sends both text and socketFile whenever the message carries HTML', () => {
    const message: MailMessage = {
      to: 'applicant@example.org',
      subject: 'Registration received',
      text: 'Plain-text fallback.',
      html: '<p>Rich HTML body.</p>',
    };

    const { message: builtMessage } = buildMicroserviceEnvelope(message, config).data.data
      .emailBody;

    expect(builtMessage.text).toBeDefined();
    expect(builtMessage.socketFile).toBeDefined();
    expect(Object.keys(builtMessage).sort()).toEqual(['socketFile', 'text']);
  });

  it('omits socketFile entirely for a text-only message — never a null placeholder', () => {
    const message: MailMessage = {
      to: 'applicant@example.org',
      subject: 'Registration received',
      text: 'Plain-text only.',
    };

    const { message: builtMessage } = buildMicroserviceEnvelope(message, config).data.data
      .emailBody;

    expect('socketFile' in builtMessage).toBe(false);
    expect(builtMessage.text).toBe('Plain-text only.');
  });

  it('never places HTML in message.text', () => {
    const message: MailMessage = {
      to: 'applicant@example.org',
      subject: 'Registration received',
      text: 'Plain-text fallback.',
      html: '<p>Rich HTML body.</p>',
    };

    const { message: builtMessage } = buildMicroserviceEnvelope(message, config).data.data
      .emailBody;

    expect(builtMessage.text).toBe('Plain-text fallback.');
    expect(builtMessage.text).not.toContain('<p>');
  });

  it('normalizes a single string `to` into a one-element array', () => {
    const message: MailMessage = {
      to: 'applicant@example.org',
      subject: 's',
      text: 't',
    };

    expect(buildMicroserviceEnvelope(message, config).data.data.emailBody.to).toEqual([
      'applicant@example.org',
    ]);
  });

  it('always sends `to` as an array, never a comma-joined string, for multiple recipients', () => {
    const message: MailMessage = {
      to: ['a@example.org', 'b@example.org'],
      subject: 's',
      text: 't',
    };

    const { to } = buildMicroserviceEnvelope(message, config).data.data.emailBody;

    expect(Array.isArray(to)).toBe(true);
    expect(to).toEqual(['a@example.org', 'b@example.org']);
  });

  it('trims whitespace from every address in `to` (DD-8)', () => {
    const message: MailMessage = {
      to: [' a@example.org ', 'b@example.org  ', '  c@example.org'],
      subject: 's',
      text: 't',
    };

    expect(buildMicroserviceEnvelope(message, config).data.data.emailBody.to).toEqual([
      'a@example.org',
      'b@example.org',
      'c@example.org',
    ]);
  });

  it('trims a single string `to` as well', () => {
    const message: MailMessage = {
      to: '  applicant@example.org  ',
      subject: 's',
      text: 't',
    };

    expect(buildMicroserviceEnvelope(message, config).data.data.emailBody.to).toEqual([
      'applicant@example.org',
    ]);
  });

  it('sends from.email and from.name as separate fields, never a "Name" <addr> composite', () => {
    const message: MailMessage = {
      to: 'applicant@example.org',
      subject: 's',
      text: 't',
    };

    const { from } = buildMicroserviceEnvelope(message, config).data.data;

    expect(from).toEqual({
      email: 'registry@example.org',
      name: 'ACCELERATE Tanzania Seed Registry -',
    });
    expect(from.email).not.toContain('<');
    expect(from.name).not.toContain('<');
  });

  it('carries the apiKey under data.apiKey, never inside data.data', () => {
    const message: MailMessage = {
      to: 'applicant@example.org',
      subject: 's',
      text: 't',
    };

    const envelope = buildMicroserviceEnvelope(message, config);

    expect(envelope.data.apiKey).toBe('test-api-key');
    expect(JSON.stringify(envelope.data.data)).not.toContain('test-api-key');
  });

  it('never includes an id property anywhere in the envelope', () => {
    const message: MailMessage = {
      to: 'applicant@example.org',
      subject: 's',
      text: 't',
      reference: 'REG-2026-0007',
    };

    const envelope = buildMicroserviceEnvelope(message, config);

    expect('id' in envelope).toBe(false);
    expect('id' in envelope.data).toBe(false);
    expect('id' in envelope.data.data).toBe(false);
    expect(JSON.stringify(envelope)).not.toContain('"id"');
  });

  it('sets pattern to the literal string "send"', () => {
    const message: MailMessage = {
      to: 'applicant@example.org',
      subject: 's',
      text: 't',
    };

    expect(buildMicroserviceEnvelope(message, config).pattern).toBe('send');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// T-4 — connection lifecycle. A hand-rolled `amqplib` mock, not
// `aws-sdk-client-mock` (this isn't an AWS SDK): each `amqp.connect()` call
// is scripted individually via `connectQueue`, so a test can make the
// FIRST physical connection behave differently from a later reconnect —
// exactly what the probe-timeout/reconnect and retry-once tests need.
// ─────────────────────────────────────────────────────────────────────────

type CheckQueueBehavior =
  | { kind: 'ok'; consumerCount?: number }
  | { kind: 'not-found' }
  | { kind: 'hang' };

type PublishBehavior =
  | { kind: 'ack' }
  | { kind: 'nack' }
  | { kind: 'return' }
  | { kind: 'hang' }
  | { kind: 'nack-after'; delayMs: number };

interface ChannelScript {
  /** `callIndex` is 0-based, per THIS physical connection — call 0 is
   * always `connectFresh`'s own `checkQueue`; call 1+ is a later probe. */
  checkQueue: (callIndex: number) => CheckQueueBehavior;
  publish: (callIndex: number) => PublishBehavior;
  /** Optional override for both `channel.close` and `model.close` —
   * defaults to an immediately-resolving mock. Issue 2 (T-4 rework): a
   * `close` that never resolves is how the "detaches cleanup" gate proves
   * teardown is genuinely detached rather than merely `.catch()`-guarded —
   * see the test below. */
  close?: () => Promise<void>;
}

function okScript(): ChannelScript {
  return { checkQueue: () => ({ kind: 'ok' }), publish: () => ({ kind: 'ack' }) };
}

/** Mirrors the `code: 404` property the real `amqplib` sets on a
 * `checkQueue` rejection for a queue that does not exist
 * (`lib/channel.js`'s `convertCloseFrameToError`) — including, like the
 * real library, the connection string inside `message`, so a test can
 * prove the transport never lets that substring escape. */
function makeNotFoundError(): Error & { code: number } {
  const err = new Error(
    'Operation failed: QueueDeclare; 404 (NOT-FOUND) with message "NOT_FOUND - no queue ' +
      '\'accelerate-tz-email\' in vhost \'/\' amqps://user:pass@broker.example.org:5671"',
  ) as Error & { code: number };
  err.code = 404;
  return err;
}

interface FakeChannel extends EventEmitter {
  checkQueue: jest.Mock;
  publish: jest.Mock;
  close: jest.Mock;
}

interface FakeChannelModel extends EventEmitter {
  createConfirmChannel: jest.Mock;
  close: jest.Mock;
}

function createFakeChannel(script: ChannelScript): FakeChannel {
  let checkQueueCalls = 0;
  let publishCalls = 0;
  const emitter = new EventEmitter() as FakeChannel;

  emitter.checkQueue = jest.fn((queueName: string) => {
    const behavior = script.checkQueue(checkQueueCalls++);
    if (behavior.kind === 'ok') {
      return Promise.resolve({
        queue: queueName,
        messageCount: 0,
        consumerCount: behavior.consumerCount ?? 1,
      });
    }
    if (behavior.kind === 'not-found') {
      return Promise.reject(makeNotFoundError());
    }
    // 'hang' — the half-open-socket case DD-11 exists for: never resolves.
    return new Promise(() => {});
  });

  emitter.publish = jest.fn(
    (
      _exchange: string,
      _routingKey: string,
      _content: Buffer,
      _options: amqp.Options.Publish | undefined,
      callback?: (err: unknown, ok: unknown) => void,
    ) => {
      const behavior = script.publish(publishCalls++);
      switch (behavior.kind) {
        case 'ack':
          callback?.(null, {});
          break;
        case 'nack':
          callback?.(new Error('NACK'), undefined);
          break;
        case 'return':
          // RabbitMQ delivers 'return' before/alongside the ack for an
          // unroutable mandatory message — the broker still acks it in
          // confirm mode (an ack means "the broker took responsibility",
          // not "it was routed").
          emitter.emit('return', {});
          callback?.(null, {});
          break;
        case 'nack-after':
          setTimeout(() => callback?.(new Error('late NACK'), undefined), behavior.delayMs);
          break;
        case 'hang':
          // Never invokes the callback.
          break;
      }
      return true;
    },
  );

  emitter.close = jest.fn(script.close ?? (() => Promise.resolve()));
  return emitter;
}

function createFakeChannelModel(channel: FakeChannel, script: ChannelScript): FakeChannelModel {
  const model = new EventEmitter() as FakeChannelModel;
  model.createConfirmChannel = jest.fn(() => Promise.resolve(channel));
  model.close = jest.fn(script.close ?? (() => Promise.resolve()));
  return model;
}

type ConnectOutcome =
  | { type: 'reject'; error: Error }
  | { type: 'ok'; script: ChannelScript }
  /** T-5 — mirrors `PublishBehavior`'s `'nack-after'`: the connect promise
   * settles (rejecting) only after `delayMs`, so a test can put a
   * credential-bearing rejection PAST the send deadline, i.e. exactly the
   * "promise orphaned by the deadline race" shape (design.md §4.4 path 3,
   * `raceAgainstDeadline`'s `promise.catch(() => {})` guard). */
  | { type: 'reject-after'; error: Error; delayMs: number };

function buildMessage(): MailMessage {
  return { to: 'applicant@example.org', subject: 'Subject', text: 'Body' };
}

/** T-5 — spies on every `Logger` instance method (`log`/`warn`/`error`/
 * `debug`/`verbose`), across BOTH `MicroserviceMailTransport`'s own logger
 * and any other `Logger` instance, since §4.4's gate is "no credential
 * substring reaches … any Logger call", not just `warn`. Returns an
 * `assertNoLeak` helper asserting none of the captured calls — across every
 * argument, not just the first — contain any of the given secrets, so the
 * gate is not defeated by a leak in a second/third `logger.warn(a, b, c)`
 * argument either. */
function spyOnAllLoggerLevels(): {
  spies: jest.SpyInstance[];
  assertNoLeak: (...secrets: string[]) => void;
  restore: () => void;
} {
  const levels = ['log', 'warn', 'error', 'debug', 'verbose'] as const;
  const spies = levels.map((level) =>
    jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
  );
  return {
    spies,
    assertNoLeak: (...secrets: string[]) => {
      const allLoggedText = spies
        .flatMap((spy) => spy.mock.calls)
        .flat()
        .map((arg) => String(arg))
        .join('\n');
      for (const secret of secrets) {
        expect(allLoggedText).not.toContain(secret);
      }
    },
    restore: () => {
      spies.forEach((spy) => spy.mockRestore());
    },
  };
}

/** Captures the rejection reason of a promise expected to reject, typed as
 * `Error` rather than `unknown | void` — `Promise<void>.catch()` cannot be
 * used for this directly since its resolved branch is `void`. */
async function captureRejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new Error('expected the promise to reject, but it resolved');
}

describe('MicroserviceMailTransport — connection lifecycle (design.md §4.3, §4.4, DD-3, DD-4, DD-5, DD-11)', () => {
  const ORIGINAL_ENV = { ...process.env };
  let connectMock: jest.MockedFunction<typeof amqp.connect>;
  let connectQueue: ConnectOutcome[];
  let connections: Array<{ model: FakeChannelModel; channel: FakeChannel }>;
  let transport: MicroserviceMailTransport;

  beforeEach(() => {
    jest.useFakeTimers();
    process.env = { ...ORIGINAL_ENV };
    process.env.RABBITMQ_URL = 'amqps://user:pass@broker.example.org:5671';
    process.env.EMAIL_QUEUE_NAME = 'accelerate-tz-email';
    process.env.MICROSERVICE_API_KEY = 'clarisa-key-123';
    process.env.EMAIL_SENDER = 'registry@example.org';
    resetMicroserviceMailTransportState();

    connections = [];
    connectQueue = [];
    connectMock = amqp.connect as jest.MockedFunction<typeof amqp.connect>;
    connectMock.mockReset();
    connectMock.mockImplementation(() => {
      const outcome = connectQueue.shift() ?? { type: 'ok' as const, script: okScript() };
      if (outcome.type === 'reject') {
        return Promise.reject(outcome.error);
      }
      if (outcome.type === 'reject-after') {
        return new Promise((_, reject) => {
          setTimeout(() => reject(outcome.error), outcome.delayMs);
        });
      }
      const channel = createFakeChannel(outcome.script);
      const model = createFakeChannelModel(channel, outcome.script);
      connections.push({ model, channel });
      return Promise.resolve(model as unknown as amqp.ChannelModel);
    });

    transport = new MicroserviceMailTransport();
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = { ...ORIGINAL_ENV };
    resetMicroserviceMailTransportState();
  });

  it('publishes on the default exchange, using the queue name as the routing key, persistent and mandatory (FR-1)', async () => {
    connectQueue = [{ type: 'ok', script: okScript() }];

    await transport.send(buildMessage());

    expect(connections[0].channel.publish).toHaveBeenCalledTimes(1);
    const [exchange, routingKey, , options] = connections[0].channel.publish.mock.calls[0];
    expect(exchange).toBe('');
    expect(routingKey).toBe('accelerate-tz-email');
    expect(options).toMatchObject({ persistent: true, mandatory: true });
  });

  it('never declares, creates, or modifies the queue — only checkQueue is used (FR-1 BUT, DD-3)', async () => {
    connectQueue = [{ type: 'ok', script: okScript() }];

    // A-2 (T-4 rework): the previous version of this test asserted
    // `expect(channel.assertQueue).toBeUndefined()`, which is a fact about
    // `FakeChannel` — it never defines that method, regardless of what the
    // transport calls — not a fact about the transport under test. The
    // real guarantee comes from `FakeChannel`'s deliberately minimal
    // surface (`checkQueue`/`publish`/`close` only, matching every real
    // `ConfirmChannel` call this file makes): a hypothetical
    // `channel.assertQueue(...)` call in the transport would hit
    // `undefined(...)`, throw a `TypeError`, and reject this very `send()`.
    // It is the `resolves` assertion below that proves the transport never
    // calls it — not a property read off the mock.
    await expect(transport.send(buildMessage())).resolves.toBeUndefined();

    expect(connections[0].channel.checkQueue).toHaveBeenCalledWith('accelerate-tz-email');
  });

  it('reuses a healthy cached connection — a second send does not reconnect (NFR-2)', async () => {
    connectQueue = [{ type: 'ok', script: okScript() }];

    await transport.send(buildMessage());
    await transport.send(buildMessage());

    expect(connectMock).toHaveBeenCalledTimes(1);
    // The second send still probes the cached channel (DD-11): one
    // checkQueue at connect-time, one more as the probe.
    expect(connections[0].channel.checkQueue).toHaveBeenCalledTimes(2);
  });

  it(
    'cuts a hanging probe at MAIL_PROBE_TIMEOUT_MS, reconnects once, and still publishes within the ' +
      'overall deadline — mutation (a): removing the probe sub-deadline reddens this',
    async () => {
      connectQueue = [
        {
          type: 'ok',
          script: {
            // Call 0 is connectFresh's own verify — must succeed so the
            // first send establishes a cached pair at all. Call 1+ is the
            // probe on the SECOND send — simulates a half-open socket.
            checkQueue: (i) => (i === 0 ? { kind: 'ok' } : { kind: 'hang' }),
            publish: () => ({ kind: 'ack' }),
          },
        },
        { type: 'ok', script: okScript() }, // the reconnect
      ];

      await transport.send(buildMessage());
      expect(connectMock).toHaveBeenCalledTimes(1);
      // Baseline after the FIRST send's own, successful publish — A-6
      // measures the SECOND send's publish counts against this, not
      // against zero, since `connections[0].channel.publish` already has
      // one legitimate call from message #1.
      const staleConnectionPublishCallsBeforeSecondSend =
        connections[0].channel.publish.mock.calls.length;
      expect(staleConnectionPublishCallsBeforeSecondSend).toBe(1);

      const second = transport.send(buildMessage());
      const settled = jest.fn();
      second.then(settled, settled);

      // Still short of the probe's own sub-deadline: must not have given
      // up yet (proves the probe's bound is what fires, not something
      // shorter).
      await jest.advanceTimersByTimeAsync(MAIL_PROBE_TIMEOUT_MS - 10);
      expect(settled).not.toHaveBeenCalled();

      // Past the probe's sub-deadline, but nowhere near the overall send
      // deadline: the transport must already have reconnected and
      // published, not still be waiting on the hung probe.
      await jest.advanceTimersByTimeAsync(20);
      expect(connectMock).toHaveBeenCalledTimes(2);
      await expect(second).resolves.toBeUndefined();
      expect(settled).toHaveBeenCalled();

      // A-6 (T-4 rework): NFR-2's measure is "one reconnect and then
      // EXACTLY one publish" — the reconnect alone was asserted above, but
      // nothing previously pinned the publish counts. The stale connection
      // must not have been published on again (the probe failed before
      // `sendLocked` ever reached step 3 on it); the fresh one must have
      // published exactly once.
      expect(connections[0].channel.publish).toHaveBeenCalledTimes(
        staleConnectionPublishCallsBeforeSecondSend,
      );
      expect(connections[1].channel.publish).toHaveBeenCalledTimes(1);
    },
  );

  it('a probe returning NOT_FOUND throws a configuration error immediately, without reconnecting (DD-11)', async () => {
    connectQueue = [
      {
        type: 'ok',
        script: {
          checkQueue: (i) => (i === 0 ? { kind: 'ok' } : { kind: 'not-found' }),
          publish: () => ({ kind: 'ack' }),
        },
      },
    ];

    await transport.send(buildMessage());
    expect(connectMock).toHaveBeenCalledTimes(1);

    await expect(transport.send(buildMessage())).rejects.toBeInstanceOf(
      MicroserviceMailQueueNotFoundError,
    );
    // Never reconnected for a NOT_FOUND — it is a configuration error, not
    // a stale connection (DD-11's central distinction).
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('a fresh connect returning NOT_FOUND throws a configuration error without retrying (DD-3, DD-11)', async () => {
    connectQueue = [
      {
        type: 'ok',
        script: { checkQueue: () => ({ kind: 'not-found' }), publish: () => ({ kind: 'ack' }) },
      },
    ];

    await expect(transport.send(buildMessage())).rejects.toBeInstanceOf(
      MicroserviceMailQueueNotFoundError,
    );
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('retries the connection at most once after a non-configuration connect failure, then succeeds (DD-4)', async () => {
    connectQueue = [
      { type: 'reject', error: new Error('connect ECONNREFUSED amqps://user:pass@broker') },
      { type: 'ok', script: okScript() },
    ];

    await expect(transport.send(buildMessage())).resolves.toBeUndefined();
    expect(connectMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after exactly one retry — a second connect failure is not retried again (DD-4 "at most once")', async () => {
    connectQueue = [
      { type: 'reject', error: new Error('connect ECONNREFUSED amqps://user:pass@broker') },
      { type: 'reject', error: new Error('connect ECONNREFUSED amqps://user:pass@broker') },
    ];

    await expect(transport.send(buildMessage())).rejects.toBeInstanceOf(
      MicroserviceMailConnectionError,
    );
    expect(connectMock).toHaveBeenCalledTimes(2);
  });

  it(
    'never republishes after a publish-phase (nack) failure — exactly one publish call — ' +
      'mutation (c): making step 5 retry reddens this',
    async () => {
      connectQueue = [
        { type: 'ok', script: { checkQueue: () => ({ kind: 'ok' }), publish: () => ({ kind: 'nack' }) } },
      ];

      await expect(transport.send(buildMessage())).rejects.toBeInstanceOf(
        MicroserviceMailPublishError,
      );
      expect(connections[0].channel.publish).toHaveBeenCalledTimes(1);
      // T-4 review (B-1), closed here: teardown must actually HAPPEN on a
      // publish-phase failure, not just be "not awaited" (the detached-
      // cleanup test below gates that half). Deleting
      // `void entry.model.close().catch(...)` outright previously left
      // every test in this file green — this is the socket/heartbeat-leak
      // half of NFR-1.
      expect(connections[0].model.close).toHaveBeenCalledTimes(1);
    },
  );

  it('a returned (unroutable) mandatory message fails the send, even though the broker still acks it (DD-3)', async () => {
    connectQueue = [
      { type: 'ok', script: { checkQueue: () => ({ kind: 'ok' }), publish: () => ({ kind: 'return' }) } },
    ];

    await expect(transport.send(buildMessage())).rejects.toThrow(/unroutable/);
    expect(connections[0].channel.publish).toHaveBeenCalledTimes(1);
  });

  it('a step-3 (publish-phase) failure invalidates the connection — the NEXT send reconnects (§4.3 step 5)', async () => {
    connectQueue = [
      { type: 'ok', script: { checkQueue: () => ({ kind: 'ok' }), publish: () => ({ kind: 'nack' }) } },
      { type: 'ok', script: okScript() },
    ];

    await expect(transport.send(buildMessage())).rejects.toBeInstanceOf(MicroserviceMailPublishError);
    expect(connectMock).toHaveBeenCalledTimes(1);

    await expect(transport.send(buildMessage())).resolves.toBeUndefined();
    expect(connectMock).toHaveBeenCalledTimes(2);
  });

  it('logs consumerCount === 0 as a warning — a signal, never a failure (D-J′)', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      connectQueue = [
        {
          type: 'ok',
          script: {
            checkQueue: () => ({ kind: 'ok', consumerCount: 0 }),
            publish: () => ({ kind: 'ack' }),
          },
        },
      ];

      await expect(transport.send(buildMessage())).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalled();
      const sawConsumerWarning = warnSpy.mock.calls.some((args) => /consumer/i.test(String(args[0])));
      expect(sawConsumerWarning).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it(
    'releases the mutex when the send deadline fires, so a subsequent send is not stuck behind it, ' +
      'and invalidates the wedged pair so the next send reconnects instead of reusing it — ' +
      "mutation (b): removing the `finally` reddens the mutex half; mutation: removing send()'s " +
      "deadline invalidation (`if (err instanceof MicroserviceMailTimeoutError && cached) { … }`) " +
      'reddens the reconnect half',
    async () => {
      connectQueue = [
        { type: 'ok', script: { checkQueue: () => ({ kind: 'ok' }), publish: () => ({ kind: 'hang' }) } },
        { type: 'ok', script: okScript() },
      ];

      const first = transport.send(buildMessage());
      // Attach the rejection handler BEFORE advancing timers — a promise
      // that rejects with no handler attached yet, even briefly, can trip
      // Node's unhandled-rejection detection under fake timers and get
      // misattributed to a later assertion in this same test.
      const firstOutcome = expect(first).rejects.toBeInstanceOf(MicroserviceMailTimeoutError);
      await jest.advanceTimersByTimeAsync(MAIL_SEND_TIMEOUT_MS);
      await firstOutcome;

      // T-4 rework (reviewer issue 1): this test used to hand-emit
      // `connections[0].model.emit('close')` here, with a comment
      // explaining that without it the pair "is still cached and reported
      // healthy — reusing it would just hang again". That was the
      // Implementer's own observation of a real defect, worked around in
      // the fixture instead of fixed in the transport. `send()`'s catch
      // now invalidates `cached` itself on a `MicroserviceMailTimeoutError`
      // (design.md §4.3 step 5), so NO manual event is emitted here — the
      // second send below reconnects on its own, and `connectQueue`'s
      // second entry (queued at the top of this test) is what it consumes.
      const second = transport.send(buildMessage());
      const settled = jest.fn();
      second.then(settled, settled);

      // Advance well short of MAIL_LOCK_WAIT_TIMEOUT_MS — if the lock was
      // properly released AND the wedged pair was invalidated, `second`
      // needs no timer budget to complete: it goes straight to a fresh
      // `connectWithRetry`, which this mock resolves on the same tick.
      await jest.advanceTimersByTimeAsync(MAIL_LOCK_WAIT_TIMEOUT_MS - 10);
      expect(settled).toHaveBeenCalled();
      await expect(second).resolves.toBeUndefined();
      // The gate itself (was the compensation above): the second send
      // reconnected rather than reusing connections[0] — proof `cached`
      // was actually cleared, not merely that the mutex was released.
      expect(connectMock).toHaveBeenCalledTimes(2);
    },
  );

  it('a send that cannot acquire the lock in time fails without ever touching the broker (DD-11)', async () => {
    connectQueue = [
      { type: 'ok', script: { checkQueue: () => ({ kind: 'ok' }), publish: () => ({ kind: 'hang' }) } },
    ];

    const first = transport.send(buildMessage());
    const firstOutcome = expect(first).rejects.toBeInstanceOf(MicroserviceMailTimeoutError);
    await jest.advanceTimersByTimeAsync(0); // let the first send acquire the lock and start
    expect(connectMock).toHaveBeenCalledTimes(1);

    const second = transport.send(buildMessage());
    const secondOutcome = expect(second).rejects.toBeInstanceOf(MicroserviceMailLockTimeoutError);
    await jest.advanceTimersByTimeAsync(MAIL_LOCK_WAIT_TIMEOUT_MS);
    await secondOutcome;
    // The second send never touched the broker at all.
    expect(connectMock).toHaveBeenCalledTimes(1);

    // Clean up the still-pending first send so it doesn't leak into
    // another test.
    await jest.advanceTimersByTimeAsync(MAIL_SEND_TIMEOUT_MS);
    await firstOutcome;
  });

  it('the overall MAIL_SEND_TIMEOUT_MS deadline fires even when the hang happens during connect', async () => {
    connectMock.mockImplementation(() => new Promise(() => {})); // hangs forever — no cached pair yet

    const send = transport.send(buildMessage());
    const outcome = expect(send).rejects.toBeInstanceOf(MicroserviceMailTimeoutError);
    await jest.advanceTimersByTimeAsync(MAIL_SEND_TIMEOUT_MS);
    await outcome;
  });

  it('does not produce an unhandled rejection when the orphaned promise rejects after losing the deadline race', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      connectQueue = [
        {
          type: 'ok',
          script: {
            checkQueue: () => ({ kind: 'ok' }),
            publish: () => ({ kind: 'nack-after', delayMs: MAIL_SEND_TIMEOUT_MS + 200 }),
          },
        },
      ];

      const send = transport.send(buildMessage());
      const outcome = expect(send).rejects.toBeInstanceOf(MicroserviceMailTimeoutError);
      await jest.advanceTimersByTimeAsync(MAIL_SEND_TIMEOUT_MS);
      await outcome;

      // Let the orphaned publish promise actually settle (reject), late.
      await jest.advanceTimersByTimeAsync(300);
      await Promise.resolve();
      await Promise.resolve();

      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it(
    'PATH 1 (sync throw/rejection, design.md §4.4) — never lets a raw amqplib error escape: the ' +
      "thrown error's name and message are credential-free, and nothing reaches any Logger call " +
      "either — mutation: making sanitizeEscapingError a passthrough (`return err`) reddens both halves",
    async () => {
      const loggerSpy = spyOnAllLoggerLevels();
      try {
        connectQueue = [
          {
            type: 'reject',
            error: new Error(
              'connect ECONNREFUSED amqps://produser:sup3rSecr3t@broker.example.org:5671',
            ),
          },
          {
            type: 'reject',
            error: new Error(
              'connect ECONNREFUSED amqps://produser:sup3rSecr3t@broker.example.org:5671',
            ),
          },
        ];

        const err = await captureRejection(transport.send(buildMessage()));

        expect(err).toBeInstanceOf(MicroserviceMailConnectionError);
        expect(err.name).not.toContain('sup3rSecr3t');
        expect(err.message).not.toContain('sup3rSecr3t');
        expect(err.message).not.toContain('amqps://');
        expect((err as Error & { cause?: unknown }).cause).toBeUndefined();
        loggerSpy.assertNoLeak('sup3rSecr3t', 'amqps://produser');
      } finally {
        loggerSpy.restore();
      }
    },
  );

  it('a NOT_FOUND configuration error never contains the broker URL or credentials either', async () => {
    connectQueue = [
      { type: 'ok', script: { checkQueue: () => ({ kind: 'not-found' }), publish: () => ({ kind: 'ack' }) } },
    ];

    const err = await captureRejection(transport.send(buildMessage()));

    expect(err).toBeInstanceOf(MicroserviceMailQueueNotFoundError);
    expect(err.message).not.toContain('amqps://');
    expect(err.message).not.toContain('user:pass');
  });

  it(
    "detaches cleanup — a close() that never resolves must not delay the send's rejection past the " +
      'publish failure itself (design.md §10 "detaches cleanup" row; requirements.md NFR-1; ' +
      'tasks.md T-4 Done-when) — mutation: replacing `detachTeardown`\'s `void entry.model.close()' +
      ".catch(...)` with `await entry.model.close()` reddens this by hanging the test past its timeout",
    async () => {
      connectQueue = [
        {
          type: 'ok',
          script: {
            checkQueue: () => ({ kind: 'ok' }),
            publish: () => ({ kind: 'nack' }),
            // Never resolves — if teardown awaited this, the send would
            // hang forever rather than reject.
            close: () => new Promise(() => {}),
          },
        },
      ];

      const send = transport.send(buildMessage());
      const outcome = expect(send).rejects.toBeInstanceOf(MicroserviceMailPublishError);

      // Deliberately NO jest.advanceTimersByTimeAsync call: a nack settles
      // synchronously via the publish callback, so a truly detached
      // teardown lets this rejection resolve on plain microtasks, well
      // before MAIL_SEND_TIMEOUT_MS's timer would ever need to fire. If
      // `close()` were awaited inside the deadline instead, this `await`
      // would hang for real wall-clock time (fake timers do not advance on
      // their own) until Jest's own test timeout fails the test — that is
      // the mutation signal, not a shorter assertion window.
      await outcome;
    },
  );

  it(
    'opens the connection with the heartbeat encoded in the URL query string — amqplib reads ' +
      "heartbeat only from the connect URL's query string, never from a separate options argument " +
      '(design.md §4.3 "Heartbeat"; §12.2b) — mutation: refactoring to `connect(url, { heartbeat })` ' +
      'reddens this while every other test in this file stays green',
    async () => {
      connectQueue = [{ type: 'ok', script: okScript() }];

      await transport.send(buildMessage());

      expect(connectMock).toHaveBeenCalledTimes(1);
      const [calledUrl] = connectMock.mock.calls[0];
      const parsed = new URL(String(calledUrl));
      expect(parsed.searchParams.get('heartbeat')).toBe('30');
      // And the rest of the URL is untouched — scheme, credentials, host,
      // vhost all survive `withHeartbeat` unchanged. (`amqps:` is a
      // non-special WHATWG scheme, so `.origin` is the opaque string
      // "null" here — asserting `.protocol`/`.host` directly instead.)
      expect(parsed.protocol).toBe('amqps:');
      expect(parsed.host).toBe('broker.example.org:5671');
      expect(parsed.username).toBe('user');
      expect(parsed.password).toBe('pass');
    },
  );

  // ───────────────────────────────────────────────────────────────────────
  // T-5 — the two paths T-4's review left ungated (advisory A-7).
  // design.md §4.4's table has three closures; the sync-throw one above
  // (T-4) already had a spot-check. These two did not have ANY test
  // exercising the `'error'`/`'close'` listeners or the orphaned-promise
  // guard emitting a credential-bearing error — they were established "by
  // reading only". T-9's cache-integrity residual (an orphaned continuation
  // overwriting `cached` on a deadline-during-connect race) is explicitly
  // OUT of scope here — these tests assert only that no credential
  // substring escapes, never anything about which connection ends up
  // cached.
  // ───────────────────────────────────────────────────────────────────────

  it(
    "PATH 2 (design.md §4.4) — a credential-bearing 'error' event emitted on the CONNECTION between " +
      'invocations is sanitized before it reaches the Logger, and never rethrown — mutation: changing ' +
      "attachHealthListeners's `logger.warn(...)` to interpolate the raw `(err as Error).message` " +
      'instead of `sanitizeEscapingError(err).message` reddens this',
    async () => {
      const loggerSpy = spyOnAllLoggerLevels();
      try {
        connectQueue = [{ type: 'ok', script: okScript() }];
        await transport.send(buildMessage());
        expect(connections[0]).toBeDefined();

        // Simulates exactly the freeze/thaw hazard §4.3/§4.4 exist for:
        // the broker (or a proxy in front of it) tears the socket down
        // between invocations and amqplib surfaces that as an 'error'
        // event carrying the connection string, the way real amqplib
        // errors do (see makeNotFoundError above for the same shape).
        const credentialBearingError = new Error(
          'read ECONNRESET amqps://produser:sup3rSecr3t@broker.example.org:5671',
        );
        connections[0].model.emit('error', credentialBearingError);

        // Node throws an unhandled exception for an 'error' event with no
        // listener — the mere fact this line is reached at all (rather
        // than the test process crashing) is part of what DD-5's listener
        // requirement proves, alongside the content assertion below.
        loggerSpy.assertNoLeak('sup3rSecr3t', 'amqps://produser');
        expect(loggerSpy.spies.some((spy) => spy.mock.calls.length > 0)).toBe(true);

        // And the listener did its OTHER job (healthy = false): the next
        // send reconnects rather than reusing a connection the broker
        // already tore down — proof this is the real DD-5 listener, not a
        // spy on a no-op.
        connectQueue = [{ type: 'ok', script: okScript() }];
        await transport.send(buildMessage());
        expect(connectMock).toHaveBeenCalledTimes(2);
      } finally {
        loggerSpy.restore();
      }
    },
  );

  it(
    "PATH 2 (design.md §4.4) — a credential-bearing 'error' event emitted on the CONFIRM CHANNEL " +
      'between invocations is sanitized the same way as the connection-level case above',
    async () => {
      const loggerSpy = spyOnAllLoggerLevels();
      try {
        connectQueue = [{ type: 'ok', script: okScript() }];
        await transport.send(buildMessage());
        expect(connections[0]).toBeDefined();

        const credentialBearingError = new Error(
          'channel error: amqps://produser:sup3rSecr3t@broker.example.org:5671 closed unexpectedly',
        );
        connections[0].channel.emit('error', credentialBearingError);

        loggerSpy.assertNoLeak('sup3rSecr3t', 'amqps://produser');
        expect(loggerSpy.spies.some((spy) => spy.mock.calls.length > 0)).toBe(true);
      } finally {
        loggerSpy.restore();
      }
    },
  );

  it(
    "PATH 2 (design.md §4.4) — a 'close' event (no error object; amqplib's own shape) carries no " +
      'credential to begin with, and still marks the pair unhealthy so the next send reconnects',
    async () => {
      connectQueue = [{ type: 'ok', script: okScript() }];
      await transport.send(buildMessage());

      connections[0].model.emit('close');

      connectQueue = [{ type: 'ok', script: okScript() }];
      await transport.send(buildMessage());
      expect(connectMock).toHaveBeenCalledTimes(2);
    },
  );

  it(
    'PATH 3 (design.md §4.4) — a credential-bearing rejection from the promise orphaned by the ' +
      'deadline race never reaches an unhandledRejection and never reaches any Logger call — ' +
      "mutation: changing raceAgainstDeadline's `promise.catch(() => {})` guard to log the raw " +
      'rejection reddens this, PROVIDED connectWithRetry is also changed to rethrow the raw error ' +
      'rather than wrap it (its own catches otherwise convert to a fixed-message typed error first, ' +
      'so the credential is no longer live by the time the orphaned catch runs) — see the reporting ' +
      'section for the exact non-sanitizing patch exercised',
    async () => {
      const loggerSpy = spyOnAllLoggerLevels();
      const unhandled = jest.fn();
      process.on('unhandledRejection', unhandled);
      try {
        // The FIRST physical connect attempt hangs past the overall send
        // deadline, then rejects — late — with a raw, credential-bearing
        // amqplib-shaped error. `raceAgainstDeadline` has already declared
        // the deadline the winner by the time this settles: this IS "the
        // promise orphaned by the deadline race" (design.md §4.4 path 3).
        // DD-4's single retry (still running in the background, on the
        // orphaned promise) MUST also fail here — queuing only one
        // failure lets the retry succeed against the default `okScript()`
        // fallback and the orphaned promise resolves instead of rejecting,
        // which would make this test pass VACUOUSLY (nothing to leak,
        // because nothing rejects) rather than because sanitization held.
        connectQueue = [
          {
            type: 'reject-after',
            delayMs: MAIL_SEND_TIMEOUT_MS + 200,
            error: new Error(
              'connect ECONNREFUSED amqps://produser:sup3rSecr3t@broker.example.org:5671',
            ),
          },
          {
            type: 'reject',
            error: new Error(
              'connect ECONNREFUSED amqps://produser:sup3rSecr3t@broker.example.org:5671',
            ),
          },
        ];

        const send = transport.send(buildMessage());
        const outcome = expect(send).rejects.toBeInstanceOf(MicroserviceMailTimeoutError);
        await jest.advanceTimersByTimeAsync(MAIL_SEND_TIMEOUT_MS);
        await outcome;

        // Let the orphaned connect promise actually settle (reject) late —
        // the moment the raw credential-bearing error exists as a live
        // rejection value with nobody but the `.catch()` guard listening.
        // The retry attempt this triggers also fails (the second queued
        // entry, consumed synchronously off the back of the first
        // rejection), so the orphaned promise itself rejects too.
        await jest.advanceTimersByTimeAsync(300);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(unhandled).not.toHaveBeenCalled();
        loggerSpy.assertNoLeak('sup3rSecr3t', 'amqps://produser');
      } finally {
        process.off('unhandledRejection', unhandled);
        loggerSpy.restore();
      }
    },
  );
});

describe('getMailTransport — exhaustive switch (mail-transport.factory.ts; inherited constraint from T-3\'s review)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    resetMailTransport();
    resetSesClient();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
    resetMailTransport();
  });

  it(
    'throws for a kind added to the union with no switch arm, rather than silently falling back to ' +
      'no-op — mutation (d): the mutation this constraint is written to catch',
    () => {
      jest
        .spyOn(mailConfigModule, 'getMailTransportKind')
        .mockReturnValue('legacy-smtp' as unknown as MailTransportKind);

      expect(() => getMailTransport()).toThrow(/legacy-smtp/);
      // And, just as important as the throw itself: it must not have
      // silently cached a NoOpMailTransport behind that throw — the exact
      // "every request 202, zero emails, no signal anywhere" shape (D-J)
      // this constraint exists to close.
      expect(() => getMailTransport()).toThrow(); // still throws — nothing was cached
    },
  );

  it('resolves "microservice" to MicroserviceMailTransport', () => {
    process.env.MAIL_TRANSPORT = 'microservice';
    process.env.RABBITMQ_URL = 'amqps://user:pass@broker.example.org:5671';
    process.env.EMAIL_QUEUE_NAME = 'accelerate-tz-email';
    process.env.MICROSERVICE_API_KEY = 'clarisa-key-123';
    process.env.EMAIL_SENDER = 'registry@example.org';

    expect(getMailTransport()).toBeInstanceOf(MicroserviceMailTransport);
  });

  it('still resolves "ses" and "no-op" correctly (the switch is exhaustive, not narrowed)', () => {
    process.env.MAIL_TRANSPORT = 'no-op';
    expect(getMailTransport()).toBeInstanceOf(NoOpMailTransport);

    resetMailTransport();
    process.env.MAIL_TRANSPORT = 'ses';
    process.env.MAIL_SENDER_ADDRESS = 'registry@example.org';
    process.env.AWS_REGION = 'eu-west-1';
    expect(getMailTransport()).toBeInstanceOf(SesMailTransport);
  });
});
