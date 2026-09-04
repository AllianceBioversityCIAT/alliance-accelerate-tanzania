import { ConsentStatus, Prisma } from '@prisma/client';
import { PII_ALLOWLIST } from './pii-consent.policy';
import {
  PublicActor,
  SerializableActor,
  toPublic,
  toPublicDetail,
  toPublicListItem,
} from './role-aware.serializer';

/**
 * T-4/T-7 — Unit tests for the role-aware serializer (DD-2): the only public
 * exit. T-7 (`actors/public-profile-disclosure`) split the single projection
 * this file originally tested into two — {@link toPublicListItem} (FR-9, the
 * list set) and {@link toPublicDetail} (FR-1, the published set) — and this
 * file's key-set assertions were rewritten accordingly. `toPublic` survives
 * as a deprecated alias of {@link toPublicListItem} (see its doc in
 * `role-aware.serializer.ts`) so the tests below that call it unchanged
 * still exercise real production code until T-8 removes it.
 *
 * The two `for (const piiField of PII_ALLOWLIST)` loops below are
 * DELIBERATELY left vacuous: T-6 emptied {@link PII_ALLOWLIST} (see its own
 * doc), and re-pointing those loops to a non-empty constant is T-9's task,
 * not this one's.
 */

/**
 * A fully-populated actor with EVERY non-`traderId`/GPS-metadata field set —
 * list-set, contact-block, and never-public alike — so the tests below can
 * prove each field lands in exactly the projection(s) it belongs to and no
 * other.
 *
 * `SerializableActor` deliberately ACCEPTS the never-public columns
 * (`traderId`, `technicalSupport`, `gpsAltitude`, `gpsAccuracy`) so this
 * fixture is a valid input — exactly what `toPublicListItem`/`toPublicDetail`
 * receive in production — and the tests prove those fields are stripped at
 * runtime.
 */
const fullActor = (
  overrides: Partial<SerializableActor> = {},
): SerializableActor => ({
  id: 'ckactor1',
  traderId: 'TZ-0001',
  traderName: 'Mbeya Seed Traders Ltd',
  region: 'Mbeya',
  district: 'Mbeya Urban',
  traderType: 'seed_company',
  capacityTons: new Prisma.Decimal('1250.50'),
  consentStatus: ConsentStatus.GRANTED,
  // T-7/FR-9 — list-set fields: ship on BOTH toPublicListItem and toPublicDetail.
  sex: 'F',
  otherCrops: 'chia, sesame',
  // T-7/FR-1 — contact block: toPublicDetail ONLY, must never reach the list (FR-9).
  contactPerson: 'Amina Juma',
  position: 'Managing Director',
  marketLocation: 'Mwanjelwa Market',
  phone: '+255700000000',
  email: 'contact@mbeyaseed.co.tz',
  // Never-public (T-6/FR-3) — must never surface on any public path:
  technicalSupport: 'Cleaning and grading equipment',
  // GPS — exact, altitude/accuracy must never surface:
  gpsLatitude: new Prisma.Decimal('-8.9094000'),
  gpsLongitude: new Prisma.Decimal('33.4607000'),
  gpsAltitude: new Prisma.Decimal('1700.00'),
  gpsAccuracy: new Prisma.Decimal('4.50'),
  crops: [{ crop: { name: 'sorghum' } }, { crop: { name: 'groundnut' } }],
  ...overrides,
});

/** Read the serialized output as a bag of keys for absence assertions. */
const asRecord = (a: PublicActor): Record<string, unknown> =>
  a as unknown as Record<string, unknown>;

