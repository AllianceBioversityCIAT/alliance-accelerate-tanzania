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
 *
 * The last four codes were added per FR-4 / design.md §4.4 / DD-7 to cover
 * categories present in the client's `Partner Profile 14.4.2026.xlsx` that
 * previously had no canonical code and would quarantine. Appended after the
 * original six so existing ordinal/positional assumptions are undisturbed
 * (additive only — the original six are untouched).
 */
export const TRADER_TYPES = [
  'seed_company',
  'cooperative',
  'ngo',
  'offtaker',
  'research_institute',
  'informal_trader',
  'humanitarian',
  'digital_service_provider',
  'qds_producer',
  'bulk_buyer',
] as const;

export type TraderType = (typeof TRADER_TYPES)[number];

/** Lower-cased canonical trader type → itself, for case-insensitive matching. */
const TRADER_TYPE_BY_LOWER = new Map<string, TraderType>(
  TRADER_TYPES.map((t) => [t.toLowerCase(), t]),
);

/**
 * Source-value aliases for trader types (lower-cased keys) → canonical taxonomy.
 * Maps the free-text labels seen in the source spreadsheet onto OQ-2 codes.
 *
 * FR-4 / design.md §4.4 / DD-7 additions (client workbook spellings for the
 * four new categories): `INGO`, `NGO/INGO`, and `cbo` are unambiguous,
 * unambiguous-to-*this*-taxonomy synonyms for the new `humanitarian` bucket
 * — an INGO, an "NGO/INGO"-labelled org, and a community-based organization
 * are all humanitarian/development actors, distinct from the formally
 * registered local NGOs already covered by the pre-existing `ngo` alias.
 * `Digital Service Provider`, `QDS`, and `Bulk buyer` are direct spellings of
 * their new canonical codes. A value whose mapping would be a guess rather
 * than a fact (e.g. a bare "Offtaker name"-style variant with no clear target,
 * or any value not listed here) is deliberately left OUT so it quarantines —
 * see the file's quarantine philosophy above and requirements.md FR-4.
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
  ['ingo', 'humanitarian'],
  ['ngo/ingo', 'humanitarian'],
  ['cbo', 'humanitarian'],
  ['digital service provider', 'digital_service_provider'],
  ['qds', 'qds_producer'],
  ['bulk buyer', 'bulk_buyer'],
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

/**
 * Tanzania E.164 country calling code (FR-5). Named per DD-5/NFR-4 so a
 * future country-code change (unlikely, but the point of a constant) is a
 * one-line edit rather than a scattered literal.
 */
const TZ_COUNTRY_CODE = '255';

/** Result of {@link normalizePhone}: a canonical `+255…` number or `null`. */
export interface PhoneNormalizationResult {
  phone: string | null;
  additionalCount: number;
}

/**
 * Normalize a raw `phone` cell to Tanzanian E.164 (`+255…`), or `null` (FR-5).
 *
 * Quarantine philosophy (matching `normalizeRegion` / `normalizeTraderType`
 * above): a value is normalized only when the mapping is unambiguous — a
 * bare 9-digit local number, a leading-zero national number, a
 * country-prefixed number (with or without internal spaces or a
 * parenthesized country code), or a landline with internal spaces. Anything
 * else — wrong length, non-numeric, or empty — returns `null` rather than a
 * partially-mangled string; the caller decides what a `null` means (import
 * quarantine vs. DTO validation), per the file's existing convention.
 *
 * **Multi-number cells (`/`-separated) are never silently truncated.** The
 * first number is the one normalized into `phone`; every number after it is
 * *discarded from the return value entirely* and only counted, never
 * surfaced — a count of `n` means the discarded values sat at positions
 * `2…n+1` of the source cell (design.md §4.1). This is what lets a caller
 * warn "a second number was present" without this function — or anything
 * downstream — ever holding, logging, or persisting the discarded digits
 * (PII — FR-5, NFR-9).
 */
export function normalizePhone(
  raw: string | null | undefined,
): PhoneNormalizationResult {
  if (raw == null) return { phone: null, additionalCount: 0 };

  const trimmed = raw.trim();
  if (trimmed === '') return { phone: null, additionalCount: 0 };

  const parts = trimmed
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length === 0) return { phone: null, additionalCount: 0 };

  return {
    phone: normalizeSinglePhone(parts[0]),
    additionalCount: parts.length - 1,
  };
}

/**
 * Normalize one phone candidate (already trimmed, no `/` splitting). Strips
 * parentheses and internal whitespace, then matches the resulting digit
 * string against the four length/prefix shapes that unambiguously resolve
 * to a Tanzanian E.164 number. No other punctuation is stripped — a value
 * with a dash or other separator is not a measured format, so it falls
 * through to `null` rather than being guessed at.
 */
function normalizeSinglePhone(candidate: string): string | null {
  const cleaned = candidate.replace(/[()]/g, '').replace(/\s+/g, '');
  if (cleaned === '') return null;

  // Already `+255` + 9 digits.
  if (new RegExp(`^\\+${TZ_COUNTRY_CODE}\\d{9}$`).test(cleaned)) {
    return cleaned;
  }
  // Country-prefixed without the leading `+` (incl. de-parenthesized).
  if (new RegExp(`^${TZ_COUNTRY_CODE}\\d{9}$`).test(cleaned)) {
    return `+${cleaned}`;
  }
  // Leading-zero national (mobile or landline) — 0 + 9 digits.
  if (/^0\d{9}$/.test(cleaned)) {
    return `+${TZ_COUNTRY_CODE}${cleaned.slice(1)}`;
  }
  // Bare 9-digit local number — no leading zero, no country code.
  if (/^\d{9}$/.test(cleaned)) {
    return `+${TZ_COUNTRY_CODE}${cleaned}`;
  }

  return null;
}

/** GPS latitude guard: finite and within [−90, 90]. */
export function isValidLatitude(n: number | null | undefined): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= -90 && n <= 90;
}

/** GPS longitude guard: finite and within [−180, 180]. */
export function isValidLongitude(n: number | null | undefined): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= -180 && n <= 180;
}
