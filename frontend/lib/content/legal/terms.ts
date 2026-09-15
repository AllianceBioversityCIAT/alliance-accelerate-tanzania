/**
 * terms.ts — the Terms of Use content module for `/terms` (T-8, FR-4,
 * design.md §4.3, §5.1).
 *
 * T-8 replaces the placeholder scaffold wholesale with the Terms of Use
 * text approved by the Alliance/CIAT legal owners
 * ("ACCELERATE Tanzania Registry - Terms of Use.txt"), transcribed
 * verbatim below in full — engineering places this text, it does not
 * author or edit it (requirements.md §4 non-goals).
 *
 * Transcription notes (verbatim ≠ blind copy of extraction artifacts):
 *  - The source .docx was extracted with `textutil`; its top-level section
 *    headings arrive as a bullet glyph ("\t•\tPurpose of the Registry").
 *    Those ARE Legal's numbered section headings, not list items — the
 *    glyph is stripped, the heading text is not touched. The final
 *    section's heading survived extraction as literal "15. Contact
 *    Information" (a typed number, not a bullet glyph) — reproduced
 *    exactly, number included, since it is Legal's own heading text, not
 *    an artifact to strip.
 *  - Double quotes in Legal's prose are reproduced as straight ASCII `"`,
 *    matching the source .txt exactly (T-8 rework, product-owner
 *    instruction: "respeta la estructura de Legal"). They need no
 *    escaping in these single-quoted TS string literals either way, so
 *    there was never an engineering reason to alter their glyph shape —
 *    an earlier revision of this module converted them to typographic
 *    curly quotes and that was reverted as an unratified edit to Legal's
 *    text. Apostrophes ARE rendered as typographic curly apostrophes (’),
 *    the same convention `cookies.ts` already uses — that conversion is
 *    escaping-driven: an unescaped `'` would terminate a single-quoted
 *    string literal early, so it is the one glyph-shape change engineering
 *    is justified in making. Neither conversion changes wording.
 *  - Legal's own unfilled fields — "Insert Email", "Insert Address",
 *    "Insert Telephone Number" — and the blank "Contact person:" line are
 *    reproduced AS ORDINARY TEXT, not flagged or specially handled; the
 *    product owner supplies the filled text in a later edition. The blank
 *    "Contact person" line is kept as an empty string value, never
 *    invented or dropped (T-8 brief).
 *  - `version` is `'v1.0'` (T-8 brief). `effectiveDate` is `'Insert Date'`
 *    — Legal's own document states "Effective Date: Insert Date" and that
 *    is reproduced as the effective date, unfilled field and all.
 *
 * Ordering fidelity and the nested bullet (why `blocks` is used
 * throughout): nearly every bulleted section places another sentence
 * AFTER the bullet list, before the next heading — `LegalSection.blocks`
 * (types.ts, T-8) renders the exact sequence given so that sentence is
 * never hoisted ahead of the list it explains. §"Profile Updates and
 * Removal" additionally contains a bullet that itself carries five nested
 * sub-bullets ("Remove profiles or information that:") — the reason
 * `LegalBulletItem.children` exists.
 *
 * The opening `lede` is Legal's source lines 3-5, three separate source
 * paragraphs (welcome / operator identity / binding assent clause). An
 * earlier revision merged them into a single string, which folded the
 * binding assent clause ("By accessing or using the Registry, you agree
 * to comply...") into the same paragraph as the welcome and operator
 * identity — a structural merge the Reviewer caught (T-8 rework). `lede`
 * is `string[]` here, one entry per source paragraph, rendered as three
 * separate `<p>` elements by `LegalDocumentView` (types.ts).
 *
 * D-6 (FR-4's negative scenario): nobody *accepts* this document — only
 * the consent policy is, and only by an applicant registering an
 * organisation. `/terms/page.tsx` composes `LegalDocumentView` with no
 * `slot`, so this module supplies no checkbox, button, or "I agree"
 * affordance anywhere below — enforced structurally, verified by
 * `terms-a11y.test.tsx`.
 */

import type { LegalDocument } from './types';

