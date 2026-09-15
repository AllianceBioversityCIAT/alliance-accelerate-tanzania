/**
 * T-1 — Consent policy: an append-only registry of editions (FR-1, D-1,
 * design.md §4.1, §4.2).
 *
 * Served over `GET /registrations/consent-policy` and deliberately NOT
 * duplicated into the frontend bundle (DD-7 of the originating spec): this
 * module is the single source of truth for both what an applicant is shown
 * and what the server will later accept back at `POST /registrations`
 * (design.md §4.1 step 4). A frontend-side copy of the version could assert
 * a value the server does not know, 400-ing every submission.
 *
 * **Why a registry of editions, not "the current text" (T-1 rework of the
 * T-2 module).** Before this task the module's exports WERE one edition's
 * prose directly — a version bump would overwrite that prose in `HEAD`
 * while `Registration.consentPolicyVersion` rows already in the database
 * kept pointing at the version that used to mean it, making the column a
 * pointer into nothing (D-1). The registry below makes a superseded
 * edition's exact text retrievable by its version string alone, forever,
 * without consulting git history (FR-1 scenario 2) — and derives
 * `CONSENT_POLICY_VERSION` and `KNOWN_CONSENT_POLICY_VERSIONS` from it so a
 * version bump cannot update one and forget the other (FR-1 scenario 1,
 * defect class 3).
 *
 * PLACEHOLDER TEXT, RETAINED — the seed (first, oldest) edition below,
 * version `v1.0-placeholder`, was carried into the registry byte-for-byte
 * UNCHANGED from its pre-registry form and is retained here permanently
 * (D-8), even though it is no longer served to a new applicant. T-9
 * appended the approved `v1.0` edition below it once Legal delivered final
 * copy — it did not edit this seed edition to do so, and this edition is
 * never removed, regardless of how many later editions exist.
 */

export interface ConsentPolicySection {
  heading: string;
  body: string;
}

/**
 * One issued version of the consent policy — its own version string, the
 * date it was issued, and its own ordered sections (design.md §4.1).
 */
export interface ConsentPolicyEdition {
  version: string;
  issuedAt: string;
  sections: readonly ConsentPolicySection[];
}

/**
 * Un-frozen source list — OLDEST FIRST. Kept private: the only view any
 * other module can ever see is the frozen {@link CONSENT_POLICY_EDITIONS}
 * below. Splitting a plain source array from a frozen runtime export
 * mirrors `rejection-reasons.ts`'s `REJECTION_REASONS_SOURCE` /
 * `REJECTION_REASONS` split, for the same reason: one non-duplicated array
 * literal, one frozen view every real caller uses.
 */
