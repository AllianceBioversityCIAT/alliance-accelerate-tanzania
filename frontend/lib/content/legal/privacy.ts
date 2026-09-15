/**
 * privacy.ts — the Privacy Policy content module for `/privacy` (T-5,
 * FR-5, design.md §4.3, §5.1).
 *
 * PLACEHOLDER TEXT — Legal has not yet delivered the Privacy Policy (see
 * requirements.md §9, "Blocked by: delivery of the approved text"). The
 * sections below marked `[PLACEHOLDER]` are structural stand-ins for
 * Legal's eventual sections and are marked
 * `[PLACEHOLDER TEXT — pending legal review]` throughout, mirroring the
 * convention `backend/src/registrations/consent-policy.ts` already uses.
 * T-8 replaces them wholesale with Legal's approved prose (D-9: Legal's
 * "Information We Collect" will discharge the collection half of the
 * contact-form obligation below).
 *
 * NOT placeholder — carried over verbatim from the previous `/privacy`
 * page as real, delivered content (T-5 task brief, item C; the originating
 * spec's FR-6): the four contact-channel facts a contact-form submission
 * requires disclosure of. These are facts about this system, authored by
 * engineering, not legal prose, so they are not placeholder-marked and are
 * NOT removed or edited by T-8 (design.md D-9) — only Legal's collection
 * statement is added ahead of them. Kept as four separate sections,
 * mirroring the previous page's structure, so each of the four facts is
 * independently testable (`privacy-a11y.test.tsx` asserts each
 * separately):
 *   1. what a contact submission collects
 *   2. who receives it
 *   3. that it is relayed by email and NOT stored by the platform
 *   4. that submitting is NOT consent to publish anything in the public
 *      registry
 *
 * Scope statement (design.md §4.3 reversion challenge). The lede below
 * RETAINS the limitation clause that this notice does not describe
 * registration or public-directory data handling — deleting it now would
 * over-promise to exactly the visitor it protects, before the approved
 * policy exists to make it true. T-8 removes it, not this task. The
 * "covers two things … and the analytics cookies" framing is corrected
 * here because cookie content has moved to `/cookies` (T-4): the lede now
 * names one subject (the contact form) and points the reader onward to
 * the Cookie Notice instead.
 */

import type { LegalDocument } from './types';

export const PRIVACY_POLICY: LegalDocument = {
  title: 'Privacy Policy',
  version: 'v1.0-placeholder',
  effectiveDate: '[PLACEHOLDER TEXT — pending legal review]',
  lede:
    'This notice covers what happens when you submit the contact form. For the cookies ' +
    'this site sets, see the Cookie Notice at /cookies. It does not describe how the ' +
    'registry handles data collected through organisation registration or shown in the ' +
    'public directory.',
  sections: [
    {
      heading: '[PLACEHOLDER] Information we collect',
      paragraphs: [
        '[PLACEHOLDER TEXT — pending legal review] This section will describe the ' +
          'categories of information this platform collects, including information ' +
          'submitted through communications with registry administrators.',
      ],
    },
    {
      heading: '[PLACEHOLDER] How we use information',
      paragraphs: [
        '[PLACEHOLDER TEXT — pending legal review] This section will describe the ' +
          'purposes for which collected information is used.',
      ],
    },
    {
      heading: '[PLACEHOLDER] Your rights',
      paragraphs: [
        '[PLACEHOLDER TEXT — pending legal review] This section will describe the rights ' +
          'available to individuals whose information is collected.',
      ],
    },
    // Not placeholder — real, delivered content (see module doc above).
    {
      heading: 'What a submission collects',
      paragraphs: [
        'When you submit the contact form we collect the name, email address, ' +
          'organisation (if you provide one), inquiry category, subject and message you ' +
          'enter, along with your acknowledgement of this notice.',
      ],
    },
    {
      heading: 'Who receives it',
      paragraphs: [
        'Your message is sent by email to the ACCELERATE Tanzania programme team — the ' +
          'administrators of this platform — so they can respond to you directly.',
      ],
    },
    {
      heading: 'How it is handled',
      paragraphs: [
        'Your message is relayed by email and is not stored by the platform — the ' +
          'registry keeps no copy of what you submit, and no record of your submission is ' +
          'added to the seed registry database.',
      ],
    },
    {
      heading: 'Not consent to publish',
      paragraphs: [
        'Submitting this form is not consent to publish any organisation’s information in ' +
          'the public registry. It does not change the consent status, contact visibility, ' +
          'or any other record of an actor in the directory.',
      ],
    },
  ],
};
