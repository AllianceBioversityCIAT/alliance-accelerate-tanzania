/**
 * T-4 — The SINGLE source of truth for PII visibility and consent (NFR-5, DD-1).
 *
 * Every public read path consults THIS module — the serializer (DD-2) and any
 * future read endpoint (T-5/T-6). Per DD-1 the PII allowlist, the consent rule,
 * and the public-GPS rule live here and nowhere else, so a legal/business change
 * is a one-file edit rather than a hunt across endpoints (which would risk drift
 * and leakage).
 *
 * PROVISIONAL — legal-ratifiable defaults (OQ-4/OQ-5): the exact PII field set
 * below and the "consent = GRANTED gates exact GPS" rule are working defaults
 * pending legal sign-off. When legal revises which fields are PII, or chooses a
 * coarsened-GPS scheme instead of hard exclusion (DD-3), edit ONLY this file.
 *
 * Design refs: design.md §5 (public projection), §7, §10 (DD-1/DD-2/DD-3/DD-5).
 * Requirements: FR-4 (consent model), FR-5 (PII boundary), NFR-1 (server-enforced),
 * NFR-5 (single legal-ratifiable policy).
 */

import { ConsentStatus, Prisma } from '@prisma/client';

/**
 * The public-hidden PII field set (DD-1/DD-5). This is the legal-ratifiable
 * list — the ONE edit point. Any field named here MUST never appear in a
 * `Public`-role response. The serializer (DD-2) builds its output by explicit
 * allowlist of public fields, but this set is the canonical declaration used by
 * read paths and asserted against in tests.
 *
 * PROVISIONAL (OQ-4): pending legal confirmation of the exact PII set.
 */
export const PII_ALLOWLIST = [
  'phone',
  'email',
  'sex',
  'position',
  'marketLocation',
  'technicalSupport',
] as const;

export type PiiField = (typeof PII_ALLOWLIST)[number];

/**
 * Minimal shape this policy reads off an Actor. Accepts the Prisma entity (and
 * any superset) without coupling to the full generated type, so it is callable
 * from pure unit tests with a plain object.
 */
export interface ConsentBearer {
  consentStatus: ConsentStatus | string;
  gpsLatitude?: Prisma.Decimal | number | string | null;
  gpsLongitude?: Prisma.Decimal | number | string | null;
}

/**
 * Whether an actor may appear in public results at all (FR-4).
 *
 * v1 rule (DD-3, PROVISIONAL): only `GRANTED` is public; `DENIED` and `UNKNOWN`
 * are excluded. Legal may later choose a coarsened-GPS alternative — that change
 * is isolated to {@link publicGps}; this gate stays the consent test.
 */
export function isPublic(actor: ConsentBearer): boolean {
  return actor.consentStatus === ConsentStatus.GRANTED;
}

/**
 * Exact public GPS for an actor, or `null` (FR-5/DD-3).
 *
 * Returns `{ lat, long }` ONLY when {@link isPublic} (consent GRANTED) AND both
 * coordinates are present; otherwise `null`. Prisma `Decimal` (or numeric
 * string) is converted to a finite `number` safely — a non-finite conversion
 * yields `null` rather than leaking `NaN`.
 *
 * Altitude and accuracy are intentionally NOT surfaced (design.md §5).
 */
export function publicGps(
  actor: ConsentBearer,
): { lat: number; long: number } | null {
  if (!isPublic(actor)) return null;

  const lat = toFiniteNumber(actor.gpsLatitude);
  const long = toFiniteNumber(actor.gpsLongitude);
  if (lat === null || long === null) return null;

  return { lat, long };
}

/**
 * Convert a Prisma `Decimal`, number, or numeric string to a finite number, or
 * `null` for null/undefined/non-finite input. Defensive: never emits `NaN`.
 */
function toFiniteNumber(
  value: Prisma.Decimal | number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;

  // Prisma.Decimal and numeric strings both coerce via Number(); guard finiteness.
  const n = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}
