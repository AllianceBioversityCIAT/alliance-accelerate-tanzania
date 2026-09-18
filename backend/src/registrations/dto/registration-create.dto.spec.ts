import 'reflect-metadata';
import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { createValidationPipe } from '../../common/validation-pipe';
import {
  ConsentInputDto,
  RegistrationCreateDto,
  RegistrationPayloadDto,
} from './registration-create.dto';

/**
 * T-9 — Tests for `RegistrationCreateDto` (FR-2 scenarios 1-3, design.md §4.1).
 *
 * Run through the PRODUCTION `createValidationPipe()` — not a hand-built
 * `new ValidationPipe({...})` — via `pipe.transform(body, metadata)`, exactly
 * the call NestJS's router makes per controller argument. This is the same
 * factory `main.ts`/`lambda.ts` install globally, so `whitelist: true` and the
 * `details` envelope behave here exactly as they will once T-10 wires this DTO
 * into a route.
 */

const METADATA: ArgumentMetadata = {
  type: 'body',
  metatype: RegistrationCreateDto,
  data: undefined,
};

const pipe = createValidationPipe();

function validPayload(): Record<string, unknown> {
  return {
    traderName: 'Mbeya Seed Traders Ltd',
    traderType: 'seed_company',
    contactPerson: 'Neema Shirima',
    position: 'Operations Manager',
    district: 'Mbeya Urban',
    marketLocation: 'Mbeya Central Market',
    sex: 'F',
    region: 'Mbeya',
    gpsLatitude: -8.9094,
    gpsLongitude: 33.4607,
    crops: ['sorghum', 'common_bean'],
    otherCrops: 'Sesame trial plot',
    capacityTons: 120,
    phone: '+255700000000',
  };
}

function validBody(overrides: {
  payload?: Record<string, unknown>;
  consent?: Record<string, unknown>;
} = {}): Record<string, unknown> {
  return {
    email: 'neema@khsc.co.tz',
    code: '123456',
    consent: { accepted: true, policyVersion: 'v2.1', ...overrides.consent },
    payload: { ...validPayload(), ...overrides.payload },
  };
}

/** Runs `body` through the production pipe and captures either outcome. */
async function run(
  body: unknown,
): Promise<{ result?: RegistrationCreateDto; error?: BadRequestException }> {
  try {
    const result = (await pipe.transform(body, METADATA)) as RegistrationCreateDto;
    return { result };
  } catch (error) {
    return { error: error as BadRequestException };
  }
}

function details(error: BadRequestException): Array<{ field: string; message: string }> {
  return (error.getResponse() as { details: Array<{ field: string; message: string }> })
    .details;
}

describe('RegistrationCreateDto — happy path (the B33 trap)', () => {
  /**
   * This is the disqualifying test the Leader's brief calls out by name: a
   * suite of pure negative cases cannot detect a missing `@ValidateNested()`
   * on `consent`, because without it `consent.accepted` reads `undefined` —
   * which throws a 400 from a DIFFERENT cause (a missing/false `accepted`)
   * and every negative test still "passes" for the wrong reason. Only a
   * valid submission proves the nested value survived `whitelist: true`
   * intact.
   */
  it('accepts a fully valid submission and preserves every nested value through whitelist', async () => {
    const { result, error } = await run(validBody());

    expect(error).toBeUndefined();
    expect(result).toBeInstanceOf(RegistrationCreateDto);
    expect(result!.email).toBe('neema@khsc.co.tz');
    expect(result!.code).toBe('123456');

    // Proves @ValidateNested() + @Type() on `consent`: if either were
    // missing, `whitelist: true` would strip the whole `consent` key (it
    // would carry zero validator metadata) and this would read `undefined`,
    // not `true` — the exact B33 failure mode.
    expect(result!.consent).toBeInstanceOf(ConsentInputDto);
    expect(result!.consent.accepted).toBe(true);
    expect(result!.consent.policyVersion).toBe('v2.1');

    // Same proof for `payload`.
    expect(result!.payload).toBeInstanceOf(RegistrationPayloadDto);
    expect(result!.payload.traderName).toBe('Mbeya Seed Traders Ltd');
    expect(result!.payload.crops).toEqual(['sorghum', 'common_bean']);
  });
});

describe('RegistrationCreateDto — crops (FR-2 scenario 2, C-13)', () => {
  it('rejects an empty crops array with a details entry, unlike the admin DTO', async () => {
    const { result, error } = await run(validBody({ payload: { crops: [] } }));

    expect(result).toBeUndefined();
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error!.getStatus()).toBe(400);
    const entries = details(error!).filter((d) => d.field === 'payload.crops');
    expect(entries).toHaveLength(1);
  });

  it('rejects an unknown crop name', async () => {
    const { error } = await run(validBody({ payload: { crops: ['maize'] } }));
    expect(details(error!).some((d) => d.field === 'payload.crops')).toBe(true);
  });

  it('rejects a duplicate crop', async () => {
    const { error } = await run(
      validBody({ payload: { crops: ['sorghum', 'sorghum'] } }),
    );
    expect(details(error!).some((d) => d.field === 'payload.crops')).toBe(true);
  });
});