const CONSENT_POLICY_EDITIONS_SOURCE: ConsentPolicyEdition[] = [
  {
    version: 'v1.0-placeholder',
    // The date this edition's prose actually entered the tree
    // ([SPEC:actors/public-self-registration] T-2, commit 7be7690,
    // 2026-08-05) — the registry did not exist yet at that point, so this
    // is the truest available "issued" date for the seed edition.
    issuedAt: '2026-08-05',
    sections: [
      {
        heading: '[PLACEHOLDER] What we collect',
        body:
          '[PLACEHOLDER TEXT — pending legal review, OQ-1] This section will describe ' +
          'the organisation and contact details collected on the registration form.',
      },
      {
        heading: '[PLACEHOLDER] Why we collect it',
        body:
          '[PLACEHOLDER TEXT — pending legal review, OQ-1] This section will explain ' +
          'the mapping purpose the seed registry serves and who relies on it.',
      },
      {
        heading: '[PLACEHOLDER] How it is published',
        body:
          '[PLACEHOLDER TEXT — pending legal review, OQ-1] This section will describe ' +
          'what becomes public once a submission is approved, and what does not.',
      },
      {
        heading: '[PLACEHOLDER] Your rights',
        body:
          '[PLACEHOLDER TEXT — pending legal review, OQ-1] This section will describe ' +
          'how an organisation can request correction or removal after publication.',
      },
    ],
  },
  {
    version: 'v1.0',
    // The date the Alliance/CIAT legal owners' approved text landed in this
    // registry (FR-2, ATP-54, T-9). Legal's source document is titled
    // "ACCELERATE Tanzania Registry Consent for Publication of
    // Information"; its structure is carried below in full, in the order
    // Legal wrote it, with TWO deliberate deviations — not one:
    //   1. The document's closing "Consent Statement" checkbox paragraph is
    //      not carried as a policy section at all — see
    //      {@link CONSENT_ACCEPTANCE_STATEMENT} for why.
    //   2. Within the "Consent" section below, Legal's sixth bullet ("I
    //      understand that CIAT may retain this consent and related
    //      records…") is carried as a trailing paragraph, not as a bullet.
    //      Legal marked it as an object of "I expressly and voluntarily
    //      consent to:", but as written it reads as a separate statement of
    //      understanding — a Word list-continuation artifact, not a
    //      neutral formatting choice. Engineering raised this, offered to
    //      restore the bullet, and the product owner declined on
    //      2026-09-15 and kept the paragraph form. Recorded as decision
    //      **D-12** (`requirements.md`) — read it before assuming this is
    //      an uncaught error.
    //
    // Legal's own text leaves the "Rights of Data Subjects" section's
    // contact line unfilled — "(Contact person) Email: Address:" — rather
    // than a real name/address. That is carried verbatim: engineering
    // places Legal's text and does not author or edit it, including by
    // filling in blanks Legal itself left open.
    issuedAt: '2026-09-15',
    sections: [
      {
        heading: 'Consent for Publication of Information',
        body:
          'The ACCELERATE Tanzania Registry is an online platform operated by the ' +
          'International Center for Tropical Agriculture (CIAT) to increase the visibility ' +
          'of actors involved in seed systems and agricultural value chains, facilitate ' +
          'business and professional connections, and support access to market ' +
          'opportunities and services.\n\n' +
          'For purposes of the ACCELERATE Tanzania Registry, CIAT acts as the organization ' +
          'responsible for the collection, storage, use, and publication of information ' +
          'submitted through the Registry.\n\n' +
          'Before submitting this registration, please read this Consent carefully.',
      },
      {
        heading: 'Purpose of the Registry',
        body:
          'The Registry is intended to facilitate connections among seed companies, ' +
          'traders, processors, NGOs, humanitarian organizations, digital service ' +
          'providers, research institutions, and other actors operating within ' +
          'agricultural value chains.\n\n' +
          'The information published through the Registry is intended to allow users to ' +
          'identify relevant actors, establish business relationships, access services, ' +
          'and connect with organizations operating in specific crops, value chains, and ' +
          'geographic areas.',
      },
      {
        heading: 'Information that may be collected and published',
        body:
          'Information submitted through the Registry may include:\n' +
          '- Organization or partner name;\n' +
          '- Partner type;\n' +
          '- Contact person name;\n' +
          '- Position or role;\n' +
          '- Sex;\n' +
          '- Region and district;\n' +
          '- Main and other crops;\n' +
          '- Annual average capacity in tonnes;\n' +
          '- Telephone number;\n' +
          '- Email address;\n' +
          '- GPS coordinates and other location information; and\n' +
          '- Any other information voluntarily provided through the registration ' +
          'process.\n\n' +
          'I understand that any information submitted through this registration and ' +
          'approved for publication may be displayed through the Registry and made ' +
          'available to users worldwide. Submit a complaint to the competent data ' +
          'protection authority or other competent authority in accordance with ' +
          'applicable law.',
      },
      {
        heading: 'Public Availability of Information',
        body:
          'I understand and acknowledge that:\n' +
          '- The Registry is publicly accessible through the internet.\n' +
          '- Information published through the Registry may be viewed by any person ' +
          'worldwide without registration or login requirements.\n' +
          '- Information published through the Registry may be copied, shared, ' +
          'downloaded, referenced, indexed by internet search engines, or otherwise ' +
          'accessed by third parties.\n' +
          '- Once information has been accessed, copied, downloaded, or indexed by ' +
          'third parties, CIAT may not be able to prevent further use of such ' +
          'information by those third parties.',
      },
      {
        heading: 'Business Information and Location Information',
        body:
          'I understand that some of the information submitted may be commercially ' +
          'sensitive or may reveal details regarding the activities, operations, ' +
          'capacity, or location of an organization.\n\n' +
          'In particular, I understand that:\n' +
          "- Annual average capacity in tonnes may reveal information regarding the " +
          "scale or capacity of an organization's operations.\n" +
          '- Telephone numbers and email addresses may enable direct contact by third ' +
          'parties\n' +
          '- GPS coordinates may reveal the precise location of facilities, operations, ' +
          'offices, activities, or other physical locations associated with the ' +
          'organization.\n\n' +
          'I acknowledge these implications and voluntarily choose to provide such ' +
          'information for publication through the Registry.',
      },
      {
        heading: 'International Storage and Access',
        body:
          'I understand and expressly agree that:\n' +
          '- Information submitted through the Registry may be stored, processed, and ' +
          'maintained outside Tanzania.\n' +
          '- The Registry is hosted on cloud infrastructure located in Ireland.\n' +
          '- Information published through the Registry may be accessed by individuals ' +
          'and organizations located both within and outside Tanzania.\n' +
          '- The information provided through this registration may therefore be ' +
          'subject to international transfer, storage, processing, and access.\n\n' +
          'I expressly consent to such international transfer, storage, processing, and ' +
          'public availability of the information submitted through the Registry.',
      },
      {
        heading: 'Authority to Provide Information',
        body:
          'By submitting this registration, I confirm that:\n' +
          '- I am authorized to submit information on behalf of the organization ' +
          'identified in this registration.\n' +
          '- The information provided is accurate to the best of my knowledge.\n' +
          '- I have the authority to authorize publication of the information submitted ' +
          'through the Registry.\n' +
          '- Where I provide information relating to an organization or another ' +
          'individual, I acknowledge that I am responsible for ensuring that I have the ' +
          'necessary authority and permissions to provide such information for ' +
          'publication through the Registry.\n' +
          '- I understand that CIAT may request reasonable evidence supporting the ' +
          'representations and authorizations made in this registration, including ' +
          'evidence of my authority to act on behalf of the organization and, where ' +
          'applicable, to provide and authorize publication of personal information ' +
          'relating to another individual.\n' +
          '- I agree to provide such supporting documentation or evidence upon request ' +
          'by CIAT.',
      },
      {
        heading: 'Rights of Data Subjects',
        body:
          'You have the right, at any time, to:\n' +
          '- Request access to the information associated with your profile.\n' +
          '- Request correction of inaccurate, incomplete, or outdated information.\n' +
          '- Request updates to your profile.\n' +
          '- Request the removal of your profile and associated information from the ' +
          'Registry.\n' +
          '- Withdraw your consent to the publication and use of your information.\n' +
          '- Request information regarding how your data is being used, stored, or ' +
          'disclosed through the Registry.\n' +
          '- Submit a complaint to the competent data protection authority or other ' +
          'competent authority in accordance with applicable law.\n\n' +
          'Withdrawal of consent will not affect any processing already carried out ' +
          'before the withdrawal request is received.\n\n' +
          'To exercise any of these rights, or if you have any questions regarding this ' +
          'Consent or the use of your information, please contact:\n' +
          '(Contact person) Email: Address:\n\n' +
          'Requests will be reviewed and addressed within a reasonable period of time ' +
          'and in accordance with applicable legal and data protection requirements.\n\n' +
          'I understand that requests to update, correct, or remove information ' +
          'published through the Registry may be submitted to the Registry ' +
          'administrators. I further understand that:\n' +
          '- Withdrawal of consent will not affect processing carried out before the ' +
          'withdrawal request is received and processed by CIAT.\n' +
          '- Information previously accessed, copied, downloaded, shared, or indexed by ' +
          'third parties may remain available outside the control of CIAT even after ' +
          'removal from the Registry.',
      },
      {
        heading: 'Consent',
        body:
          'By selecting the checkbox below and submitting this registration, I ' +
          'expressly and voluntarily consent to:\n' +
          '- The collection of the information provided through this registration;\n' +
          '- The storage and processing of such information by CIAT for purposes ' +
          'related to the operation of the ACCELERATE Tanzania Registry;\n' +
          '- The international transfer, storage, and processing of such information ' +
          'outside Tanzania;\n' +
          '- The public display and publication of the information provided through ' +
          'the Registry; and\n' +
          '- The worldwide accessibility of such information through the internet.\n\n' +
          'I understand that CIAT may retain this consent and related records for ' +
          'compliance, audit, legal, and operational purposes, including after my ' +
          'profile has been removed from the Registry in accordance with applicable ' +
          'record retention requirements.',
      },
    ],
  },
  // Any FUTURE edition is appended at the very END of this list, in
  // issuance order — NEVER inserted above, reordered, or removed (D-1,
  // D-8, design.md §4.2). A `Registration.consentPolicyVersion` row
  // pointing at a version this list no longer carries would be a pointer
  // into nothing.
  //
  // This comment used to sit BETWEEN the two editions above ("appended
  // BELOW this line"). Read literally at that position, a future author
  // inserting `v2.0` directly below it would place the new edition
  // BETWEEN `v1.0-placeholder` and `v1.0` — `deriveCurrentEdition` would
  // keep returning `v1.0` forever, silently never serving the new edition,
  // and nothing would redden (only `CONSENT_POLICY_EDITIONS[0].version` was
  // pinned). It is moved here, to the true end of the array, for that
  // reason. `consent-policy.spec.ts`'s `KNOWN_CONSENT_POLICY_VERSIONS`
  // full-sequence pin (`toEqual(['v1.0-placeholder', 'v1.0'])`) is the
  // falsifier that now catches an insert-in-the-middle mistake even if
  // this comment is misread again.
];

