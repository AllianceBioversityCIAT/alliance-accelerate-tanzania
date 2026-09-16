// @sdd-spec enhancement/email-notification-microservice (T-2)
/**
 * `buildMicroserviceEnvelope` unit tests (design.md §4.2; FR-2, FR-4, DD-8).
 *
 * Pure-function coverage only — no AMQP, no network, no mocked SDK. T-4 adds
 * a separate spec for the connection/publish lifecycle.
 */
import {
  buildMicroserviceEnvelope,
  MicroserviceEnvelopeConfig,
} from './microservice-mail.transport';
import { MailMessage } from './mail-transport.interface';

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
