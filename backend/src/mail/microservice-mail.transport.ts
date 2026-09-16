// @sdd-spec enhancement/email-notification-microservice (T-2)
import { MailMessage } from './mail-transport.interface';

/**
 * T-2 — Envelope builder for the OneCGIAR notification microservice
 * (design.md §4.2, §4.5; FR-2, FR-4, DD-8).
 *
 * `design.md` §4.2 splits "build the envelope" from "publish it" on purpose:
 * this function is a **pure** `MailMessage` → JSON mapping, no AMQP, no
 * network, no clock. It is gated by a spec that needs no broker stub. The
 * connection, mutex, probe and publish belong to `MicroserviceMailTransport`
 * (T-4), which is deliberately NOT in this file yet.
 *
 * `apiKey`/`senderAddress`/`senderName` are config-derived (FR-3, FR-4), not
 * part of `MailMessage` — this file takes them as an explicit parameter
 * rather than importing `mail.config.ts`, so the builder stays dependency-free
 * and independently testable, and so it does not couple to that file's
 * concurrent edit (T-3).
 *
 * A worked example of the wire format exists in a sibling project,
 * `ai-services/partner-request-support/backend/src/email_microservice.py`
 * (`send_email`'s `config_message_dto`/`payload`). Two things are
 * deliberately NOT copied from it:
 *   1. It authenticates with the legacy `auth: {username, password}` pair.
 *      We use `data.apiKey` — the legacy form is deprecated (FR-2).
 *   2. It always sends `socketFile: None` (text-only). We send HTML, so
 *      `socketFile` carries `MailMessage.html` whenever it is present — that
 *      is the whole point of this transport (FR-2's `AND IT MUST`).
 */

/** Config-derived fields the envelope needs but `MailMessage` does not carry. */
export interface MicroserviceEnvelopeConfig {
  /** CLARISA-issued key. Goes in `data.apiKey`, never in `data.data`. */
  apiKey: string;
  /** `EMAIL_SENDER` (FR-4) — the bare address, `data.data.from.email`. */
  senderAddress: string;
  /** `EMAIL_SENDER_NAME` (FR-4) — the display name, `data.data.from.name`. */
  senderName: string;
}

interface MicroserviceMailAddress {
  email: string;
  name: string;
}

interface MicroserviceEmailMessage {
  text: string;
  /**
   * `MailMessage.html`, present only when the message carries HTML (FR-2's
   * `AND IT MUST`: both `text` and `socketFile` when HTML exists). Omitted
   * entirely — never `null` — for a text-only message, so a text-only send
   * matches the exemplar's shape without reintroducing its `None` trap.
   *
   * Deliberately NOT named `file` — that field is HTTP-only and ignored on
   * the queue path (FR-2's `BUT`). Renaming this key is the task's own
   * mutation-testing gate: it must redden the suite.
   */
  socketFile?: string;
}

interface MicroserviceEmailBody {
  subject: string;
  /** Always an array, always trimmed (DD-8) — never a comma-joined string. */
  to: string[];
  message: MicroserviceEmailMessage;
}

/**
 * The exact NestJS RMQ wire shape (FR-2). Note what is absent: no `id`
 * property anywhere. An `id` without a `reply_to` makes the microservice
 * attempt an RPC reply nothing will consume (FR-2's `BUT`) — the fix here is
 * simply to never add one, not to add and then strip one.
 */
export interface MicroserviceMailEnvelope {
  pattern: 'send';
  data: {
    apiKey: string;
    data: {
      /**
       * Separate `email`/`name` fields — never a `"Name" <addr>` composite
       * (FR-4's `BUT`). The microservice takes address and name as distinct
       * fields; wrapping them the way `ses-mail.transport.ts`'s
       * `buildSource()` does for SES would be sent as one literal address.
       */
      from: MicroserviceMailAddress;
      emailBody: MicroserviceEmailBody;
    };
  };
}

/**
 * DD-8 — always send `to` as a trimmed array. A malformed entry (stray
 * leading/trailing whitespace, e.g. from a naively comma-split source
 * upstream) invalidates the whole list at the microservice; trimming every
 * entry removes that footgun. `MailMessage.to` is `string | string[]` — a
 * bare string is always normalized to a one-element array, matching FR-2's
 * "always an array, never a comma-joined string".
 */
function normalizeTo(to: string | string[]): string[] {
  const list = Array.isArray(to) ? to : [to];
  return list.map((address) => address.trim());
}

/**
 * Pure builder: `MailMessage` + sender config → the microservice envelope.
 * No I/O, no AMQP — see file docblock. `MicroserviceMailTransport` (T-4)
 * calls this immediately before publishing.
 */
export function buildMicroserviceEnvelope(
  message: MailMessage,
  config: MicroserviceEnvelopeConfig,
): MicroserviceMailEnvelope {
  // message.text is always taken verbatim into `text`; message.html (when
  // present) is always taken verbatim into `socketFile`. Neither ever falls
  // back into the other's slot, so HTML can never land in `message.text`
  // (FR-2's `BUT`).
  const emailMessage: MicroserviceEmailMessage = message.html
    ? { text: message.text, socketFile: message.html }
    : { text: message.text };

  return {
    pattern: 'send',
    data: {
      apiKey: config.apiKey,
      data: {
        from: {
          email: config.senderAddress,
          name: config.senderName,
        },
        emailBody: {
          subject: message.subject,
          to: normalizeTo(message.to),
          message: emailMessage,
        },
      },
    },
  };
}
