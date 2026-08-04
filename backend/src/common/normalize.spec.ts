import {
  CANONICAL_REGIONS,
  DISTRICT_TO_REGION,
  TRADER_TYPES,
  isValidLatitude,
  isValidLongitude,
  normalizePhone,
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

/**
 * T-2 — DISTRICT_TO_REGION (FR-3, design.md §4.2). Membership only: every
 * value in the map is a member of CANONICAL_REGIONS. This does NOT — and
 * cannot — assert that a pairing is the CORRECT region for its district
 * (requirements.md §9 D-1b has no automated gate for that; see this task's
 * report). It also asserts the constant leaves normalizeRegion's own
 * quarantine behavior untouched, since DISTRICT_TO_REGION is not consumed by
 * normalizeRegion at all (design.md DD-1).
 */
describe('DISTRICT_TO_REGION', () => {
  it('maps every district to a value that is a member of CANONICAL_REGIONS', () => {
    expect(DISTRICT_TO_REGION.size).toBeGreaterThan(0);
    for (const [district, region] of DISTRICT_TO_REGION) {
      expect(district).toBe(district.toLowerCase());
      expect(CANONICAL_REGIONS).toContain(region);
    }
  });

  it('does not change normalizeRegion — an ambiguous value still quarantines', () => {
    // DISTRICT_TO_REGION is not consumed by normalizeRegion (DD-1); this
    // pins that "Arusha/Dodoma" keeps quarantining after this constant was
    // added, rather than merely re-asserting the pre-existing behavior.
    expect(normalizeRegion('Arusha/Dodoma')).toEqual({
      region: null,
      quarantined: true,
    });
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

  it('exposes the OQ-2 taxonomy as TRADER_TYPES, including the FR-4 additions', () => {
    expect(TRADER_TYPES).toEqual([
      'seed_company',
      'cooperative',
      'ngo',
      'offtaker',
      'research_institute',
      'informal_trader',
      'humanitarian',
      'digital_service_provider',
      'qds_producer',
      'bulk_buyer',
    ]);
  });

  // FR-4: workbook category values normalise to the four new canonical codes.
  it('maps the FR-4 workbook spellings to their canonical codes without quarantine', () => {
    expect(normalizeTraderType('INGO')).toBe('humanitarian');
    expect(normalizeTraderType('NGO/INGO')).toBe('humanitarian');
    expect(normalizeTraderType('cbo')).toBe('humanitarian');
    expect(normalizeTraderType('Digital Service Provider')).toBe(
      'digital_service_provider',
    );
    expect(normalizeTraderType('QDS')).toBe('qds_producer');
    expect(normalizeTraderType('Bulk buyer')).toBe('bulk_buyer');
  });

  it('resolves the FR-4 aliases case- and whitespace-insensitively', () => {
    expect(normalizeTraderType('  INGO ')).toBe('humanitarian');
    expect(normalizeTraderType('digital SERVICE provider')).toBe(
      'digital_service_provider',
    );
    expect(normalizeTraderType('  bulk buyer  ')).toBe('bulk_buyer');
  });

  it('still quarantines (returns null for) values whose mapping would be a guess, not a fact', () => {
    // Not aliased on purpose: mapping either to an existing type or to one of
    // the new FR-4 categories would be a judgement call, not a documented fact.
    expect(normalizeTraderType('Community Group')).toBeNull();
    expect(normalizeTraderType('Offtaker name')).toBeNull();
  });

  it('leaves the six pre-existing types byte-identical to before this change', () => {
    expect(normalizeTraderType('Informal trader/retailer')).toBe(
      'informal_trader',
    );
    expect(normalizeTraderType('Large offtaker')).toBe('offtaker');
    expect(normalizeTraderType('Seed_Company')).toBe('seed_company');
    expect(normalizeTraderType('ngo')).toBe('ngo');
    expect(normalizeTraderType('co-op')).toBe('cooperative');
    expect(normalizeTraderType('research institution')).toBe(
      'research_institute',
    );
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

/**
 * T-1 — normalizePhone (FR-5). Table-driven cases, one group per measured
 * source format (requirements.md FR-5), plus the multi-number-cell scenario
 * and the never-guess null branch. All fixture numbers are synthetic; no real
 * number from the client workbook appears anywhere in this file (NFR-9).
 */
describe('normalizePhone', () => {
  describe('format: bare 9-digit local number', () => {
    it('prepends +255 to a bare 9-digit number starting with 7', () => {
      expect(normalizePhone('700000001')).toEqual({
        phone: '+255700000001',
        additionalCount: 0,
      });
    });

    it('prepends +255 to a bare 9-digit number starting with 6', () => {
      expect(normalizePhone('612345678')).toEqual({
        phone: '+255612345678',
        additionalCount: 0,
      });
    });

    it('quarantines a bare 9-digit number whose leading digit is not 6 or 7 (amendment A1, D-6)', () => {
      // A non-6/7 leading digit cannot be a Tanzanian mobile number, so it is
      // never a bare local number — it is more likely a column-shifted
      // numeric (ID, capacity figure). Synthetic value only (NFR-9).
      expect(normalizePhone('812345678')).toEqual({
        phone: null,
        additionalCount: 0,
      });
    });
  });

  describe('format: leading-zero national number (0 + 9 digits)', () => {
    it('replaces the leading 0 with +255', () => {
      expect(normalizePhone('0700000002')).toEqual({
        phone: '+255700000002',
        additionalCount: 0,
      });
    });
  });

  describe('format: country-prefixed number with internal spaces', () => {
    it('strips internal spaces and prepends +', () => {
      expect(normalizePhone('255 700 000 003')).toEqual({
        phone: '+255700000003',
        additionalCount: 0,
      });
    });

    it('leaves an already-plus-prefixed, space-separated number canonical', () => {
      expect(normalizePhone('+255 700 000 008')).toEqual({
        phone: '+255700000008',
        additionalCount: 0,
      });
    });

    it('quarantines a country code followed by a trunk 0, with or without the + (amendment A2)', () => {
      // A trunk prefix and a country code are mutually exclusive: `+2550…`
      // is a national number that had `255` pasted in front without the
      // trunk `0` being dropped. There is no reading under which it is
      // well-formed, so it must not normalize. Synthetic values (NFR-9).
      expect(normalizePhone('+255012345678')).toEqual({
        phone: null,
        additionalCount: 0,
      });
      expect(normalizePhone('255012345678')).toEqual({
        phone: null,
        additionalCount: 0,
      });
      expect(normalizePhone('(255) 012345678')).toEqual({
        phone: null,
        additionalCount: 0,
      });
    });

    it('still normalizes a country-prefixed landline, so A2 did not over-tighten', () => {
      // A2 constrains only the trunk-0 case. A landline subscriber part
      // begins with a non-zero digit and must keep normalizing — the
      // mobile-vs-landline question is deliberately left to real data.
      expect(normalizePhone('255 22 700 0005')).toEqual({
        phone: '+255227000005',
        additionalCount: 0,
      });
    });
  });

  describe('format: parenthesized country code', () => {
    it('strips the parentheses around the country code', () => {
      expect(normalizePhone('(255) 700000004')).toEqual({
        phone: '+255700000004',
        additionalCount: 0,
      });
    });
  });

  describe('format: landline with internal spaces', () => {
    it('normalizes a spaced landline number without loss', () => {
      expect(normalizePhone('022 700 0005')).toEqual({
        phone: '+255227000005',
        additionalCount: 0,
      });
    });
  });

  describe('format: "/"-separated multi-number cell', () => {
    it('normalizes the first number and counts the discarded one', () => {
      expect(normalizePhone('700000006/700000007')).toEqual({
        phone: '+255700000006',
        additionalCount: 1,
      });
    });

    it('counts every number beyond the first, for more than two', () => {
      expect(normalizePhone('700000006/700000007/700000009')).toEqual({
        phone: '+255700000006',
        additionalCount: 2,
      });
    });

    it('never includes the discarded digits anywhere in the return value', () => {
      const result = normalizePhone('700000006/700000007');
      expect(JSON.stringify(result)).not.toContain('700000007');
      expect(Object.keys(result).sort()).toEqual([
        'additionalCount',
        'phone',
      ]);
    });
  });

  describe('never-guess null branch', () => {
    it('returns null (never a partial string) for input it cannot confidently normalize', () => {
      expect(normalizePhone('12345')).toEqual({
        phone: null,
        additionalCount: 0,
      });
      expect(normalizePhone('not-a-phone-number')).toEqual({
        phone: null,
        additionalCount: 0,
      });
    });

    it('returns null with additionalCount 0 for blank, empty, null, and undefined input', () => {
      expect(normalizePhone(null)).toEqual({ phone: null, additionalCount: 0 });
      expect(normalizePhone(undefined)).toEqual({
        phone: null,
        additionalCount: 0,
      });
      expect(normalizePhone('')).toEqual({ phone: null, additionalCount: 0 });
      expect(normalizePhone('   ')).toEqual({
        phone: null,
        additionalCount: 0,
      });
    });

    it('does not invent a country code for a number of unrecognized length', () => {
      expect(normalizePhone('12345678')).toEqual({
        phone: null,
        additionalCount: 0,
      });
      expect(normalizePhone('70000000123')).toEqual({
        phone: null,
        additionalCount: 0,
      });
    });
  });

  describe('determinism (NFR-6)', () => {
    it('returns an identical result for the same input on repeated calls', () => {
      const first = normalizePhone('255 700 000 003');
      const second = normalizePhone('255 700 000 003');
      expect(first).toEqual(second);
    });
  });
});
