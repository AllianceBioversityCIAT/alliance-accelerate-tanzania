// @sdd-spec actors/public-self-registration (T-3)
// @sdd-spec contact/contact-channels (T-1)
/**
 * `SesMailTransport` unit tests with a mocked SES client (`aws-sdk-client-mock`,
 * mirroring `users/users.service.spec.ts`'s Cognito mocking convention).
 *
 * Scope note (DEP-6): these tests prove the command this class builds and
 * that a send failure propagates. They do NOT and cannot prove that a real
 * message reaches SES, that the configured sender identity is verified, or
 * that the account's SES sandbox/quota allows it — there is no application
 * sender identity under this repo's default infra parameters.
 *
 * contact/contact-channels T-1 (design.md §4.2, §4.6, DD-5) adds coverage for
 * the widened `to` (array form), `ReplyToAddresses`, and the `Source`
 * double-wrapping guard.
 */
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { mockClient } from 'aws-sdk-client-mock';

import { SesMailTransport, resetSesClient } from './ses-mail.transport';

const sesMock = mockClient(SESClient);

describe('SesMailTransport (design.md §4.9)', () => {
  beforeEach(() => {
    sesMock.reset();
    resetSesClient();
    process.env.MAIL_SENDER_ADDRESS = 'registry@example.org';
    process.env.AWS_REGION = 'eu-west-1';
  });

  it('sends a SendEmailCommand with the configured sender, destination, subject and body', async () => {
    sesMock.on(SendEmailCommand).resolves({ MessageId: 'test-message-id' });
    const transport = new SesMailTransport();

    await transport.send({
      to: 'applicant@example.org',
      subject: 'Registration received — REG-2026-0007',
      text: 'Your reference is REG-2026-0007.',
      reference: 'REG-2026-0007',
    });

    expect(sesMock.calls()).toHaveLength(1);
    const input = sesMock.call(0).args[0].input as {
      Source?: string;
      Destination?: { ToAddresses?: string[] };
      Message?: { Subject?: { Data?: string }; Body?: { Text?: { Data?: string } } };
    };
    expect(input.Source).toBe('ACCELERATE Tanzania Seed Registry <registry@example.org>');
    expect(input.Destination?.ToAddresses).toEqual(['applicant@example.org']);
    expect(input.Message?.Subject?.Data).toBe('Registration received — REG-2026-0007');
    expect(input.Message?.Body?.Text?.Data).toBe('Your reference is REG-2026-0007.');
  });

  it('propagates a send failure to the caller unchanged', async () => {
    sesMock.on(SendEmailCommand).rejects(new Error('Throttling'));
    const transport = new SesMailTransport();

    await expect(
      transport.send({ to: 'applicant@example.org', subject: 's', text: 't' }),
    ).rejects.toThrow('Throttling');
  });

  it('throws before any SDK call when required config is missing', async () => {
    delete process.env.MAIL_SENDER_ADDRESS;
    const transport = new SesMailTransport();

    await expect(
      transport.send({ to: 'applicant@example.org', subject: 's', text: 't' }),
    ).rejects.toThrow(/MAIL_SENDER_ADDRESS/);
    expect(sesMock.calls()).toHaveLength(0);
  });

  it('maps an array `to` to every ToAddresses entry (design.md §2, §4.6)', async () => {
    sesMock.on(SendEmailCommand).resolves({ MessageId: 'test-message-id' });
    const transport = new SesMailTransport();

    await transport.send({
      to: ['admin-one@example.org', 'admin-two@example.org'],
      subject: 's',
      text: 't',
    });

    const input = sesMock.call(0).args[0].input as { Destination?: { ToAddresses?: string[] } };
    expect(input.Destination?.ToAddresses).toEqual(['admin-one@example.org', 'admin-two@example.org']);
  });

  it('passes ReplyToAddresses when `replyTo` is present (FR-4)', async () => {
    sesMock.on(SendEmailCommand).resolves({ MessageId: 'test-message-id' });
    const transport = new SesMailTransport();

    await transport.send({
      to: 'admin@example.org',
      subject: 's',
      text: 't',
      replyTo: 'Jane Requester <jane@example.org>',
    });

    const input = sesMock.call(0).args[0].input as { ReplyToAddresses?: string[] };
    expect(input.ReplyToAddresses).toEqual(['Jane Requester <jane@example.org>']);
  });

  it('omits ReplyToAddresses when `replyTo` is absent', async () => {
    sesMock.on(SendEmailCommand).resolves({ MessageId: 'test-message-id' });
    const transport = new SesMailTransport();

    await transport.send({ to: 'admin@example.org', subject: 's', text: 't' });

    const input = sesMock.call(0).args[0].input as { ReplyToAddresses?: string[] };
    expect(input.ReplyToAddresses).toBeUndefined();
  });

  it('uses MAIL_SENDER_ADDRESS verbatim when it already contains a display name (design.md §4.2 double-wrapping guard)', async () => {
    process.env.MAIL_SENDER_ADDRESS = 'Existing Name <registry@example.org>';
    sesMock.on(SendEmailCommand).resolves({ MessageId: 'test-message-id' });
    const transport = new SesMailTransport();

    await transport.send({ to: 'admin@example.org', subject: 's', text: 't' });

    const input = sesMock.call(0).args[0].input as { Source?: string };
    expect(input.Source).toBe('Existing Name <registry@example.org>');
  });
});
