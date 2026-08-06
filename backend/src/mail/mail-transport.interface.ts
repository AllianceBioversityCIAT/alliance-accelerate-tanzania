// @sdd-spec actors/public-self-registration (T-3)
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
 * `MailTransport` is the swap point between "actually send" (SES) and
 * "record the attempt, send nothing" (no-op, NFR-10). Both implementations
 * receive the identical `MailMessage` shape, so a caller cannot tell which is
 * selected except by observing whether bytes left the process.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** The applicant-facing reference, when one has been allocated. See above. */
  reference?: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}
