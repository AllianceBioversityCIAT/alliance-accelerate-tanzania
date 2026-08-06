// @sdd-spec actors/public-self-registration (T-3)
/**
 * `SesMailTransport` unit tests with a mocked SES client (`aws-sdk-client-mock`,
 * mirroring `users/users.service.spec.ts`'s Cognito mocking convention).
 *
 * Scope note (DEP-6): these tests prove the command this class builds and
 * that a send failure propagates. They do NOT and cannot prove that a real
 * message reaches SES, that the configured sender identity is verified, or
 * that the account's SES sandbox/quota allows it — there is no application
 * sender identity under this repo's default infra parameters.
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
    expect(input.Source).toBe('registry@example.org');
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
});
