import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConsentStatus } from '@prisma/client';
import { ActorCreateDto } from './actor-create.dto';
import { ListQueryDto } from './list-query.dto';

/**
 * T-3 — Unit tests for the validated write/query DTOs (NFR-4). These drive
 * `class-validator`'s `validate()` directly (no controller — that is T-5), so a
 * non-empty error array means the input would yield a 400 once wired.
 */

/** Helper: which property names produced at least one constraint violation. */
async function invalidProps(dto: object): Promise<string[]> {
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

/**
 * A `validator.js`-valid email of EXACTLY `totalLength` characters, built by
 * padding the domain with dot-separated labels (each ≤ 63 chars, the DNS
 * label limit) rather than the local part (capped at 64 by `isEmail`).
 * Padding the local part instead — e.g. `'x'.repeat(181) + '@example.com'`
 * — fails `@IsEmail()`'s FORMAT check on its own regardless of length,
 * which would make a bound test pass for the wrong reason (an inert
 * fixture: it can't tell a length violation from a format violation).
 */
function validEmailOfLength(totalLength: number): string {
  const prefix = 'a@';
  const tld = '.com';
  let remaining = totalLength - prefix.length - tld.length;
  const labels: string[] = [];
  while (remaining > 63) {
    labels.push('x'.repeat(63));
    remaining -= 64; // 63 label chars + 1 joining dot
  }
  labels.push('x'.repeat(remaining));
  return `${prefix}${labels.join('.')}${tld}`;
}

describe('ActorCreateDto', () => {
  const validInput = {
    traderId: 'TZ-0001',
    traderName: 'Mbeya Seed Traders Ltd',
    region: 'Mbeya',
    district: 'Mbeya Urban',
    traderType: 'seed_company',
    sex: 'F',
    contactPerson: 'Neema Shirima',
    capacityTons: 1250.5,
    phone: '+255700000000',
    email: 'contact@mbeyaseed.co.tz',
    gpsLatitude: -8.9094,
    gpsLongitude: 33.4607,
    consentStatus: ConsentStatus.GRANTED,
  };

  it('passes a valid, fully-populated create input', async () => {
    const dto = plainToInstance(ActorCreateDto, validInput);
    expect(await validate(dto)).toHaveLength(0);
  });

  // T-1 (intake-required-fields) — "required fields only" now includes the
  // intake contract's set (contactPerson, capacityTons, phone, email), not
  // just identity/location. `crops` is `AdminActorCreateDto`'s field, tested
  // there.
  it('passes a minimal input (required fields only)', async () => {
    const dto = plainToInstance(ActorCreateDto, {
      traderId: 'TZ-0002',
      traderName: 'Dodoma Groundnut Co-op',
      region: 'Dodoma',
      traderType: 'cooperative',
      contactPerson: 'Halima Mrisho',
      capacityTons: 0,
      phone: '+255700000001',
      email: 'halima@example.com',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects missing required fields (traderName)', async () => {
    const dto = plainToInstance(ActorCreateDto, {
      region: 'Mbeya',
      traderType: 'seed_company',
    });
    const props = await invalidProps(dto);
    expect(props).toEqual(expect.arrayContaining(['traderName']));
  });

  // FR-2 — no decorator exists for traderId, so a client-sent value can't fail validate() (stripping happens at the pipe, proven in the e2e spec).
  it('a client-sent traderId does not block validation either way (no decorator exists for it)', async () => {
    const dto = plainToInstance(ActorCreateDto, { ...validInput, traderId: 'CLIENT-SUPPLIED' });
    expect(await validate(dto)).toHaveLength(0);
  });

  // T-1 (intake-required-fields) FR-1 — the same required set self-registration
  // enforces, now required on the admin-side base DTO too.
  it.each(['contactPerson', 'capacityTons', 'phone', 'email'])(
    'rejects a missing %s',
    async (field) => {
      const input = { ...validInput } as Record<string, unknown>;
      delete input[field];
      const dto = plainToInstance(ActorCreateDto, input);
      expect(await invalidProps(dto)).toContain(field);
    },
  );

  // FR-1 "capacity of zero" scenario — self-registration accepts 0, and so must this path.
  it('accepts capacityTons of exactly 0', async () => {
    const dto = plainToInstance(ActorCreateDto, { ...validInput, capacityTons: 0 });
    expect(await validate(dto)).toHaveLength(0);
  });

  // FR-1 "same bounds" scenario — taken verbatim from self-registration (intake-contract.ts).
  it.each([
    { field: 'traderName', maxLength: 200 },
    { field: 'phone', maxLength: 40 },
  ])('rejects $field over its $maxLength-char bound', async ({ field, maxLength }) => {
    const dto = plainToInstance(ActorCreateDto, {
      ...validInput,
      [field]: 'x'.repeat(maxLength + 1),
    });
    expect(await invalidProps(dto)).toContain(field);
  });

  it('rejects an email over its 191-char bound (requirements.md FR-1 — matches the VARCHAR(191) column)', async () => {
    const dto = plainToInstance(ActorCreateDto, {
      ...validInput,
      email: validEmailOfLength(192),
    });
    expect(await invalidProps(dto)).toContain('email');
  });

  it('accepts an email exactly at the 191-char bound', async () => {
    const dto = plainToInstance(ActorCreateDto, {
      ...validInput,
      email: validEmailOfLength(191),
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a non-canonical region', async () => {
    const dto = plainToInstance(ActorCreateDto, {
      ...validInput,
      region: 'Atlantis',
    });
    expect(await invalidProps(dto)).toContain('region');
  });

  it('rejects a non-taxonomy traderType', async () => {
    const dto = plainToInstance(ActorCreateDto, {
      ...validInput,
      traderType: 'wholesaler',
    });
    expect(await invalidProps(dto)).toContain('traderType');
  });

  it('rejects latitude out of range (120 → invalid)', async () => {
    const dto = plainToInstance(ActorCreateDto, {
      ...validInput,
      gpsLatitude: 120,
    });
    expect(await invalidProps(dto)).toContain('gpsLatitude');
  });

  it('rejects a malformed email', async () => {
    const dto = plainToInstance(ActorCreateDto, {
      ...validInput,
      email: 'not-an-email',
    });
    expect(await invalidProps(dto)).toContain('email');
  });

  it('rejects a negative capacity (−1 → invalid)', async () => {
    const dto = plainToInstance(ActorCreateDto, {
      ...validInput,
      capacityTons: -1,
    });
    expect(await invalidProps(dto)).toContain('capacityTons');
  });

  it('rejects an out-of-set sex value', async () => {
    const dto = plainToInstance(ActorCreateDto, { ...validInput, sex: 'Z' });
    expect(await invalidProps(dto)).toContain('sex');
  });
});

describe('ListQueryDto', () => {
  it('coerces string query params to numbers and passes', async () => {
    const dto = plainToInstance(ListQueryDto, {
      crop: 'sorghum',
      role: 'cooperative',
      region: 'Dodoma',
      page: '2',
      pageSize: '50',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.pageSize).toBe(50);
  });

  it('applies defaults when pagination is omitted', async () => {
    const dto = plainToInstance(ListQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(20);
  });

  it('rejects a non-positive page', async () => {
    const dto = plainToInstance(ListQueryDto, { page: '0' });
    expect(await invalidProps(dto)).toContain('page');
  });

  it('rejects a pageSize over the max', async () => {
    const dto = plainToInstance(ListQueryDto, { pageSize: '1000' });
    expect(await invalidProps(dto)).toContain('pageSize');
  });

  // ATP-68 raised the public list's cap 100 → 500 so the map reaches the
  // PRD's 1 000+ target in 10 sequential round trips instead of 50. Both
  // sides of the boundary are pinned: a silent drift back to 100 would
  // quadruple the map's request count without failing anything else.
  it('accepts a pageSize of exactly 500, the max (ATP-68)', async () => {
    const dto = plainToInstance(ListQueryDto, { pageSize: '500' });
    expect(await invalidProps(dto)).not.toContain('pageSize');
    expect(dto.pageSize).toBe(500);
  });

  it('rejects a pageSize of 501, one over the max (ATP-68)', async () => {
    const dto = plainToInstance(ListQueryDto, { pageSize: '501' });
    expect(await invalidProps(dto)).toContain('pageSize');
  });

  it('rejects a non-taxonomy role', async () => {
    const dto = plainToInstance(ListQueryDto, { role: 'wholesaler' });
    expect(await invalidProps(dto)).toContain('role');
  });

  it('accepts a valid search term (FR-4)', async () => {
    const dto = plainToInstance(ListQueryDto, { search: 'Mbeya Seed' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.search).toBe('Mbeya Seed');
  });

  it('rejects an over-long search term (> 100 chars)', async () => {
    const dto = plainToInstance(ListQueryDto, { search: 'a'.repeat(101) });
    expect(await invalidProps(dto)).toContain('search');
  });
});
