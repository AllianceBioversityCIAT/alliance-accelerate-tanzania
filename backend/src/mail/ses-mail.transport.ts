// @sdd-spec actors/public-self-registration (T-3)
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { MailMessage, MailTransport } from './mail-transport.interface';
import { getSesMailConfig } from './mail.config';

/**
 * Single, shared SES client (Lambda-tuned — mirrors
 * `users/cognito-admin.client.ts`'s `getCognitoAdminClient()` singleton). One
 * instance per container is reused across warm invocations, so SDK
 * credential/HTTP setup happens only on the first send (design.md §4.9's
 * cold-start note; `aws-serverless` skill guidance).
 *
 * Created lazily on first send, not at construction — matches `mail.config.ts`
 * resolving `AWS_REGION` lazily too, so a run with `MAIL_TRANSPORT=no-op`
 * never touches this file at all.
 */
let client: SESClient | undefined;

function getSesClient(region: string): SESClient {
  if (!client) {
    client = new SESClient({ region });
  }
  return client;
}

/**
 * T-3 — SES-backed `MailTransport` (design.md §4.9).
 *
 * **Cannot be exercised end-to-end in CI** (DEP-6): there is no verified SES
 * sending identity under default infra parameters
 * (`infra/10-data-auth/template.yaml:196-200`, gated on `SenderEmail` being
 * non-empty). These tests mock the SDK client (`aws-sdk-client-mock`) and
 * prove the command this class builds and that failures propagate — they do
 * NOT prove a real message is delivered, that the configured sender identity
 * is verified, or that SES accepts the account's sending quota/region.
 */
export class SesMailTransport implements MailTransport {
  async send(message: MailMessage): Promise<void> {
    const { senderAddress, region } = getSesMailConfig();
    const sesClient = getSesClient(region);

    await sesClient.send(
      new SendEmailCommand({
        Source: senderAddress,
        Destination: { ToAddresses: [message.to] },
        Message: {
          Subject: { Data: message.subject, Charset: 'UTF-8' },
          Body: { Text: { Data: message.text, Charset: 'UTF-8' } },
        },
      }),
    );
  }
}

/** Test seam — reset the cached SES client singleton between specs. */
export function resetSesClient(): void {
  client = undefined;
}
