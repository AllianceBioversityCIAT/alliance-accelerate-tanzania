/**
 * Phone rule for the forms, mirroring backend `phone-of-country.validator.ts`:
 * the international form with the country's prefix, Tanzania included.
 */
import { countryName, callingCode } from '@/lib/content/countries';

/** Côte d'Ivoire, Gabon and Congo: the leading 0 belongs to the subscriber number. */
const LEADING_ZERO_CALLING_CODES = new Set(['225', '241', '242']);

const clean = (raw: string) =>
  (raw.split('/').map((part) => part.trim()).find((part) => part !== '') ?? '')
    .replace(/\(0\)/g, '')
    .replace(/[()\s.-]/g, '')
    .replace(/^00/, '+');

export function isPhoneOfCountry(country: string, raw: string): boolean {
  const cc = callingCode(country).slice(1);
  if (!cc) return true;
  const first = LEADING_ZERO_CALLING_CODES.has(cc) ? '\\d' : '[1-9]';
  return new RegExp(`^\\+${cc}${first}\\d{5,11}$`).test(clean(raw));
}

export function phoneOfCountryMessage(country: string): string {
  return `Phone must include the country prefix: a number from ${countryName(country)} starts with ${callingCode(country)}.`;
}

/** Hint under the phone field: always ask for the prefix, and name it once a country is chosen. */
export function phoneHint(country: string): string {
  const cc = callingCode(country);
  return cc
    ? `Please include the country prefix (${countryName(country)}: ${cc}).`
    : 'Please include the country prefix, e.g. +255.';
}
