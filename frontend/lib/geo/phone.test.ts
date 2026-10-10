import { isPhoneOfCountry, phoneHint, phoneOfCountryMessage } from './phone';

describe('isPhoneOfCountry', () => {
  it.each([
    ['TZ', '+255 712 345 678'],
    ['KE', '+254 712 345 678'],
    ['UG', '00256772123456'],
    ['CI', '+225 07 12 34 56 78'],
    ['KE', '+254712345678 / +254700000000'],
    ['TZ', '+255-712-345-678'],
    ['TZ', '+255 (0) 712 345 678'],
    ['TZ', '00255712345678'],
    ['KE', '+254.712.345.678'],
    ['TZ', '/ +255712345678'],
  ])('accepts %s %s', (country, phone) => {
    expect(isPhoneOfCountry(country, phone)).toBe(true);
  });

  it.each([
    ['KE', '0712 345 678'],
    ['KE', '+255 712 345 678'],
    ['KE', '+254 0712345678'],
    ['TZ', '+254 712 345 678'],
    ['TZ', '12345'],
    ['TZ', '0712 345 678'],
    ['TZ', '712345678'],
  ])('rejects %s %s', (country, phone) => {
    expect(isPhoneOfCountry(country, phone)).toBe(false);
  });

  it('does not judge a phone before a country is chosen', () => {
    expect(isPhoneOfCountry('', 'anything')).toBe(true);
  });
});

describe('messages', () => {
  it('names the country and its code', () => {
    expect(phoneOfCountryMessage('KE')).toBe(
      'Phone must include the country prefix: a number from Kenya starts with +254.',
    );
    expect(phoneHint('KE')).toBe('Please include the country prefix (Kenya: +254).');
    expect(phoneHint('TZ')).toBe('Please include the country prefix (Tanzania: +255).');
    expect(phoneHint('')).toBe('Please include the country prefix, e.g. +255.');
  });
});
