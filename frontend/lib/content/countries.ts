import { AFRICAN_COUNTRIES, type AfricanCountry } from './african-countries.generated';

export const COUNTRIES: readonly AfricanCountry[] = [...AFRICAN_COUNTRIES].sort((a, b) =>
  a.name.localeCompare(b.name),
);

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.code, label: c.name }));

/** Country name for a code; the code itself when unknown, never blank. */
export function countryName(code: string | null | undefined): string {
  if (!code) return '';
  return BY_CODE.get(code)?.name ?? code;
}

export function regionsFor(code: string | null | undefined): readonly string[] {
  return (code && BY_CODE.get(code)?.regions) || [];
}

/** E.164 calling code including the "+", or '' when the country is unknown. */
export function callingCode(code: string | null | undefined): string {
  const cc = code ? BY_CODE.get(code)?.callingCode : undefined;
  return cc ? `+${cc}` : '';
}

/** `Region, Country`; just the region when the country is unknown. */
export function formatLocation(region: string, country: string | null | undefined): string {
  const name = countryName(country);
  return name ? `${region}, ${name}` : region;
}

export interface RegionOption {
  /** Unique across countries: `<code>|<region>`. */
  value: string;
  label: string;
  country: string;
  region: string;
}

/** Every region of every country; the label carries the country so shared names stay unambiguous. */
export const ALL_REGION_OPTIONS: readonly RegionOption[] = COUNTRIES.flatMap((c) =>
  c.regions.map((region) => ({
    value: `${c.code}|${region}`,
    label: `${region} (${c.name})`,
    country: c.code,
    region,
  })),
);

export function regionOptionsFor(code: string | null | undefined): { value: string; label: string }[] {
  return regionsFor(code).map((region) => ({ value: region, label: region }));
}

export interface GeoFilter {
  country?: string;
  region?: string;
}

/** Country changed: keep the region only while it still belongs to the country. */
export function withCountry<T extends GeoFilter>(filters: T, country: string | undefined): T {
  const keep = country && filters.region && regionsFor(country).includes(filters.region);
  return { ...filters, country, region: keep ? filters.region : undefined };
}

/** Region picked from the all-regions list: also pins its country. */
export function withRegionOption<T extends GeoFilter>(filters: T, optionValue: string): T {
  const option = ALL_REGION_OPTIONS.find((o) => o.value === optionValue);
  if (!option) return { ...filters, region: undefined };
  return { ...filters, country: option.country, region: option.region };
}

/** Option value that represents the current region in the all-regions list. */
export function regionOptionValue(filters: GeoFilter): string {
  if (!filters.region) return '';
  if (filters.country) return `${filters.country}|${filters.region}`;
  // Country-less links predate other countries, so a shared name means Tanzania's.
  const matches = ALL_REGION_OPTIONS.filter((o) => o.region === filters.region);
  return (matches.find((o) => o.country === 'TZ') ?? matches[0])?.value ?? '';
}

/** URL pair the API will accept: unknown country dropped, region dropped unless it fits. */
export function cleanGeo(country: string | undefined, region: string | undefined): GeoFilter {
  const knownCountry = country && BY_CODE.has(country) ? country : undefined;
  const fits = knownCountry
    ? regionsFor(knownCountry).includes(region ?? '')
    : ALL_REGION_OPTIONS.some((o) => o.region === region);
  return { country: knownCountry, region: region && fits ? region : undefined };
}
