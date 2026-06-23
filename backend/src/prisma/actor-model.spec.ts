import { ConsentStatus, Prisma } from '@prisma/client';

/**
 * T-2 — Actor / Crop model shape round-trip test (DB-INDEPENDENT).
 *
 * There is no reachable MySQL in this environment, so the live
 * `prisma migrate dev` + real INSERT/SELECT round-trip is a DEFERRED step the
 * user runs against RDS. What we CAN assert without a database is that the
 * generated Prisma Client types accept a fully-populated Actor create input —
 * every column from design.md §5, including the `Decimal` fields, the
 * `consentStatus` enum, and a nested crop relation. If a field were missing,
 * mistyped, or the enum/relation were wrong, this file would fail to compile
 * via `Prisma.validator`, which type-checks the object against the schema.
 */
describe('Actor model shape (type-level, no DB)', () => {
  // `Prisma.validator` returns its argument unchanged but forces TypeScript to
  // check it against `Prisma.ActorCreateInput`. Compilation IS the assertion;
  // the runtime expectations below guard the produced object shape.
  const buildFullActorCreateInput = (): Prisma.ActorCreateInput =>
    Prisma.validator<Prisma.ActorCreateInput>()({
      traderId: 'TZ-0001',
      traderName: 'Mbeya Seed Traders Ltd',
      region: 'Mbeya',
      district: 'Mbeya Urban',
      traderType: 'Aggregator',
      sex: 'F',
      position: 'Managing Director',
      marketLocation: 'Mwanjelwa Market',
      capacityTons: new Prisma.Decimal('1250.50'),
      technicalSupport: 'Cleaning and grading equipment; storage advisory',
      phone: '+255700000000', // PII
      email: 'contact@mbeyaseed.co.tz', // PII
      gpsLatitude: new Prisma.Decimal('-8.9094000'),
      gpsLongitude: new Prisma.Decimal('33.4607000'),
      gpsAltitude: new Prisma.Decimal('1700.00'),
      gpsAccuracy: new Prisma.Decimal('4.50'),
      consentStatus: ConsentStatus.GRANTED,
      crops: {
        create: [{ crop: { create: { name: 'sorghum' } } }],
      },
    });

  it('accepts a fully-populated Actor create input including decimals, enum, and crop relation', () => {
    const input = buildFullActorCreateInput();

    // Scalar columns (design.md §5).
    expect(input.traderId).toBe('TZ-0001');
    expect(input.traderName).toBe('Mbeya Seed Traders Ltd');
    expect(input.region).toBe('Mbeya');

    // PII columns are present on the model (gating is enforced later, T-4).
    expect(input.phone).toBe('+255700000000');
    expect(input.email).toBe('contact@mbeyaseed.co.tz');

    // Decimal-typed columns serialize through Prisma.Decimal.
    expect(input.capacityTons).toBeInstanceOf(Prisma.Decimal);
    expect((input.gpsLatitude as Prisma.Decimal).toString()).toBe('-8.9094');

    // Enum column defaults to UNKNOWN in the schema but accepts explicit values.
    expect(input.consentStatus).toBe(ConsentStatus.GRANTED);

    // M:N crop relation is wired through the CropsOnActors join model.
    expect(input.crops).toBeDefined();
  });

  it('exposes the ConsentStatus enum with exactly the three design.md §5 values', () => {
    expect(Object.values(ConsentStatus).sort()).toEqual([
      'DENIED',
      'GRANTED',
      'UNKNOWN',
    ]);
  });

  it('allows a minimal Actor create input (required fields only)', () => {
    // consentStatus is omitted on purpose — the schema default (UNKNOWN) applies.
    // Typed as the full input so the optional, unset enum field is addressable.
    const minimal: Prisma.ActorCreateInput = {
      traderId: 'TZ-0002',
      traderName: 'Dodoma Groundnut Co-op',
      region: 'Dodoma',
      traderType: 'Producer',
    };

    expect(minimal.traderId).toBe('TZ-0002');
    expect(minimal.consentStatus).toBeUndefined();
  });
});
