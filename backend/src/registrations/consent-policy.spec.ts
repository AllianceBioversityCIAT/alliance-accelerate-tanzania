// @sdd-spec legal/legal-notices-and-consent-copy (T-1)
/**
 * `consent-policy.ts` unit tests — the append-only registry of editions
 * (FR-1, design.md §4.1, §4.2).
 *
 * `isVersionKnown`'s tests below are UNCHANGED from the pre-registry module
 * (see that function's doc comment in `consent-policy.ts` for why they must
 * be run against a SYNTHETIC multi-entry array rather than the production
 * `KNOWN_CONSENT_POLICY_VERSIONS`, which carries exactly one entry today).
 * The new describe blocks apply the SAME reasoning to the registry's own
 * derivation and lookup functions — `deriveConsentPolicyVersion`,
 * `deriveCurrentEdition`, `deriveKnownConsentPolicyVersions`, and
 * `findConsentPolicyEdition` are all parameterized for exactly this reason,
 * and are all tested here against a synthetic `TWO_EDITIONS` fixture.
 *
 * The "is wired to this function applied to the real registry" assertions
 * below are a DIFFERENT kind of test, and the paragraph above does not cover
 * them: each compares a module-level export to that export's own derivation
 * applied to PRODUCTION data (`CONSENT_POLICY_EDITIONS`), which is exactly
 * the one-edition-registry case the paragraph above warns a synthetic
 * fixture is needed for. `KNOWN_CONSENT_POLICY_VERSIONS`'s wiring test adds
 * an `Object.isFrozen` assertion, which gives it a real discriminator
 * (a hand-written array literal is not frozen unless someone also freezes
 * it); `CONSENT_POLICY_VERSION`'s
 * wiring test has no such discriminator available to it — see the "LATENT
 * GATE" note on that export in `consent-policy.ts` and the comment on that
 * test below.
 */
import {
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
 * tests above already use one: today's real `CONSENT_POLICY_EDITIONS`
 * carries a single edition, so an assertion built only against production
 * data cannot tell a genuine multi-edition derivation from a narrower one
 * that merely happens to agree on a one-element input.
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
      // LATENT GATE (defect class 3) — see the matching note on
      // CONSENT_POLICY_VERSION's own doc comment in consent-policy.ts. With
      // today's single-edition registry a hand-written string literal of
      // the SAME value as CONSENT_POLICY_VERSION is indistinguishable from
      // this derivation — there is no runtime discriminator to assert for a
      // string primitive (unlike KNOWN_CONSENT_POLICY_VERSIONS below, which
      // can assert Object.isFrozen against an array). This assertion starts
      // actually falsifying drift only once CONSENT_POLICY_EDITIONS gains a
      // second edition (T-9). Do not fabricate a discriminator before then.
      expect(CONSENT_POLICY_VERSION).toBe(deriveConsentPolicyVersion(CONSENT_POLICY_EDITIONS));
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
      // The real discriminator, unlike the `toEqual` above: with today's
      // single-edition registry a hand-written array literal of the SAME
      // VALUE as KNOWN_CONSENT_POLICY_VERSIONS would pass the `toEqual`
      // check too (`toEqual` does not inspect frozen-ness). But
      // deriveKnownConsentPolicyVersions freezes its result and a
      // hand-written literal is not frozen unless someone also freezes it,
      // so this assertion reddens on
      // that mutation today — it does not have to wait for a second
      // edition the way the CONSENT_POLICY_VERSION wiring test above does.
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
    // this edition is retained, unedited, forever). This stays true even
    // after T-9 appends v1.0 and v1.0-placeholder stops being the CURRENT
    // version — do not confuse it with an "is current" assertion, here or
    // elsewhere in this codebase.
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
    'retains v1.0-placeholder in the known-version set (D-8 — retention is unconditional, ' +
      'even though it is the only edition today, because a rule with an exception is not an ' +
      'invariant)',
    () => {
      expect(KNOWN_CONSENT_POLICY_VERSIONS).toContain('v1.0-placeholder');
    },
  );
});

describe("CONSENT_POLICY_SECTIONS (the controller's response contract, FR-1 scenario 3)", () => {
  it('equals the CURRENT (final) edition\'s sections, not any superseded one', () => {
    // Sanity against production data only — with today's single-edition
    // registry this cannot distinguish CONSENT_POLICY_SECTIONS being built
    // from deriveCurrentEdition from it being built from any other index
    // (they all resolve to the same one edition). The real falsifier for
    // that distinction is the `deriveCurrentEdition` describe block above,
    // which runs against the synthetic TWO_EDITIONS fixture.
    const currentEdition = CONSENT_POLICY_EDITIONS[CONSENT_POLICY_EDITIONS.length - 1];

    expect(CONSENT_POLICY_SECTIONS).toEqual(currentEdition.sections);
  });
});