export const TERMS_OF_USE: LegalDocument = {
  title: 'ACCELERATE Tanzania Registry - Terms of Use',
  version: 'v1.0',
  effectiveDate: 'Insert Date',
  lede: [
    'Welcome to the ACCELERATE Tanzania Registry (the "Registry").',
    'The Registry is operated by CIAT ("CIAT", "we", "our", or "us").',
    'By accessing or using the Registry, you agree to comply with these Terms of Use. If you ' +
      'do not agree with these Terms, you should not access or use the Registry.',
  ],
  sections: [
    {
      heading: 'Purpose of the Registry',
      paragraphs: [
        'The Registry is intended to facilitate visibility, networking, and connections ' +
          'among actors operating within agricultural value chains, including seed ' +
          'companies, traders, processors, service providers, research institutions, ' +
          'development organizations, and other stakeholders.',
        'The Registry is provided as an informational resource only.',
      ],
    },
    {
      heading: 'Registry Content',
      paragraphs: [
        'The Registry contains information submitted voluntarily by participating ' +
          'organizations and individuals, either directly through self-registration or ' +
          'through administrator-managed registration processes.',
        'Information published in the Registry is provided by the relevant participants ' +
          'and may include business information, contact details, operational information, ' +
          'and location information.',
      ],
    },
    {
      heading: 'No Verification or Endorsement',
      blocks: [
        { kind: 'paragraph', text: 'CIAT does not independently verify all information submitted to the Registry.' },
        { kind: 'paragraph', text: 'Publication of a profile does not constitute:' },
        {
          kind: 'bullets',
          items: [
            'An endorsement by CIAT;',
            'A certification of the participant;',
            'A recommendation of any product or service;',
            'Confirmation of the accuracy, completeness, or reliability of the information provided.',
          ],
        },
        {
          kind: 'paragraph',
          text: 'Users are solely responsible for conducting their own due diligence before relying on information available through the Registry.',
        },
      ],
    },
    {
      heading: 'Responsibility for Submitted Information',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Any person or organization submitting information to the Registry is responsible for ensuring that:',
        },
        {
          kind: 'bullets',
          items: [
            'The information is accurate and up to date;',
            'They are authorized to submit the information;',
            'They are authorized to provide any third-party information included in the submission;',
            'Publication of the information does not violate any applicable law, confidentiality obligation, contractual obligation, or third-party right.',
          ],
        },
        { kind: 'paragraph', text: 'CIAT may request evidence supporting these representations where appropriate.' },
      ],
    },
    {
      heading: 'Public Nature of the Registry',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Users acknowledge that information published in the Registry is intended to be publicly available.',
        },
        { kind: 'paragraph', text: 'Information may be:' },
        {
          kind: 'bullets',
          items: ['Accessed worldwide;', 'Indexed by search engines;', 'Copied, shared, or referenced by third parties.'],
        },
        {
          kind: 'paragraph',
          text: 'CIAT cannot control or prevent the use of information by third parties once such information has been made publicly available.',
        },
      ],
    },
    {
      heading: 'User Conduct',
      blocks: [
        { kind: 'paragraph', text: 'Users agree not to:' },
        {
          kind: 'bullets',
          items: [
            'Use the Registry for unlawful purposes;',
            'Upload false, misleading, or fraudulent information;',
            'Interfere with the operation or security of the Registry;',
            'Attempt to gain unauthorized access to any part of the Registry;',
            'Use automated tools, bots, crawlers, scrapers, data-mining tools, or similar technologies to extract, harvest, reproduce, or compile information from the Registry without CIAT’s prior written authorization.',
            'Use information obtained from the Registry for unlawful, abusive, discriminatory, or harmful purposes.',
          ],
        },
        { kind: 'paragraph', text: 'CIAT reserves the right to restrict or terminate access to users who violate these Terms.' },
      ],
    },
    {
      heading: 'Third-Party Interactions',
      blocks: [
        { kind: 'paragraph', text: 'The Registry may facilitate contact between users and participating organizations.' },
        {
          kind: 'paragraph',
          text:
            'Any communication, transaction, collaboration, agreement, purchase, sale, or ' +
            'other interaction arising from information contained in the Registry is solely ' +
            'between the relevant parties.',
        },
        { kind: 'paragraph', text: 'CIAT is not responsible for and shall not be liable for:' },
        {
          kind: 'bullets',
          items: [
            'Any transaction between users;',
            'Any contractual relationship between third parties;',
            'The quality, suitability, safety, legality, or availability of products or services offered by Registry participants;',
            'Any loss, damage, dispute, or claim arising from interactions between users.',
          ],
        },
      ],
    },
    {
      heading: 'Intellectual Property',
      paragraphs: [
        'The Registry, including its design, structure, software, content developed by ' +
          'CIAT, logos, trademarks, and related materials, is protected by applicable ' +
          'intellectual property laws.',
        'Nothing in these Terms grants any ownership rights in the Registry or its underlying systems.',
        'Users may access and use the Registry solely for its intended purposes.',
      ],
    },
    {
      heading: 'Privacy and Personal Data',
      paragraphs: [
        'The collection, use, storage, publication, and processing of personal data through ' +
          'the Registry is governed by the applicable Privacy Policy and Consent documentation.',
        'Users should review those documents carefully before submitting information or using the Registry.',
        'Users acknowledge that information published through the Registry may contain ' +
          'personal data and business information that has been made available based on the ' +
          'consent of the relevant participant. Users shall process and use such information ' +
          'responsibly and in accordance with applicable laws.',
      ],
    },
    {
      // Nested bullet (types.ts's LegalBulletItem.children) — "Remove
      // profiles or information that:" carries five sub-bullets.
      heading: 'Profile Updates and Removal',
      blocks: [
        { kind: 'paragraph', text: 'CIAT reserves the right to:' },
        {
          kind: 'bullets',
          items: [
            'Correct administrative errors;',
            'Request clarification regarding submitted information;',
            'Refuse publication of information;',
            'Suspend publication of profiles;',
            {
              text: 'Remove profiles or information that:',
              children: [
                'Appears inaccurate;',
                'Violates these Terms;',
                'Creates legal, security, operational, or reputational risks;',
                'Is the subject of a valid removal request;',
                'Is no longer relevant to the purposes of the Registry.',
              ],
            },
          ],
        },
        { kind: 'paragraph', text: 'CIAT is not obligated to publish or maintain any profile in the Registry.' },
      ],
    },
    {
      heading: 'Availability of the Registry',
      blocks: [
        { kind: 'paragraph', text: 'CIAT makes reasonable efforts to maintain the availability of the Registry.' },
        { kind: 'paragraph', text: 'However, CIAT does not guarantee that:' },
        {
          kind: 'bullets',
          items: [
            'The Registry will always be available;',
            'Access will be uninterrupted;',
            'The Registry will be error-free;',
            'The Registry will always operate without delays, interruptions, failures, or technical issues.',
          ],
        },
        { kind: 'paragraph', text: 'CIAT may modify, suspend, or discontinue all or part of the Registry at any time.' },
      ],
    },
    {
      heading: 'Disclaimer of Warranties',
      blocks: [
        { kind: 'paragraph', text: 'The Registry is provided on an "as is" and "as available" basis.' },
        {
          kind: 'paragraph',
          text: 'To the fullest extent permitted by applicable law, CIAT disclaims all warranties, whether express or implied, including warranties of:',
        },
        {
          kind: 'bullets',
          items: ['Accuracy;', 'Reliability;', 'Availability;', 'Fitness for a particular purpose;', 'Non-infringement.'],
        },
      ],
    },
    {
      heading: 'Limitation of Liability',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'To the fullest extent permitted by applicable law, CIAT shall not be liable for ' +
            'any direct, indirect, incidental, consequential, special, exemplary, or punitive ' +
            'damages arising out of or relating to:',
        },
        {
          kind: 'bullets',
          items: [
            'Use of the Registry;',
            'Reliance on Registry information;',
            'Interactions between users;',
            'Publication or removal of information;',
            'Unavailability of the Registry;',
            'Unauthorized access to the Registry;',
            'Errors or omissions in Registry content.',
          ],
        },
        {
          kind: 'paragraph',
          text: 'In no event shall CIAT’s aggregate liability arising out of or relating to the Registry exceed the maximum extent permitted under applicable law.',
        },
      ],
    },
    {
      heading: 'Indemnification',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Any person or organization submitting information to the Registry agrees to ' +
            'indemnify, defend, and hold harmless CIAT, its employees, officers, agents, ' +
            'affiliates, and representatives from and against any claims, liabilities, ' +
            'damages, losses, costs, or expenses (including reasonable legal fees) arising from:',
        },
        {
          kind: 'bullets',
          items: [
            'Information submitted to the Registry;',
            'Any allegation that the submitter lacked authority to provide or publish such information;',
            'Any infringement of third-party rights;',
            'Any breach of these Terms of Use.',
          ],
        },
      ],
    },
    {
      heading: 'Use of CIAT Name, Logos and Trademarks',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Nothing in these Terms of Use grants any right to use the name, logo, trademarks, service marks, trade names, branding elements, or other intellectual property of CIAT.',
        },
        { kind: 'paragraph', text: 'Users may not:' },
        {
          kind: 'bullets',
          items: [
            'Use the name of CIAT in a manner that suggests endorsement, sponsorship, certification, partnership, or affiliation where none exists;',
            'Reproduce, display, modify, distribute, or otherwise use CIAT’s logos, trademarks, or branding materials without CIAT’s prior written authorization;',
            'Represent themselves as agents, representatives, partners, or affiliates of CIAT simply because they are listed in the Registry.',
          ],
        },
        {
          kind: 'paragraph',
          text:
            'Participation in the Registry does not confer any right to state or imply that ' +
            'CIAT endorses, certifies, approves, recommends, sponsors, or supports any ' +
            'participant, product, service, activity, or commercial operation.',
        },
      ],
    },
    {
      heading: 'Dispute Resolution, Governing Law and Privileges and Immunities',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Any dispute, controversy, or claim arising out of or relating to these Terms of Use or the use of the Registry shall be resolved as follows:',
        },
        {
          kind: 'bullets',
          items: [
            'The parties shall first seek to resolve any dispute amicably through good faith discussions. Such discussions shall continue for a period of thirty (30) calendar days from the date one party notifies the other of the existence of a dispute.',
            'If the dispute cannot be resolved amicably within thirty (30) calendar days, either party may submit the dispute to arbitration.',
            'The arbitration shall be conducted by three arbitrators. Each party shall appoint one arbitrator, and the two arbitrators shall jointly appoint the third arbitrator, who shall act as Chair. By mutual agreement, the parties may agree to submit the dispute to a sole arbitrator.',
            'If the parties are unable to agree on the appointment of the Chair, such appointment shall be made in accordance with the Arbitration Rules of the United Nations Commission on International Trade Law (UNCITRAL).',
            'The arbitration shall be conducted in Nairobi, Kenya, and the language of the proceedings shall be English.',
            'The arbitration shall be conducted in accordance with the UNCITRAL Arbitration Rules then in force.',
            'These Terms of Use shall be governed by the UNIDROIT Principles of International Commercial Contracts.',
            'A failure or delay by either party to exercise any right under these Terms shall not constitute a waiver of that right, nor shall any waiver of a breach constitute a waiver of any subsequent breach.',
            'Nothing in these Terms of Use shall be construed as a waiver, express or implied, of any privileges and immunities enjoyed by CIAT under applicable host country agreements, international agreements, or principles of international law. Any such privileges and immunities are expressly reserved.',
          ],
        },
      ],
    },
    {
      heading: 'Changes to the Registry or these Terms',
      paragraphs: [
        'CIAT may update these Terms of Use from time to time.',
        'The most recent version will be made available through the Registry.',
        'Continued use of the Registry after changes become effective constitutes acceptance of the revised Terms.',
      ],
    },
    {
      // Legal's source types this one heading as "15. Contact Information" while
      // every other heading in the document is unnumbered — an inconsistency in
      // the source, not a numbering scheme (there is no 1-14). The "15. " is
      // dropped on the product owner's instruction, 2026-09-15; recorded as D-14
      // so a future reader diffing against Legal's file finds the authorization
      // rather than reading it as drift.
      heading: 'Contact Information',
      blocks: [
        { kind: 'paragraph', text: 'For questions regarding these Terms of Use, please contact:' },
        {
          kind: 'contact',
          entries: [
            { label: 'Contact person', value: '' },
            { label: 'Email', value: 'Insert Email' },
            { label: 'Address', value: 'Insert Address' },
            { label: 'Telephone', value: 'Insert Telephone Number' },
          ],
        },
      ],
    },
  ],
};
