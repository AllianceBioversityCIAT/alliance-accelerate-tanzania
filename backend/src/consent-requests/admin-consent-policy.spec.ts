// @sdd-spec actors/consent-intake/consent-request-email (T-2)
/**
 * `admin-consent-policy.ts` unit tests — the Administrator-Managed
 * Registration consent registry (FR-1, design.md §7.2, P-8, P-18).
 *
 * The verbatim test below is the gate this task's "Review: checklist" relies
 * on. It reconstructs plain text from `v1.0`, reverses the three named
 * substitutions (D-8), normalizes ONLY whitespace and bullet glyphs, and
 * compares the result — line by line, in document order — against
 * `__fixtures__/legal-admin-consent-v1.0.txt`, the `textutil` extract of the
 * Legal `.docx` (sha256 `80fe083f…a9ba1c7`, P-18), excluding that document's
 * signature block (which is NOT edition text — FR-1 description, D-8: it
 * becomes the page's form fields).
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ADMIN_CONSENT_EDITIONS,
  AdminConsentEdition,
  CURRENT_ADMIN_CONSENT_VERSION,
  KNOWN_ADMIN_CONSENT_VERSIONS,
  computeAdminConsentEditionHash,
  findAdminConsentEdition,
  getAdminConsentEdition,
  getAdminConsentEditionHash,
} from './admin-consent-policy';

/**
 * The three substitutions FR-1/D-8 names, applied forward (fixture wording
 * → edition wording). The verbatim test reverses them to get back to the
 * fixture's own words before comparing.
 */
const SUBSTITUTIONS: ReadonlyArray<{ edition: string; original: string }> = [
  {
    edition: 'By accepting this Consent, I confirm that:',
    original: 'By signing this Consent, I confirm that:',
  },
  {
    edition: 'By selecting **I accept** below, I expressly and voluntarily consent to:',
    original: 'By signing below, I expressly and voluntarily consent to:',
  },
];

/**
 * Normalizes ONLY whitespace and bullet glyphs (the brief's exact phrase) —
 * never substance. Strips a leading bullet marker in EITHER the fixture's
 * own `\t•\t` form or this module's `- ` markdown form, then collapses
 * internal whitespace and trims. Deliberately narrow: it must NOT be broad
 * enough to swallow a one-word content change (ruled out by the falsifier
 * below — the Disqualifier this task names).
 */
function normalizeLine(line: string): string {
  return line
    .replace(/^[\t ]*(?:[••]|-)[\t ]+/u, '')
    .trim()
    .replace(/[ \t]+/g, ' ');
}

/** Splits a block of text into normalized, non-empty lines. */
function toNormalizedLines(text: string): string[] {
  return text
    .split('\n')
    .map(normalizeLine)
    .filter((line) => line.length > 0);
}

/**
 * Reconstructs the full plain-text document (in order) from an edition,
 * reversing the three substitutions first (on the WHOLE concatenated text,
 * so a reversed phrase can never straddle a line split), then flattening
 * every section's heading + body, plus the edition's OWN
 * `acceptanceStatement` (T-3, design.md §7.2 as amended 2026-10-05 — it is
 * per-edition, not shared), into normalized lines.
 */
function reconstructEditionLines(edition: AdminConsentEdition): string[] {
  const sectionTexts = edition.sections.map((section) => `${section.heading}\n${section.body}`);
  let fullText = [...sectionTexts, edition.acceptanceStatement].join('\n');

  for (const { edition: editionWording, original } of SUBSTITUTIONS) {
    fullText = fullText.split(editionWording).join(original);
  }

  return toNormalizedLines(fullText);
}

/** The fixture, parsed into normalized lines, with the signature block excluded (it is not edition text). */
function fixtureLines(): string[] {
  const raw = readFileSync(
    join(__dirname, '__fixtures__', 'legal-admin-consent-v1.0.txt'),
    'utf-8',
  );
  const signatureBlockStart = raw.indexOf('Organization Name:');
  expect(signatureBlockStart).toBeGreaterThan(-1);
  return toNormalizedLines(raw.slice(0, signatureBlockStart));
}

