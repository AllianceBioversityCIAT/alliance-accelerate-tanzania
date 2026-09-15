/**
 * privacy.ts — the Privacy Policy content module for `/privacy` (T-8, FR-5,
 * design.md §4.3, §5.1).
 *
 * T-8 replaces the placeholder scaffold wholesale with the Privacy Policy
 * text approved by the Alliance/CIAT legal owners
 * ("ACCELERATE Tanzania Registry - Privacy Policy.txt"), transcribed
 * verbatim below. Section 1 through the "Changes to this Privacy Policy"
 * section are LEGAL'S TEXT — engineering places it, does not author or
 * edit it (requirements.md §4 non-goals). The three sections after that
 * ("Who receives it" / "How it is handled" / "Not consent to publish") are
 * ENGINEERING-AUTHORED (D-9) and marked as such below.
 *
 * Transcription notes (verbatim ≠ blind copy of extraction artifacts):
 *  - The source .docx was extracted with `textutil`; its top-level section
 *    headings arrive as a bullet glyph ("\t•\tWho is Responsible for the
 *    Registry?"). Those ARE Legal's numbered section headings, not list
 *    items — the glyph is stripped, the heading text is not touched.
 *  - Repeated whitespace introduced purely by that extraction (e.g. the
 *    "Who is Responsible" section's operator line, which the source
 *    renders as "CIAT  Address:  Email:" with doubled spaces from a lost
 *    table/line-break) is normalized to single spaces. No word is added,
 *    removed, or reordered.
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
 *  - Legal's own unfilled fields — "Insert Date", "Insert CIAT Legal
 *    Entity", "Insert Email", "Insert Address", "Insert Telephone Number",
 *    and the several contact lines Legal left blank (e.g. "Email: " with
 *    nothing after) — are reproduced AS ORDINARY TEXT. They are not
 *    marked, flagged, or specially handled; the product owner will supply
 *    the filled text in a later edition. A blank contact value is kept as
 *    an empty string (`value: ''`), never invented or dropped (T-8 brief).
 *  - `version` is `'v1.0'` (T-8 brief). `effectiveDate` is `'Insert Date'`
 *    — Legal's own document states "Effective Date: Insert Date" and that
 *    is reproduced as the effective date, unfilled field and all.
 *
 * Ordering fidelity (why so many sections use `blocks` instead of the
 * simpler `paragraphs`/`bullets` fields): nearly every bulleted section in
 * Legal's approved text places another sentence AFTER the bullet list,
 * before the next heading (e.g. "Information We Collect": intro
 * paragraph, thirteen bullets, then "Not all information is necessarily
 * personal data..."). `LegalSection.blocks` (types.ts, T-8) renders
 * exactly the sequence given, so that trailing sentence is never silently
 * reordered ahead of the list it explains.
 *
 * The opening `lede` is Legal's source lines 3-4, two separate source
 * paragraphs (operator identity / what this policy explains). An earlier
 * revision merged them into a single string — a structural merge the
 * Reviewer caught (T-8 rework). `lede` is `string[]` here, one entry per
 * source paragraph, rendered as two separate `<p>` elements by
 * `LegalDocumentView` (types.ts).
 *
 * D-4 / D-10 (Cookies section, FR-5 scenario (b)): the "Cookies" section
 * below is Legal's text CARRIED VERBATIM AND UNAMENDED — it is not
 * reconciled with `/cookies`'s factual inventory, does not name Google,
 * and its "does not use cookies to collect personal information" sentence
 * stands exactly as Legal wrote it (requirements.md D-10 records this as
 * an accepted, not reconciled, divergence). The section's FINAL block is
 * an engineering-authored pointer sentence linking onward to `/cookies` —
 * clearly not Legal's words, appended after all of Legal's own content in
 * that section, exactly as D-4 requires. It carries no consent-change
 * control (that lives only on `/cookies`, D-4's "must NOT host" clause).
 */

import type { LegalDocument } from './types';

