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
 * PLACEHOLDER TEXT — the seed (first, oldest) edition below, version
 * `v1.0-placeholder`, is still pending legal review (OQ-1); its four
 * sections are carried into the registry byte-for-byte UNCHANGED from
 * their pre-registry form. T-9 appends the approved `v1.0` edition once
 * Legal delivers final copy — it does not edit this one, and this one is
 * never removed (D-8: retention is unconditional even though it is the
 * only edition today).
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
  // Later editions are appended BELOW this line, in issuance order, as the
  // policy is revised — NEVER inserted above, reordered, or removed (D-1,
  // D-8, design.md §4.2). A `Registration.consentPolicyVersion` row
  // pointing at a version this list no longer carries would be a pointer
  // into nothing.
];

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
 * design.md §4.2 gives for {@link isVersionKnown}: today's registry carries
 * exactly ONE edition, so a test written only against the module-level
 * exports cannot tell a real "last element" derivation from one that
 * (wrongly) reads the first. Taking `editions` as a parameter lets a test
 * construct a synthetic multi-edition array and prove the value returned
 * really is the LAST edition, not any other.
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
 * LATENT GATE (defect class 3) — recorded here, not only in the T-1 rework
 * report, because this is where the author of T-9 will look: the test that
 * checks this export is really wired to {@link deriveConsentPolicyVersion}
 * (`consent-policy.spec.ts`, "CONSENT_POLICY_VERSION is wired to this
 * function applied to the real registry") has NO runtime discriminator
 * today. This is a string primitive — unlike
 * {@link KNOWN_CONSENT_POLICY_VERSIONS}, which can assert
 * `Object.isFrozen` against a hand-written array literal, there is nothing
 * to freeze on a string, and with a single-edition registry a hand-written
 * literal of the SAME value as this export is indistinguishable at runtime
 * from this derivation. The gate starts actually falsifying drift the
 * moment `CONSENT_POLICY_EDITIONS_SOURCE` gains its second edition (T-9),
 * because only then can the derived and a stale hand-written value diverge
 * in value. Do not fabricate a discriminator before then — an honestly
 * latent gate is acceptable; one silently reported as demonstrated is not.
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
 * unmodified by this task). Built from {@link deriveCurrentEdition} — the
 * SAME "which edition is current" derivation {@link CONSENT_POLICY_VERSION}
 * is built from — rather than a second, independent
 * `CONSENT_POLICY_EDITIONS[length - 1]` index expression, so the version an
 * applicant is shown and the sections they are shown can never come from
 * two different editions (FR-1 scenario 3: the endpoint "must NOT begin
 * serving a non-current edition"). Exported as a fresh, ordinary MUTABLE
 * array — matching the pre-registry module's export type exactly,
 * byte-for-byte — so the controller's response contract does not move an
 * inch (same keys, same types, same current-edition values). The underlying
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
 * {@link deriveConsentPolicyVersion} and {@link isVersionKnown}: with
 * today's single-edition registry, a lookup tested only against
 * {@link CONSENT_POLICY_EDITIONS} cannot distinguish "found the right
 * edition by version" from "there is only one edition to find". Taking
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
 *
 * T-1 note: the registry above WILL make production's set multi-entry once
 * T-9 lands — it still carries exactly ONE edition today — for the
 * first time, which WEAKENS rather than removes the argument for this seam
 * (design.md §4.2) — it stays parameterized and this comment stays intact.
 */
export function isVersionKnown(versions: readonly string[], version: string): boolean {
  return versions.includes(version);
}

/** T-10's acceptance check (design.md §4.1 step 4). */
export function isKnownConsentPolicyVersion(version: string): boolean {
  return isVersionKnown(KNOWN_CONSENT_POLICY_VERSIONS, version);
}
