import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConsentStatus } from '@prisma/client';
import { AdminActorCreateDto } from './admin-actor-create.dto';
import { AdminActorUpdateDto } from './admin-actor-update.dto';
import { ActorHistoryQueryDto } from './actor-history-query.dto';

/**
 * T-2 — Unit tests for the admin actor write/query DTOs (FR-1, FR-3, FR-7, NFR-1, NFR-6).
 *
 * Like `actor-dto.spec.ts`, these exercise `class-validator` directly (no
 * controller) so a non-empty error array means the input would yield a 400 once
 * wired. Crop catalog validation, partial-update inheritance, and history-query
 * pagination bounds are the focus.
 */

/** Helper: which property names produced at least one constraint violation. */
async function invalidProps(dto: object): Promise<string[]> {
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

describe('AdminActorCreateDto', () => {
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
    consentStatus: ConsentStatus.UNKNOWN,
  };

  it('passes a valid create input with crops', async () => {
    const dto = plainToInstance(AdminActorCreateDto, {
      ...validInput,
      crops: ['sorghum', 'common_bean'],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('passes a valid create input without crops', async () => {
    const dto = plainToInstance(AdminActorCreateDto, validInput);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an invalid crop name', async () => {
    const dto = plainToInstance(AdminActorCreateDto, {
      ...validInput,
      crops: ['maize'],
    });
    expect(await invalidProps(dto)).toContain('crops');
  });

  it('rejects duplicate crops via @ArrayUnique', async () => {
    const dto = plainToInstance(AdminActorCreateDto, {
      ...validInput,
      crops: ['sorghum', 'sorghum'],
    });
    expect(await invalidProps(dto)).toContain('crops');
  });

  it('rejects a non-boolean acknowledged value', async () => {
    const dto = plainToInstance(AdminActorCreateDto, {
      ...validInput,
      acknowledged: 'yes',
    });
    expect(await invalidProps(dto)).toContain('acknowledged');
  });

  it('preserves inherited base validation (non-canonical region)', async () => {
    const dto = plainToInstance(AdminActorCreateDto, {
      ...validInput,
      region: 'Atlantis',
    });
    expect(await invalidProps(dto)).toContain('region');
  });

  it('preserves inherited GPS bounds validation', async () => {
    const dto = plainToInstance(AdminActorCreateDto, {
      ...validInput,
      gpsLatitude: 120,
    });
    expect(await invalidProps(dto)).toContain('gpsLatitude');
  });
});

describe('AdminActorUpdateDto', () => {
  it('passes a valid partial update with a single field', async () => {
    const dto = plainToInstance(AdminActorUpdateDto, {
      traderName: 'Updated Traders Ltd',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('passes a valid partial update with crops and acknowledged', async () => {
    const dto = plainToInstance(AdminActorUpdateDto, {
      crops: ['groundnut'],
      acknowledged: true,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a malformed partial update (invalid crop)', async () => {
    const dto = plainToInstance(AdminActorUpdateDto, {
      crops: ['wheat'],
    });
    expect(await invalidProps(dto)).toContain('crops');
  });

  it('rejects duplicate crops in a partial update', async () => {
    const dto = plainToInstance(AdminActorUpdateDto, {
      crops: ['common_bean', 'common_bean'],
    });
    expect(await invalidProps(dto)).toContain('crops');
  });

  it('rejects inherited validation in a partial update (malformed email)', async () => {
    const dto = plainToInstance(AdminActorUpdateDto, {
      email: 'not-an-email',
    });
    expect(await invalidProps(dto)).toContain('email');
  });
});

describe('ActorHistoryQueryDto', () => {
  it('applies defaults when pagination is omitted', async () => {
    const dto = plainToInstance(ActorHistoryQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(20);
  });

  it('coerces string query params to numbers and passes', async () => {
    const dto = plainToInstance(ActorHistoryQueryDto, {
      page: '3',
      pageSize: '50',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.pageSize).toBe(50);
  });

  it('rejects a pageSize over 100', async () => {
    const dto = plainToInstance(ActorHistoryQueryDto, { pageSize: '101' });
    expect(await invalidProps(dto)).toContain('pageSize');
  });

  it('rejects a non-positive page', async () => {
    const dto = plainToInstance(ActorHistoryQueryDto, { page: '0' });
    expect(await invalidProps(dto)).toContain('page');
  });

  it('passes a valid history query at the upper bound', async () => {
    const dto = plainToInstance(ActorHistoryQueryDto, {
      page: '1',
      pageSize: '100',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.pageSize).toBe(100);
  });
});
