// @sdd-spec actors/public-self-registration (T-3)
import { getMailTransportKind, getSesMailConfig } from './mail.config';

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

    it('accepts "ses" and "no-op"', () => {
      process.env.MAIL_TRANSPORT = 'ses';
      expect(getMailTransportKind()).toBe('ses');

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
});