/**
 * The acceptance-checkbox label from Legal's approved text (FR-2, D-6) — NOT
 * a policy section. Legal's source document closes with two things: a
 * "Consent" section (carried above as `v1.0`'s final section) and a
 * separate "Consent Statement" block containing a `☐` checkbox line. The
 * checkbox line is the LABEL for the acceptance control that already exists
 * on the registration form (`ConsentPolicyDisclosure.tsx`); rendering it as
 * a policy section would place a second, inert, unchecked box next to the
 * real one — two checkboxes, one of them fake. It is therefore NOT part of
 * {@link CONSENT_POLICY_SECTIONS}, and that half of the original reasoning
 * stands unchanged.
 *
 * It IS, however, served — as the `acceptanceStatement` field of `GET
 * /registrations/consent-policy`, under **D-13**. That widening was a
 * deliberate, argued contract change, not drift: the frontend cannot import
 * `backend/src`, so the only alternative was hand-copying Legal's sentence
 * into `ConsentPolicyDisclosure.tsx` — two divergent copies of the exact
 * words a person legally accepts, with nothing that would ever 400 to
 * reveal the divergence. `ConsentPolicyDisclosure.tsx` renders this value
 * today; it is not a promise for later.
 *
 * (This comment previously asserted the opposite on every count — that the
 * field was absent from the response and that adding it would violate FR-1
 * scenario 3. It was left unswept when D-13 landed in the same change, and
 * told a future author that the shipped code broke a requirement. FR-1
 * scenario 3 constrains T-1's refactor, which moved nothing; D-13 is a
 * separate later decision.)
 *
 * Two corrections applied to the source text, both typographical, neither
 * legal substance: the leading `☐ ` glyph is stripped (the frontend already
 * renders a real `<input type="checkbox">`, so the drawn box is not part of
 * the label), and the doubled full stop at the end ("...where provided..")
 * is corrected to a single one.
 */
