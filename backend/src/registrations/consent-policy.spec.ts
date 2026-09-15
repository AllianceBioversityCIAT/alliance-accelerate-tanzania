// @sdd-spec legal/legal-notices-and-consent-copy (T-1, T-9)
/**
 * `consent-policy.ts` unit tests — the append-only registry of editions
 * (FR-1, design.md §4.1, §4.2). As of T-9 the registry carries two editions
 * (`v1.0-placeholder`, retained per D-8, and the approved `v1.0`).
 *
 * `isVersionKnown`'s tests below are UNCHANGED from the pre-registry module
 * (see that function's doc comment in `consent-policy.ts` for why they must
 * be run against a SYNTHETIC multi-entry array, independent of however many
 * entries the production `KNOWN_CONSENT_POLICY_VERSIONS` carries at any
 * given time). The new describe blocks apply the SAME reasoning to the
 * registry's own derivation and lookup functions —
 * `deriveConsentPolicyVersion`, `deriveCurrentEdition`,
 * `deriveKnownConsentPolicyVersions`, and `findConsentPolicyEdition` are all
 * parameterized for exactly this reason, and are all tested here against a
 * synthetic `TWO_EDITIONS` fixture.
 *
 * The "is wired to this function applied to the real registry" assertions
 * below are a DIFFERENT kind of test, and the paragraph above does not cover
 * them: each compares a module-level export to that export's own derivation
 * applied to PRODUCTION data (`CONSENT_POLICY_EDITIONS`). Before T-9, with a
 * single-edition registry, this was exactly the case the paragraph above
 * warns a synthetic fixture is needed for, and `CONSENT_POLICY_VERSION`'s
 * wiring test had no discriminator available to it at all. As of T-9 the
 * registry is multi-entry: `KNOWN_CONSENT_POLICY_VERSIONS`'s wiring test
 * still carries the stronger, permanent discriminator (`Object.isFrozen` —
 * a hand-written array literal is not frozen unless someone also freezes
 * it); `CONSENT_POLICY_VERSION`'s wiring test now has a real, if weaker,
 * discriminator too — a stale hand-written literal diverges in VALUE from
 * the derivation for the first time — see the "LATENT GATE" note on that
 * export in `consent-policy.ts` and the comment on that test below.
 */
import {
  CONSENT_ACCEPTANCE_STATEMENT,
  CONSENT_POLICY_EDITIONS,
  CONSENT_POLICY_SECTIONS,
  CONSENT_POLICY_VERSION,
  ConsentPolicyEdition,
  KNOWN_CONSENT_POLICY_VERSIONS,
  deriveConsentPolicyVersion,
  deriveCurrentEdition,
  deriveKnownConsentPolicyVersions,
  findConsentPolicyEdition,
  getConsentPolicyEdition,
  isVersionKnown,
} from './consent-policy';

describe('isVersionKnown', () => {
  const TWO_KNOWN_VERSIONS = ['v1.0-superseded', 'v2.0-current'];

  it('accepts a version that is in the set but is NOT the last (current) entry', () => {
    // The discriminating case: a naive `version === versions[versions.length - 1]`
    // implementation would reject this.
    expect(isVersionKnown(TWO_KNOWN_VERSIONS, 'v1.0-superseded')).toBe(true);
  });

  it('accepts the current (last) entry too', () => {
    expect(isVersionKnown(TWO_KNOWN_VERSIONS, 'v2.0-current')).toBe(true);
  });

  it('rejects a version absent from the set, even one that looks plausible', () => {
    expect(isVersionKnown(TWO_KNOWN_VERSIONS, 'v1.5-never-issued')).toBe(false);
    expect(isVersionKnown(TWO_KNOWN_VERSIONS, '')).toBe(false);
  });

  it('rejects everything against an empty set', () => {
    expect(isVersionKnown([], 'v1.0-superseded')).toBe(false);
  });
});

/**
 * A synthetic, two-edition fixture — independent of production data — used
 * throughout the rest of this file for exactly the reason `isVersionKnown`'s
 * tests above already use one: an assertion built only against production
 * data cannot prove a genuine multi-edition derivation apart from a
 * narrower one that merely happens to agree on however many editions
 * production carries at any given moment. That is true regardless of
 * whether that count is one (as it was before T-9) or two (as it is now,
 * `v1.0-placeholder` and `v1.0`) — this fixture keeps the property provable
 * independent of production's edition count, forever, not because
 * production happens to carry few editions today.
 */
