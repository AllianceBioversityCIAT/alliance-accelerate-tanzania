/**
 * terms.ts — the Terms of Use content module for `/terms` (T-5, FR-4,
 * design.md §4.3, §5.1).
 *
 * PLACEHOLDER TEXT — Legal has not yet delivered the Terms of Use (see
 * requirements.md §9, "Blocked by: delivery of the approved text"). Every
 * section body below is marked `[PLACEHOLDER TEXT — pending legal review]`,
 * mirroring the convention `backend/src/registrations/consent-policy.ts`
 * already uses for its own seed edition, so the marker reads the same way
 * whether it is found in the served consent policy or on this page.
 *
 * T-8 replaces this module wholesale with Legal's approved prose once it
 * is delivered — it does not edit these placeholder sections in place.
 *
 * D-6: nobody *accepts* this document (only the consent policy is
 * accepted, and only by an applicant registering an organisation), so
 * `/terms/page.tsx` renders this with no acceptance control, checkbox, or
 * "I agree" affordance — enforced here structurally, by never composing
 * anything but `LegalDocumentView` with no slot (FR-4's negative scenario;
 * verified by `terms-a11y.test.tsx`).
 */

import type { LegalDocument } from './types';

export const TERMS_OF_USE: LegalDocument = {
  title: 'Terms of Use',
  version: 'v1.0-placeholder',
  effectiveDate: '[PLACEHOLDER TEXT — pending legal review]',
  lede:
    '[PLACEHOLDER TEXT — pending legal review] These Terms of Use are awaiting final ' +
    'copy from the Alliance/CIAT legal owners. The section headings below are structural ' +
    'placeholders and do not reflect the approved terms.',
  sections: [
    {
      heading: '[PLACEHOLDER] Acceptance of these terms',
      paragraphs: [
        '[PLACEHOLDER TEXT — pending legal review] This section will describe what using ' +
          'this site means for accepting these terms.',
      ],
    },
    {
      heading: '[PLACEHOLDER] Use of the registry',
      paragraphs: [
        '[PLACEHOLDER TEXT — pending legal review] This section will describe permitted ' +
          'and prohibited uses of the seed system registry and its data.',
      ],
    },
    {
      heading: '[PLACEHOLDER] Intellectual property',
      paragraphs: [
        '[PLACEHOLDER TEXT — pending legal review] This section will describe ownership ' +
          'and permitted reuse of content published on this site.',
      ],
    },
    {
      heading: '[PLACEHOLDER] Disclaimer of warranties',
      paragraphs: [
        '[PLACEHOLDER TEXT — pending legal review] This section will describe the basis ' +
          'on which registry data and site availability are provided.',
      ],
    },
    {
      heading: '[PLACEHOLDER] Limitation of liability',
      paragraphs: [
        '[PLACEHOLDER TEXT — pending legal review] This section will describe the limits ' +
          'of liability for use of this site and its data.',
      ],
    },
    {
      heading: '[PLACEHOLDER] Changes to these terms',
      paragraphs: [
        '[PLACEHOLDER TEXT — pending legal review] This section will describe how and ' +
          'when these terms may change.',
      ],
    },
    {
      heading: '[PLACEHOLDER] Contact',
      paragraphs: [
        '[PLACEHOLDER TEXT — pending legal review] This section will describe how to ' +
          'reach the programme team with questions about these terms.',
      ],
    },
  ],
};
