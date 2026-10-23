// @sdd-spec admin/registration-review-queue (T-9)
import { MailMessage } from '../mail-transport.interface';
import { renderEmailHtml } from './email-layout';

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
/**
 * `reviewNote` is the reviewer's applicant-facing note, shown when present
 * (ATP-99, QA PBR-15). The structured rejection reason stays admin-only
 * (DC-32) and is never passed here.
 */
export function buildRejectionMessage(
  to: string,
  reference: string,
  reviewNote: string | null = null,
): MailMessage {
  const lookup = reviewNote
    ? 'You can also look up your submission at any time using this reference and the email address you registered with.'
    : "You can look up your submission at any time using this reference and the email address you registered with, to see the reviewer's note if one was left.";
  return {
    to,
    reference,
    subject: `Your registration was not approved — ${reference}`,
    text:
      'Your PABRA Seed Actors Registry registration has been reviewed and was not approved at this time.\n\n' +
      (reviewNote ? `Note from the reviewer:\n${reviewNote}\n\n` : '') +
      `Your reference is ${reference}. ${lookup}\n\n` +
      'If you believe this was in error, or your details have since changed, you are welcome to ' +
      'submit a new registration.',
    // No callout on the reference here: emphasising a number is the wrong
    // visual weight for a refusal, and the copy already carries it.
    html: renderEmailHtml({
      preheader: `${reference} was not approved.`,
      heading: 'Your registration was not approved',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Your PABRA Seed Actors Registry registration has been reviewed and was not approved at this time.',
        },
        ...(reviewNote
          ? [
              { kind: 'paragraph' as const, text: 'Note from the reviewer:' },
              { kind: 'quote' as const, text: reviewNote },
            ]
          : []),
        { kind: 'fields', rows: [{ label: 'Reference', value: reference }] },
        { kind: 'paragraph', text: lookup },
        {
          kind: 'note',
          text: 'If you believe this was in error, or your details have since changed, you are welcome to submit a new registration.',
        },
      ],
    }),
  };
}
