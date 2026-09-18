import { ConsentStatus, Prisma } from '@prisma/client';
import { CONTACT_BLOCK_FIELDS } from './pii-consent.policy';
import {
  PublicActorListItem,
  SerializableActor,
  toPublicDetail,
  toPublicListItem,
} from './role-aware.serializer';

/**
 * T-4/T-7/T-9 — Unit tests for the role-aware serializer (DD-2): the only
 * public exit. T-7 (`actors/public-profile-disclosure`) split the single
 * projection this file originally tested into two — {@link toPublicListItem}
 * (FR-9, the list set) and {@link toPublicDetail} (FR-1, the published set) —
 * and this file's key-set assertions were rewritten accordingly. `toPublic`
 * survived T-7 as a deprecated alias of {@link toPublicListItem} (see its
 * doc, since removed, in `role-aware.serializer.ts`) so the tests that used
 * to call it kept exercising real production code — until T-8 removed the
 * alias, which left every `toPublic(...)` call below referring to a deleted
 * export (a TS2305 compile error). T-9 re-points every one of those calls to
 * {@link toPublicListItem}, the function `toPublic` aliased, so each test
 * keeps exercising exactly the production path it always did.
 *
 * T-9 also re-points the two `for (const field of ...)` loop assertions that
 * used to iterate {@link PII_ALLOWLIST}: T-6 emptied that constant (see its
 * own doc in `pii-consent.policy.ts`), which made both loops iterate zero
 * elements and assert nothing while still reporting green (D-1c). Both now
 * iterate {@link CONTACT_BLOCK_FIELDS} instead — the list path (what
 * `toPublicListItem` computes) withholds that set unconditionally, by key,
 * regardless of consent (FR-9); `PUBLICLY_DISCLOSED_FIELDS` is deliberately
 * NOT used here even though it was `PII_ALLOWLIST`'s closer historical
 * analogue, because it is a PRESENCE set for the detail path and folding it
 * into an absence check on the list output would be self-contradictory (see
 * `NEVER_PUBLIC_FIELDS`'s doc in `pii-consent.policy.ts` for the three-way
 * polarity this file must respect).
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
const asRecord = (a: PublicActorListItem): Record<string, unknown> =>
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

  it('strips EVERY CONTACT_BLOCK_FIELDS field from the list output (loop assertion)', () => {
    // Guards the loop itself against silently going vacuous again the way
    // PII_ALLOWLIST did under T-6 (D-1c) — an accidentally emptied
    // CONTACT_BLOCK_FIELDS would fail HERE, by name, instead of the loop
    // below asserting nothing and staying green.
    expect(CONTACT_BLOCK_FIELDS.length).toBeGreaterThan(0);
    const result = asRecord(toPublicListItem(fullActor()));
    for (const contactField of CONTACT_BLOCK_FIELDS) {
      expect(result).not.toHaveProperty(contactField);
    }
  });

  it('never exposes traderId, gpsAltitude, or gpsAccuracy', () => {
    const result = asRecord(toPublicListItem(fullActor()));
    expect(result).not.toHaveProperty('traderId');
    expect(result).not.toHaveProperty('gpsAltitude');
    expect(result).not.toHaveProperty('gpsAccuracy');
    expect(result).not.toHaveProperty('consentStatus');
  });

  it('passes through the allowed public scalar fields', () => {
    const result = toPublicListItem(fullActor());
    expect(result).toMatchObject<Partial<PublicActorListItem>>({
      id: 'ckactor1',
      traderName: 'Mbeya Seed Traders Ltd',
      region: 'Mbeya',
      district: 'Mbeya Urban',
      traderType: 'seed_company',
      capacityTons: 1250.5,
    });
  });
});

describe('toPublicListItem — consent-gated GPS (FR-5/DD-3)', () => {
  it('includes exact gps {lat,long} ONLY when consent is GRANTED', () => {
    expect(
      toPublicListItem(fullActor({ consentStatus: ConsentStatus.GRANTED })).gps,
    ).toEqual({ lat: -8.9094, long: 33.4607 });
  });

  it('returns gps: null for UNKNOWN and DENIED even with GPS populated', () => {
    expect(
      toPublicListItem(fullActor({ consentStatus: ConsentStatus.UNKNOWN })).gps,
    ).toBeNull();
    expect(
      toPublicListItem(fullActor({ consentStatus: ConsentStatus.DENIED })).gps,
    ).toBeNull();
  });

  it('a non-granted actor with all PII populated leaks neither the contact block nor exact GPS', () => {
    expect(CONTACT_BLOCK_FIELDS.length).toBeGreaterThan(0);
    const projected = toPublicListItem(
      fullActor({ consentStatus: ConsentStatus.DENIED }),
    );
    const result = asRecord(projected);
    for (const contactField of CONTACT_BLOCK_FIELDS) {
      expect(result).not.toHaveProperty(contactField);
    }
    expect(projected.gps).toBeNull();
  });
});

describe('toPublicListItem — crops mapping', () => {
  it('maps the crop relation to a string[] of names', () => {
    expect(toPublicListItem(fullActor()).crops).toEqual(['sorghum', 'groundnut']);
  });

  it('yields [] for a missing or empty crop relation', () => {
    expect(toPublicListItem(fullActor({ crops: undefined })).crops).toEqual([]);
    expect(toPublicListItem(fullActor({ crops: null })).crops).toEqual([]);
    expect(toPublicListItem(fullActor({ crops: [] })).crops).toEqual([]);
  });

  it('drops relation rows without a resolvable crop name', () => {
    expect(
      toPublicListItem(
        fullActor({ crops: [{ crop: { name: 'sorghum' } }, { crop: null }] }),
      ).crops,
    ).toEqual(['sorghum']);
  });
});

describe('toPublicListItem — district/capacity nullability', () => {
  it('normalizes missing district and capacity to null', () => {
    const result = toPublicListItem(
      fullActor({ district: undefined, capacityTons: undefined }),
    );
    expect(result.district).toBeNull();
    expect(result.capacityTons).toBeNull();
  });
});