const TWO_EDITIONS: ConsentPolicyEdition[] = [
  {
    version: 'v1.0-superseded',
    issuedAt: '2026-01-01',
    sections: [{ heading: 'Superseded heading', body: 'Superseded body' }],
  },
  {
    version: 'v2.0-current',
    issuedAt: '2026-06-01',
    sections: [{ heading: 'Current heading', body: 'Current body' }],
  },
];

describe('deriveConsentPolicyVersion (FR-1 scenario 1 — CONSENT_POLICY_VERSION tracks the FINAL edition)', () => {
  it("returns the LAST edition's version, not the first", () => {
    expect(deriveConsentPolicyVersion(TWO_EDITIONS)).toBe('v2.0-current');
  });

  it(
    'CONSENT_POLICY_VERSION is wired to this function applied to the real registry, not a ' +
      'separately hand-written literal',
    () => {
      // LATENT GATE (defect class 3) — NOW LIVE as of T-9. See the matching
      // note on CONSENT_POLICY_VERSION's own doc comment in
      // consent-policy.ts. Before T-9, with a single-edition registry, a
      // hand-written string literal of the SAME value as
      // CONSENT_POLICY_VERSION was indistinguishable from this derivation —
      // there was no runtime discriminator to assert for a string primitive
      // (unlike KNOWN_CONSENT_POLICY_VERSIONS below, which can assert
      // Object.isFrozen against an array). Now that CONSENT_POLICY_EDITIONS
      // carries a second edition, a STALE hand-written literal (e.g. the
      // superseded 'v1.0-placeholder') diverges in VALUE from this
      // derivation. The explicit negative check below is the direct
      // falsifier: hand-writing CONSENT_POLICY_VERSION = 'v1.0-placeholder'
      // reddens it (and the toBe above, since the derivation now returns
      // 'v1.0').
      expect(CONSENT_POLICY_VERSION).toBe(deriveConsentPolicyVersion(CONSENT_POLICY_EDITIONS));
      expect(CONSENT_POLICY_VERSION).not.toBe('v1.0-placeholder');
    },
  );
});

describe('deriveKnownConsentPolicyVersions (FR-1 scenario 1 — every edition stays known, in issuance order)', () => {
  it("includes a NON-final (superseded) edition's version, not only the current one", () => {
    expect(deriveKnownConsentPolicyVersions(TWO_EDITIONS)).toContain('v1.0-superseded');
  });

  it("returns every edition's version, in issuance order", () => {
    expect(deriveKnownConsentPolicyVersions(TWO_EDITIONS)).toEqual([
      'v1.0-superseded',
      'v2.0-current',
    ]);
  });

  it('dropping the non-final edition from the input removes it from the derived set', () => {
    const withoutTheSupersededEdition = [TWO_EDITIONS[1]];

    expect(deriveKnownConsentPolicyVersions(withoutTheSupersededEdition)).not.toContain(
      'v1.0-superseded',
    );
    expect(deriveKnownConsentPolicyVersions(withoutTheSupersededEdition)).toEqual([
      'v2.0-current',
    ]);
  });

  it(
    'KNOWN_CONSENT_POLICY_VERSIONS is wired to this function applied to the real registry, not a ' +
      'separately hand-written literal',
    () => {
      expect(KNOWN_CONSENT_POLICY_VERSIONS).toEqual(
        deriveKnownConsentPolicyVersions(CONSENT_POLICY_EDITIONS),
      );
      // The real discriminator, unlike the `toEqual` above: a hand-written
      // array literal of the SAME VALUE as KNOWN_CONSENT_POLICY_VERSIONS
      // would pass the `toEqual` check too (`toEqual` does not inspect
      // frozen-ness), regardless of how many editions the registry carries.
      // But deriveKnownConsentPolicyVersions freezes its result and a
      // hand-written literal is not frozen unless someone also freezes it,
      // so this assertion reddens on that mutation independent of registry
      // size — unlike the CONSENT_POLICY_VERSION wiring test above, whose
      // value-divergence discriminator only became live once a second
      // edition existed (T-9).
      expect(Object.isFrozen(KNOWN_CONSENT_POLICY_VERSIONS)).toBe(true);
    },
  );
});

