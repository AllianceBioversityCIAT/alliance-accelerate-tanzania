/**
 * T-2 — Consent policy content and versioning (FR-3, design.md §4.2, DD-7).
 *
 * Served over `GET /registrations/consent-policy` and deliberately NOT
 * duplicated into the frontend bundle (DD-7): this module is the single
 * source of truth for both what an applicant is shown and what the server
 * will later accept back at `POST /registrations` (design.md §4.1 step 4,
 * owned by T-10). A frontend-side copy of the version could assert a value
 * the server does not know, 400-ing every submission.
 *
 * PLACEHOLDER TEXT — OQ-1 is open; legal owns the wording. The section
 * bodies below are clearly-marked placeholders so nobody mistakes them for
 * approved copy. The mechanism — versioning, serving, and the known-version
 * acceptance set — is this task's deliverable, not the prose.
 */

export interface ConsentPolicySection {
  heading: string;
  body: string;
}

/** Ordered — rendered top to bottom in the disclosure (design.md §5.2). */
export const CONSENT_POLICY_SECTIONS: ConsentPolicySection[] = [
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
];

/**
 * The version an applicant accepting this content today is shown, and the
 * value returned as `version` from the public endpoint.
 */
export const CONSENT_POLICY_VERSION = 'v1.0-placeholder';

/**
 * Every consent policy version this server will accept back at submission
 * time (design.md §4.1 step 4, §4.2, FR-3 "server-side acceptance is
 * mandatory"). **Append-only.** A version is added here the moment
 * `CONSENT_POLICY_VERSION` changes; no entry is ever removed, because
 * removing one would invalidate submissions already in flight under it
 * (design.md §2.2, §4.2). `CONSENT_POLICY_VERSION` is always the most
 * recent element.
 *
 * T-10's consent gate calls `isKnownConsentPolicyVersion` against this set
 * to implement FR-3's "unknown policy version ⇒ 400" branch.
 */
export const KNOWN_CONSENT_POLICY_VERSIONS: readonly string[] = [
  CONSENT_POLICY_VERSION,
  // Superseded versions are appended above this line as the policy is
  // revised — never removed, never reordered out of issuance order.
];

/**
 * T-10 rework (T2-A2) — the parameterized, independently-testable half of
 * the acceptance check. Extracted because `isKnownConsentPolicyVersion`
 * closing over the module-level `KNOWN_CONSENT_POLICY_VERSIONS` — which
 * carries exactly ONE entry today — made every test of the wrapper
 * indistinguishable from a hardcoded
 * `version === CONSENT_POLICY_VERSION` check: with a one-element known set,
 * "is in the known set" and "equals the current version" agree on every
 * input, so a test built against the wrapper alone cannot tell a real
 * known-SET check apart from that narrower, wrong one. Taking `versions` as
 * a parameter lets a test construct a synthetic multi-entry array and prove
 * the SET semantics — which is what DD-7/§4.2's "superseded versions stay
 * accepted" promise actually depends on — independent of how many versions
 * production has shipped so far.
 */
export function isVersionKnown(versions: readonly string[], version: string): boolean {
  return versions.includes(version);
}

/** T-10's acceptance check (design.md §4.1 step 4). */
export function isKnownConsentPolicyVersion(version: string): boolean {
  return isVersionKnown(KNOWN_CONSENT_POLICY_VERSIONS, version);
}
