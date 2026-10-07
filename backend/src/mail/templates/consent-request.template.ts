// @sdd-spec actors/consent-intake/consent-request-email (T-4)
import { MailMessage } from '../mail-transport.interface';
import { getPublicAppBaseUrl } from '../mail.config';
import { renderEmailHtml } from './email-layout';

/**
 * FR-7 — the consent-request email.
 *
 * **Subject (FR-7, NFR-7, R-5).** `CONSENT_REQUEST_SUBJECT` is a fixed
 * constant carrying no trader name, address, token or request id, so any two
 * requests' messages are byte-identical on this field — including in Slack,
 * which posts every subject (ADR-015).
 *
 * **Link (FR-7, FR-8, design.md §5.3).** The token appears ONLY after the
 * `#` — `${PUBLIC_APP_BASE_URL}/consent/#t=<token>` — never in the path or
 * query, so it never reaches API Gateway access logs or CloudFront.
 *
 * **`MailMessage.reference` is left undefined** (design.md §7.1): dispatch
 * logs the request id itself; a request id is not needed in mail logs too.
 */
export const CONSENT_REQUEST_SUBJECT = 'Your consent is requested — ACCELERATE Tanzania Registry';

/** FR-13's data-protection contact, named in the consent text itself (P-18). */
const DATA_PROTECTION_CONTACT =
  'Questions about this request can be sent to Sylvia Kalemera (S.Kalemera@cgiar.org).';

const EXPIRY_NOTE =
  'This link expires in 30 days. If you were not expecting this request, you can ignore this email.';

function consentLinkUrl(token: string): string {
  return `${getPublicAppBaseUrl()}/consent/#t=${token}`;
}

export function buildConsentRequestMessage(
  to: string,
  organizationName: string,
  token: string,
): MailMessage {
  const link = consentLinkUrl(token);
  const siteAddress = getPublicAppBaseUrl();
  // FR-7 Content: "publish information about the organization (by name) on
  // the ACCELERATE Tanzania Registry (site address)" — the site address
  // itself must appear as wording in this paragraph, not only inside the
  // link button's `href` (Reviewer B issue 1).
  const intro =
    `Consent is requested to publish information about ${organizationName} on the ` +
    `ACCELERATE Tanzania Registry (${siteAddress}).`;

  return {
    to,
    subject: CONSENT_REQUEST_SUBJECT,
    text: `${intro}\n\nReview and respond: ${link}\n\n${EXPIRY_NOTE}\n\n${DATA_PROTECTION_CONTACT}`,
    html: renderEmailHtml({
      preheader: 'Review and respond to a consent request for the ACCELERATE Tanzania Registry.',
      heading: 'Your consent is requested',
      blocks: [
        { kind: 'paragraph', text: intro },
        { kind: 'link', label: 'Review and respond', href: link },
        { kind: 'note', text: EXPIRY_NOTE },
        { kind: 'note', text: DATA_PROTECTION_CONTACT },
      ],
    }),
  };
}