describe(
  'deriveCurrentEdition (FR-1 scenario 3 — CONSENT_POLICY_SECTIONS must serve the CURRENT ' +
    'edition, never a superseded one)',
  () => {
    it('returns the LAST edition, not the first', () => {
      expect(deriveCurrentEdition(TWO_EDITIONS)).toBe(TWO_EDITIONS[1]);
    });

    it(
      "returns the edition whose sections carry 'Current heading', not the superseded " +
        "edition's 'Superseded heading' — the falsifier for the endpoint contract's \"must NOT " +
        'begin serving a non-current edition\" clause. A `deriveCurrentEdition` mistakenly ' +
        'reading the FIRST element instead of the LAST reddens this against the same ' +
        'TWO_EDITIONS fixture the version-tracking test above uses.',
      () => {
        expect(deriveCurrentEdition(TWO_EDITIONS).sections).toEqual([
          { heading: 'Current heading', body: 'Current body' },
        ]);
      },
    );
  },
);

describe("findConsentPolicyEdition (FR-1 scenario 2 — a superseded edition's sections survive a bump)", () => {
  it("retrieves a NON-final (superseded) edition's sections by its version string alone", () => {
    const found = findConsentPolicyEdition(TWO_EDITIONS, 'v1.0-superseded');

    expect(found).toBeDefined();
    expect(found?.sections).toEqual([{ heading: 'Superseded heading', body: 'Superseded body' }]);
  });

  it('retrieves the current (final) edition too', () => {
    expect(findConsentPolicyEdition(TWO_EDITIONS, 'v2.0-current')?.version).toBe('v2.0-current');
  });

  it('returns undefined for a version the registry never issued', () => {
    expect(findConsentPolicyEdition(TWO_EDITIONS, 'v1.5-never-issued')).toBeUndefined();
  });
});

describe('getConsentPolicyEdition (the real, closed-over lookup)', () => {
  it('retrieves the seed v1.0-placeholder edition, sections intact', () => {
    // NOT a claim about CURRENCY — unlike the "is wired to ... the real
    // registry" tests above, this asserts only that a by-version lookup
    // still finds v1.0-placeholder's own text, which never changes (D-8:
    // this edition is retained, unedited, forever). This stays true now
    // that T-9 has appended v1.0 and v1.0-placeholder is no longer the
    // CURRENT version — do not confuse it with an "is current" assertion,
    // here or elsewhere in this codebase.
    const edition = getConsentPolicyEdition('v1.0-placeholder');

    expect(edition).toBeDefined();
    expect(edition?.sections.length).toBe(4);
    expect(edition?.sections.every((section) => section.body.includes('PLACEHOLDER'))).toBe(true);
  });

  it('returns undefined for a version never issued', () => {
    expect(getConsentPolicyEdition('v99.0-never-issued')).toBeUndefined();
  });
});

describe('CONSENT_POLICY_EDITIONS (the registry itself)', () => {
  it('is ordered oldest first, seeded with v1.0-placeholder', () => {
    expect(CONSENT_POLICY_EDITIONS[0].version).toBe('v1.0-placeholder');
  });

  it('is frozen at every level — array, edition, and sections — so a mutation attempt does not silently succeed', () => {
    expect(Object.isFrozen(CONSENT_POLICY_EDITIONS)).toBe(true);
    expect(Object.isFrozen(CONSENT_POLICY_EDITIONS[0])).toBe(true);
    expect(Object.isFrozen(CONSENT_POLICY_EDITIONS[0].sections)).toBe(true);
    expect(Object.isFrozen(CONSENT_POLICY_EDITIONS[0].sections[0])).toBe(true);
  });

  it("the seed edition's four placeholder sections are unchanged from the pre-registry module", () => {
    const headings = CONSENT_POLICY_EDITIONS[0].sections.map((section) => section.heading);

    expect(headings).toEqual([
      '[PLACEHOLDER] What we collect',
      '[PLACEHOLDER] Why we collect it',
      '[PLACEHOLDER] How it is published',
      '[PLACEHOLDER] Your rights',
    ]);
  });

  it(
    "the seed edition's four sections are pinned verbatim — headings AND bodies (T-9, FR-1 " +
      'scenario 2)',
    () => {
      // Before T-9 this edition's prose was protected only by
      // `sections.length === 4` and a `body.includes('PLACEHOLDER')` check
      // (T-1 attempt-2's forward pointer to T-9, item 3) — a single word
      // could drift inside any body and nothing would redden. Now that a
      // second edition exists and FR-1 scenario 2 ("a superseded edition's
      // prose survives a bump") is load-bearing for real rather than
      // vacuously true, both heading and body are pinned verbatim for all
      // four sections via a single `toEqual` on the whole array.
      expect(CONSENT_POLICY_EDITIONS[0].sections).toEqual([
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
      ]);
    },
  );

  it(
    'retains v1.0-placeholder in the known-version set (D-8 — retention is unconditional, ' +
      'independent of how many editions the registry carries, because a rule with an ' +
      'exception is not an invariant)',
    () => {
      expect(KNOWN_CONSENT_POLICY_VERSIONS).toContain('v1.0-placeholder');
    },
  );

  it(
    'pins the FULL version sequence, oldest first — the falsifier for an edition inserted in ' +
      'the middle rather than appended at the end (T-9 rework issue 3)',
    () => {
      // Before this test existed, inserting a new edition BETWEEN
      // v1.0-placeholder and v1.0 (rather than after it) reddened nothing:
      // only CONSENT_POLICY_EDITIONS[0].version was pinned, and
      // `deriveCurrentEdition` would silently keep returning `v1.0` forever
      // — the newly-inserted edition would never be served, with no test
      // failure to reveal it. This asserts the entire sequence, so an
      // insert-in-the-middle mutation now has a named falsifier.
      expect(KNOWN_CONSENT_POLICY_VERSIONS).toEqual(['v1.0-placeholder', 'v1.0']);
    },
  );
});

