// @sdd-spec admin/registration-review-queue (T-8)
import { MailMessage } from '../mail-transport.interface';
import { renderEmailHtml } from './email-layout';

/**
 * FR-12 / FR-14 scenario 1 — the approval-decision message.
 *
 * Dispatched AFTER the approval transaction commits (DD-9,
 * `admin-registrations.service.ts`'s `dispatchApprovalEmail`), so it always
 * carries a reference that genuinely resolved to a published actor by the
 * time this is sent. Per FR-14, this is a convenience channel only — the
 * applicant can always learn the outcome via 3a's status lookup even with
 * email disabled (`MAIL_TRANSPORT` set to the no-op transport), so this copy
 * must not promise anything that lookup path does not also guarantee.
 */
export function buildApprovalMessage(to: string, reference: string): MailMessage {
  return {
    to,
    reference,
    subject: `Your registration has been approved — ${reference}`,
    text:
      'Good news — your ACCELERATE Tanzania registration has been reviewed and approved.\n\n' +
      `Your reference is ${reference}. Your organisation is now listed in the public seed ` +
      'system directory.\n\n' +
      'You can look up your submission at any time using this reference and the email ' +
      'address you registered with. You do not need to take any further action.',
    html: renderEmailHtml({
      preheader: `Approved — ${reference}. Your organisation is now listed.`,
      heading: 'Your registration has been approved',
      blocks: [
        { kind: 'paragraph', text: 'Good news — your ACCELERATE Tanzania registration has been reviewed and approved.' },
        { kind: 'callout', label: 'Your reference', value: reference },
        { kind: 'paragraph', text: 'Your organisation is now listed in the public seed system directory.' },
        {
          kind: 'note',
          text: 'You can look up your submission at any time using this reference and the email address you registered with. You do not need to take any further action.',
        },
      ],
    }),
  };
}
