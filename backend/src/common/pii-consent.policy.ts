/**
 * T-4/T-6 — The SINGLE source of truth for PII visibility and consent
 * (NFR-5, DD-1).
 *
 * Every public read path consults THIS module — the serializer (DD-2) and any
 * future read endpoint (T-5/T-6). Per DD-1 the disclosure/contact-block/
 * never-public partition, the consent rule, and the public-GPS rule live here
 * and nowhere else, so a legal/business change is a one-file edit rather than
 * a hunt across endpoints (which would risk drift and leakage).
 *
 * PROVISIONAL — legal-ratifiable defaults (OQ-4/OQ-5): the exact field sets
 * below ({@link PUBLICLY_DISCLOSED_FIELDS}, {@link CONTACT_BLOCK_FIELDS},
 * {@link NEVER_PUBLIC_FIELDS}) and the "consent = GRANTED gates exact GPS"
 * rule are working defaults pending legal sign-off. When legal revises which
 * fields are disclosed, or chooses a coarsened-GPS scheme instead of hard
 * exclusion (DD-3), edit ONLY this file.
 *
 * Design refs: design.md §5 (public projection), §7.1 (the four-constant
 * table), §10 (DD-1/DD-2/DD-3/DD-5). Requirements: FR-1 (detail disclosure),
 * FR-3 (never-public set), FR-4 (consent model), FR-9 (list withholds the
 * contact block), NFR-1 (server-enforced), NFR-5 (single legal-ratifiable
 * policy).
 */

import { ConsentStatus, Prisma } from '@prisma/client';

/**
 * T-6/DD-2/OQ-1 — Retained, deliberately EMPTY.
 *
 * Before the public-profile disclosure revision, this was the single
 * legal-ratifiable PII allowlist: any field named here was hidden from
 * `Public`. That partition no longer describes reality — GRANTED consent now
 * unlocks every actor-supplied field on the detail path (FR-1) — so the
 * fields that used to live here moved to {@link PUBLICLY_DISCLOSED_FIELDS}
 * and {@link CONTACT_BLOCK_FIELDS}; `technicalSupport` moved to
 * {@link NEVER_PUBLIC_FIELDS} instead (FR-3), because it was never the
 * actor's own PII declaration.
 *
 * Kept, not deleted, as the ONE designated edit point if legal later
 * re-restricts a field this revision disclosed (DD-2): re-restricting means
 * adding the field here AND removing it from `PUBLICLY_DISCLOSED_FIELDS`
 * (and `CONTACT_BLOCK_FIELDS`, if applicable) — this file stays the one-file
 * edit for that future change.
 *
 * PROVISIONAL (OQ-1): resolved 2026-09-04 — keep it, documented, empty.
 */
export const PII_ALLOWLIST = [] as const;

export type PiiField = (typeof PII_ALLOWLIST)[number];

/**
 * T-6/DD-1 — Fields that MUST appear in a `Public`-role response on the
 * detail path (`GET /api/v1/actors/:id`) for a `GRANTED` actor, and MUST NOT
 * appear at all for a non-`GRANTED` actor (FR-1, FR-2).
 *
 * **Membership rule, stated BY POLICY (design.md §7.1, revised 2026-09-04
 * after T-6's first attempt was rejected for stating it by history
 * instead):**
 *
 * > Every field whose public disclosure this revision introduces.
 *
 * This is deliberately narrower than FR-1's whole published field set, which
 * is not verbatim implementable as a field-name array: FR-1 also names
 * *"exact GPS"*, which is not a response field name (`gps: {lat, long}`,
 * computed by {@link publicGps}, not this constant) and `crops`, a relation
 * array rather than a scalar column.
 *
 * A rule phrased instead as an edit to the retired {@link PII_ALLOWLIST}
 * ("the old allowlist, minus `technicalSupport`, plus `contactPerson`") has
 * no slot for a column that did not exist before this revision — which is
 * exactly how `otherCrops` was omitted the first time this constant was
 * written. Stating the rule by policy gives a future author adding a column
 * a test to apply: does this revision make the field publicly visible? If
 * yes, it belongs here.
 *
 * {@link CONTACT_BLOCK_FIELDS} is a strict subset of this set — every
 * contact-block field is also disclosed on detail, but not every disclosed
 * field is in the contact block. `sex` and `otherCrops` are the two members
 * here that are NOT in the contact block: both also ship on the list path
 * and in the CSV (FR-7/A-1). Do not infer membership from UI adjacency or
 * schema column order — see {@link CONTACT_BLOCK_FIELDS}'s doc for why that
 * inference is specifically wrong for `sex` and `marketLocation`.
 *
 * PROVISIONAL, same status as the allowlist it replaces (OQ-4/OQ-5).
 */
export const PUBLICLY_DISCLOSED_FIELDS = [
  'phone',
  'email',
  'sex',
  'position',
  'marketLocation',
  'contactPerson',
  'otherCrops',
] as const;

export type PubliclyDisclosedField =
  (typeof PUBLICLY_DISCLOSED_FIELDS)[number];

