import { ValidationArguments, registerDecorator } from 'class-validator';
import { countryByCode, isRegionOf } from './geo/countries';

/** The message shared by the DTO check and the service's merged-state check. */
export function regionOfCountryMessage(country: string): string {
  return `Region must be one of ${countryByCode(country)?.name ?? country}'s regions.`;
}

/**
 * Region must belong to the object's own `country`. Skipped when `country` is
 * absent or unknown (its own validator reports that; on update the service
 * checks the merged pair).
 */
export function IsRegionOfCountry() {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isRegionOfCountry',
      target: object.constructor,
      propertyName,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const country = (args.object as Record<string, unknown>).country;
          if (typeof country !== 'string' || !countryByCode(country)) return true;
          return typeof value === 'string' && isRegionOf(country, value);
        },
        defaultMessage(args: ValidationArguments): string {
          return regionOfCountryMessage((args.object as Record<string, string>).country);
        },
      },
    });
  };
}

/** Query-filter variant: when `country` is also present, `region` must belong to it. */
export function IsRegionOfCountryFilter() {
  return IsRegionOfCountry();
}