describe(
  "CONSENT_POLICY_EDITIONS[1] ('v1.0', the approved edition) — verbatim pin (Reviewer " +
    'advisory 2, adopted)',
  () => {
    it("is the edition at index 1, versioned 'v1.0' (sanity check before pinning its content)", () => {
      expect(CONSENT_POLICY_EDITIONS[1].version).toBe('v1.0');
    });

    it(
      "all nine sections are pinned verbatim — headings AND bodies, encoded as they stand " +
        'after D-12 (paragraph form, not a bullet). Before this test, the approved v1.0 prose ' +
        'was the only text in this module with no verbatim pin — a clause could be silently ' +
        'dropped or altered and nothing would redden, which is exactly how the D-12 deviation ' +
        'went unnoticed until a human read this text against Legal\'s source document.',
      () => {
        expect(CONSENT_POLICY_EDITIONS[1].sections).toEqual([
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
        ]);
      },
    );
  },
);

describe(
  'CONSENT_ACCEPTANCE_STATEMENT (the checkbox label source, Reviewer advisory 2, adopted)',
  () => {
    it('is pinned verbatim — the exact sentence an applicant legally accepts', () => {
      expect(CONSENT_ACCEPTANCE_STATEMENT).toBe(
        'I confirm that I have read and understood this Consent for Publication of ' +
          'Information and voluntarily consent to the collection, storage, processing, ' +
          'international transfer, and public publication of the information provided ' +
          'through my registration in the ACCELERATE Tanzania Registry, including contact ' +
          'information, business information, capacity information, and location ' +
          'information where provided.',
      );
    });
  },
);

describe("CONSENT_POLICY_SECTIONS (the controller's response contract, FR-1 scenario 3)", () => {
  it('equals the CURRENT (final) edition\'s sections, not any superseded one', () => {
    // LATENT GATE (defect class 3) — NOW LIVE as of T-9. This is the
    // sibling latent gate named in T-1 attempt-2's forward pointer to T-9
    // (item 2): before T-9, with a single-edition registry, this comparison
    // could not distinguish CONSENT_POLICY_SECTIONS being built from
    // deriveCurrentEdition from it being built from any other index — both
    // resolved to the same one edition. Now that CONSENT_POLICY_EDITIONS
    // carries the placeholder AND v1.0, the two disagree, so the `toEqual`
    // below is a real discriminator and the explicit negative check is a
    // direct falsifier rather than a vacuous one: mutating
    // CONSENT_POLICY_SECTIONS to read `[0]` instead of the current edition
    // would redden it. (The `deriveCurrentEdition` describe block above
    // remains the falsifier for the underlying selection RULE, proved
    // against the synthetic TWO_EDITIONS fixture independent of production
    // registry size.)
    const currentEdition = CONSENT_POLICY_EDITIONS[CONSENT_POLICY_EDITIONS.length - 1];

    expect(CONSENT_POLICY_SECTIONS).toEqual(currentEdition.sections);
    expect(CONSENT_POLICY_SECTIONS).not.toEqual(CONSENT_POLICY_EDITIONS[0].sections);
  });
});
