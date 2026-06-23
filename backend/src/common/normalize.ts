/**
 * T-3 — Pure normalization helpers (DB- and Nest-INDEPENDENT).
 *
 * Implements FR-3 (normalize + validate on every write) as a set of PURE,
 * exported functions plus the canonical constants they enforce. Nothing here
 * imports Nest, Prisma, or any I/O — so the same rules are trivially unit-tested
 * and reused unchanged by the seed (T-7) and the design-only import (T-8).
 *
 * Design refs: design.md §4 (`common/normalize.ts`), §5 (canonical columns),
 * §7 (CommonModule owns `normalize.*`), §10 DD-5 (taxonomy/PII as named
 * constants, edited in one place). Requirement: requirements.md FR-3 / NFR-4.
 *
 * Quarantine philosophy (FR-3): dirty input is NEVER silently guessed. A value
 * is canonicalized only when the mapping is unambiguous (trim/case/known alias);
 * anything ambiguous or unknown is *quarantined* (region = null, quarantined =
 * true) for a human/import to resolve, rather than coerced into a wrong region.
 */

/**
 * Official Tanzania regions (mainland + Zanzibar), 31 as of the most recent
 * administrative split (Songwe carved from Mbeya; Zanzibar's five urban/rural
 * regions included). This is the canonical allowlist `region` is matched
 * against. Edited in one place per DD-5 if the administrative map changes.
 */
export const CANONICAL_REGIONS = [
  'Arusha',
  'Dar es Salaam',
  'Dodoma',
  'Geita',
  'Iringa',
  'Kagera',
  'Katavi',
  'Kigoma',
  'Kilimanjaro',
  'Lindi',
  'Manyara',
  'Mara',
  'Mbeya',
  'Morogoro',
  'Mtwara',
  'Mwanza',
  'Njombe',
  'Pwani',
  'Rukwa',
  'Ruvuma',
  'Shinyanga',
  'Simiyu',
  'Singida',
  'Songwe',
  'Tabora',
  'Tanga',
  // Zanzibar
  'Kaskazini Unguja', // Zanzibar North
  'Kusini Unguja', // Zanzibar Central/South
  'Mjini Magharibi', // Zanzibar Urban/West
  'Kaskazini Pemba', // Pemba North
  'Kusini Pemba', // Pemba South
] as const;

export type CanonicalRegion = (typeof CANONICAL_REGIONS)[number];

/**
 * Lower-cased canonical region → exact canonical spelling, for O(1)
 * case-insensitive lookup. Built once at module load.
 */
const REGION_BY_LOWER = new Map<string, CanonicalRegion>(
  CANONICAL_REGIONS.map((r) => [r.toLowerCase(), r]),
);

/**
 * Known unambiguous aliases for canonical regions (lower-cased keys). These are
 * dirty-but-resolvable spellings seen in source data — e.g. the trailing
 * "Region" word, or the English Zanzibar names. Ambiguous values (e.g.
 * "Arusha/Dodoma") are deliberately ABSENT here so they fall through to
 * quarantine.
 */
const REGION_ALIASES = new Map<string, CanonicalRegion>([
  ['dar-es-salaam', 'Dar es Salaam'],
  ['dar es salaam region', 'Dar es Salaam'],
  ['kusini unguja region', 'Kusini Unguja'],
  ['zanzibar north', 'Kaskazini Unguja'],
  ['zanzibar central/south', 'Kusini Unguja'],
  ['zanzibar south', 'Kusini Unguja'],
  ['zanzibar urban/west', 'Mjini Magharibi'],
  ['zanzibar west', 'Mjini Magharibi'],
  ['pemba north', 'Kaskazini Pemba'],
  ['pemba south', 'Kusini Pemba'],
]);

/** Result of {@link normalizeRegion}: a canonical region or a quarantine flag. */
export interface RegionNormalizationResult {
  region: CanonicalRegion | null;
  quarantined: boolean;
}

/**
 * Normalize a raw `region` string to a canonical Tanzania region.
 *
 * Resolution order (FR-3): exact/case-insensitive canonical match → trailing
 * " Region" stripped → known alias. Anything still unresolved — including
 * AMBIGUOUS values such as `"Arusha/Dodoma"` (two regions, can't pick one) and
 * unknown values — is quarantined (`region: null, quarantined: true`) rather
 * than guessed. Blank/null input is quarantined.
 */
