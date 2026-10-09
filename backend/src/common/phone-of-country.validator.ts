import { ValidationArguments, registerDecorator } from 'class-validator';
import { countryByCode, normalizePhoneFor } from './geo/countries';

/** The message shared by the DTO check and the service's merged-state check. */
export function phoneOfCountryMessage(country: string): string {
  const entry = countryByCode(country);
  if (!entry) return 'Phone must include the country code.';
  return entry.code === 'TZ'
    ? 'Phone must be a Tanzanian number, e.g. +255 712 345 678 or 0712 345 678.'
    : `Phone must be a number from ${entry.name}, starting with +${entry.callingCode}.`;
}

export function isPhoneOfCountry(country: string, phone: string): boolean {
  return normalizePhoneFor(country, phone).phone !== null;
}

/**
 * Phone must be readable as a number of the object's own `country` (the same
 * rule the import applies). Skipped when `country` is absent or unknown; on
 * update the service checks the merged pair.
 */
export function IsPhoneOfCountry() {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPhoneOfCountry',
      target: object.constructor,
      propertyName,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const country = (args.object as Record<string, unknown>).country;
          if (typeof country !== 'string' || !countryByCode(country)) return true;
          return typeof value === 'string' && isPhoneOfCountry(country, value);
        },
        defaultMessage(args: ValidationArguments): string {
          return phoneOfCountryMessage((args.object as Record<string, string>).country);
        },
      },
    });
  };
}
