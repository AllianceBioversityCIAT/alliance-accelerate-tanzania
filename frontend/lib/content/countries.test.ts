import {
  ALL_REGION_OPTIONS,
  COUNTRIES,
  callingCode,
  countryName,
  formatLocation,
  regionOptionValue,
  cleanGeo,
  regionsFor,
  withCountry,
  withRegionOption,
} from './countries';

describe('countries helpers', () => {
  it('lists the 54 African countries sorted by name', () => {
    expect(COUNTRIES).toHaveLength(54);
    const names = COUNTRIES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('resolves names, regions and calling codes by ISO code', () => {
    expect(countryName('KE')).toBe('Kenya');
    expect(regionsFor('TZ')).toContain('Arusha');
    expect(callingCode('KE')).toBe('+254');
  });

  it('degrades for unknown or missing codes instead of throwing', () => {
    expect(countryName('')).toBe('');
    expect(countryName('ZZ')).toBe('ZZ');
    expect(regionsFor(undefined)).toEqual([]);
    expect(callingCode('ZZ')).toBe('');
  });

  it('formats a location as "Region, Country" and never shows the bare code', () => {
    expect(formatLocation('Arusha', 'TZ')).toBe('Arusha, Tanzania');
    expect(formatLocation('Arusha', undefined)).toBe('Arusha');
  });

  it('gives every region of the all-regions list a unique value and label', () => {
    expect(new Set(ALL_REGION_OPTIONS.map((o) => o.value)).size).toBe(ALL_REGION_OPTIONS.length);
    expect(new Set(ALL_REGION_OPTIONS.map((o) => o.label)).size).toBe(ALL_REGION_OPTIONS.length);
  });

  it('keeps a region on country change only when the new country has it', () => {
    expect(withCountry({ country: 'TZ', region: 'Arusha' }, 'TZ')).toEqual({ country: 'TZ', region: 'Arusha' });
    expect(withCountry({ country: 'TZ', region: 'Arusha' }, 'KE')).toEqual({ country: 'KE', region: undefined });
    expect(withCountry({ country: 'TZ', region: 'Arusha' }, undefined)).toEqual({ country: undefined, region: undefined });
  });

  it('pins the country when a region is chosen from the all-regions list', () => {
    const option = ALL_REGION_OPTIONS.find((o) => o.country === 'KE' && o.region === 'Nakuru')!;
    expect(withRegionOption({}, option.value)).toEqual({ country: 'KE', region: 'Nakuru' });
    expect(regionOptionValue({ country: 'KE', region: 'Nakuru' })).toBe(option.value);
  });
});

describe('country-less region links', () => {
  it('reads a shared region name as Tanzania’s', () => {
    expect(regionOptionValue({ region: 'Mwanza' })).toBe('TZ|Mwanza');
  });
});

describe('cleanGeo', () => {
  it('keeps a pair the API accepts', () => {
    expect(cleanGeo('KE', 'Nakuru')).toEqual({ country: 'KE', region: 'Nakuru' });
    expect(cleanGeo(undefined, 'Nakuru')).toEqual({ country: 'KE', region: 'Nakuru' });
  });

  it('pins a country-less region to the country its label shows (Tanzania first)', () => {
    expect(cleanGeo(undefined, 'Mwanza')).toEqual({ country: 'TZ', region: 'Mwanza' });
  });

  it('drops a region that is not the country’s, or not any country’s', () => {
    expect(cleanGeo('KE', 'Arusha')).toEqual({ country: 'KE', region: undefined });
    expect(cleanGeo(undefined, 'Atlantis')).toEqual({ country: undefined, region: undefined });
  });

  it('drops an unknown country', () => {
    expect(cleanGeo('XX', 'Nakuru')).toEqual({ country: 'KE', region: 'Nakuru' });
  });
});
