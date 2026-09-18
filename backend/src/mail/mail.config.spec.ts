// @sdd-spec actors/public-self-registration (T-3)
// @sdd-spec enhancement/email-notification-microservice (T-3)
import {
  getMailTransportKind,
  getMicroserviceMailConfig,
} from './mail.config';

describe('mail.config', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('getMailTransportKind', () => {
    it('throws when MAIL_TRANSPORT is unset', () => {
      delete process.env.MAIL_TRANSPORT;
      expect(() => getMailTransportKind()).toThrow(/MAIL_TRANSPORT/);
    });

    it('throws on an unrecognised value', () => {
      process.env.MAIL_TRANSPORT = 'smtp';
      expect(() => getMailTransportKind()).toThrow(/Invalid MAIL_TRANSPORT/);
    });

    it(
      'interpolates the invalid value into the thrown message (T-5, inherited from T-3 review A3) — ' +
        "on the record as checked: this is mail.config.ts's ONE value-interpolating throw. Harmless " +
        "today because MAIL_TRANSPORT is never a secret — it can only ever carry MAIL_TRANSPORT's own " +
        'value — but it is an escape path and must stay enumerated, not merely read past',
      () => {
        process.env.MAIL_TRANSPORT = 'smtp';
        expect(() => getMailTransportKind()).toThrow(/"smtp"/);
      },
    );

    it('accepts "microservice" and "no-op" (Phase B)', () => {
      process.env.MAIL_TRANSPORT = 'microservice';
      expect(getMailTransportKind()).toBe('microservice');

      process.env.MAIL_TRANSPORT = 'no-op';
      expect(getMailTransportKind()).toBe('no-op');
    });

    it('rejects "ses" — Phase B has narrowed the union (FR-3 BUT, design.md §7.3)', () => {
      process.env.MAIL_TRANSPORT = 'ses';
      expect(() => getMailTransportKind()).toThrow(/Invalid MAIL_TRANSPORT/);
      expect(() => getMailTransportKind()).toThrow(/"ses"/);
    });
  });

  describe('getMicroserviceMailConfig', () => {
    const setAllRequired = () => {
      process.env.RABBITMQ_URL = 'amqps://user:pass@broker.example.org:5671';
      process.env.EMAIL_QUEUE_NAME = 'accelerate-tz-email';
      process.env.MICROSERVICE_API_KEY = 'clarisa-key-123';
      process.env.EMAIL_SENDER = 'registry@example.org';
    };

    it('throws naming RABBITMQ_URL when absent', () => {
      setAllRequired();
      delete process.env.RABBITMQ_URL;
      expect(() => getMicroserviceMailConfig()).toThrow(/RABBITMQ_URL/);
    });

    it('throws naming EMAIL_QUEUE_NAME when absent', () => {
      setAllRequired();
      delete process.env.EMAIL_QUEUE_NAME;
      expect(() => getMicroserviceMailConfig()).toThrow(/EMAIL_QUEUE_NAME/);
    });

    it('throws naming MICROSERVICE_API_KEY when absent', () => {
      setAllRequired();
      delete process.env.MICROSERVICE_API_KEY;
      expect(() => getMicroserviceMailConfig()).toThrow(/MICROSERVICE_API_KEY/);
    });

    it('throws naming EMAIL_SENDER when absent', () => {
      setAllRequired();
      delete process.env.EMAIL_SENDER;
      expect(() => getMicroserviceMailConfig()).toThrow(/EMAIL_SENDER\b/);
    });

    it(
      'never echoes the URL or the API key in a thrown message — T-5 fix (inherited from T-3 review ' +
        'A1): the FIRST block below is near-vacuous on its own terms, since it asserts the absence ' +
        'of a value (RABBITMQ_URL) that was JUST DELETED from the environment — an implementation ' +
        'appending `JSON.stringify(process.env)` to the thrown message would pass it while leaking ' +
        'every OTHER live secret. The discriminating assertion is the one added to the SECOND block: ' +
        'RABBITMQ_URL is still SET (only MICROSERVICE_API_KEY is deleted there), so asserting its ' +
        'value is absent from that throw is checked against a secret that is genuinely live — ' +
        'mutation: appending `process.env.RABBITMQ_URL` (or the whole env) to either thrown message ' +
        'reddens this',
      () => {
        setAllRequired();
        delete process.env.RABBITMQ_URL;
        let message = '';
        try {
          getMicroserviceMailConfig();
        } catch (err) {
          message = (err as Error).message;
        }
        // T-5 polish: `fail()` is a type-only Jest global — it does not
        // exist at runtime under jest-circus (the default runner here, and
        // this repo sets no testRunner override), so the old
        // try/fail()/catch shape would swallow a ReferenceError and let
        // every toContain assertion below pass vacuously against
        // "fail is not defined" if getMicroserviceMailConfig ever stopped
        // throwing. Asserting the captured message is non-empty is what
        // actually distinguishes "threw cleanly" from "did not throw".
        expect(message).not.toBe('');
        expect(message).not.toContain('amqps://');
        expect(message).not.toContain('user:pass');

        setAllRequired();
        delete process.env.MICROSERVICE_API_KEY;
        message = '';
        try {
          getMicroserviceMailConfig();
        } catch (err) {
          message = (err as Error).message;
        }
        expect(message).not.toBe('');
        expect(message).not.toContain('clarisa-key-123');
        // The discriminating assertion (A1 fix): RABBITMQ_URL is still
        // SET in process.env at this point (setAllRequired() above,
        // never deleted in this second block) — a secret that is
        // actually present, not one already removed before the check.
        expect(message).not.toContain('amqps://');
        expect(message).not.toContain('user:pass');
      },
    );

    it('defaults EMAIL_SENDER_NAME without throwing, preserving the trailing dash', () => {
      setAllRequired();
      delete process.env.EMAIL_SENDER_NAME;
      expect(() => getMicroserviceMailConfig()).not.toThrow();
      expect(getMicroserviceMailConfig().senderName).toBe(
        'ACCELERATE Tanzania Seed Registry -',
      );
    });

    it('returns every configured value, including a custom EMAIL_SENDER_NAME', () => {
      setAllRequired();
      process.env.EMAIL_SENDER_NAME = 'Custom Name -';
      expect(getMicroserviceMailConfig()).toEqual({
        rabbitmqUrl: 'amqps://user:pass@broker.example.org:5671',
        queueName: 'accelerate-tz-email',
        apiKey: 'clarisa-key-123',
        senderAddress: 'registry@example.org',
        senderName: 'Custom Name -',
      });
    });
  });

  describe('lazy resolution (FR-3 BUT)', () => {
    it('importing/using the module with nothing configured does not throw at import time', async () => {
      // The import at the top of this file already exercised module
      // initialization with a real environment. This test instead asserts
      // the *behavioural* half of the contract: with every relevant env var
      // cleared, freshly importing the module must not throw. Resolution
      // only happens when a getter is called, never on import.
      delete process.env.MAIL_TRANSPORT;
      delete process.env.RABBITMQ_URL;
      delete process.env.EMAIL_QUEUE_NAME;
      delete process.env.MICROSERVICE_API_KEY;
      delete process.env.EMAIL_SENDER;
      delete process.env.EMAIL_SENDER_NAME;

      jest.resetModules();
      await expect(import('./mail.config')).resolves.toBeDefined();
    });
  });
});
