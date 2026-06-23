import {
  CANONICAL_REGIONS,
  TRADER_TYPES,
  isValidLatitude,
  isValidLongitude,
  normalizeRegion,
  normalizeSex,
  normalizeTraderType,
  parseCapacityTons,
} from './normalize';

/**
 * T-3 — Unit tests for the pure normalization layer (FR-3). No DB, no Nest.
 */
describe('normalizeRegion', () => {
  it('canonicalizes an exact match', () => {
    expect(normalizeRegion('Mbeya')).toEqual({
      region: 'Mbeya',
      quarantined: false,
    });
  });

  it('canonicalizes case-insensitively and trims whitespace', () => {
    expect(normalizeRegion('  dar es salaam  ')).toEqual({
      region: 'Dar es Salaam',
      quarantined: false,
    });
  });

  it('strips a trailing "Region" word (e.g. "Kusini Unguja Region")', () => {
    expect(normalizeRegion('Kusini Unguja Region')).toEqual({
      region: 'Kusini Unguja',
      quarantined: false,
    });
  });

  it('resolves a known unambiguous alias', () => {
    expect(normalizeRegion('Zanzibar Urban/West')).toEqual({
      region: 'Mjini Magharibi',
      quarantined: false,
    });
  });

  it('quarantines an AMBIGUOUS value ("Arusha/Dodoma") instead of guessing', () => {
    expect(normalizeRegion('Arusha/Dodoma')).toEqual({
      region: null,
      quarantined: true,
    });
  });

  it('quarantines unknown and blank/null values', () => {
    expect(normalizeRegion('Atlantis')).toEqual({
      region: null,
      quarantined: true,
    });
    expect(normalizeRegion('   ')).toEqual({ region: null, quarantined: true });
    expect(normalizeRegion(null)).toEqual({ region: null, quarantined: true });
    expect(normalizeRegion(undefined)).toEqual({
      region: null,
      quarantined: true,
    });
  });

  it('every CANONICAL_REGIONS value round-trips to itself', () => {
    for (const region of CANONICAL_REGIONS) {
      expect(normalizeRegion(region)).toEqual({ region, quarantined: false });
    }
  });
});

describe('normalizeTraderType', () => {
  it('maps "Informal trader/retailer" → informal_trader', () => {
    expect(normalizeTraderType('Informal trader/retailer')).toBe(
      'informal_trader',
    );
  });

  it('maps "Large offtaker" → offtaker', () => {
    expect(normalizeTraderType('Large offtaker')).toBe('offtaker');
  });

  it('accepts canonical codes case-insensitively', () => {
    expect(normalizeTraderType('Seed_Company')).toBe('seed_company');
  });

  it('returns null for unknown / blank (caller decides)', () => {
    expect(normalizeTraderType('Wholesaler-of-the-year')).toBeNull();
    expect(normalizeTraderType('')).toBeNull();
    expect(normalizeTraderType(null)).toBeNull();
  });

  it('exposes the OQ-2 taxonomy as TRADER_TYPES', () => {
    expect(TRADER_TYPES).toEqual([
      'seed_company',
      'cooperative',
      'ngo',
      'offtaker',
      'research_institute',
      'informal_trader',
    ]);
  });
});

describe('normalizeSex', () => {
  it('maps Male → M, Female → F', () => {
    expect(normalizeSex('Male')).toBe('M');
    expect(normalizeSex('female')).toBe('F');
    expect(normalizeSex('M')).toBe('M');
  });

  it('maps a recognized third value to Other', () => {
    expect(normalizeSex('Other')).toBe('Other');
  });

  it('returns null for blank / null / unrecognized', () => {
    expect(normalizeSex('')).toBeNull();
    expect(normalizeSex('  ')).toBeNull();
    expect(normalizeSex(null)).toBeNull();
    expect(normalizeSex('xyz')).toBeNull();
  });
});

describe('parseCapacityTons', () => {
  it('accepts non-negative numbers and numeric strings', () => {
    expect(parseCapacityTons(1250.5)).toBe(1250.5);
    expect(parseCapacityTons('1250.5')).toBe(1250.5);
    expect(parseCapacityTons(0)).toBe(0);
  });

  it('returns null for negative, non-numeric, blank, and null (documented choice)', () => {
    expect(parseCapacityTons(-1)).toBeNull();
    expect(parseCapacityTons('abc')).toBeNull();
    expect(parseCapacityTons('')).toBeNull();
    expect(parseCapacityTons(null)).toBeNull();
    expect(parseCapacityTons(undefined)).toBeNull();
  });
});

describe('GPS guards', () => {
  it('isValidLatitude enforces [−90, 90]', () => {
    expect(isValidLatitude(-8.9094)).toBe(true);
    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(120)).toBe(false);
    expect(isValidLatitude(-91)).toBe(false);
    expect(isValidLatitude(NaN)).toBe(false);
    expect(isValidLatitude(null)).toBe(false);
  });

  it('isValidLongitude enforces [−180, 180]', () => {
    expect(isValidLongitude(33.4607)).toBe(true);
    expect(isValidLongitude(-180)).toBe(true);
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(200)).toBe(false);
    expect(isValidLongitude(-181)).toBe(false);
    expect(isValidLongitude(undefined)).toBe(false);
  });
});
