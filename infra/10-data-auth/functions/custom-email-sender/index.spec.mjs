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
// T-4 attempt 3, ADVISORY 3 — the mocked confirm channel needs `once`/
// `removeListener` now that index.mjs attaches a 'return' listener before
// every publish (mirrors amqp.ConfirmChannel's real EventEmitter surface).
// `channelOnceMock` captures the 'return' handler so a test can fire it to
// simulate RabbitMQ returning a message as unroutable.
let capturedOnReturn;
const channelOnceMock = jest.fn((event, cb) => {
  if (event === 'return') {
    capturedOnReturn = cb;
  }
});
const channelRemoveListenerMock = jest.fn();
const createConfirmChannelMock = jest.fn(async () => ({
  publish: publishMock,
  once: channelOnceMock,
  removeListener: channelRemoveListenerMock,
}));
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
let MESSAGE_BUILDERS;

beforeAll(async () => {
  ({ handler, MESSAGE_BUILDERS } = await import('./index.mjs'));
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
  capturedOnReturn = undefined;

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
  channelOnceMock.mockImplementation((event, cb) => {
    if (event === 'return') {
      capturedOnReturn = cb;
    }
  });
  createConfirmChannelMock.mockImplementation(async () => ({
    publish: publishMock,
    once: channelOnceMock,
    removeListener: channelRemoveListenerMock,
  }));
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
    'CustomEmailSender_AdminCreateUser',
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
    'CustomEmailSender_UpdateUserAttribute',
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
// FALSIFIER 4 (T-4 attempt 3, Fix A) — the gate for FR-1's central clause:
// the DECRYPTED code, not the ciphertext Cognito handed this function,
// must be what reaches the published body. `expect.any(String)` above
// proves a string is present, never WHICH string — replacing
// `buildMessage(recipientEmail, plaintextCode)` with
// `buildMessage(recipientEmail, event.request.code)` at the call site
// (mailing the user the base64 ciphertext instead of the decrypted code)
// left every other test in this file green. This one is written to catch
// exactly that swap: it asserts the decrypted value POSITIVELY, in both
// message parts, and asserts the ciphertext is ABSENT from the wire body —
// both must hold, so a builder call using the raw ciphertext instead of
// `plaintextCode` reddens it (present-ciphertext failure), and so would a
// builder call using neither (missing-plaintext failure).
// ---------------------------------------------------------------------------
describe('FALSIFIER 4 — the published body carries the DECRYPTED code, never the ciphertext (FR-1)', () => {
  it('the decrypted code appears in both the text and HTML parts, and the ciphertext appears nowhere in the wire body', async () => {
    await handler(forgotPasswordEvent());

    expect(publishMock).toHaveBeenCalledTimes(1);
    const [, , content] = publishMock.mock.calls[0];
    const raw = content.toString('utf8');
    const envelope = JSON.parse(raw);

    // Positive, distinguishable assertion: '482913' is decryptMock's
    // plaintext (beforeEach above) — distinct from the ciphertext below in
    // both alphabet and value, so this cannot pass by accident.
    expect(envelope.data.data.emailBody.message.text).toContain('482913');
    expect(envelope.data.data.emailBody.message.socketFile).toContain('482913');

    // The ciphertext Cognito handed this function (forgotPasswordEvent's
    // `request.code`, base64 of the literal string 'opaque-ciphertext')
    // must not appear anywhere in the published body — neither the
    // base64 form nor the plaintext it decodes to.
    const ciphertextBase64 = Buffer.from('opaque-ciphertext').toString('base64');
    expect(raw).not.toContain(ciphertextBase64);
    expect(raw).not.toContain('opaque-ciphertext');
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

  // THE FALSIFIER (validation-report.md B-4): a probe against the live DEV
  // pool measured that an admin editing a user's email via
  // `users.service.ts::update()` emits `CustomEmailSender_
  // UpdateUserAttribute` — not `VerifyUserAttribute`, which design.md §5
  // (pre-correction) wrongly named as the admin-edit source. Before this
  // fix, this exact triggerSource fell into FALSIFIER 2's unhandled set and
  // raised, silently losing the verification email. Make the fix vanish
  // (comment out this triggerSource's entry in index.mjs's MESSAGE_BUILDERS)
  // and this test must redden with "unhandled triggerSource" — see this
  // task's completion report for the red/restore/green transcript.
  it('handles CustomEmailSender_UpdateUserAttribute and dispatches (B-4 — the actual admin-edit source, corrected from VerifyUserAttribute)', async () => {
    const event = forgotPasswordEvent({ triggerSource: 'CustomEmailSender_UpdateUserAttribute' });
    await handler(event);
    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  it('CustomEmailSender_UpdateUserAttribute propagates getPublicAppBaseUrl()\'s refusal when PUBLIC_APP_BASE_URL is unset (same builder as VerifyUserAttribute)', async () => {
    delete process.env.PUBLIC_APP_BASE_URL;
    const event = forgotPasswordEvent({ triggerSource: 'CustomEmailSender_UpdateUserAttribute' });
    await expect(handler(event)).rejects.toThrow(/PUBLIC_APP_BASE_URL/);
  });

  it('raises on CustomEmailSender_AdminCreateUser and names the source (DD-5a — its Cognito mail is a duplicate of the invitation users.service.ts already sends by hand)', async () => {
    const event = forgotPasswordEvent({ triggerSource: 'CustomEmailSender_AdminCreateUser' });
    await expect(handler(event)).rejects.toThrow(
      /unhandled triggerSource "CustomEmailSender_AdminCreateUser"/,
    );
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('returns the event unmodified on success (Cognito expects no additional return information)', async () => {
    const event = forgotPasswordEvent();
    await expect(handler(event)).resolves.toBe(event);
  });
});

// ---------------------------------------------------------------------------
// Guard against the CLASS, not just the instance (validation-report.md
// B-4). The defect this test suite failed to catch was never "one string
// is missing" — it was "the handled set silently drifted from what the
// pool actually emits." Naming one more triggerSource in the tests above
// only guards the instance just fixed. This asserts the COMPLETE handled
// set against an explicit expected list, so any future gain or loss of a
// source — an addition nobody wrote a routing test for, a typo, an
// accidental deletion during a refactor — is a failing diff here, not a
// silent behaviour change discovered only by measuring production again.
//
// ⚠️ WHAT THIS CANNOT PROVE, stated because the comment above could be
// read as more than it is (tasks.md §2: "say what it cannot prove and
// name what would"). This asserts the handled set against a DECLARED
// EXPECTATION written in this same file — NOT against what Cognito
// actually emits. Applied at T-4, when the set was {ForgotPassword,
// VerifyUserAttribute}, the expected list would have said exactly that
// and this test would have been GREEN while the pool emitted
// UpdateUserAttribute. It would NOT have caught B-4. Its real value is
// narrower and still worth having: it forces any intentional change to
// the set to appear as a visible line in a diff, and it catches typos,
// refactor deletions and additions nobody wrote a routing test for.
// THE ONLY THING THAT VERIFIES CORRESPONDENCE WITH WHAT THE POOL EMITS
// is the live probe — one admin email-edit against DEV plus a CloudWatch
// check — which belongs in the same standing-manual-check register as
// tasks.md §3's real-password-reset check, and must be re-run whenever a
// pool setting that could emit a new source changes.
// ---------------------------------------------------------------------------
describe('the handled set matches design.md §5 exactly (guards the class, not just this instance)', () => {
  it('is exactly {ForgotPassword, VerifyUserAttribute, UpdateUserAttribute} — no more, no fewer', () => {
    expect(Object.keys(MESSAGE_BUILDERS).sort()).toEqual(
      [
        'CustomEmailSender_ForgotPassword',
        'CustomEmailSender_UpdateUserAttribute',
        'CustomEmailSender_VerifyUserAttribute',
      ].sort(),
    );
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
// T-4 attempt 3, Fix B — the credential path the file's own docblock
// forbids. Two defects, one fix: `readMicroserviceMailSecret` must validate
// the three required fields (never silently publish an envelope missing
// one), and its `JSON.parse` must be guarded (a nodejs24.x SyntaxError
// embeds a window of the offending input — the broker URL, credential
// included — and `handler` ends in `throw err`, so an unguarded parse
// failure would write that fragment verbatim to CloudWatch).
// ---------------------------------------------------------------------------
describe('T-4 attempt 3, Fix B — the microservice secret is validated, and a malformed SecretString never leaks a credential', () => {
  it.each(['rabbitmqUrl', 'apiKey', 'queueName'])(
    'throws, naming only the field, when the secret is missing "%s" — and never publishes',
    async (missingKey) => {
      const incomplete = { ...SECRET };
      delete incomplete[missingKey];
      secretsSendMock.mockResolvedValue({ SecretString: JSON.stringify(incomplete) });

      await expect(handler(forgotPasswordEvent())).rejects.toThrow(
        new RegExp(`missing required field "${missingKey}"`),
      );
      expect(publishMock).not.toHaveBeenCalled();
    },
  );

  it('never throws with the field\'s VALUE in the message — only the key name', async () => {
    const incomplete = { ...SECRET, apiKey: '' };
    secretsSendMock.mockResolvedValue({ SecretString: JSON.stringify(incomplete) });

    await expect(handler(forgotPasswordEvent())).rejects.toThrow(/missing required field "apiKey"/);
    // Guard against a regression that interpolates the (empty, but in
    // principle any) value instead of the key.
    await expect(handler(forgotPasswordEvent())).rejects.not.toThrow(/rabbitmqUrl|queueName/);
  });

  it('a malformed SecretString produces a FIXED message containing neither the broker user nor the password, and never publishes', async () => {
    // Truncated JSON that itself embeds a live-looking broker credential —
    // exactly the shape DD-3a/this file's docblock warns must never reach
    // a log or an error message.
    const malformed =
      '{"rabbitmqUrl":"amqp://broker-user:broker-pass@broker.example.com:5672","apiKey":';
    secretsSendMock.mockResolvedValue({ SecretString: malformed });

    await expect(handler(forgotPasswordEvent())).rejects.toThrow(
      'custom-email-sender: mail microservice secret is invalid: SecretString is not valid JSON.',
    );
    expect(publishMock).not.toHaveBeenCalled();

    let caught;
    try {
      await handler(forgotPasswordEvent());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught.message).not.toContain('broker-user');
    expect(caught.message).not.toContain('broker-pass');
    expect(caught.message).not.toContain('broker.example.com');
    expect(caught.stack).not.toContain('broker-user');
    expect(caught.stack).not.toContain('broker-pass');
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

  // T-4 attempt 3, ADVISORY 3 — `mandatory: true` plus the 'return'
  // listener close the gap a bare confirm-channel ack cannot: a message
  // that is unroutable (e.g. a wrong queueName) can still ack on the
  // confirm channel — "a publisher confirm attests persistence, not
  // routing" (backend/src/mail/microservice-mail.transport.ts's DD-3,
  // mirrored here). Without `mandatory`, this scenario is emailed nowhere,
  // logged "dispatched", and returns success.
  it('publish still passes { mandatory: true } to channel.publish', async () => {
    await handler(forgotPasswordEvent());
    const [, , , opts] = publishMock.mock.calls[0];
    expect(opts).toMatchObject({ mandatory: true });
  });

  it('fails the invocation when the broker returns the message as unroutable, even though the confirm itself acks (ADVISORY 3)', async () => {
    publishMock.mockImplementation((_exchange, _queue, _content, _opts, cb) => {
      // Simulate RabbitMQ delivering 'return' before the confirm ack — the
      // ordering this function's docblock says it never misses.
      capturedOnReturn();
      cb(null); // the confirm channel acks anyway (persistence, not routing)
    });

    await expect(handler(forgotPasswordEvent())).rejects.toThrow(
      'custom-email-sender: failed to publish to the mail broker.',
    );
    // Still closed, still never a raw amqplib/return detail exposed (NFR-1
    // — same sanitized, fixed message as every other publish failure).
    expect(connectionCloseMock).toHaveBeenCalledTimes(1);
  });
});
