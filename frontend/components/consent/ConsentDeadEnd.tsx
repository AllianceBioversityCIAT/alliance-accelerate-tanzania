/**
 * ConsentDeadEnd — the one page every dead link lands on
 * (actors/consent-intake/consent-request-email T-8, FR-11, NFR-2).
 *
 * Unknown, malformed, expired, answered, superseded and deleted-actor links
 * are indistinguishable on the wire (uniform `404`), so they are
 * indistinguishable here too: fixed copy, the data-protection contact from
 * the consent text, and NOTHING about any organization or actor — this
 * component takes no data props by design.
 */

import { CONSENT_PAGE_COPY, DATA_PROTECTION_CONTACT } from '@/lib/content/consent-requests';

export default function ConsentDeadEnd() {
  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <p className="max-w-prose text-sm text-fg">{CONSENT_PAGE_COPY.deadEndBody}</p>
      <p className="mt-4 text-sm text-fg">
        <span className="font-semibold">{DATA_PROTECTION_CONTACT.name}</span>
        <br />
        <a
          href={`mailto:${DATA_PROTECTION_CONTACT.email}`}
          className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {DATA_PROTECTION_CONTACT.email}
        </a>
      </p>
    </div>
  );
}
