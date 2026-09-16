// @sdd-spec actors/public-self-registration (T-3)
// @sdd-spec contact/contact-channels (T-1)
// @sdd-spec enhancement/email-notification-microservice (T-6)
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
import net from 'node:net';

import { MAIL_SEND_TIMEOUT_MS } from './mail-timing';
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

  describe('the HTML alternative', () => {
    type Body = {
      Text?: { Data?: string; Charset?: string };
      Html?: { Data?: string; Charset?: string };
    };

    function bodyOf(): Body {
      const input = sesMock.call(0).args[0].input as { Message?: { Body?: Body } };
      return input.Message?.Body ?? {};
    }

    it('sends Text only when the message has no html part', async () => {
      sesMock.on(SendEmailCommand).resolves({ MessageId: 'id' });
      await new SesMailTransport().send({ to: 'a@b.org', subject: 's', text: 'plain' });

      const body = bodyOf();
      expect(body.Text).toEqual({ Data: 'plain', Charset: 'UTF-8' });
      // Absent entirely, not present-and-empty: an empty Html part would make
      // SES emit a multipart message whose HTML alternative renders blank.
      expect(body).not.toHaveProperty('Html');
    });

    it('sends both parts when html is present, keeping text as the fallback', async () => {
      sesMock.on(SendEmailCommand).resolves({ MessageId: 'id' });
      await new SesMailTransport().send({
        to: 'a@b.org',
        subject: 's',
        text: 'plain',
        html: '<p>rich</p>',
      });

      const body = bodyOf();
      expect(body.Text).toEqual({ Data: 'plain', Charset: 'UTF-8' });
      expect(body.Html).toEqual({ Data: '<p>rich</p>', Charset: 'UTF-8' });
    });
  });
});

/**
 * enhancement/email-notification-microservice T-6 (design.md §4.1, DD-10,
 * NFR-7) — proves the client actually ABORTS at the deadline, not merely
 * that a timeout option was passed to its constructor.
 *
 * This is deliberately a SEPARATE top-level `describe`, and deliberately
 * NOT using `sesMock`: `aws-sdk-client-mock` stubs `SESClient.prototype.send`
 * itself, so it never reaches the configured `requestHandler` — a test built
 * on it could only ever assert presence (the option was passed), not
 * behaviour (the option does something). To observe the real abort, this
 * suite un-mocks the SES client prototype for its one test, points the real
 * client at a raw TCP stub that accepts the connection and then never
 * writes a response (SES's shape for a hung/half-open path — the same
 * failure mode DD-11 calls out for the microservice's probe), and measures
 * wall-clock time to rejection.
 *
 * Must run LAST in this file: `sesMock.restore()` un-mocks
 * `SESClient.prototype.send` for every test that runs after it, and nothing
 * re-mocks it afterwards.
 */
describe('SesMailTransport — request timeout is enforced, not merely configured (T-6)', () => {
  afterAll(() => {
    // Hygiene for any test file added after this one in a future change.
    mockClient(SESClient);
  });

  it('aborts a non-responding SES endpoint at MAIL_SEND_TIMEOUT_MS instead of hanging', async () => {
    sesMock.restore();
    resetSesClient();
    process.env.MAIL_SENDER_ADDRESS = 'registry@example.org';
    process.env.AWS_REGION = 'eu-west-1';
    // Static credentials so the credential-provider chain resolves
    // synchronously and doesn't add its own (unrelated) network latency to
    // the measurement below. Saved (not just deleted) in `finally` below:
    // `jest --runInBand` shares `process.env` across every spec file in the
    // run, so unconditionally deleting these would also strip them if the
    // ambient environment (or an earlier file) had legitimately owned them.
    const originalAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const originalSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';

    // A stub that accepts the TCP connection and then goes silent forever —
    // never sends an HTTP response, so nothing but a client-side timeout
    // can end the request. Sockets are tracked so they can be force-destroyed
    // in `finally` below; otherwise the aborted client socket can linger as
    // an open handle past the test (Jest's "did not exit" warning).
    const openSockets = new Set<import('node:net').Socket>();
    const server = net.createServer((socket) => {
      openSockets.add(socket);
      socket.on('close', () => openSockets.delete(socket));
      socket.on('error', () => undefined); // ignore ECONNRESET from the abort
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const { port } = server.address() as net.AddressInfo;
    // Standard AWS SDK v3 per-service endpoint override — picked up by
    // `new SESClient({ region })` exactly as the production constructor in
    // `ses-mail.transport.ts` calls it, with no test-only endpoint plumbing
    // added to that file.
    process.env.AWS_ENDPOINT_URL_SES = `http://127.0.0.1:${port}`;

    const transport = new SesMailTransport();
    const start = Date.now();
    let caughtError: unknown;
    try {
      await transport.send({ to: 'applicant@example.org', subject: 's', text: 't' });
    } catch (error) {
      caughtError = error;
    } finally {
      for (const socket of openSockets) {
        socket.destroy();
      }
      server.close();
      delete process.env.AWS_ENDPOINT_URL_SES;
      if (originalAccessKeyId === undefined) {
        delete process.env.AWS_ACCESS_KEY_ID;
      } else {
        process.env.AWS_ACCESS_KEY_ID = originalAccessKeyId;
      }
      if (originalSecretAccessKey === undefined) {
        delete process.env.AWS_SECRET_ACCESS_KEY;
      } else {
        process.env.AWS_SECRET_ACCESS_KEY = originalSecretAccessKey;
      }
    }
    const elapsedMs = Date.now() - start;

    // It rejected at all (didn't hang past the test's own timeout) ...
    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).name).toBe('TimeoutError');
    // ... at THE configured deadline, not "eventually": a generous margin
    // above MAIL_SEND_TIMEOUT_MS catches scheduler jitter without hiding a
    // regression to "no bound at all".
    expect(elapsedMs).toBeGreaterThanOrEqual(MAIL_SEND_TIMEOUT_MS - 100);
    // ... and well under what a SECOND attempt would add, proving
    // `maxAttempts: 1` — a retry would push this past ~2 × the deadline.
    expect(elapsedMs).toBeLessThan(MAIL_SEND_TIMEOUT_MS + 800);
  }, 10_000);
});
