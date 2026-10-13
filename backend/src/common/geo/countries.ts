/**
 * Country/region allowlist: the 54 African countries and their ISO 3166-2
 * regions (african-countries.generated.json, written by
 * scripts/generate-african-geo.ts). `country` is stored as the ISO 3166-1
 * alpha-2 code; `region` must be one of that country's regions.
 */
import { normalizePhone, normalizeRegion, type PhoneNormalizationResult } from '../normalize';
import GENERATED from './african-countries.generated.json';

export interface AfricanCountry {
  /** ISO 3166-1 alpha-2, the value stored in `country`. */
  readonly code: string;
  readonly name: string;
  /** E.164 country calling code, without the "+". */
  readonly callingCode: string;
  readonly regions: readonly string[];
  /** Map frame, `[[south, west], [north, east]]` (Natural Earth, mainland-weighted). */
  readonly bounds: readonly [readonly [number, number], readonly [number, number]];
}

export const AFRICAN_COUNTRIES = GENERATED as unknown as readonly AfricanCountry[];

export const COUNTRY_CODES: readonly string[] = AFRICAN_COUNTRIES.map((c) => c.code);

/** Every region of every country, deduplicated: what `?region=` may name without `?country=`. */
export const ALL_REGION_NAMES: readonly string[] = [
  ...new Set(AFRICAN_COUNTRIES.flatMap((c) => c.regions)),
];

// Short on purpose: @IsIn's default message would list every allowed value.
export const UNKNOWN_COUNTRY = { message: 'country must be the ISO code of an African country.' };
export const UNKNOWN_REGION = { message: 'region is not a known region.' };

const BY_CODE = new Map(AFRICAN_COUNTRIES.map((c) => [c.code, c]));

export function countryByCode(code: string | null | undefined): AfricanCountry | undefined {
  return code ? BY_CODE.get(code) : undefined;
}

export function countryName(code: string): string {
  return BY_CODE.get(code)?.name ?? code;
}

/** Exact membership, as the write DTOs and list filters require. */
export function isRegionOf(country: string, region: string): boolean {
  return BY_CODE.get(country)?.regions.includes(region) ?? false;
}

/** Lower-case, strip accents and collapse punctuation/space, for lenient matching. */
export function foldName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Other names people write for a country (folded) → code. */
const COUNTRY_ALIASES: Record<string, string> = {
  'ivory coast': 'CI',
  'cape verde': 'CV',
  swaziland: 'SZ',
  'the gambia': 'GM',
  'republic of the congo': 'CG',
  'congo brazzaville': 'CG',
  'republic of congo': 'CG',
  drc: 'CD',
  'dr congo': 'CD',
  'congo kinshasa': 'CD',
  'democratic republic of congo': 'CD',
  'united republic of tanzania': 'TZ',
  'tanzania united republic of': 'TZ',
  car: 'CF',
};

const COUNTRY_BY_FOLDED = new Map<string, string>([
  ...AFRICAN_COUNTRIES.map((c): [string, string] => [foldName(c.name), c.code]),
  ...AFRICAN_COUNTRIES.map((c): [string, string] => [c.code.toLowerCase(), c.code]),
  ...Object.entries(COUNTRY_ALIASES),
]);

/** A country name, ISO code or known alias → ISO code; anything else → null. */
export function normalizeCountry(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const folded = foldName(raw);
  if (folded === '') return null;
  return COUNTRY_BY_FOLDED.get(folded) ?? null;
}

/** Codes of the countries with a name word starting with `term` (3+ chars, folded), for free-text search. */
export function countryCodesMatching(term: string): string[] {
  const folded = foldName(term);
  if (folded.length < 3) return [];
  return AFRICAN_COUNTRIES.filter((c) =>
    ` ${foldName(c.name)}`.includes(` ${folded}`),
  ).map((c) => c.code);
}

export interface RegionForResult {
  region: string | null;
  quarantined: boolean;
}

const UNIT_SUFFIX = / (region|province|county|district|state|governorate|department|prefecture)$/;

/**
 * Normalize a raw region within a country. Tanzania keeps its alias-aware
 * `normalizeRegion`; elsewhere a value matches when it equals one of the
 * country's regions ignoring case, accents and punctuation, optionally with
 * a trailing unit word ("Nakuru County"). Unknown country → quarantined.
 */
export function normalizeRegionFor(
  country: string | null,
  raw: string | null | undefined,
): RegionForResult {
  const entry = countryByCode(country);
  if (!entry) return { region: null, quarantined: true };
  if (entry.code === 'TZ') return normalizeRegion(raw);
  if (raw == null) return { region: null, quarantined: true };

  const folded = foldName(raw);
  if (folded === '') return { region: null, quarantined: true };
  const match = (key: string) => entry.regions.find((r) => foldName(r) === key);
  const found = match(folded) ?? match(folded.replace(UNIT_SUFFIX, ''));
  return found ? { region: found, quarantined: false } : { region: null, quarantined: true };
}

/**
 * `normalizePhone` with the country's calling code. Unknown country → no
 * phone (the number cannot be read without knowing whose it is).
 */
export function normalizePhoneFor(
  country: string | null,
  raw: string | null | undefined,
): PhoneNormalizationResult {
  const entry = countryByCode(country);
  if (!entry) return { phone: null, additionalCount: 0 };
  return normalizePhone(raw, entry.callingCode);
}

/** Registrations submitted before `country` existed were all Tanzanian. */
export const LEGACY_PAYLOAD_COUNTRY = 'TZ';

/** The country of a registration payload; a missing/unknown one reads as Tanzania. */
export function payloadCountry(payload: { country?: unknown } | null | undefined): string {
  const country = payload?.country;
  return typeof country === 'string' && BY_CODE.has(country) ? country : LEGACY_PAYLOAD_COUNTRY;
}
