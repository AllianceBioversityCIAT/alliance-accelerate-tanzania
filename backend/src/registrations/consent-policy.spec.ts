// @sdd-spec actors/public-self-registration (T-10, rework attempt 2, T2-A2)
/**
 * `isVersionKnown` unit tests — the parameterized half of FR-3's known-
 * version check (design.md §4.2, DD-7). See `consent-policy.ts`'s doc on
 * `isVersionKnown` for why this must be tested against a SYNTHETIC
 * multi-entry array rather than only against the production
 * `KNOWN_CONSENT_POLICY_VERSIONS` (which carries exactly one entry today,
 * making "in the set" and "equals the current version" indistinguishable).
 */
import { isVersionKnown } from './consent-policy';

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