export const CONSENT_ACCEPTANCE_STATEMENT: string =
  'I confirm that I have read and understood this Consent for Publication of ' +
  'Information and voluntarily consent to the collection, storage, processing, ' +
  'international transfer, and public publication of the information provided ' +
  'through my registration in the ACCELERATE Tanzania Registry, including contact ' +
  'information, business information, capacity information, and location ' +
  'information where provided.';

/**
 * The append-only registry — OLDEST FIRST — and this module's single source
 * of truth (design.md §4.1). `CONSENT_POLICY_VERSION` and
 * `KNOWN_CONSENT_POLICY_VERSIONS` below are DERIVED from this list, never
 * hand-written literals, so a version bump that updates one export and
 * forgets the other becomes structurally impossible (FR-1 scenario 1,
 * defect class 3). `Object.freeze` on the array, on each edition, and on
 * each edition's `sections` stops a CALLER mutating the registry at
 * runtime — the same guard `rejection-reasons.ts`'s `REJECTION_REASONS`
 * applies to a different frozen list, for the same reason: a version
 * already written to a database column must keep resolving to real content
 * forever.
 *
 * Freeze does NOT stop a DEVELOPER deleting or reordering an edition in
 * `CONSENT_POLICY_EDITIONS_SOURCE` above in a future edit — nothing at
 * runtime can prevent that kind of change. The append-only invariant
 * against THAT is held by the retention tests alone
 * (`consent-policy.spec.ts`'s "retains v1.0-placeholder in the
 * known-version set" and "unchanged from the pre-registry module" tests) —
 * they are the guard, not this comment, and not `Object.freeze`.
 */
