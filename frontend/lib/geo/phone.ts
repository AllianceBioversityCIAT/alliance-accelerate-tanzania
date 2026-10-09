/**
 * Phone rules per country, mirroring backend `normalizePhone` /
 * `phone-of-country.validator.ts`: Tanzania also accepts its national formats;
 * every other country needs the international form with its calling code.
 */
import { countryName, callingCode } from '@/lib/content/countries';

/** Côte d'Ivoire, Gabon and Congo: the leading 0 belongs to the subscriber number. */
const LEADING_ZERO_CALLING_CODES = new Set(['225', '241', '242']);

const clean = (raw: string) =>
  (raw.split('/').map((part) => part.trim()).find((part) => part !== '') ?? '')
    .replace(/\(0\)/g, '')
    .replace(/[()\s.-]/g, '')
    .replace(/^00/, '+');

function isTanzanian(phone: string): boolean {
  return /^\+?255[1-9]\d{8}$/.test(phone) || /^0\d{9}$/.test(phone) || /^[67]\d{8}$/.test(phone);
}

export function isPhoneOfCountry(country: string, raw: string): boolean {
  const cc = callingCode(country).slice(1);
  if (!cc) return true;
  const phone = clean(raw);
  if (country === 'TZ') return isTanzanian(phone);
  const first = LEADING_ZERO_CALLING_CODES.has(cc) ? '\\d' : '[1-9]';
  return new RegExp(`^\\+${cc}${first}\\d{5,11}$`).test(phone);
}

export function phoneOfCountryMessage(country: string): string {
  return country === 'TZ'
    ? 'Phone must be a Tanzanian number, e.g. +255 712 345 678 or 0712 345 678.'
    : `Phone must be a number from ${countryName(country)}, starting with ${callingCode(country)}.`;
}

/** Hint under the phone field once a country is chosen. */
export function phoneHint(country: string): string | undefined {
  const cc = callingCode(country);
  if (!cc) return undefined;
  return country === 'TZ'
    ? `Tanzania: ${cc} 7XX XXX XXX or 07XX XXX XXX`
    : `${countryName(country)}: start with ${cc}`;
}
