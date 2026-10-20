import { ValidationArguments, registerDecorator } from 'class-validator';
import { normalizePhone } from './normalize';
import { countryByCode } from './geo/countries';

/** The message shared by the DTO check and the service's merged-state check. */
export function phoneOfCountryMessage(country: string): string {
  const entry = countryByCode(country);
  if (!entry) return 'Phone must include the country code.';
  return `Phone must include the country prefix: a number from ${entry.name} starts with +${entry.callingCode}.`;
}

/** International form with the country's prefix, Tanzania included (the import is laxer). */
export function isPhoneOfCountry(country: string, phone: string): boolean {
  const entry = countryByCode(country);
  return !!entry && normalizePhone(phone, entry.callingCode, { internationalOnly: true }).phone !== null;
}

/**
 * Phone must be in international form with the object's own `country`
 * prefix. Skipped when `country` is absent or unknown; on update the service
 * checks the merged pair.
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
