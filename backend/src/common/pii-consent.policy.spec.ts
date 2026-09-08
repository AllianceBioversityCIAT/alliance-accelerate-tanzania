import { ConsentStatus, Prisma } from '@prisma/client';
import {
  CONTACT_BLOCK_FIELDS,
  NEVER_PUBLIC_FIELDS,
  PII_ALLOWLIST,
  PUBLICLY_DISCLOSED_FIELDS,
  isPublic,
  publicGps,
} from './pii-consent.policy';

/**
 * T-4/T-6 — Unit tests for the single PII/consent policy (DD-1). Pure, no
 * DB/Nest. This is the security boundary: consent gates exact GPS
 * (FR-5/DD-3) and the four constants below are the one legal-ratifiable
 * disclosure policy (NFR-5).
 *
 * T-6 (design.md §7.1, DD-1, DD-2): each constant gets a by-value pin —
 * `expect([...X]).toEqual([...])` against a literal — so a member silently
 * added, removed, or reordered fails a NAMED test. Two tests below are
 * DELIBERATELY VACUOUS after this restructuring (PII_ALLOWLIST emptied per
 * DD-2/OQ-1); each is annotated in place rather than deleted, per the
 * instruction that the record of a deliberate change must survive it.
 */
describe('PII_ALLOWLIST', () => {
  it(
    'is exactly [] — VACUOUS BY DESIGN (DD-2/OQ-1): this constant was ' +
      'emptied on purpose when disclosure moved to PUBLICLY_DISCLOSED_FIELDS ' +
      '/ CONTACT_BLOCK_FIELDS. This assertion cannot catch a real regression ' +
      '— only PUBLICLY_DISCLOSED_FIELDS, CONTACT_BLOCK_FIELDS, and ' +
      'NEVER_PUBLIC_FIELDS below can. Kept as the by-value pin DD-1 requires ' +
      'on every constant, including the empty one, and as the record that ' +
      'the emptying was deliberate.',
    () => {
      expect([...PII_ALLOWLIST]).toEqual([]);
    },
  );
});

describe('PUBLICLY_DISCLOSED_FIELDS', () => {
  it('is exactly the detail-path disclosure set for a GRANTED actor (FR-1, DD-1)', () => {
    expect([...PUBLICLY_DISCLOSED_FIELDS]).toEqual([
      'phone',
      'email',
      'sex',
      'position',
      'marketLocation',
      'contactPerson',
      'otherCrops',
    ]);
  });
});

describe('CONTACT_BLOCK_FIELDS', () => {
  it('is exactly the bulk-exposure boundary set — never on the list path (FR-9, DD-3)', () => {
    expect([...CONTACT_BLOCK_FIELDS]).toEqual([
      'contactPerson',
      'position',
      'phone',
      'email',
      'marketLocation',
    ]);
  });

  it('is a STRICT subset of PUBLICLY_DISCLOSED_FIELDS, not merely a subset (design.md §7.1)', () => {
    const disclosed: readonly string[] = PUBLICLY_DISCLOSED_FIELDS;
    for (const field of CONTACT_BLOCK_FIELDS) {
      expect(disclosed).toContain(field);
    }
    // `toContain` in a loop only proves ⊆; it passes even if the two sets
    // are equal. Prove the strictness the test's name promises: the sets
    // are different sizes, and name a witness — `sex` — that is disclosed
    // on detail but deliberately excluded from the contact block (it also
    // ships on the list path and in the CSV, per CONTACT_BLOCK_FIELDS's doc).
    expect(CONTACT_BLOCK_FIELDS.length).toBeLessThan(
      PUBLICLY_DISCLOSED_FIELDS.length,
    );
    expect(disclosed).toContain('sex');
    expect(CONTACT_BLOCK_FIELDS as readonly string[]).not.toContain('sex');
  });
});

describe('NEVER_PUBLIC_FIELDS', () => {
  it('is exactly the never-public field set, including technicalSupport (FR-3, DD-1)', () => {
    expect([...NEVER_PUBLIC_FIELDS]).toEqual([
      'traderId',
      'gpsAltitude',
      'gpsAccuracy',
      'registrationSource',
      'consentMethod',
      'consentObtainedAt',
      'consentReference',
      'technicalSupport',
    ]);
  });

  it(
    'shares no member with PII_ALLOWLIST — VACUOUS BY DESIGN: PII_ALLOWLIST ' +
      'is now [] (DD-2/OQ-1), so this can never fail no matter what ' +
      'NEVER_PUBLIC_FIELDS contains — an empty set is disjoint from ' +
      'everything by construction. Kept as the record that the disjointness ' +
      'these two constants once meaningfully maintained still holds, not as ' +
      'evidence of anything. Real coverage against a wrong overlap is the ' +
      'by-value pin above plus the subset assertion on CONTACT_BLOCK_FIELDS.',
    () => {
      const overlap = NEVER_PUBLIC_FIELDS.filter((f) =>
        (PII_ALLOWLIST as readonly string[]).includes(f),
      );
      expect(overlap).toEqual([]);
    },
  );
});

describe('isPublic', () => {
  it('is true ONLY for GRANTED consent (FR-4)', () => {
    expect(isPublic({ consentStatus: ConsentStatus.GRANTED })).toBe(true);
    expect(isPublic({ consentStatus: ConsentStatus.DENIED })).toBe(false);
    expect(isPublic({ consentStatus: ConsentStatus.UNKNOWN })).toBe(false);
  });
});

describe('publicGps', () => {
  const lat = new Prisma.Decimal('-8.9094000');
  const long = new Prisma.Decimal('33.4607000');

  it('returns exact {lat,long} when consent is GRANTED', () => {
    expect(
      publicGps({
        consentStatus: ConsentStatus.GRANTED,
        gpsLatitude: lat,
        gpsLongitude: long,
      }),
    ).toEqual({ lat: -8.9094, long: 33.4607 });
  });

  it('returns null for non-GRANTED consent even with GPS present (FR-5/DD-3)', () => {
    for (const consentStatus of [ConsentStatus.UNKNOWN, ConsentStatus.DENIED]) {
      expect(
        publicGps({ consentStatus, gpsLatitude: lat, gpsLongitude: long }),
      ).toBeNull();
    }
  });

  it('returns null when a coordinate is missing even if GRANTED', () => {
    expect(
      publicGps({
        consentStatus: ConsentStatus.GRANTED,
        gpsLatitude: lat,
        gpsLongitude: null,
      }),
    ).toBeNull();
    expect(publicGps({ consentStatus: ConsentStatus.GRANTED })).toBeNull();
  });

  it('accepts numeric and string coordinates and never leaks NaN', () => {
    expect(
      publicGps({
        consentStatus: ConsentStatus.GRANTED,
        gpsLatitude: -8.9094,
        gpsLongitude: '33.4607',
      }),
    ).toEqual({ lat: -8.9094, long: 33.4607 });

    expect(
      publicGps({
        consentStatus: ConsentStatus.GRANTED,
        gpsLatitude: 'not-a-number',
        gpsLongitude: long,
      }),
    ).toBeNull();
  });
});
