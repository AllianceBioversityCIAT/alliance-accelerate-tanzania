// @sdd-spec contact/contact-channels (T-3)
import { MailMessage } from '../mail-transport.interface';
import { composeReplyTo } from '../../contact/reply-to.util';

/**
 * T-3 — Contact-form message template (design.md §4.5, FR-4, §6's
 * content-abuse row).
 *
 * Follows `buildReceiptMessage`'s shape: a pure function that renders a
 * fully-formed `MailMessage` from data, with no I/O and no recipient
 * resolution of its own. Two departures from that shape, both scope-driven:
 *
 * 1. **`to` is a parameter, not resolved here.** `buildReceiptMessage` is
 *    called with the applicant's own address, already known to its caller.
 *    Here the caller (T-6's `ContactService`) resolves every administrator
 *    recipient from Cognito (T-5) and passes the result straight through —
 *    this file never touches `admin-recipient.resolver.ts` or Cognito.
 * 2. **`replyTo` is set, via `composeReplyTo` (T-2) — not reimplemented.**
 *    FR-4 requires the `Reply-To` display name to be composed safely
 *    (CR/LF stripped, RFC 5322 quoting, RFC 2047 encoding, a
 *    bare-address fallback); `reply-to.util.ts` already does exactly that,
 *    so this file only calls it.
 *
 * **Header/body split (FR-4's own boundary).** `Reply-To` is the ONLY
 * header carrying requester-supplied text. Every other requester-supplied
 * value — name, organization, category, the visitor's own "subject" field,
 * message, and the visitor's address — is rendered as BODY DATA, never as
 * an email header. `CONTACT_SUBJECT` (the `Subject:` HEADER SES sends) is
 * a fixed, server-generated constant containing no requester-supplied text
 * at all — it must not be confused with the DTO's own `subject` property,
 * which is a plain body field like `message`.
 *
 * **The provenance line (design.md §4.5, §6 — "the only control in the
 * whole spec that touches message CONTENT rather than automation").** An
 * unauthenticated visitor's text arrives in the inboxes of every
 * `admin`-group member under the registry's own display name (T-1, DD-5),
 * with a `Reply-To` the visitor chose. `CONTACT_PROVENANCE_LINE` is the
 * fixed opening statement that this is a public, unverified submission, so
 * no administrator reading it mistakes the sender's stated identity — name
 * OR the restated email address that follows it — for a verified one.
 * `CONTACT_PROVENANCE_LINE` itself carries NO interpolated data (so its
 * exact text is a stable, assertable constant); the address is rendered as
 * an ordinary labelled body field immediately below it, per FR-4's "renders
 * the requester's address as body data".
 *
 * **CR/LF stripping — single-line fields only (design.md §4.5, amended
 * 2026-08-28, T-3 rework).** Every requester-supplied value rendered as a
 * labelled `Field: value` line — name, organization, category, and the
 * visitor's own subject line — has CR/LF stripped before rendering, so a
 * value carrying an embedded newline cannot masquerade as an extra
 * labelled line the visitor did not actually supply (a body-content-
 * spoofing analogue of header injection). `message` is deliberately
 * EXEMPT: it renders last, as a free-text block with no labelled field
 * following it to spoof, and its internal line breaks are the visitor's
 * legitimate paragraph structure, not an attempt to forge a neighbouring
 * field. The stripping exists for header safety in the first place, and
 * `message` lands only in `Message.Body.Text.Data` — a body, not a
 * header — where a newline is just a newline and cannot inject or spoof
 * anything. *(This file previously stripped `message` too, "exactly like
 * every other field", which flattened multi-paragraph submissions into
 * one unreadable line for no security benefit; design.md §4.5's
 * amendment note 2 corrected that premise, and the trade-off this
 * docblock used to defend no longer exists.)*
 *
 * **Empty vs. absent organization render identically (T-4's review
 * forward-pointer).** `organization: ''` is an accepted DTO value, exactly
 * as valid as `organization` being absent. Both must produce a body with NO
 * dangling `Organization:` label — the line is omitted entirely rather than
 * rendered with a blank value, for either input.
 */

/**
 * The fixed `Subject:` header SES sends for every contact-form message.
 * Contains no requester-supplied text (FR-4) — the visitor's own "subject"
 * field is rendered as body data instead, see `renderBody` below.
 */
export const CONTACT_SUBJECT = 'New message from the ACCELERATE Tanzania contact form';

/**
 * The mandatory, fixed provenance line (design.md §4.5, §6). Carries no
 * interpolated data — see the file docblock for why the address is
 * rendered as a separate body field immediately below it instead of being
 * spliced into this sentence.
 */
export const CONTACT_PROVENANCE_LINE =
  "This message was submitted through the ACCELERATE Tanzania Seed Registry's public "
  + 'contact form. The sender\'s identity has NOT been verified — treat the name and '
  + 'address below as a claim, not a confirmed fact.';

/** Every requester-supplied value this template renders. */
export interface ContactSubmissionData {
  name: string;
  email: string;
  organization?: string;
  category: string;
  /** The visitor's own subject line — body data only, never the email `Subject:` header. */
  subject: string;
  message: string;
}

const CR_LF = /[\r\n]/g;

/** Strip CR and LF from a body-rendered field (see file docblock for scope and rationale). */
function stripCrLf(value: string): string {
  return (value ?? '').replace(CR_LF, '');
}

function renderBody(data: ContactSubmissionData): string {
  const name = stripCrLf(data.name);
  const email = stripCrLf(data.email);
  const organization = stripCrLf(data.organization ?? '');
  const category = stripCrLf(data.category);
  const subject = stripCrLf(data.subject);
  // Deliberately NOT stripped — `message` is body-only free text (see file
  // docblock); its newlines are legitimate paragraph structure and cannot
  // reach a header from here.
  const message = data.message;

  const lines: string[] = [CONTACT_PROVENANCE_LINE, '', `Name: ${name}`, `Email: ${email}`];

  // `''` and `undefined` must render identically — omit the label entirely for both.
  if (organization.length > 0) {
    lines.push(`Organization: ${organization}`);
  }

  lines.push(`Category: ${category}`, `Subject: ${subject}`, '', message);

  return lines.join('\n');
}

/**
 * Render a fully-formed contact-form `MailMessage`. `to` is supplied by the
 * caller (T-6) — this function never resolves recipients itself.
 */
export function buildContactMessage(to: string | string[], data: ContactSubmissionData): MailMessage {
  return {
    to,
    subject: CONTACT_SUBJECT,
    text: renderBody(data),
    replyTo: composeReplyTo(data.name, data.email),
  };
}
