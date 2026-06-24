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

describe('ActorCreateDto', () => {
  const validInput = {
    traderId: 'TZ-0001',
    traderName: 'Mbeya Seed Traders Ltd',
    region: 'Mbeya',
    district: 'Mbeya Urban',
    traderType: 'seed_company',
    sex: 'F',
    capacityTons: 1250.5,
    email: 'contact@mbeyaseed.co.tz',
    gpsLatitude: -8.9094,
    gpsLongitude: 33.4607,
    consentStatus: ConsentStatus.GRANTED,
  };

  it('passes a valid, fully-populated create input', async () => {
    const dto = plainToInstance(ActorCreateDto, validInput);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('passes a minimal input (required fields only)', async () => {
    const dto = plainToInstance(ActorCreateDto, {
      traderId: 'TZ-0002',
      traderName: 'Dodoma Groundnut Co-op',
      region: 'Dodoma',
      traderType: 'cooperative',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects missing required fields (traderId, traderName)', async () => {
    const dto = plainToInstance(ActorCreateDto, {
      region: 'Mbeya',
      traderType: 'seed_company',
    });
    const props = await invalidProps(dto);
    expect(props).toEqual(expect.arrayContaining(['traderId', 'traderName']));
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
