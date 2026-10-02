import { MailMessage } from '../mail-transport.interface';
import { getPublicAppBaseUrl } from '../mail.config';
import { renderEmailHtml } from './email-layout';

/**
 * ATP-78 — tells the platform admins a self-registration is waiting in the
 * review queue.
 *
 * Carries only what an admin needs to recognise the submission: the
 * organisation, its type and region, and the reference. The submitter's
 * contact details (person, phone, email) are deliberately left out — admins
 * read those in the console, behind auth, not in an inbox.
 */
const REVIEW_QUEUE_PATH = '/admin/registrations/';

export interface NewRegistrationNoticeData {
  reference: string;
  traderName: string;
  traderType: string;
  region: string;
}

/** `seed_company` → `Seed company`. */
function humanizeTraderType(value: string): string {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Submitter-supplied values never carry a line break into the message. */
function singleLine(value: string): string {
  return (value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

export function buildNewRegistrationMessage(
  to: string[],
  data: NewRegistrationNoticeData,
): MailMessage {
  const reviewQueueUrl = `${getPublicAppBaseUrl()}${REVIEW_QUEUE_PATH}`;
  const rows = [
    { label: 'Organisation', value: singleLine(data.traderName) },
    { label: 'Actor type', value: humanizeTraderType(singleLine(data.traderType)) },
    { label: 'Region', value: singleLine(data.region) },
    { label: 'Reference', value: data.reference },
  ];

  return {
    to,
    reference: data.reference,
    subject: `New registration awaiting review — ${data.reference}`,
    text:
      'A new self-registration was submitted to the ACCELERATE Tanzania registry ' +
      'and is waiting for review.\n\n' +
      rows.map((r) => `${r.label}: ${r.value}`).join('\n') +
      `\n\nReview it in the Admin console: ${reviewQueueUrl}`,
    html: renderEmailHtml({
      preheader: `${rows[0].value} is waiting for review (${data.reference}).`,
      heading: 'New registration awaiting review',
      blocks: [
        {
          kind: 'paragraph',
          text: 'A new self-registration was submitted to the ACCELERATE Tanzania registry and is waiting for review.',
        },
        { kind: 'fields', rows },
        { kind: 'link', label: 'Open the review queue', href: reviewQueueUrl },
      ],
    }),
  };
}