export const CONSENT_POLICY_EDITIONS: readonly ConsentPolicyEdition[] = Object.freeze(
  CONSENT_POLICY_EDITIONS_SOURCE.map((edition) =>
    Object.freeze({
      ...edition,
      sections: Object.freeze(edition.sections.map((section) => Object.freeze({ ...section }))),
    }),
  ),
);

/**
 * Pure derivation of the current EDITION — the FINAL element of an
 * oldest-first edition list. Both {@link deriveConsentPolicyVersion} (this
 * edition's `version`) and {@link CONSENT_POLICY_SECTIONS} below (this
 * edition's `sections`) are built from this one function, so "which edition
 * is current" is decided in exactly one place — they cannot disagree with
 * each other about it (FR-1 scenario 3: the public endpoint must serve the
 * current edition's sections under the current edition's version, never a
 * superseded edition's sections under the current version). Exposed as a
 * function of `editions`, not read only off the module-level
 * {@link CONSENT_POLICY_EDITIONS}, for the same testability reason
 * design.md §4.2 gives for {@link isVersionKnown}: at T-1, the registry
 * carried exactly ONE edition, so a test written only against the
 * module-level exports could not tell a real "last element" derivation from
 * one that (wrongly) reads the first. As of T-9 the registry is
 * multi-entry (`v1.0-placeholder`, `v1.0`) and a module-level comparison
 * could now discriminate too — which weakens, but does not remove, the case
 * for this seam (design.md §4.2): it keeps the property provable
 * independent of how many editions have shipped at any given time. Taking
 * `editions` as a parameter lets a test construct a synthetic multi-edition
 * array and prove the value returned really is the LAST edition, not any
 * other.
 */
export function deriveCurrentEdition(
  editions: readonly ConsentPolicyEdition[],
): ConsentPolicyEdition {
  return editions[editions.length - 1];
}