/**
 * T-6/DD-3 — The bulk-exposure boundary (FR-9, NFR-6). A strict subset of
 * {@link PUBLICLY_DISCLOSED_FIELDS}: these fields MUST appear on the detail
 * path for a `GRANTED` actor but MUST NEVER appear on the list path
 * (`GET /api/v1/actors`) under any filter, page, or page size — by key OR by
 * value (FR-9's `AND IT MUST be asserted by value`). This is the field set
 * the CSV, the map, and the dashboard therefore structurally cannot carry,
 * because all three are built from the list response (DD-3/DD-6).
 *
 * Membership is fixed by `requirements.md`'s glossary and FR-1/FR-9, not by
 * inference:
 * - `marketLocation` **IS** a member (joined 2026-09-04, R2-1/A-1 in
 *   `judgment.md`) — it is where to physically find the named person, which
 *   makes it a contact field regardless of how it reads on the page.
 * - `sex` is **NOT** a member, despite sitting next to these fields in the
 *   profile UI's "Contact" section and next to them in `schema.prisma`.
 *   Neither adjacency is membership (design.md §8) — `sex` ships on the list
 *   path and in the CSV export.
 */
export const CONTACT_BLOCK_FIELDS = [
  'contactPerson',
  'position',
  'phone',
  'email',
  'marketLocation',
] as const;

export type ContactBlockField = (typeof CONTACT_BLOCK_FIELDS)[number];

/**
 * T-7/T-6 — Fields that must NEVER appear in a `Public`-role response, for
 * reasons OTHER than being an actor-declared field disclosed under consent
 * (DD-6). Distinct from {@link PUBLICLY_DISCLOSED_FIELDS} / the retired
 * {@link PII_ALLOWLIST} on purpose: those constants' documented meaning is
 * *what the actor supplied about themselves and may consent to disclose*,
 * and overloading this constant with them would make it lie about what it
 * contains (a future reader could reasonably "fix" `registrationSource` out
 * of it as miscategorised).
 *
 * Two different reasons live here now, and only one of them is "not PII":
 * - `traderId`, `gpsAltitude`, `gpsAccuracy`, `registrationSource`,
 *   `consentMethod`, `consentObtainedAt`, `consentReference` are admin-only
 *   OPERATIONAL METADATA about the record — genuinely not PII about the
 *   actor at all.
 * - `technicalSupport` (T-6, FR-3) is different, and NOT simply "not PII":
 *   it is a STAFF-AUTHORED needs assessment (the TRD names it *"Technical
 *   support required"*), not an actor declaration — so it does not belong
 *   among the actor-consent constants above — but it is unreviewed free text
 *   that CAN incidentally carry personal data. It excludes for a narrower
 *   reason than its neighbours: nobody has reviewed it for what it might
 *   contain, and it was never the actor's own disclosure to consent to. It
 *   remains present in the `Admin` projection (FR-3's `BUT`).
 *
 * **Three different polarities apply across the public paths (design.md
 * §7.1, DD-3) — recorded here, in the file the next task reads first, so an
 * edit to any one of them does not get folded into another (KZ-008):**
 * - `NEVER_PUBLIC_FIELDS` (this constant) — an ABSENCE set on EVERY public
 *   path: list, detail, AND `/metrics`. This is what
 *   `pii-boundary.spec.ts`'s `FORBIDDEN_KEYS` sweeps for.
 * - {@link CONTACT_BLOCK_FIELDS} — an ADDITIONAL absence set, but ONLY BY
 *   KEY on the list path (FR-9/DD-3); those same fields are REQUIRED PRESENT
 *   on the detail path. By VALUE, the contact-block fixture values are also
 *   absent on `/metrics` (design.md DD-4's "Detail-only" row), enforced
 *   today by `LEAKABLE_PII_VALUES` rather than this constant.
 * - {@link PUBLICLY_DISCLOSED_FIELDS} — a PRESENCE set, checked on the
 *   detail path only. It must NEVER be folded into an absence check: doing
 *   so would forbid `phone`/`email`/`position`/`marketLocation`/
 *   `contactPerson`/`otherCrops` on the very path FR-1 requires them
 *   present on.
 *
 * As of T-6, `pii-boundary.spec.ts` still iterates
 * `FORBIDDEN_KEYS = [...PII_ALLOWLIST, ...NEVER_PUBLIC_FIELDS]` and applies
 * it as an absence set on all three public paths — that is the correct
 * polarity for `NEVER_PUBLIC_FIELDS` above and needs no change on that
 * account. Whichever task next re-points `PII_ALLOWLIST`'s now-empty share
 * of that union should consult design.md §7.1/DD-3 for the target, not
 * assume it is {@link PUBLICLY_DISCLOSED_FIELDS} — that constant is a
 * presence set and does not belong in `FORBIDDEN_KEYS` at all.
 */
export const NEVER_PUBLIC_FIELDS = [
  'traderId',
  'gpsAltitude',
  'gpsAccuracy',
  'registrationSource',
  'consentMethod',
  'consentObtainedAt',
  'consentReference',
  'technicalSupport',
] as const;

export type NeverPublicField = (typeof NEVER_PUBLIC_FIELDS)[number];

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