describe('RegistrationCreateDto — every free-text string is bound', () => {
  const cases: Array<{ field: string; maxLength: number }> = [
    { field: 'traderName', maxLength: 200 },
    { field: 'contactPerson', maxLength: 120 },
    { field: 'position', maxLength: 120 },
    { field: 'district', maxLength: 120 },
    { field: 'marketLocation', maxLength: 120 },
    { field: 'otherCrops', maxLength: 300 },
    { field: 'phone', maxLength: 40 },
  ];

  it.each(cases)('rejects $field over its $maxLength-char bound', async ({ field, maxLength }) => {
    const { error } = await run(
      validBody({ payload: { [field]: 'x'.repeat(maxLength + 1) } }),
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect(details(error!).some((d) => d.field === `payload.${field}`)).toBe(true);
  });

  it('accepts a value exactly at each bound', async () => {
    const atBound = Object.fromEntries(
      cases.map(({ field, maxLength }) => [field, 'x'.repeat(maxLength)]),
    );
    const { error } = await run(validBody({ payload: atBound }));
    expect(error).toBeUndefined();
  });
});

describe('RegistrationCreateDto — GPS coordinate pairing (FR-2 scenario 3)', () => {
  it('accepts both coordinates present', async () => {
    const { error } = await run(
      validBody({ payload: { gpsLatitude: -6.8, gpsLongitude: 39.28 } }),
    );
    expect(error).toBeUndefined();
  });

  it('accepts both coordinates blank', async () => {
    const { result, error } = await run(
      validBody({ payload: { gpsLatitude: undefined, gpsLongitude: undefined } }),
    );
    expect(error).toBeUndefined();
    expect(result!.payload.gpsLatitude).toBeUndefined();
    expect(result!.payload.gpsLongitude).toBeUndefined();
  });

  it('rejects latitude alone with exactly one details entry, on gpsLatitude', async () => {
    const { error } = await run(
      validBody({ payload: { gpsLatitude: -6.8, gpsLongitude: undefined } }),
    );
    expect(error).toBeInstanceOf(BadRequestException);
    const entries = details(error!).filter((d) => d.field === 'payload.gpsLatitude');
    expect(entries).toHaveLength(1);
    expect(details(error!).some((d) => d.field === 'payload.gpsLongitude')).toBe(false);
  });

  it('rejects longitude alone with exactly one details entry, on gpsLongitude', async () => {
    const { error } = await run(
      validBody({ payload: { gpsLatitude: undefined, gpsLongitude: 39.28 } }),
    );
    expect(error).toBeInstanceOf(BadRequestException);
    const entries = details(error!).filter((d) => d.field === 'payload.gpsLongitude');
    expect(entries).toHaveLength(1);
    expect(details(error!).some((d) => d.field === 'payload.gpsLatitude')).toBe(false);
  });

  it('rejects an out-of-range latitude even when paired', async () => {
    const { error } = await run(
      validBody({ payload: { gpsLatitude: 120, gpsLongitude: 39.28 } }),
    );
    expect(details(error!).some((d) => d.field === 'payload.gpsLatitude')).toBe(true);
  });

  it('rejects an out-of-range longitude even when paired', async () => {
    const { error } = await run(
      validBody({ payload: { gpsLatitude: -6.8, gpsLongitude: 200 } }),
    );
    expect(details(error!).some((d) => d.field === 'payload.gpsLongitude')).toBe(true);
  });
});

describe('RegistrationCreateDto — no email in the payload (S-6)', () => {
  it('has no declared email field on RegistrationPayloadDto', () => {
    expect(Object.getOwnPropertyNames(new RegistrationPayloadDto())).not.toContain('email');
  });

  it('strips an email supplied inside payload rather than accepting or publishing it', async () => {
    const { result, error } = await run(
      validBody({ payload: { email: 'attacker@example.com' } }),
    );
    expect(error).toBeUndefined();
    expect((result!.payload as unknown as Record<string, unknown>).email).toBeUndefined();
    // The top-level, OTP-verified address is untouched and is the only one.
    expect(result!.email).toBe('neema@khsc.co.tz');
  });
});

describe('RegistrationCreateDto — field-level 400 shape (FR-2 scenario 2)', () => {
  it('rejects a submission with a negative capacity, malformed email, and no crop with one details entry per field', async () => {
    const { error } = await run({
      email: 'not-an-email',
      code: '123456',
      consent: { accepted: true, policyVersion: 'v2.1' },
      payload: { ...validPayload(), capacityTons: -5, crops: [] },
    });

    expect(error).toBeInstanceOf(BadRequestException);
    const body = error!.getResponse() as { statusCode: number; details: unknown[] };
    expect(body.statusCode).toBe(400);
    const fields = details(error!).map((d) => d.field);
    expect(fields).toContain('email');
    expect(fields).toContain('payload.capacityTons');
    expect(fields).toContain('payload.crops');
  });

  it('rejects consent.accepted = false and does not silently pass', async () => {
    const { error, result } = await run(validBody({ consent: { accepted: false } }));
    // Shape-only at the DTO layer: `accepted` is a valid boolean, so the DTO
    // itself does not reject `false` — the semantic "must be true" check is
    // T-10's service-side consent check (design.md §4.1 step 4). This test
    // exists to pin that boundary: the DTO transforms it faithfully rather
    // than losing it, so the downstream check has a real value to inspect.
    expect(error).toBeUndefined();
    expect(result!.consent.accepted).toBe(false);
  });
});