/**
 * Pure derivation of the current version — {@link deriveCurrentEdition}'s
 * `version` — used to build {@link CONSENT_POLICY_VERSION} below (FR-1).
 * Delegates to {@link deriveCurrentEdition} rather than re-deriving "last
 * element" with its own `editions[editions.length - 1]` expression, so
 * there is exactly one place in this module that decides which edition is
 * current.
 */
export function deriveConsentPolicyVersion(editions: readonly ConsentPolicyEdition[]): string {
  return deriveCurrentEdition(editions).version;
}

/**
 * Pure derivation of the known-version set — every edition's version, in
 * issuance order — used to build {@link KNOWN_CONSENT_POLICY_VERSIONS}
 * below (FR-1, design.md §4.2). Same parameterization reasoning as
 * {@link deriveConsentPolicyVersion} and {@link isVersionKnown}.
 */
export function deriveKnownConsentPolicyVersions(
  editions: readonly ConsentPolicyEdition[],
): readonly string[] {
  return Object.freeze(editions.map((edition) => edition.version));
}

/**
 * The version an applicant accepting this content today is shown, and the
 * value returned as `version` from the public endpoint. DERIVED — the final
 * (most recently appended) edition's version — never a hand-written literal
 * (FR-1 scenario 1).
 *
 * LATENT GATE (defect class 3) — NOW LIVE as of T-9. Recorded here, not
 * only in the T-1 rework report, because this is where the author of T-9
 * looked: the test that checks this export is really wired to
 * {@link deriveConsentPolicyVersion} (`consent-policy.spec.ts`,
 * "CONSENT_POLICY_VERSION is wired to this function applied to the real
 * registry") had NO runtime discriminator before T-9. This is a string
 * primitive — unlike {@link KNOWN_CONSENT_POLICY_VERSIONS}, which can
 * assert `Object.isFrozen` against a hand-written array literal, there is
 * nothing to freeze on a string, and with the pre-T-9 single-edition
 * registry a hand-written literal of the SAME value as this export was
 * indistinguishable at runtime from this derivation. Now that
 * `CONSENT_POLICY_EDITIONS_SOURCE` carries a second edition (`v1.0`, T-9),
 * a stale hand-written literal (e.g. the superseded `'v1.0-placeholder'`)
 * diverges in VALUE from this derivation and the wiring test reddens — see
 * its explicit `.not.toBe('v1.0-placeholder')` assertion for the direct
 * falsifier.
 */
export const CONSENT_POLICY_VERSION: string = deriveConsentPolicyVersion(CONSENT_POLICY_EDITIONS);

/**
 * Every consent policy version this server will accept back at submission
 * time (design.md §4.1 step 4, §4.2, FR-1 scenario 1 "superseded edition
 * stays served-acceptable"). DERIVED from {@link CONSENT_POLICY_EDITIONS} —
 * never a hand-written literal — in issuance order (oldest first), so
 * adding an edition updates this set and `CONSENT_POLICY_VERSION` together,
 * by construction. **Append-only** for the same reason the registry itself
 * is: removing an entry here would invalidate submissions already accepted
 * under it (D-1, D-8, design.md §4.2). Consumed by
 * `RegistrationsService.submitRegistration` via `isKnownConsentPolicyVersion`
 * below to reject a submission under an unknown policy version.
 */
export const KNOWN_CONSENT_POLICY_VERSIONS: readonly string[] =
  deriveKnownConsentPolicyVersions(CONSENT_POLICY_EDITIONS);

