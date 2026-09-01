// @sdd-spec admin/registration-review-queue (T-9)
import { MailMessage } from '../mail-transport.interface';

/**
 * FR-13 / FR-14 scenario 2 — the rejection-decision message.
 *
 * Dispatched AFTER the rejection transaction commits (DD-9,
 * `admin-registrations.service.ts`'s `dispatchRejectionEmail`), mirroring
 * `buildApprovalMessage`'s already-reviewed pattern exactly.
 *
 * **This copy must not promise anything the status-lookup path does not also
 * guarantee (NFR-10).** The applicant can always learn the outcome — status
 * AND the reviewer's note, if one was recorded — via 3a's public lookup even
 * with `MAIL_TRANSPORT` set to the no-op transport, so this message points
 * the applicant at that lookup rather than repeating the note's content: the
 * note itself may be empty, and this template has no access to it (only
 * `to`/`reference` are threaded through, matching `buildApprovalMessage`'s
 * signature) — repeating a value this function cannot see is not an option,
 * and pointing at the lookup keeps the two channels honest about which one
 * actually carries the note.
 */
export function buildRejectionMessage(to: string, reference: string): MailMessage {
  return {
    to,
    reference,
    subject: `Your registration was not approved — ${reference}`,
    text:
      'Your ACCELERATE Tanzania registration has been reviewed and was not approved at this time.\n\n' +
      `Your reference is ${reference}. You can look up your submission at any time using this ` +
      'reference and the email address you registered with to see the reviewer\'s note, if one was ' +
      'left.\n\n' +
      'If you believe this was in error, or your details have since changed, you are welcome to ' +
      'submit a new registration.',
  };
}
