// @sdd-spec actors/public-self-registration (T-3)
import { MailMessage } from '../mail-transport.interface';
import { renderEmailHtml } from './email-layout';

/**
 * FR-5 / FR-14 — the submission receipt.
 *
 * Sent after `POST /registrations` allocates the reference, so it carries
 * the reference the applicant needs for the status lookup (FR-6). Per FR-14
 * this is a convenience channel only — the receipt SCREEN (T-20), not this
 * email, is the flow's actual guarantee, and this copy must not promise a
 * review round-trip this chunk does not implement (design.md §5.4, D-10).
 */
/** Single source for the status-lookup link used by both parts (ATP-67 will change this value). */
const STATUS_LOOKUP_URL = 'https://d3idqvvg0xa1r7.cloudfront.net/register/status/';

export function buildReceiptMessage(to: string, reference: string): MailMessage {
  return {
    to,
    reference,
    subject: `Registration received — ${reference}`,
    text:
      'Thank you for registering with ACCELERATE Tanzania.\n\n' +
      `Your reference is ${reference}. Keep it — you can use it together with ` +
      'this email address to check your submission\'s status at any time at ' +
      `${STATUS_LOOKUP_URL}\n\n` +
      'An ACCELERATE Tanzania reviewer will check your submission. You do not ' +
      'need to take any further action.',
    html: renderEmailHtml({
      preheader: `Your reference is ${reference}. Keep it to check your status.`,
      heading: 'Registration received',
      blocks: [
        { kind: 'paragraph', text: 'Thank you for registering with ACCELERATE Tanzania.' },
        {
          kind: 'callout',
          label: 'Your reference',
          value: reference,
          caption: 'Keep this — you will need it together with this email address.',
        },
        { kind: 'paragraph', text: "You can check your submission's status at any time:" },
        { kind: 'link', label: 'Check status', href: STATUS_LOOKUP_URL },
        {
          kind: 'note',
          text: 'An ACCELERATE Tanzania reviewer will check your submission. You do not need to take any further action.',
        },
      ],
    }),
  };
}