/**
 * The current (final) edition's sections, exactly as served by `GET
 * /registrations/consent-policy` (`RegistrationsController.getConsentPolicy`,
 * which T-1's refactor left untouched). Built from {@link deriveCurrentEdition} — the
 * SAME "which edition is current" derivation {@link CONSENT_POLICY_VERSION}
 * is built from — rather than a second, independent
 * `CONSENT_POLICY_EDITIONS[length - 1]` index expression, so the version an
 * applicant is shown and the sections they are shown can never come from
 * two different editions (FR-1 scenario 3: the endpoint "must NOT begin
 * serving a non-current edition"). Exported as a fresh, ordinary MUTABLE
 * array — matching the pre-registry module's export type exactly,
 * byte-for-byte — so **T-1's refactor** did not move the controller's
 * response contract an inch (same keys, same types across it). The response
 * has since gained `acceptanceStatement` under D-13 — a separate, later
 * decision, not a consequence of the refactor; this export is unaffected. The underlying
 * {@link ConsentPolicyEdition.sections} stays frozen and `readonly`; this is
 * a shallow copy taken for the one caller (`registrations.controller.ts`,
 * untouched by this task) that still needs the old, wider (mutable) type.
 */
export const CONSENT_POLICY_SECTIONS: ConsentPolicySection[] = [
  ...deriveCurrentEdition(CONSENT_POLICY_EDITIONS).sections,
];

/**
 * The parameterized half of the by-version lookup (FR-1 scenario 2 — a
 * superseded edition's sections must be retrievable by version alone,
 * without consulting git history). Same testability reasoning as
 * {@link deriveConsentPolicyVersion} and {@link isVersionKnown}: at T-1,
 * with a single-edition registry, a lookup tested only against
 * {@link CONSENT_POLICY_EDITIONS} could not distinguish "found the right
 * edition by version" from "there is only one edition to find". As of T-9
 * the registry is multi-entry, which weakens but does not remove the case
 * for this seam — it keeps the property provable with a controlled
 * fixture regardless of how many editions production carries. Taking
 * `editions` as a parameter lets a test construct a synthetic multi-edition
 * array and prove a NON-final edition's sections really do come back
 * intact.
 */
export function findConsentPolicyEdition(
  editions: readonly ConsentPolicyEdition[],
  version: string,
): ConsentPolicyEdition | undefined {
  return editions.find((edition) => edition.version === version);
}

/** The lookup any real caller uses — closes over the actual registry. */
export function getConsentPolicyEdition(version: string): ConsentPolicyEdition | undefined {
  return findConsentPolicyEdition(CONSENT_POLICY_EDITIONS, version);
}

/**
 * T-10 rework (T2-A2) — the parameterized, independently-testable half of
 * the acceptance check. Extracted because `isKnownConsentPolicyVersion`
 * closing over the module-level `KNOWN_CONSENT_POLICY_VERSIONS` — which
 * carried exactly ONE entry at the time — made every test of the wrapper
 * indistinguishable from a hardcoded
 * `version === CONSENT_POLICY_VERSION` check: with a one-element known set,
 * "is in the known set" and "equals the current version" agree on every
 * input, so a test built against the wrapper alone cannot tell a real
 * known-SET check apart from that narrower, wrong one. Taking `versions` as
 * a parameter lets a test construct a synthetic multi-entry array and prove
 * the SET semantics — which is what DD-7/§4.2's "superseded versions stay
 * accepted" promise actually depends on — independent of how many versions
 * production has shipped so far.
 *
 * T-1 note, resolved at T-9: the registry above NOW makes production's set
 * multi-entry (`v1.0-placeholder`, `v1.0`) — weakening, rather than
 * removing, the argument for this seam (design.md §4.2), since a
 * module-level test could now also discriminate a real set-membership check
 * from a narrower one. It stays parameterized and this comment stays
 * intact, because the synthetic-fixture property is still what makes the
 * SET semantics provable independent of how many editions ship next.
 */
export function isVersionKnown(versions: readonly string[], version: string): boolean {
  return versions.includes(version);
}

/** T-10's acceptance check (design.md §4.1 step 4). */
export function isKnownConsentPolicyVersion(version: string): boolean {
  return isVersionKnown(KNOWN_CONSENT_POLICY_VERSIONS, version);
}