export const PRIVACY_POLICY: LegalDocument = {
  title: 'ACCELERATE Tanzania Registry Privacy Policy',
  version: 'v1.0',
  effectiveDate: 'Insert Date',
  lede: [
    'The ACCELERATE Tanzania Registry ("Registry") is an online platform operated by Insert ' +
      'CIAT Legal Entity ("CIAT", "we", "our", or "us") to increase the visibility of actors ' +
      'involved in seed systems and agricultural value chains, facilitate business and ' +
      'professional connections, and support access to market opportunities and services.',
    'This Privacy Policy explains how we collect, use, store, publish, and protect ' +
      'information provided through the Registry.',
  ],
  sections: [
    // -----------------------------------------------------------------
    // Legal's text — verbatim, sections 1 through "Changes to this
    // Privacy Policy".
    // -----------------------------------------------------------------
    {
      heading: 'Who is Responsible for the Registry?',
      paragraphs: [
        'The Registry is operated by:',
        'CIAT Address: Email:',
        'For purposes of the Registry, this entity acts as the organization responsible for ' +
          'the collection, use, storage, publication, and management of information submitted ' +
          'through the platform.',
      ],
    },
    {
      heading: 'Information We Collect',
      blocks: [
        { kind: 'paragraph', text: 'Depending on the information provided, the Registry may collect:' },
        {
          kind: 'bullets',
          items: [
            'Organization or partner name;',
            'Organization type;',
            'Contact person name;',
            'Position or role;',
            'Sex;',
            'Region and district;',
            'Main and other crops;',
            'Annual average capacity in tonnes;',
            'Telephone number;',
            'Email address;',
            'GPS coordinates and other location information;',
            'Information submitted through communications with Registry administrators;',
            'Technical information generated through use of the platform.',
          ],
        },
        {
          kind: 'paragraph',
          text:
            'Not all information is necessarily personal data. However, certain information ' +
            'may identify an individual directly or indirectly and will therefore be treated ' +
            'as personal data where applicable.',
        },
      ],
    },
    {
      heading: 'How We Collect Information',
      blocks: [
        { kind: 'paragraph', text: 'Information may be collected through:' },
        {
          kind: 'subBlocks',
          blocks: [
            {
              heading: 'Self-registration',
              paragraphs: [
                'Actors may submit their own information directly through the Registry and ' +
                  'provide consent electronically during registration.',
              ],
            },
            {
              heading: 'Administrator-managed registration',
              paragraphs: [
                'Information may be provided to project personnel or Registry administrators ' +
                  'and subsequently uploaded to the Registry after the required consent has ' +
                  'been obtained and documented.',
              ],
            },
            {
              heading: 'Platform operation',
              paragraphs: [
                'Certain technical information may be collected automatically to operate, ' +
                  'maintain, and secure the platform.',
              ],
            },
          ],
        },
      ],
    },
    {
      heading: 'Why We Use Information',
      blocks: [
        { kind: 'paragraph', text: 'Information is collected and used to:' },
        {
          kind: 'bullets',
          items: [
            'Operate and maintain the Registry;',
            'Publish actor profiles within the Registry;',
            'Facilitate business and professional connections;',
            'Increase visibility of participating actors;',
            'Respond to requests submitted by Registry participants;',
            'Improve the performance, functionality, and security of the platform;',
            'Comply with legal, regulatory, audit, and compliance requirements.',
          ],
        },
        {
          kind: 'paragraph',
          text:
            'We will not use information for purposes materially different from those ' +
            'described in this Privacy Policy without an appropriate legal basis or ' +
            'additional consent where required.',
        },
      ],
    },
    {
      heading: 'Public Nature of the Registry',
      blocks: [
        { kind: 'paragraph', text: 'A core purpose of the Registry is to make participating actors visible to users.' },
        {
          kind: 'paragraph',
          text: 'Accordingly, information included in approved profiles may be publicly available through the internet.',
        },
        { kind: 'paragraph', text: 'Information published through the Registry may:' },
        {
          kind: 'bullets',
          items: [
            'Be viewed worldwide;',
            'Be accessed without registration or login requirements;',
            'Be copied, downloaded, shared, referenced, or indexed by third parties or internet search engines.',
          ],
        },
        {
          kind: 'paragraph',
          text:
            'Users should only provide information that they are willing to make publicly ' +
            'available. While CIAT may remove information from the Registry upon request ' +
            'where appropriate, CIAT cannot guarantee the removal of information that has ' +
            'already been copied, shared, archived, or otherwise retained by third parties.',
        },
      ],
    },
    {
      heading: 'Business Information and Location Data',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The Registry may include information that could be commercially sensitive, including:',
        },
        {
          kind: 'bullets',
          items: [
            'Contact information;',
            'Business capacity information;',
            'Operational information;',
            'Location information;',
            'GPS coordinates where provided.',
          ],
        },
        {
          kind: 'paragraph',
          text: 'Participants are responsible for determining what information they wish to provide and publish through the Registry.',
        },
        {
          kind: 'paragraph',
          text:
            'Publication of such information occurs only on the basis of the applicable ' +
            'consent provided by the participant or authorized representative.',
        },
      ],
    },
    {
      heading: 'International Storage and Access',
      blocks: [
        { kind: 'paragraph', text: 'The Registry is hosted on cloud infrastructure located in Ireland.' },
        { kind: 'paragraph', text: 'As a result:' },
        {
          kind: 'bullets',
          items: [
            'Information may be stored and processed outside Tanzania;',
            'Information published through the Registry may be accessed internationally;',
            'Data may be transferred and processed across jurisdictions as necessary for operation of the Registry.',
          ],
        },
        {
          kind: 'paragraph',
          text:
            'By participating in the Registry, individuals acknowledge that information may ' +
            'be stored, processed, and accessed outside Tanzania in accordance with ' +
            'applicable legal requirements.',
        },
      ],
    },
    {
      heading: 'Legal Basis for Processing',
      blocks: [
        { kind: 'paragraph', text: 'The Registry primarily relies on the consent provided by participants.' },
        { kind: 'paragraph', text: 'Where applicable, information may also be processed when necessary for:' },
        {
          kind: 'bullets',
          items: [
            'Operation and administration of the Registry;',
            'Compliance with legal obligations;',
            'Audit, compliance, security, and fraud prevention purposes;',
            'Protection of the legitimate interests of CIAT and Registry users, where permitted by law.',
          ],
        },
      ],
    },
    {
      heading: 'Accuracy and Authority',
      blocks: [
        { kind: 'paragraph', text: 'Individuals submitting information are responsible for ensuring that:' },
        {
          kind: 'bullets',
          items: [
            'The information provided is accurate;',
            'They are authorized to submit information on behalf of an organization;',
            'They have the necessary authority to provide personal information relating to other individuals where applicable;',
            'Appropriate permissions have been obtained before providing information relating to third parties.',
          ],
        },
        {
          kind: 'paragraph',
          text:
            'CIAT may request reasonable evidence supporting such representations where ' +
            'necessary. CIAT does not independently verify the accuracy, completeness, or ' +
            'authority underlying all information submitted to the Registry and relies on ' +
            'the representations made by the submitting party.',
        },
      ],
    },
    {
      heading: 'Sharing of Information',
      blocks: [
        { kind: 'paragraph', text: 'Information may be shared:' },
        {
          kind: 'bullets',
          items: [
            'Through public publication on the Registry;',
            'With service providers supporting operation of the Registry who process information only on behalf of and under the instructions of CIAT, and who are subject to appropriate confidentiality and data protection obligations;',
            'With contractors acting on behalf of CIAT and subject to appropriate confidentiality obligations;',
            'Where required by law, regulation, judicial order, or lawful governmental request;',
            'As necessary to protect the rights, safety, security, or legitimate interests of CIAT or others.',
          ],
        },
        { kind: 'paragraph', text: 'CIAT does not sell personal data.' },
      ],
    },
    {
      heading: 'Data Retention',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Information will be retained only for as long as reasonably necessary to fulfill the purposes described in this Privacy Policy.',
        },
        { kind: 'paragraph', text: 'Published profile information may remain in the Registry until:' },
        {
          kind: 'bullets',
          items: [
            'The participant requests removal;',
            'The information is no longer required for Registry purposes; or',
            'CIAT decides to remove the profile.',
          ],
        },
        {
          kind: 'paragraph',
          text: 'Consent records and related documentation may be retained after profile removal for legal, audit, compliance, and recordkeeping purposes.',
        },
      ],
    },
    {
      heading: 'Your Rights',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Subject to applicable law, including the Tanzania Personal Data Protection Act, ' +
            '2022, where applicable, you have the right to:',
        },
        {
          kind: 'bullets',
          items: [
            'Request access to information relating to you;',
            'Request correction of inaccurate or incomplete information;',
            'Request updates to your profile;',
            'Request deletion of your profile and associated information;',
            'Withdraw consent previously provided;',
            'Object to or request restriction of certain processing activities;',
            'Request information regarding how your data is being used;',
            'Submit a complaint to a competent authority.',
          ],
        },
        { kind: 'paragraph', text: 'Withdrawal of consent will not affect processing carried out before such withdrawal.' },
        {
          kind: 'paragraph',
          text:
            'Please note that information previously copied, downloaded, shared, archived, ' +
            'or indexed by third parties may remain available outside the control of CIAT ' +
            'after removal from the Registry.',
        },
      ],
    },
    {
      heading: 'Security',
      paragraphs: [
        'CIAT implements reasonable administrative, technical, and organizational measures ' +
          'designed to protect information against unauthorized access, alteration, ' +
          'disclosure, misuse, or destruction.',
        'However, no internet-based service or electronic storage system can guarantee absolute security.',
      ],
    },
    {
      // D-4 / D-10 / FR-5 scenario (b) — Legal's text below is carried
      // VERBATIM AND UNAMENDED. Only the final block (the pointer to
      // /cookies) is engineering-authored — see module doc above.
      heading: 'Cookies',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The Registry may use cookies and similar technologies to support the operation, ' +
            'security, functionality, and performance of the platform.',
        },
        {
          kind: 'paragraph',
          text:
            'Cookies are small text files that are stored on a user’s device when visiting a ' +
            'website. These technologies may be used to:',
        },
        {
          kind: 'bullets',
          items: [
            'Enable and maintain essential platform functionality;',
            'Authenticate administrator sessions and maintain secure access to administrative features;',
            'Improve the performance and reliability of the Registry;',
            'Detect and prevent unauthorized access, fraud, or misuse;',
            'Generate aggregated and non-identifiable statistics regarding the use of the Registry; and',
            'Support troubleshooting, maintenance, and security monitoring activities.',
          ],
        },
        { kind: 'paragraph', text: 'Users will be provided with appropriate notice to manage cookie preferences.' },
        {
          kind: 'paragraph',
          text:
            'Users may also manage or disable cookies through their browser settings. Please ' +
            'note that disabling certain cookies may affect the availability or functionality ' +
            'of some features of the Registry.',
        },
        {
          kind: 'paragraph',
          text:
            'The Registry does not use cookies to collect personal information beyond what is ' +
            'reasonably necessary for the purposes described in this Privacy Policy.',
        },
        {
          kind: 'paragraph',
          text:
            'For additional information regarding the technologies used by the Registry, ' +
            'users may contact CIAT using the contact details provided in this Privacy Policy.',
        },
        // --- Engineering-authored pointer (D-4). NOT Legal's text. ---
        {
          kind: 'paragraph',
          text:
            'For the specific cookies this site sets today, and to change your consent ' +
            'choice, see the',
          link: { href: '/cookies', label: 'Cookie Notice' },
        },
      ],
    },
    {
      heading: 'Contact Us',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'If you have questions regarding this Privacy Policy, wish to exercise your ' +
            'rights, or would like to request access, correction, update, or removal of ' +
            'information, please contact:',
        },
        {
          kind: 'contact',
          entries: [
            { label: 'Contact', value: '' },
            { label: 'Email', value: '' },
            { label: 'Address', value: '' },
            { label: 'Telephone', value: '' },
          ],
        },
      ],
    },
    {
      heading: 'Changes to this Privacy Policy',
      paragraphs: [
        'CIAT may update this Privacy Policy from time to time to reflect changes in the ' +
          'Registry, legal requirements, operational practices, or technological developments.',
        'The most current version will be made available through the Registry. Continued ' +
          'participation in the Registry after any update becomes effective constitutes ' +
          'acknowledgment of the revised Privacy Policy.',
      ],
    },

    // -----------------------------------------------------------------
    // Engineering-authored (D-9). NOT Legal's text. Carries facts 2–4 of
    // the four-part contact-form obligation (requirements.md FR-5 scenario,
    // originating spec's FR-6). Fact 1 — what a submission collects — is
    // now discharged by Legal's "Information We Collect" section above,
    // via "Information submitted through communications with Registry
    // administrators". Kept as three separate sections, unchanged in
    // substance from the previous page, so each fact stays independently
    // testable (privacy-a11y.test.tsx asserts each separately).
    // -----------------------------------------------------------------
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
