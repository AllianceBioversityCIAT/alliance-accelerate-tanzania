// @sdd-spec actors/public-self-registration (T-3)
import { MailMessage } from '../mail-transport.interface';

/**
 * FR-5 / FR-14 — the submission receipt.
 *
 * Sent after `POST /registrations` allocates the reference, so it carries
 * the reference the applicant needs for the status lookup (FR-6). Per FR-14
 * this is a convenience channel only — the receipt SCREEN (T-20), not this
 * email, is the flow's actual guarantee, and this copy must not promise a
 * review round-trip this chunk does not implement (design.md §5.4, D-10).
 */
export function buildReceiptMessage(to: string, reference: string): MailMessage {
  return {
    to,
    reference,
    subject: `Registration received — ${reference}`,
    text:
      'Thank you for registering with ACCELERATE Tanzania.\n\n' +
      `Your reference is ${reference}. Keep it — you can use it together with ` +
      'this email address to check your submission\'s status at any time.\n\n' +
      'An ACCELERATE Tanzania reviewer will check your submission. You do not ' +
      'need to take any further action.',
  };
}
