import { readFileSync } from 'fs';
import { join } from 'path';
import { CANONICAL_REGIONS } from '../normalize';
import {
  AFRICAN_COUNTRIES,
  ALL_REGION_NAMES,
  COUNTRY_CODES,
  countryCodesMatching,
  isRegionOf,
  normalizeCountry,
  normalizePhoneFor,
  normalizeRegionFor,
} from './countries';

describe('african countries allowlist', () => {
  it('lists the 54 African countries once each', () => {
    expect(AFRICAN_COUNTRIES).toHaveLength(54);
    expect(new Set(COUNTRY_CODES).size).toBe(54);
    expect(COUNTRY_CODES).not.toContain('EH');
  });

  it('keeps Tanzania on the 31 regions stored actors already use', () => {
    const tz = AFRICAN_COUNTRIES.find((c) => c.code === 'TZ')!;
    expect([...tz.regions].sort()).toEqual([...CANONICAL_REGIONS].sort());
  });

  it('uses districts, not the 4 groupings, for Uganda', () => {
    const ug = AFRICAN_COUNTRIES.find((c) => c.code === 'UG')!;
    expect(ug.regions).toContain('Kampala');
    expect(ug.regions).not.toContain('Central');
    expect(ug.regions.length).toBeGreaterThan(100);
  });

  it('gives every country at least one region and no duplicates within one', () => {
    for (const c of AFRICAN_COUNTRIES) {
      expect(c.regions.length).toBeGreaterThan(0);
      expect(new Set(c.regions).size).toBe(c.regions.length);
    }
  });

  it('is byte-identical to the frontend copy', () => {
    const read = (p: string) => readFileSync(join(__dirname, '../../../..', p), 'utf8');
    expect(read('frontend/lib/content/african-countries.generated.ts')).toBe(
      read('backend/src/common/geo/african-countries.generated.ts'),
    );
  });

  it('exposes every region name for country-less filtering', () => {
    expect(ALL_REGION_NAMES).toContain('Kigoma');
    expect(ALL_REGION_NAMES).toContain('Nakuru');
  });
});

describe('isRegionOf', () => {
  it('accepts a region of the country and rejects one of another', () => {
    expect(isRegionOf('TZ', 'Kigoma')).toBe(true);
    expect(isRegionOf('KE', 'Nakuru')).toBe(true);
    expect(isRegionOf('KE', 'Kigoma')).toBe(false);
    expect(isRegionOf('XX', 'Kigoma')).toBe(false);
  });
});

describe('normalizeCountry', () => {
  it.each([
    ['Tanzania', 'TZ'],
    ['tz', 'TZ'],
    ['  KENYA ', 'KE'],
    ['Cote dIvoire', null],
    ["Cote d'Ivoire", 'CI'],
    ['Ivory Coast', 'CI'],
    ['DRC', 'CD'],
    ['Sao Tome and Principe', 'ST'],
    ['United Republic of Tanzania', 'TZ'],
    ['France', null],
    ['', null],
    [null, null],
  ])('%p → %p', (raw, expected) => {
    expect(normalizeCountry(raw)).toBe(expected);
  });
});

describe('countryCodesMatching', () => {
  it('matches a folded word prefix of the name, from 3 characters', () => {
    expect(countryCodesMatching('tanz')).toEqual(['TZ']);
    expect(countryCodesMatching('congo').sort()).toEqual(['CD', 'CG']);
    expect(countryCodesMatching('south').sort()).toEqual(['SS', 'ZA']);
    expect(countryCodesMatching('nia')).toEqual([]);
    expect(countryCodesMatching('ta')).toEqual([]);
    expect(countryCodesMatching('  ')).toEqual([]);
  });
});

describe('normalizeRegionFor', () => {
  it('delegates to the Tanzania aliases', () => {
    expect(normalizeRegionFor('TZ', 'Pemba North')).toEqual({ region: 'Kaskazini Pemba', quarantined: false });
  });

  it('matches ignoring case, accents and a unit word elsewhere', () => {
    expect(normalizeRegionFor('KE', 'nakuru county')).toEqual({ region: 'Nakuru', quarantined: false });
    expect(normalizeRegionFor('GW', 'Gabu')).toEqual({ region: 'Gabú', quarantined: false });
  });

  it('quarantines a region of another country, blanks and unknown countries', () => {
    expect(normalizeRegionFor('KE', 'Kigoma')).toEqual({ region: null, quarantined: true });
    expect(normalizeRegionFor('KE', ' ')).toEqual({ region: null, quarantined: true });
    expect(normalizeRegionFor(null, 'Nakuru')).toEqual({ region: null, quarantined: true });
  });
});

describe('normalizePhoneFor', () => {
  it('keeps the Tanzanian national formats for Tanzania', () => {
    expect(normalizePhoneFor('TZ', '0712 345 678').phone).toBe('+255712345678');
  });

  it('reads only the international form elsewhere', () => {
    expect(normalizePhoneFor('KE', '+254 712 345 678').phone).toBe('+254712345678');
    expect(normalizePhoneFor('KE', '00254712345678').phone).toBe('+254712345678');
    expect(normalizePhoneFor('KE', '0712345678').phone).toBeNull();
    expect(normalizePhoneFor('KE', '+255712345678').phone).toBeNull();
    expect(normalizePhoneFor('KE', '+254 0712345678').phone).toBeNull();
    expect(normalizePhoneFor('CI', '+225 07 12 34 56 78').phone).toBe('+2250712345678');
    expect(normalizePhoneFor('CI', '+225 27 12 34 56 78').phone).toBe('+2252712345678');
  });

  it('counts extra numbers without returning them', () => {
    expect(normalizePhoneFor('KE', '+254712345678 / +254700000000')).toEqual({
      phone: '+254712345678',
      additionalCount: 1,
    });
  });

  it('reads no phone for an unknown country', () => {
    expect(normalizePhoneFor(null, '+254712345678').phone).toBeNull();
  });
});