describe('toPublicListItem / toPublicDetail — PII boundary (FR-1/FR-9)', () => {
  it('toPublicListItem emits ONLY the list-set keys (design.md §6, FR-9)', () => {
    const result = toPublicListItem(fullActor());
    expect(Object.keys(result).sort()).toEqual(
      [
        'capacityTons',
        'crops',
        'district',
        'gps',
        'id',
        'otherCrops',
        'region',
        'sex',
        'traderName',
        'traderType',
      ].sort(),
    );
  });

  it('toPublicDetail emits the list-set keys PLUS the contact block (design.md §6, FR-1)', () => {
    const result = toPublicDetail(fullActor());
    expect(Object.keys(result).sort()).toEqual(
      [
        'capacityTons',
        'contactPerson',
        'crops',
        'district',
        'email',
        'gps',
        'id',
        'marketLocation',
        'otherCrops',
        'phone',
        'position',
        'region',
        'sex',
        'traderName',
        'traderType',
      ].sort(),
    );
  });

  it('toPublicListItem never carries a contact-block field (FR-9, by key)', () => {
    const result = toPublicListItem(fullActor()) as unknown as Record<
      string,
      unknown
    >;
    for (const contactField of [
      'contactPerson',
      'position',
      'phone',
      'email',
      'marketLocation',
    ]) {
      expect(result).not.toHaveProperty(contactField);
    }
  });

  it('strips EVERY PII_ALLOWLIST field from the output (loop assertion)', () => {
    const result = asRecord(toPublic(fullActor()));
    for (const piiField of PII_ALLOWLIST) {
      expect(result).not.toHaveProperty(piiField);
    }
  });

  it('never exposes traderId, gpsAltitude, or gpsAccuracy', () => {
    const result = asRecord(toPublic(fullActor()));
    expect(result).not.toHaveProperty('traderId');
    expect(result).not.toHaveProperty('gpsAltitude');
    expect(result).not.toHaveProperty('gpsAccuracy');
    expect(result).not.toHaveProperty('consentStatus');
  });

  it('passes through the allowed public scalar fields', () => {
    const result = toPublic(fullActor());
    expect(result).toMatchObject<Partial<PublicActor>>({
      id: 'ckactor1',
      traderName: 'Mbeya Seed Traders Ltd',
      region: 'Mbeya',
      district: 'Mbeya Urban',
      traderType: 'seed_company',
      capacityTons: 1250.5,
    });
  });
});

describe('toPublic — consent-gated GPS (FR-5/DD-3)', () => {
  it('includes exact gps {lat,long} ONLY when consent is GRANTED', () => {
    expect(toPublic(fullActor({ consentStatus: ConsentStatus.GRANTED })).gps).toEqual(
      { lat: -8.9094, long: 33.4607 },
    );
  });

  it('returns gps: null for UNKNOWN and DENIED even with GPS populated', () => {
    expect(toPublic(fullActor({ consentStatus: ConsentStatus.UNKNOWN })).gps).toBeNull();
    expect(toPublic(fullActor({ consentStatus: ConsentStatus.DENIED })).gps).toBeNull();
  });

  it('a non-granted actor with all PII populated leaks neither PII nor exact GPS', () => {
    const projected = toPublic(fullActor({ consentStatus: ConsentStatus.DENIED }));
    const result = asRecord(projected);
    for (const piiField of PII_ALLOWLIST) {
      expect(result).not.toHaveProperty(piiField);
    }
    expect(projected.gps).toBeNull();
  });
});

describe('toPublic — crops mapping', () => {
  it('maps the crop relation to a string[] of names', () => {
    expect(toPublic(fullActor()).crops).toEqual(['sorghum', 'groundnut']);
  });

  it('yields [] for a missing or empty crop relation', () => {
    expect(toPublic(fullActor({ crops: undefined })).crops).toEqual([]);
    expect(toPublic(fullActor({ crops: null })).crops).toEqual([]);
    expect(toPublic(fullActor({ crops: [] })).crops).toEqual([]);
  });

  it('drops relation rows without a resolvable crop name', () => {
    expect(
      toPublic(
        fullActor({ crops: [{ crop: { name: 'sorghum' } }, { crop: null }] }),
      ).crops,
    ).toEqual(['sorghum']);
  });
});

describe('toPublic — district/capacity nullability', () => {
  it('normalizes missing district and capacity to null', () => {
    const result = toPublic(
      fullActor({ district: undefined, capacityTons: undefined }),
    );
    expect(result.district).toBeNull();
    expect(result.capacityTons).toBeNull();
  });
});
