import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { IsString, validate } from 'class-validator';
import { IsPhoneOfCountry, phoneOfCountryMessage } from './phone-of-country.validator';

class Probe {
  @IsString()
  country!: string;

  @IsPhoneOfCountry()
  phone!: string;
}

const errorsFor = async (country: string, phone: string) =>
  (await validate(plainToInstance(Probe, { country, phone }))).flatMap((e) => Object.values(e.constraints ?? {}));

describe('IsPhoneOfCountry', () => {
  it.each([
    ['TZ', '0712 345 678'],
    ['TZ', '+255 712 345 678'],
    ['KE', '+254 712 345 678'],
    ['UG', '00256772123456'],
    ['CI', '+225 07 12 34 56 78'],
  ])('accepts %s %s', async (country, phone) => {
    expect(await errorsFor(country, phone)).toEqual([]);
  });

  it.each([
    ['KE', '0712 345 678', 'Phone must be a number from Kenya, starting with +254.'],
    ['KE', '+255 712 345 678', 'Phone must be a number from Kenya, starting with +254.'],
    ['TZ', '12345', 'Phone must be a Tanzanian number, e.g. +255 712 345 678 or 0712 345 678.'],
  ])('rejects %s %s', async (country, phone, message) => {
    expect(await errorsFor(country, phone)).toEqual([message]);
  });

  it('leaves an unknown country to its own validator', async () => {
    expect(await errorsFor('XX', 'anything')).toEqual([]);
  });

  it('names the country in the message', () => {
    expect(phoneOfCountryMessage('UG')).toBe('Phone must be a number from Uganda, starting with +256.');
  });
});
