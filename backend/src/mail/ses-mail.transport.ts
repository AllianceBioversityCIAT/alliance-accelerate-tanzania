// @sdd-spec actors/public-self-registration (T-3)
// @sdd-spec contact/contact-channels (T-1)
// @sdd-spec enhancement/email-notification-microservice (T-6)
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { MailMessage, MailTransport } from './mail-transport.interface';
import { MAIL_SEND_TIMEOUT_MS } from './mail-timing';
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
 *
 * enhancement/email-notification-microservice T-6 (design.md §4.1, DD-10,
 * NFR-7): bounded with the same `MAIL_SEND_TIMEOUT_MS` deadline the
 * microservice transport is held to, imported from `mail-timing.ts` — its
 * single home (§12) — never restated here. Before this, `new
 * SESClient({ region })` set neither a request timeout nor a retry cap, so
 * the SES path was unbounded; with the SDK's default of up to 3 attempts,
 * an unbounded per-attempt wait could turn "one send" into multiples of the
 * OTP endpoint's constant-time floor (`VERIFICATION_CODE_RESPONSE_FLOOR_MS`,
 * composed as `PRESEND_ALLOWANCE + MAIL_SEND_TIMEOUT_MS`), reopening the
 * timing oracle that floor exists to close. `requestTimeout` aborts a
 * single attempt at the deadline; `maxAttempts: 1` removes the SDK's
 * built-in retry so no attempt sequence can exceed that one deadline.
 */
let client: SESClient | undefined;

function getSesClient(region: string): SESClient {
  if (!client) {
    client = new SESClient({
      region,
      // `requestHandler` here is a plain options object, not a constructed
      // `NodeHttpHandler` — `SESClient`'s `requestHandler` accepts the
      // handler's constructor options directly, and the client's own
      // runtimeConfig builds the handler via
      // `NodeHttpHandler.create(config.requestHandler)`. Passing options
      // avoids an explicit `import { NodeHttpHandler } from
      // '@smithy/node-http-handler'`, a package that is NOT declared in
      // this package's `package.json` and today resolves only via npm
      // hoisting through `@aws-sdk/client-ses` — a future lockfile
      // regeneration or SDK bump could nest it and break this file's build.
      //
      // `throwOnRequestTimeout` is not cosmetic: @smithy/node-http-handler's
      // default behaviour for a `requestTimeout` breach is to call
      // `logger.warn` and let the request keep running to completion — the
      // deadline would otherwise be advisory only, observed but not
      // enforced. `throwOnRequestTimeout: true` turns the breach into an
      // actual rejection (a `TimeoutError`) instead.
      requestHandler: {
        requestTimeout: MAIL_SEND_TIMEOUT_MS,
        throwOnRequestTimeout: true,
      },
      // `maxAttempts: 1` is forced, not merely sound: §12.3 invariant 1 is
      // `VERIFICATION_CODE_PRESEND_ALLOWANCE_MS (800) + MAIL_SEND_TIMEOUT_MS
      // (1200) ≤ VERIFICATION_CODE_RESPONSE_FLOOR_MS (2000)` with zero
      // slack — any SDK-default retry on this client would let a single
      // send exceed that floor and reopen the timing oracle NFR-7 closes.
      maxAttempts: 1,
    });
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
          Body: {
            Text: { Data: message.text, Charset: 'UTF-8' },
            // Both parts present → SES emits multipart/alternative and the
            // client picks. Omitted entirely when a builder has no HTML, so
            // an empty Html part is never sent.
            ...(message.html
              ? { Html: { Data: message.html, Charset: 'UTF-8' } }
              : {}),
          },
        },
      }),
    );
  }
}

/** Test seam — reset the cached SES client singleton between specs. */
export function resetSesClient(): void {
  client = undefined;
}
