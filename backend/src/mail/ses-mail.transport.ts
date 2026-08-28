// @sdd-spec actors/public-self-registration (T-3)
// @sdd-spec contact/contact-channels (T-1)
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { MailMessage, MailTransport } from './mail-transport.interface';
import { getSesMailConfig } from './mail.config';

/**
 * contact/contact-channels T-1 (design.md §4.2, §4.6, DD-5) — the fixed
 * `From` display name every message sent through this transport now carries,
 * layered over the verified sender address rather than replacing it. SES
 * verifies the address, not the display name, so this needs no separate
 * verification and no IAM change.
 */
const MAIL_SENDER_DISPLAY_NAME = 'ACCELERATE Tanzania Seed Registry';

/**
 * Builds the SES `Source` field. If `MAIL_SENDER_ADDRESS` already contains
 * `<` — i.e. an operator configured it as its own `"Name" <address>` form —
 * it is used verbatim so the display name is never wrapped twice (design.md
 * §4.2's double-wrapping guard). Otherwise the fixed
 * `MAIL_SENDER_DISPLAY_NAME` is layered over the bare address.
 */
function buildSource(senderAddress: string): string {
  if (senderAddress.includes('<')) {
    return senderAddress;
  }
  return `${MAIL_SENDER_DISPLAY_NAME} <${senderAddress}>`;
}

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

    const toAddresses = Array.isArray(message.to) ? message.to : [message.to];

    await sesClient.send(
      new SendEmailCommand({
        Source: buildSource(senderAddress),
        Destination: { ToAddresses: toAddresses },
        ...(message.replyTo ? { ReplyToAddresses: [message.replyTo] } : {}),
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
