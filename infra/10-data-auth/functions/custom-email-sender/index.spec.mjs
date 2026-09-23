// T-4 (docs/specs/auth/forgot-password-delivery, tasks.md T-4) — the three
// named falsifiers, the NFR-1 log assertions (with anti-vacuity guards),
// and the envelope-shape pin DD-3a requires.
//
// Every AWS client is mocked here (`@aws-crypto/client-node`, `amqplib`,
// `@aws-sdk/client-secrets-manager`) — that is this suite's DISQUALIFIER,
// stated in tasks.md and restated at the point it matters: mocking decrypt
// proves the call shape, never that the key, the grant, and a real
// ciphertext agree. A green run here is compatible with a function that
// cannot decrypt a single real Cognito code. T-7's manual DEV check is the
// only thing that closes that gap.
//
// ESM mocking: this package has no babel/ts-jest transform (jest.config.mjs
// — plain ESM under --experimental-vm-modules), so modules are mocked with
// `jest.unstable_mockModule` BEFORE the module under test is imported via a
// dynamic `import()` in `beforeAll`, per Jest's own documented pattern for
// this mode.

import { jest } from '@jest/globals';

const decryptMock = jest.fn();
const kmsKeyringCtorMock = jest.fn();

jest.unstable_mockModule('@aws-crypto/client-node', () => ({
  buildClient: () => ({ decrypt: decryptMock, encrypt: jest.fn() }),
  KmsKeyringNode: kmsKeyringCtorMock,
  CommitmentPolicy: { REQUIRE_ENCRYPT_ALLOW_DECRYPT: 'REQUIRE_ENCRYPT_ALLOW_DECRYPT' },
}));

const publishMock = jest.fn((_exchange, _queue, _content, _opts, cb) => cb(null));
const createConfirmChannelMock = jest.fn(async () => ({ publish: publishMock }));
const connectionCloseMock = jest.fn(async () => {});
const connectMock = jest.fn(async () => ({
  createConfirmChannel: createConfirmChannelMock,
  close: connectionCloseMock,
}));

jest.unstable_mockModule('amqplib', () => ({
  connect: connectMock,
}));

const secretsSendMock = jest.fn();
const secretsManagerCtorMock = jest.fn().mockImplementation(() => ({ send: secretsSendMock }));
const getSecretValueCommandMock = jest.fn((input) => ({ input }));

jest.unstable_mockModule('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: secretsManagerCtorMock,
  GetSecretValueCommand: getSecretValueCommandMock,
}));

let handler;

beforeAll(async () => {
  ({ handler } = await import('./index.mjs'));
});

const ENV_KEYS = [
  'CUSTOM_EMAIL_SENDER_KEY_ARN',
  'BACKEND_STACK_NAME',
  'PUBLIC_APP_BASE_URL',
  'EMAIL_SENDER',
  'EMAIL_SENDER_NAME',
];
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function resetEnv() {
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ORIGINAL_ENV[key];
    }
  }
}

const KEY_ARN = 'arn:aws:kms:eu-west-1:111111111111:key/00000000-0000-0000-0000-000000000000';
const SECRET = {
  rabbitmqUrl: 'amqp://broker-user:broker-pass@broker.example.com:5672',
  apiKey: 'test-microservice-api-key',
  queueName: 'test-mail-queue',
};