/**
 * SHA-256 over every heading + body + `acceptanceStatement` of every
 * edition, in order (mirrors `consent-policy.spec.ts`'s `bodyDigest`). A
 * changed, dropped, or reordered clause — or an appended section — moves it;
 * this is this task's digest falsifier ("Add a section to v1.0. The digest
 * goes red."). `acceptanceStatement` is included (T-3, amended 2026-10-05)
 * so an edit to it also reddens this pin, not just the verbatim test.
 */
function allEditionsDigest(): string {
  const parts = ADMIN_CONSENT_EDITIONS.flatMap((edition) => [
    edition.version,
    ...edition.sections.map((section) => [section.heading, section.body]),
    edition.acceptanceStatement,
  ]);
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

/**
 * Recorded digest over the WHOLE registry (every edition's version, every
 * section's heading and body), computed once against the approved `v1.0`
 * text and pinned here as the append-only guard — mirrors
 * `consent-policy.spec.ts`'s `APPROVED_BODY_DIGEST`. A changed, dropped, or
 * reordered clause, or an appended section, reddens the test below.
 *
 * To update after an authorized text change: run the digest function here
 * against the new registry (or copy the value from this test's failure
 * output), in the same commit as the text change.
 */
const RECORDED_EDITIONS_DIGEST = '5aa42f417c564cb04b7b42ab44135fc4ef4cfddeaac21cb1b0320b34813abff3';

describe('admin-consent-editions.json verbatim pin (FR-1 "verbatim text" scenario)', () => {
  it(
    'reconstructs v1.0 with the three substitutions reversed and matches the Legal .docx ' +
      'extract, line for line, in document order, excluding the signature block',
    () => {
      const currentEdition = ADMIN_CONSENT_EDITIONS[ADMIN_CONSENT_EDITIONS.length - 1];
      const reconstructed = reconstructEditionLines(currentEdition);

      expect(reconstructed).toEqual(fixtureLines());
    },
  );
});

describe('negative-word assertion (FR-1 "MUST NOT contain the word signing or signature", B-14)', () => {
  const SIGN_WORD = /\bsign(ing|ature|ed)?\b/i;

  it('contains no sign/signing/signature/signed anywhere in any edition\'s text', () => {
    const allText = ADMIN_CONSENT_EDITIONS.flatMap((edition) => [
      ...edition.sections.flatMap((section) => [section.heading, section.body]),
      edition.acceptanceStatement,
    ]).join('\n');

    expect(SIGN_WORD.test(allText)).toBe(false);
  });

  it(
    'the fixture itself DOES contain the word (sanity check that the regex is not vacuous — ' +
      'the brief records exactly three occurrences, all replaced by the substitutions)',
    () => {
      const raw = readFileSync(
        join(__dirname, '__fixtures__', 'legal-admin-consent-v1.0.txt'),
        'utf-8',
      );
      const signatureBlockStart = raw.indexOf('Organization Name:');
      const editionPortion = raw.slice(0, signatureBlockStart);

      const matches = editionPortion.match(new RegExp(SIGN_WORD.source, 'gi')) ?? [];
      // "signing" (x2, the two substitutions' original wording) + "Signature:"
      // lives in the signature block, which is excluded above, so only the
      // two "signing" occurrences remain in the edition portion.
      expect(matches.length).toBe(2);
    },
  );
});

describe('append-only registry (FR-1 "append-only" scenario)', () => {
  it('is frozen at every level — array, edition, and sections', () => {
    expect(Object.isFrozen(ADMIN_CONSENT_EDITIONS)).toBe(true);
    expect(Object.isFrozen(ADMIN_CONSENT_EDITIONS[0])).toBe(true);
    expect(Object.isFrozen(ADMIN_CONSENT_EDITIONS[0].sections)).toBe(true);
    expect(Object.isFrozen(ADMIN_CONSENT_EDITIONS[0].sections[0])).toBe(true);
  });

  it('pins the full version sequence, oldest first', () => {
    expect(KNOWN_ADMIN_CONSENT_VERSIONS).toEqual(['v1.0']);
  });

  it('CURRENT_ADMIN_CONSENT_VERSION tracks the last (current) edition', () => {
    expect(CURRENT_ADMIN_CONSENT_VERSION).toBe('v1.0');
  });

  it(
    "pins every heading, in order, and a body digest over the whole registry — the " +
      'falsifier for "change one word in the v1.0 JSON" and for "add a section to v1.0"',
    () => {
      expect(ADMIN_CONSENT_EDITIONS[0].sections.map((s) => s.heading)).toEqual([
        'ACCELERATE Tanzania Registry Consent for Publication of Information (Administrator-Managed Registration)',
        'Purpose of the Registry',
        'Information that may be Collected and Published',
        'Public Availability of Information',
        'Business Information and Location Information',
        'International Storage and Access',
        'Authority to Provide Information',
        'Rights of Data Subjects',
        'Consent',
      ]);
      expect(allEditionsDigest()).toBe(RECORDED_EDITIONS_DIGEST);
    },
  );
});

describe('findAdminConsentEdition / getAdminConsentEdition (FR-1 "old request keeps its text")', () => {
  const TWO_EDITIONS: AdminConsentEdition[] = [
    {
      version: 'v1.0',
      issuedAt: '2026-01-01',
      sections: [{ heading: 'Old heading', body: 'Old body' }],
      acceptanceStatement: 'Old acceptance statement',
    },
    {
      version: 'v1.1',
      issuedAt: '2026-06-01',
      sections: [{ heading: 'New heading', body: 'New body' }],
      acceptanceStatement: 'New acceptance statement',
    },
  ];

  it("retrieves a superseded edition's sections by version alone, unaffected by a later edition", () => {
    const found = findAdminConsentEdition(TWO_EDITIONS, 'v1.0');
    expect(found?.sections).toEqual([{ heading: 'Old heading', body: 'Old body' }]);
  });

  it('returns undefined for a version never issued', () => {
    expect(getAdminConsentEdition('v99.0-never-issued')).toBeUndefined();
  });

  it('the real v1.0 edition is retrievable today', () => {
    expect(getAdminConsentEdition('v1.0')).toBeDefined();
  });
});

describe('editionHash (design.md §7.2 — sha256({ version, sections, acceptanceStatement }))', () => {
  const EDITION_A: AdminConsentEdition = {
    version: 'v1.0',
    issuedAt: '2026-01-01',
    sections: [{ heading: 'H', body: 'B' }],
    acceptanceStatement: 'Accept A',
  };
  const EDITION_B: AdminConsentEdition = {
    version: 'v1.1',
    issuedAt: '2026-06-01',
    sections: [{ heading: 'H2', body: 'B2' }],
    acceptanceStatement: 'Accept B',
  };

  it('is stable: hashing the same edition twice yields the same hash', () => {
    expect(computeAdminConsentEditionHash(EDITION_A)).toBe(computeAdminConsentEditionHash(EDITION_A));
  });

  it('differs between two distinct editions', () => {
    expect(computeAdminConsentEditionHash(EDITION_A)).not.toBe(
      computeAdminConsentEditionHash(EDITION_B),
    );
  });

  it("getAdminConsentEditionHash('v1.0') is defined and stable across repeated calls", () => {
    const first = getAdminConsentEditionHash('v1.0');
    const second = getAdminConsentEditionHash('v1.0');
    expect(first).toBeDefined();
    expect(first).toBe(second);
  });

  it('returns undefined for an unknown version', () => {
    expect(getAdminConsentEditionHash('v99.0-never-issued')).toBeUndefined();
  });

  it('changes when only acceptanceStatement changes, holding version and sections fixed (T-3 — the digest must cover it)', () => {
    const withDifferentStatement: AdminConsentEdition = {
      ...EDITION_A,
      acceptanceStatement: 'A completely different acceptance statement',
    };
    expect(computeAdminConsentEditionHash(EDITION_A)).not.toBe(
      computeAdminConsentEditionHash(withDifferentStatement),
    );
  });

  /**
   * T-3 (design.md §7.2, "The literal v1.0 editionHash is pinned") — any
   * change to the canonical serialization (field order, included fields, the
   * edition's own text) reddens this BEFORE a stored `ConsentRequest.editionHash`
   * could silently mismatch what the registry would recompute.
   */
  it('pins the literal v1.0 editionHash', () => {
    expect(getAdminConsentEditionHash('v1.0')).toBe(
      '0a2d028028794882ef6cfaf8997c03c0f07d131b304641594f8654696def3fbe',
    );
  });
});
