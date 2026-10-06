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
  /**
   * T-3 (design.md §7.2, amended 2026-10-05) — PER EDITION, not
   * registry-wide. A shared, top-level statement would let editing it
   * change an already-issued edition's text and hash, breaking FR-1's "an
   * old request keeps its text". Each edition carries its own copy.
   */
  acceptanceStatement: string;
}

/**
 * Un-frozen source list — OLDEST FIRST. Kept private; the only view any
 * other module sees is the frozen {@link ADMIN_CONSENT_EDITIONS} below
 * (mirrors `consent-policy.ts`'s `CONSENT_POLICY_EDITIONS_SOURCE` split).
 */
const ADMIN_CONSENT_EDITIONS_SOURCE: AdminConsentEdition[] = EDITIONS_SOURCE.editions;

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
 * (design.md §7.2, amended 2026-10-05: `sha256(JSON.stringify({ version,
 * sections, acceptanceStatement }))`). **Correction (T-3):** a prior
 * revision of this comment claimed `acceptanceStatement` was registry-wide
 * and shared across editions — that was false even when the field lived at
 * the top of the JSON file, because a shared value edited later would have
 * silently changed every already-issued edition's hash. `acceptanceStatement`
 * is THIS edition's own field (`AdminConsentEdition.acceptanceStatement`),
 * so the hash only moves when THIS edition's own text changes.
 */
function canonicalAdminConsentEditionPayload(edition: AdminConsentEdition): string {
  return JSON.stringify({
    version: edition.version,
    sections: edition.sections,
    acceptanceStatement: edition.acceptanceStatement,
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
