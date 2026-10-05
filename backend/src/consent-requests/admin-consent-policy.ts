/**
 * T-2 — Admin-managed consent edition registry (FR-1, design.md §7.2, P-8).
 *
 * Holds the *Administrator-Managed Registration* consent text Legal
 * delivered as a `.docx` (sha256 pinned on the fixture at
 * `__fixtures__/legal-admin-consent-v1.0.txt`, P-18), as a versioned,
 * **append-only** registry of editions — the same ADR-014 pattern
 * `registrations/consent-policy.ts` uses for the self-registration text, and
 * deliberately a SEPARATE file and a separate module: this registry MUST NOT
 * change when the self-registration policy changes, and vice versa (FR-1
 * "BUT the self-registration consent policy MUST NOT change").
 *
 * Every consent request (T-3+) records the edition it was sent under and
 * `editionHash` — never just a version string — so a later edition can be
 * appended without altering what an already-sent request legally shows.
 */

import EDITIONS_SOURCE from './admin-consent-editions.json';
import { createHash } from 'crypto';

export interface AdminConsentSection {
  heading: string;
  body: string;
}

export interface AdminConsentEdition {
  version: string;
  issuedAt: string;
  sections: readonly AdminConsentSection[];
}

/**
 * Un-frozen source list — OLDEST FIRST. Kept private; the only view any
 * other module sees is the frozen {@link ADMIN_CONSENT_EDITIONS} below
 * (mirrors `consent-policy.ts`'s `CONSENT_POLICY_EDITIONS_SOURCE` split).
 */
const ADMIN_CONSENT_EDITIONS_SOURCE: AdminConsentEdition[] = EDITIONS_SOURCE.editions;

/**
 * The acceptance statement — Legal's closing confirmatory sentence (not part
 * of any section's `body`; see the JSON generation note in this task's
 * report for why it was extracted out of the `Consent` section, mirroring
 * how `consent-policy.ts`'s `CONSENT_ACCEPTANCE_STATEMENT` is carried
 * separately from its own `Consent` section body).
 */
export const ADMIN_CONSENT_ACCEPTANCE_STATEMENT: string = EDITIONS_SOURCE.acceptanceStatement;

/**
 * The append-only registry — OLDEST FIRST — frozen at every level (array,
 * edition, sections, each section) so a caller cannot mutate it at runtime.
 * Freeze does not stop a developer editing the JSON source; that invariant
 * is held by tests alone (the sequence pin and body digest below).
 */
export const ADMIN_CONSENT_EDITIONS: readonly AdminConsentEdition[] = Object.freeze(
  ADMIN_CONSENT_EDITIONS_SOURCE.map((edition) =>
    Object.freeze({
      ...edition,
      sections: Object.freeze(edition.sections.map((section) => Object.freeze({ ...section }))),
    }),
  ),
);

/** Pure derivation of the current (final) edition — see `consent-policy.ts` for why this is parameterized. */
export function deriveCurrentAdminConsentEdition(
  editions: readonly AdminConsentEdition[],
): AdminConsentEdition {
  return editions[editions.length - 1];
}

/** Pure derivation of the known-version set, in issuance order. */
export function deriveKnownAdminConsentVersions(
  editions: readonly AdminConsentEdition[],
): readonly string[] {
  return Object.freeze(editions.map((edition) => edition.version));
}

/** The current edition's version — derived, never a hand-written literal. */
export const CURRENT_ADMIN_CONSENT_EDITION: AdminConsentEdition = deriveCurrentAdminConsentEdition(
  ADMIN_CONSENT_EDITIONS,
);

export const CURRENT_ADMIN_CONSENT_VERSION: string = CURRENT_ADMIN_CONSENT_EDITION.version;

/** Every version this registry has ever issued, oldest first (append-only). */
export const KNOWN_ADMIN_CONSENT_VERSIONS: readonly string[] = deriveKnownAdminConsentVersions(
  ADMIN_CONSENT_EDITIONS,
);

/** By-version lookup — a superseded edition's text must stay retrievable forever (FR-1 scenario 2). */
export function findAdminConsentEdition(
  editions: readonly AdminConsentEdition[],
  version: string,
): AdminConsentEdition | undefined {
  return editions.find((edition) => edition.version === version);
}

/** The lookup any real caller uses — closes over the actual registry. */
export function getAdminConsentEdition(version: string): AdminConsentEdition | undefined {
  return findAdminConsentEdition(ADMIN_CONSENT_EDITIONS, version);
}

/**
 * The canonical serialization an edition's `editionHash` is computed over
 * (design.md §7.2: `sha256(JSON.stringify({ version, sections,
 * acceptanceStatement })`). `acceptanceStatement` is the REGISTRY-WIDE
 * {@link ADMIN_CONSENT_ACCEPTANCE_STATEMENT}, not a per-edition field — it is
 * included in every edition's hash input so a (hypothetical, append-only)
 * change to it would also be visible in the hash of editions issued after
 * that change, without requiring a second per-edition copy of the field.
 */
function canonicalAdminConsentEditionPayload(edition: AdminConsentEdition): string {
  return JSON.stringify({
    version: edition.version,
    sections: edition.sections,
    acceptanceStatement: ADMIN_CONSENT_ACCEPTANCE_STATEMENT,
  });
}

/** SHA-256 of an edition's canonical serialization (design.md §7.2). */
export function computeAdminConsentEditionHash(edition: AdminConsentEdition): string {
  return createHash('sha256').update(canonicalAdminConsentEditionPayload(edition)).digest('hex');
}

/** The hash recorded against every request sent under this edition. */
export function getAdminConsentEditionHash(version: string): string | undefined {
  const edition = getAdminConsentEdition(version);
  return edition ? computeAdminConsentEditionHash(edition) : undefined;
}
