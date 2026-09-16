// @sdd-spec actors/public-self-registration (T-3)
// @sdd-spec enhancement/email-notification-microservice (T-3)
import {
  getMailTransportKind,
  getMicroserviceMailConfig,
  getSesMailConfig,
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

    it('accepts "ses", "microservice" and "no-op" (Phase A)', () => {
      process.env.MAIL_TRANSPORT = 'ses';
      expect(getMailTransportKind()).toBe('ses');

      process.env.MAIL_TRANSPORT = 'microservice';
      expect(getMailTransportKind()).toBe('microservice');

      process.env.MAIL_TRANSPORT = 'no-op';
      expect(getMailTransportKind()).toBe('no-op');
    });
  });

  describe('getSesMailConfig', () => {
    it('throws when MAIL_SENDER_ADDRESS is missing', () => {
      delete process.env.MAIL_SENDER_ADDRESS;
      process.env.AWS_REGION = 'eu-west-1';
      expect(() => getSesMailConfig()).toThrow(/MAIL_SENDER_ADDRESS/);
    });

    it('throws when AWS_REGION is missing', () => {
      process.env.MAIL_SENDER_ADDRESS = 'registry@example.org';
      delete process.env.AWS_REGION;
      expect(() => getSesMailConfig()).toThrow(/AWS_REGION/);
    });

    it('returns the configured sender + region', () => {
      process.env.MAIL_SENDER_ADDRESS = 'registry@example.org';
      process.env.AWS_REGION = 'eu-west-1';
      expect(getSesMailConfig()).toEqual({
        senderAddress: 'registry@example.org',
        region: 'eu-west-1',
      });
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

    it('never echoes the URL or the API key in a thrown message', () => {
      setAllRequired();
      delete process.env.RABBITMQ_URL;
      try {
        getMicroserviceMailConfig();
        fail('expected getMicroserviceMailConfig to throw');
      } catch (err) {
        const message = (err as Error).message;
        expect(message).not.toContain('amqps://');
        expect(message).not.toContain('user:pass');
      }

      setAllRequired();
      delete process.env.MICROSERVICE_API_KEY;
      try {
        getMicroserviceMailConfig();
        fail('expected getMicroserviceMailConfig to throw');
      } catch (err) {
        expect((err as Error).message).not.toContain('clarisa-key-123');
      }
    });

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
      delete process.env.MAIL_SENDER_ADDRESS;
      delete process.env.AWS_REGION;

      jest.resetModules();
      await expect(import('./mail.config')).resolves.toBeDefined();
    });
  });
});
