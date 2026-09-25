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


import { createHash } from 'crypto';

/**
 * The approved text has ONE home: `consent-policy.editions.json`. This spec
 * does not hold a second copy of it, and that is a deliberate reversal of how
 * the pin was first written.
 *
 * **What the pin still guarantees.** Every heading is asserted verbatim below,
 * and every body is covered by {@link APPROVED_BODY_DIGEST}. Altering or
 * dropping a single clause of the text a person legally accepts reddens this
 * suite. Nothing about that has weakened.
 *
 * **Why it is a digest and not a literal copy.** The copy was 160 lines that
 * Sonar's CPD matched against the module, and the repeated
 * `{ heading, body: '…' + '…' }` shape self-matched inside each file as well —
 * 403 duplicated lines on PR #73 against a 3% gate, blocking the merge.
 *
 * The objection to hashing was that a failure says "mismatch" instead of
 * naming the clause that moved. **That objection dissolves once the text is
 * its own file**: the failure message below points at `git diff`, which names
 * the clause better than a Jest diff would. Headings stay literal because they
 * are short, they are what a reader scans for, and they carry no repeated
 * structure for CPD to match.
 *
 * **To update after an authorized text change:** run
 * `node -e "…"` over the JSON, or copy the actual value from this test's
 * failure output — and do it in the same commit as the text change, never as a
 * follow-up, so the digest never sits stale against prose it no longer covers.
 */
const APPROVED_BODY_DIGEST =
  'e4d965d4a5523e1f560240a85c1c1bab0eb2289619b0c241539e627a7adf7232';

/** Every heading, both editions, in order — seed edition first. */
const ALL_HEADINGS = [
  '[PLACEHOLDER] What we collect',
  '[PLACEHOLDER] Why we collect it',
  '[PLACEHOLDER] How it is published',
  '[PLACEHOLDER] Your rights',
  'Consent for Publication of Information',
  'Purpose of the Registry',
  'Information that may be collected and published',
  'Public Availability of Information',
  'Business Information and Location Information',
  'International Storage and Access',
  'Authority to Provide Information',
  'Rights of Data Subjects',
  'Consent',
];

/**
 * SHA-256 over every body of every edition, in order. A changed, dropped or
 * reordered clause moves it.
 */
function bodyDigest(): string {
  const bodies = CONSENT_POLICY_EDITIONS.flatMap((e) => e.sections.map((s) => s.body));
  return createHash('sha256').update(JSON.stringify(bodies)).digest('hex');
}

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
        expect(CONSENT_POLICY_EDITIONS[0].sections.map((s) => s.heading)).toEqual(
          ALL_HEADINGS.slice(0, 4),
        );
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
      'all nine headings are pinned verbatim and every body is covered by the content ' +
        'digest, encoded as they stand after D-12 (paragraph form, not a bullet). Before ' +
        'this guard the approved v1.0 prose was the only text in this module with nothing ' +
        'holding it — a clause could be silently dropped or altered and nothing would ' +
        'redden, which is exactly how the D-12 deviation went unnoticed until a human read ' +
        "this text against Legal's source document.",
      () => {
        expect(CONSENT_POLICY_EDITIONS[1].sections.map((s) => s.heading)).toEqual(
          ALL_HEADINGS.slice(4),
        );
        expect(bodyDigest()).toBe(APPROVED_BODY_DIGEST);
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