export function normalizeRegion(
  raw: string | null | undefined,
): RegionNormalizationResult {
  if (raw == null) return { region: null, quarantined: true };

  const trimmed = raw.trim();
  if (trimmed === '') return { region: null, quarantined: true };

  const lower = trimmed.toLowerCase();

  // 1. Exact (case-insensitive) canonical match.
  const exact = REGION_BY_LOWER.get(lower);
  if (exact) return { region: exact, quarantined: false };

  // 2. Trailing " region" word stripped (e.g. "Mbeya Region" → "Mbeya").
  const withoutSuffix = lower.replace(/\s+region$/, '').trim();
  const bySuffix = REGION_BY_LOWER.get(withoutSuffix);
  if (bySuffix) return { region: bySuffix, quarantined: false };

  // 3. Known unambiguous alias.
  const alias = REGION_ALIASES.get(lower);
  if (alias) return { region: alias, quarantined: false };

  // 4. Ambiguous (e.g. "Arusha/Dodoma") or unknown → quarantine, never guess.
  return { region: null, quarantined: true };
}

/**
 * Canonical trader-type taxonomy (OQ-2). Declared as a named constant per DD-5
 * so legal/business can revise it in one place. Exported for DTO enum
 * validation (`actor-create.dto.ts`).
 */
export const TRADER_TYPES = [
  'seed_company',
  'cooperative',
  'ngo',
  'offtaker',
  'research_institute',
  'informal_trader',
] as const;

export type TraderType = (typeof TRADER_TYPES)[number];

/** Lower-cased canonical trader type → itself, for case-insensitive matching. */
const TRADER_TYPE_BY_LOWER = new Map<string, TraderType>(
  TRADER_TYPES.map((t) => [t.toLowerCase(), t]),
);

/**
 * Source-value aliases for trader types (lower-cased keys) → canonical taxonomy.
 * Maps the free-text labels seen in the source spreadsheet onto OQ-2 codes.
 */
const TRADER_TYPE_ALIASES = new Map<string, TraderType>([
  ['informal trader/retailer', 'informal_trader'],
  ['informal trader', 'informal_trader'],
  ['retailer', 'informal_trader'],
  ['large offtaker', 'offtaker'],
  ['off-taker', 'offtaker'],
  ['seed company', 'seed_company'],
  ['cooperative', 'cooperative'],
  ['co-operative', 'cooperative'],
  ['co-op', 'cooperative'],
  ['ngo', 'ngo'],
  ['research institute', 'research_institute'],
  ['research institution', 'research_institute'],
]);

/**
 * Normalize a raw `traderType` to the canonical taxonomy (OQ-2). Accepts
 * canonical codes (case-insensitive) and known source aliases. Unknown values
 * return `null` — the CALLER decides whether that is a validation failure (DTO)
 * or a quarantine (import), per the task spec.
 */
export function normalizeTraderType(
  raw: string | null | undefined,
): TraderType | null {
  if (raw == null) return null;

  const lower = raw.trim().toLowerCase();
  if (lower === '') return null;

  return TRADER_TYPE_BY_LOWER.get(lower) ?? TRADER_TYPE_ALIASES.get(lower) ?? null;
}

/** Canonical `sex` values stored on the Actor (PII, gated downstream in T-4). */
export type NormalizedSex = 'M' | 'F' | 'Other';

/**
 * Normalize a raw `sex` value to `M` | `F` | `Other` | null. `Male`/`M` → `M`,
 * `Female`/`F` → `F`, blank/null → null (FR-3). Anything else recognized as a
 * deliberate third value maps to `Other`; otherwise null.
 */
export function normalizeSex(
  raw: string | null | undefined,
): NormalizedSex | null {
  if (raw == null) return null;

  const lower = raw.trim().toLowerCase();
  if (lower === '') return null;

  if (lower === 'm' || lower === 'male') return 'M';
  if (lower === 'f' || lower === 'female') return 'F';
  if (lower === 'other' || lower === 'o') return 'Other';

  return null;
}

/**
 * Coerce a raw `capacityTons` value to a non-negative number, or null.
 *
 * Choice (documented per task): this returns null for blank/null, for
 * non-numeric input, and for NEGATIVE values, rather than throwing. Rationale —
 * `normalize.*` is a pure data-cleaning layer shared by import (which quarantines
 * bad rows, not crashes) and the DTO (which separately rejects negatives via
 * `@Min(0)`, producing the 400). A negative capacity is treated as "no usable
 * value", so the cleaner yields null and the DTO is the gate that rejects an
 * explicitly-supplied bad number. Numeric strings ("1250.5") are accepted.
 */
export function parseCapacityTons(
  raw: string | number | null | undefined,
): number | null {
  if (raw == null) return null;

  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else {
    const trimmed = raw.trim();
    // `Number('')` coerces to 0, so an empty/blank string must short-circuit to
    // null ("no usable value") rather than become a spurious 0.
    if (trimmed === '') return null;
    n = Number(trimmed);
  }

  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;

  return n;
}

/** GPS latitude guard: finite and within [−90, 90]. */
export function isValidLatitude(n: number | null | undefined): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= -90 && n <= 90;
}

/** GPS longitude guard: finite and within [−180, 180]. */
export function isValidLongitude(n: number | null | undefined): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= -180 && n <= 180;
}
