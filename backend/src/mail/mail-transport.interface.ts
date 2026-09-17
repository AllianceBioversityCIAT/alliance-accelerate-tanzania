// @sdd-spec actors/public-self-registration (T-3)
// @sdd-spec contact/contact-channels (T-1)
/**
 * T-3 — Mail transport abstraction (design.md §4.9).
 *
 * A `MailMessage` is a fully-rendered message: subject and body text already
 * built by a `templates/*.template.ts` function, plus the applicant-facing
 * correlator every post-submission message carries.
 *
 * `reference` is deliberately `string | undefined`, not required. Design.md
 * §4.9 and tasks.md T-3 both say "every message carries the reference" as a
 * summary, but FR-4 is explicit that the verification-code send happens
 * BEFORE any Registration row exists ("No Registration row is written until
 * the code has been verified") — so at that point no reference has been
 * allocated (§4.5 derives it only inside the submission transaction). The
 * receipt message, sent after `POST /registrations` creates the row, DOES
 * carry it. Faking a reference for the verification-code message would be
 * worse than omitting the field. See `templates/verification-code.template.ts`
 * and `templates/receipt.template.ts`.
 *
 * `MailTransport` is the swap point between "actually send" (the OneCGIAR
 * notification microservice, `MicroserviceMailTransport`) and "record the
 * attempt, send nothing" (no-op, NFR-10). Both implementations receive the
 * identical `MailMessage` shape, so a caller cannot tell which is selected
 * except by observing whether bytes left the process. *(Until Phase B of
 * enhancement/email-notification-microservice, SES filled the "actually
 * send" role via `ses-mail.transport.ts`; that transport is deleted, and
 * `MailTransportKind` narrowed to `'microservice' | 'no-op'`, in T-10.)*
 *
 * contact/contact-channels T-1 (design.md §2, §4.6) widened `to` to accept
 * multiple recipients. *(That same task also added `replyTo`, a pre-composed
 * `Display Name <address>` string routing a reply to the requester rather
 * than the registry; enhancement/email-notification-microservice T-11
 * removed it again — the notification-microservice DTO has no reply-to
 * field, so a caller-set value would be silently unread, design.md DD-7.)*
 */
export interface MailMessage {
  to: string | string[];
  subject: string;
  text: string;
  /**
   * Optional HTML alternative. When present the transport sends
   * multipart/alternative and `text` becomes the fallback part — it is never
   * replaced: text-only clients, screen readers and spam scoring all want it.
   * Built by `templates/email-layout.ts`, which escapes every interpolated
   * value (the contact message carries visitor-supplied fields).
   */
  html?: string;
  /** The applicant-facing reference, when one has been allocated. See above. */
  reference?: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}
