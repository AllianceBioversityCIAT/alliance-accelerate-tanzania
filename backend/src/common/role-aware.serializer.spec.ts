import { ConsentStatus, Prisma } from '@prisma/client';
import { PII_ALLOWLIST } from './pii-consent.policy';
import {
  PublicActor,
  SerializableActor,
  toPublic,
} from './role-aware.serializer';

/**
 * T-4 — Unit tests for the role-aware serializer (DD-2): the only public exit.
 * Proves the PII boundary (FR-5/NFR-1) at the unit level — no PII field, no
 * `traderId`, no altitude/accuracy, and exact GPS only when consent GRANTED.
 */

/**
 * A fully-populated actor with EVERY PII field set, to prove none leak.
 *
 * `SerializableActor` deliberately ACCEPTS the non-public columns (`traderId`,
 * the six PII fields, `gpsAltitude`, `gpsAccuracy`) so this fixture is a valid
 * input — exactly what `toPublic` receives in production — and the tests prove
 * those fields are stripped at runtime.
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
  // PII — must never surface:
  sex: 'F',
  position: 'Managing Director',
  marketLocation: 'Mwanjelwa Market',
  technicalSupport: 'Cleaning and grading equipment',
  phone: '+255700000000',
  email: 'contact@mbeyaseed.co.tz',
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

describe('toPublic — PII boundary (FR-5/NFR-1)', () => {
  it('emits ONLY the design §5 public projection keys', () => {
    const result = toPublic(fullActor());
    expect(Object.keys(result).sort()).toEqual(
      [
        'capacityTons',
        'crops',
        'district',
        'gps',
        'id',
        'region',
        'traderName',
        'traderType',
      ].sort(),
    );
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