function forgotPasswordEvent(overrides = {}) {
  return {
    version: '1',
    triggerSource: 'CustomEmailSender_ForgotPassword',
    region: 'eu-west-1',
    userPoolId: 'eu-west-1_TESTPOOL',
    userName: '3f29c1de-7b1a-4e11-9c2a-0123456789ab', // Cognito Username is a UUID in this pool
    callerContext: { awsSdkVersion: 'aws-sdk-unused-test-value', clientId: 'test-client' },
    request: {
      type: 'customEmailSenderRequestV1',
      code: Buffer.from('opaque-ciphertext').toString('base64'),
      userAttributes: {
        sub: '3f29c1de-7b1a-4e11-9c2a-0123456789ab',
        email: 'user@example.org',
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  resetEnv();
  jest.clearAllMocks();

  process.env.CUSTOM_EMAIL_SENDER_KEY_ARN = KEY_ARN;
  process.env.BACKEND_STACK_NAME = 'accelerate-tz-dev-backend';
  process.env.EMAIL_SENDER = 'AccelerateTZ-No-reply@cgiar.org';
  process.env.PUBLIC_APP_BASE_URL = 'https://example.cloudfront.net';

  decryptMock.mockResolvedValue({
    plaintext: Buffer.from('482913', 'utf-8'),
    messageHeader: {},
  });
  secretsSendMock.mockResolvedValue({ SecretString: JSON.stringify(SECRET) });
  publishMock.mockImplementation((_exchange, _queue, _content, _opts, cb) => cb(null));
  connectMock.mockImplementation(async () => ({
    createConfirmChannel: createConfirmChannelMock,
    close: connectionCloseMock,
  }));
  createConfirmChannelMock.mockImplementation(async () => ({ publish: publishMock }));
});

afterEach(() => {
  resetEnv();
});

// ---------------------------------------------------------------------------
// FALSIFIER 1 (tasks.md T-4) — "Make the recipient validation accept
// anything, then feed it a UUID → a test must redden." This IS that test:
// replacing `isEmailShaped`'s regex check with `() => true` reddens it,
// because the UUID would then be published as the recipient instead of
// refused.
// ---------------------------------------------------------------------------
describe('FALSIFIER 1 — recipient validation never substitutes another identifier (FR-1 s2 BUT it must NOT)', () => {
  it('refuses to publish when userAttributes.email is a UUID (Cognito Username), not an address', async () => {
    const event = forgotPasswordEvent({
      request: {
        type: 'customEmailSenderRequestV1',
        code: Buffer.from('opaque-ciphertext').toString('base64'),
        userAttributes: {
          sub: '3f29c1de-7b1a-4e11-9c2a-0123456789ab',
          email: '3f29c1de-7b1a-4e11-9c2a-0123456789ab', // a UUID, not an address
        },
      },
    });

    await expect(handler(event)).rejects.toThrow(/no usable recipient email attribute/);
    expect(publishMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// FALSIFIER 2 — "Feed an unhandled triggerSource → the function must raise
// and the raise must name the source. Make it return normally instead → a
// test must redden."
// ---------------------------------------------------------------------------
describe('FALSIFIER 2 — an unhandled triggerSource raises, names the source, and never returns normally (FR-2)', () => {
  it.each([
    'CustomEmailSender_SignUp',
    'CustomEmailSender_Authentication',
    'CustomEmailSender_ResendCode',
    'CustomEmailSender_AccountTakeOverNotification',
    'CustomEmailSender_UpdateUserAttribute',
    'SomeFutureTriggerSourceNobodyHasSeenYet',
  ])('raises and names "%s"', async (triggerSource) => {
    const event = forgotPasswordEvent({ triggerSource });
    await expect(handler(event)).rejects.toThrow(
      new RegExp(`unhandled triggerSource "${triggerSource}"`),
    );
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('still attempts to decrypt an unhandled source that carries a code, before raising (mirrors AWS\'s own reference example)', async () => {
    const event = forgotPasswordEvent({ triggerSource: 'CustomEmailSender_SignUp' });
    await expect(handler(event)).rejects.toThrow(/unhandled triggerSource/);
    expect(decryptMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// FALSIFIER 3 — "Feed a handled source whose event carries no email
// attribute → it must refuse to publish. Make it publish anyway → a test
// must redden."
// ---------------------------------------------------------------------------
describe('FALSIFIER 3 — a handled source with no email attribute refuses to publish (design.md §3 step 3)', () => {
  it.each([
    'CustomEmailSender_ForgotPassword',
    'CustomEmailSender_VerifyUserAttribute',
    'CustomEmailSender_AdminCreateUser',
  ])('refuses to publish "%s" when userAttributes carries no email at all', async (triggerSource) => {
    const event = forgotPasswordEvent({
      triggerSource,
      request: {
        type: 'customEmailSenderRequestV1',
        code: Buffer.from('opaque-ciphertext').toString('base64'),
        userAttributes: { sub: '3f29c1de-7b1a-4e11-9c2a-0123456789ab' }, // no email
      },
    });

    await expect(handler(event)).rejects.toThrow(/no usable recipient email attribute/);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('refuses to publish when a handled source carries no code at all (defensive — never publish a broken/undefined-code message)', async () => {
    const event = forgotPasswordEvent({
      request: {
        type: 'customEmailSenderRequestV1',
        userAttributes: { email: 'user@example.org' }, // no code field
      },
    });

    await expect(handler(event)).rejects.toThrow(/no code present/);
    expect(publishMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// NFR-1 — the decrypted code and the recipient address never reach a log.
// Each assertion carries an explicit anti-vacuity guard: it first asserts
// that something WAS logged, so the "never contains X" assertions cannot
// pass merely because nothing was logged at all.
// ---------------------------------------------------------------------------
describe('NFR-1 — the decrypted code and the recipient address never reach a log', () => {
  it('logs on success, but never the address or the decrypted code', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await handler(forgotPasswordEvent());

      // Anti-vacuity guard — fails loudly if nothing was logged at all,
      // which would otherwise make every assertion below pass vacuously.
      expect(logSpy).toHaveBeenCalled();

      const logged = logSpy.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(logged).not.toContain('user@example.org');
      expect(logged).not.toContain('482913'); // the decrypted code from decryptMock
    } finally {
      logSpy.mockRestore();
    }
  });

  it('logs on failure, but never the address, the decrypted code, or the raw broker error', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      decryptMock.mockResolvedValue({
        plaintext: Buffer.from('999999', 'utf-8'),
        messageHeader: {},
      });
      // A raw amqplib-shaped error carrying the broker URL (and its
      // credential) in `.message` — exactly the shape DD-3a warns never
      // escapes this function.
      publishMock.mockImplementation((_exchange, _queue, _content, _opts, cb) =>
        cb(new Error('connect ECONNREFUSED amqp://broker-user:broker-pass@broker.example.com:5672')),
      );

      const event = forgotPasswordEvent({
        request: {
          type: 'customEmailSenderRequestV1',
          code: Buffer.from('opaque-ciphertext').toString('base64'),
          userAttributes: { email: 'someone-secret@example.org' },
        },
      });

      await expect(handler(event)).rejects.toThrow();

      // Anti-vacuity guard.
      expect(errorSpy).toHaveBeenCalled();

      const logged = errorSpy.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(logged).not.toContain('someone-secret@example.org');
      expect(logged).not.toContain('999999');
      expect(logged).not.toContain('broker-user');
      expect(logged).not.toContain('broker-pass');
      expect(logged).not.toContain('broker.example.com');
    } finally {
      errorSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// DD-3a — the envelope shape is a contract this task does not own. Pinned
// field-for-field against `buildMicroserviceEnvelope`
// (backend/src/mail/microservice-mail.transport.ts), which this task read
// in full rather than re-deriving from memory. A renamed `socketFile`, a
// composite `from`, a comma-joined `to`, or a stray `id`/`reply_to` must
// each redden this.
// ---------------------------------------------------------------------------
describe('DD-3a — the published envelope mirrors buildMicroserviceEnvelope\'s exact shape', () => {
  it('publishes pattern/data/data/from/emailBody exactly, with to as a trimmed array and no id or reply_to', async () => {
    await handler(forgotPasswordEvent());

    expect(publishMock).toHaveBeenCalledTimes(1);
    const [exchange, queueName, content, options] = publishMock.mock.calls[0];
    expect(exchange).toBe('');
    expect(queueName).toBe(SECRET.queueName);
    expect(options).toMatchObject({ persistent: true, contentType: 'application/json' });

    const envelope = JSON.parse(content.toString('utf8'));
    expect(envelope).toStrictEqual({
      pattern: 'send',
      data: {
        apiKey: SECRET.apiKey,
        data: {
          from: {
            email: 'AccelerateTZ-No-reply@cgiar.org',
            name: 'ACCELERATE Tanzania Seed Registry -',
          },
          emailBody: {
            subject: expect.any(String),
            to: ['user@example.org'],
            message: {
              text: expect.any(String),
              socketFile: expect.any(String),
            },
          },
        },
      },
    });

    // Redundant with toStrictEqual above, stated explicitly because these
    // three are the exact wire-format defects already recorded against
    // this shape elsewhere in this repo (DD-3a) — a future edit that
    // reintroduces any one of them must fail here, unambiguously.
    expect(envelope).not.toHaveProperty('id');
    expect(envelope.data).not.toHaveProperty('id');
    expect(envelope.data).not.toHaveProperty('reply_to');
    const raw = content.toString('utf8');
    expect(raw).not.toContain('"reply_to"');
    expect(raw).not.toContain('"id"');
  });

  it('never sends the "to" field as a comma-joined string', async () => {
    await handler(forgotPasswordEvent());
    const [, , content] = publishMock.mock.calls[0];
    const envelope = JSON.parse(content.toString('utf8'));
    expect(Array.isArray(envelope.data.data.emailBody.to)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Routing coverage (design.md §5's table) and configuration wiring.
// ---------------------------------------------------------------------------
describe('routing — design.md §5\'s table', () => {
  it('handles CustomEmailSender_ForgotPassword and dispatches (no PUBLIC_APP_BASE_URL required — DD-1c)', async () => {
    delete process.env.PUBLIC_APP_BASE_URL;
    await expect(handler(forgotPasswordEvent())).resolves.toBeDefined();
    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  it('handles CustomEmailSender_VerifyUserAttribute and dispatches', async () => {
    const event = forgotPasswordEvent({ triggerSource: 'CustomEmailSender_VerifyUserAttribute' });
    await handler(event);
    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  it('CustomEmailSender_VerifyUserAttribute propagates getPublicAppBaseUrl()\'s refusal when PUBLIC_APP_BASE_URL is unset', async () => {
    delete process.env.PUBLIC_APP_BASE_URL;
    const event = forgotPasswordEvent({ triggerSource: 'CustomEmailSender_VerifyUserAttribute' });
    await expect(handler(event)).rejects.toThrow(/PUBLIC_APP_BASE_URL/);
  });

  it('handles CustomEmailSender_AdminCreateUser defensively (design.md §5 — suppressed today, must not vanish silently)', async () => {
    const event = forgotPasswordEvent({ triggerSource: 'CustomEmailSender_AdminCreateUser' });
    await handler(event);
    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  it('returns the event unmodified on success (Cognito expects no additional return information)', async () => {
    const event = forgotPasswordEvent();
    await expect(handler(event)).resolves.toBe(event);
  });
});

describe('configuration wiring', () => {
  it('builds the KMS keyring with CUSTOM_EMAIL_SENDER_KEY_ARN as generatorKeyId', async () => {
    await handler(forgotPasswordEvent());
    expect(kmsKeyringCtorMock).toHaveBeenCalledWith({ generatorKeyId: KEY_ARN });
  });

  it('reads the microservice secret by its composed name — BACKEND_STACK_NAME + the fixed suffix, never a literal (DD-3b)', async () => {
    await handler(forgotPasswordEvent());
    expect(getSecretValueCommandMock).toHaveBeenCalledWith({
      SecretId: 'accelerate-tz-dev-backend-mail-microservice-secret',
    });
  });

  it('composes the secret name from a DIFFERENT BACKEND_STACK_NAME value too, proving it is not hardcoded', async () => {
    process.env.BACKEND_STACK_NAME = 'some-other-backend-stack';
    await handler(forgotPasswordEvent());
    expect(getSecretValueCommandMock).toHaveBeenCalledWith({
      SecretId: 'some-other-backend-stack-mail-microservice-secret',
    });
  });
});

// ---------------------------------------------------------------------------
// DD-3a — connect per invocation, cache nothing.
// ---------------------------------------------------------------------------
describe('DD-3a — connects fresh and closes on every invocation; nothing is cached', () => {
  it('calls amqp.connect and closes the connection on every separate invocation', async () => {
    await handler(forgotPasswordEvent());
    await handler(forgotPasswordEvent());

    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(connectionCloseMock).toHaveBeenCalledTimes(2);
  });

  it('closes the connection even when the publish is nacked, and never leaks the raw broker error', async () => {
    publishMock.mockImplementation((_exchange, _queue, _content, _opts, cb) =>
      cb(new Error('channel closed: amqp://broker-user:broker-pass@broker.example.com')),
    );

    await expect(handler(forgotPasswordEvent())).rejects.toThrow(
      'custom-email-sender: failed to publish to the mail broker.',
    );
    expect(connectionCloseMock).toHaveBeenCalledTimes(1);
  });

  it('never retries a failed publish (at most one channel.publish call per invocation)', async () => {
    publishMock.mockImplementation((_exchange, _queue, _content, _opts, cb) => cb(new Error('nope')));
    await expect(handler(forgotPasswordEvent())).rejects.toThrow();
    expect(publishMock).toHaveBeenCalledTimes(1);
  });
});
