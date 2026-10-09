import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConsentMethod, ConsentStatus } from '@prisma/client';
import { AdminActorCreateDto } from './admin-actor-create.dto';
import { AdminActorUpdateDto } from './admin-actor-update.dto';
import { ActorHistoryQueryDto } from './actor-history-query.dto';
import {
  invalidProps,
  validActorInput,
  validEmailOfLength,
} from '../../test/support/actor-input.fixture';

/**
 * T-2 — Unit tests for the admin actor write/query DTOs (FR-1, FR-3, FR-7, NFR-1, NFR-6).
 *
 * Like `actor-dto.spec.ts`, these exercise `class-validator` directly (no
 * controller) so a non-empty error array means the input would yield a 400 once
 * wired. Crop catalog validation, partial-update inheritance, and history-query
 * pagination bounds are the focus.
 */

describe('AdminActorCreateDto', () => {
  const validInput = validActorInput({ consentStatus: ConsentStatus.UNKNOWN });

  it('passes a valid create input with crops', async () => {
    const dto = plainToInstance(AdminActorCreateDto, {
      ...validInput,
      crops: ['sorghum', 'common_bean'],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  // T-1 (intake-required-fields) FR-1 — crops is now required (at least one),
  // reversing the old "without crops" pass. `otherCrops` is free text and
  // must NOT substitute for it (the "other crops alone" scenario below).
  it('rejects create input with crops omitted', async () => {
    const dto = plainToInstance(AdminActorCreateDto, validInput);
    expect(await invalidProps(dto)).toContain('crops');
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

  // Falsifier 2 (tasks.md T-1) — otherCrops alone must NOT satisfy the crop
  // requirement, matching self-registration's rule exactly.
  it('rejects an explicit empty crops array even when otherCrops is filled', async () => {
    const dto = plainToInstance(AdminActorCreateDto, {
      ...validInput,
      otherCrops: 'millet',
      crops: [],
    });
    expect(await invalidProps(dto)).toContain('crops');
  });

  // T-1 — the required set self-registration enforces, now required here too.
  it.each(['contactPerson', 'capacityTons', 'phone', 'email'])(
    'rejects a missing %s',
    async (field) => {
      const input = { ...validInput, crops: ['sorghum'] } as Record<string, unknown>;
      delete input[field];
      const dto = plainToInstance(AdminActorCreateDto, input);
      expect(await invalidProps(dto)).toContain(field);
    },
  );

  it('rejects phone over its 40-char bound', async () => {
    const dto = plainToInstance(AdminActorCreateDto, {
      ...validInput,
      crops: ['sorghum'],
      phone: 'x'.repeat(41),
    });
    expect(await invalidProps(dto)).toContain('phone');
  });

  it('rejects an email over its 191-char bound (requirements.md FR-1 — matches the VARCHAR(191) column)', async () => {
    const dto = plainToInstance(AdminActorCreateDto, {
      ...validInput,
      crops: ['sorghum'],
      email: validEmailOfLength(192),
    });
    expect(await invalidProps(dto)).toContain('email');
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

  it('rejects GPS outside Africa and accepts the rectangle edges', async () => {
    const bogota = plainToInstance(AdminActorCreateDto, {
      ...validInput,
      gpsLatitude: 4.711,
      gpsLongitude: -74.07,
    });
    const props = await invalidProps(bogota);
    expect(props).toContain('gpsLongitude');
    expect(props).not.toContain('gpsLatitude');

    const edge = plainToInstance(AdminActorCreateDto, {
      ...validInput,
      gpsLatitude: 37.6,
      gpsLongitude: -25.5,
    });
    expect(await invalidProps(edge)).not.toEqual(expect.arrayContaining(['gpsLatitude']));
    expect(await invalidProps(edge)).not.toEqual(expect.arrayContaining(['gpsLongitude']));
  });

  // `actors/public-profile-disclosure` T-2 — a populated round-trip, not a
  // `null` default, per the task's Disqualifier: submitting a value and
  // reading it back is what proves the field, not merely that it validates.
  it('passes and round-trips a non-empty contactPerson and otherCrops', async () => {
    const dto = plainToInstance(AdminActorCreateDto, {
      ...validInput,
      crops: ['sorghum'],
      contactPerson: 'Neema Shirima',
      otherCrops: 'Sesame trial plot',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.contactPerson).toBe('Neema Shirima');
    expect(dto.otherCrops).toBe('Sesame trial plot');
  });

  // T-2 MANDATORY carry-forward — explicit @MaxLength bounds, unlike the
  // pre-existing unbounded neighbours (district/position/marketLocation/phone),
  // which are a known, out-of-scope defect this task does not fix.
  it.each([
    { field: 'contactPerson', maxLength: 120 },
    { field: 'otherCrops', maxLength: 300 },
  ])('rejects $field over its $maxLength-char bound', async ({ field, maxLength }) => {
    const dto = plainToInstance(AdminActorCreateDto, {
      ...validInput,
      [field]: 'x'.repeat(maxLength + 1),
    });
    expect(await invalidProps(dto)).toContain(field);
  });

  it('accepts contactPerson and otherCrops exactly at their bound', async () => {
    const dto = plainToInstance(AdminActorCreateDto, {
      ...validInput,
      crops: ['sorghum'],
      contactPerson: 'x'.repeat(120),
      otherCrops: 'x'.repeat(300),
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  // T-1 (consent-request-email, DD-9) — Falsifier 1 (tasks.md T-1): swapping
  // ADMIN_ASSERTABLE_CONSENT_METHODS for Object.values(ConsentMethod) in
  // actor-create.dto.ts is what must redden this.
  it('rejects EMAIL_LINK as a consentMethod on create — only the actor\'s own response can record it (DD-9)', async () => {
    const dto = plainToInstance(AdminActorCreateDto, {
      ...validInput,
      crops: ['sorghum'],
      consentMethod: ConsentMethod.EMAIL_LINK,
    });
    expect(await invalidProps(dto)).toContain('consentMethod');
  });

  it('accepts every admin-assertable consentMethod value on create', async () => {
    for (const method of [
      ConsentMethod.NOT_RECORDED,
      ConsentMethod.PORTAL_CHECKBOX,
      ConsentMethod.SIGNED_FORM,
      ConsentMethod.EMAIL,
      ConsentMethod.VERBAL_FIELD,
    ]) {
      const dto = plainToInstance(AdminActorCreateDto, {
        ...validInput,
        crops: ['sorghum'],
        consentMethod: method,
      });
      expect(await invalidProps(dto)).not.toContain('consentMethod');
    }
  });
});

describe('additionalTraderTypes validation', () => {
  const validInput = validActorInput({ consentStatus: ConsentStatus.UNKNOWN });
  const create = (additionalTraderTypes: unknown) =>
    plainToInstance(AdminActorCreateDto, {
      ...validInput,
      crops: ['sorghum'],
      additionalTraderTypes,
    });

  it('is optional; accepts distinct taxonomy members, including []', async () => {
    expect(await validate(create(undefined))).toHaveLength(0);
    expect(await validate(create([]))).toHaveLength(0);
    expect(await validate(create(['ngo', 'cooperative']))).toHaveLength(0);
  });

  it.each([
    ['the main traderType', () => [validInput.traderType]],
    ['an unknown value', () => ['banana']],
    ['duplicates', () => ['ngo', 'ngo']],
    ['a non-array', () => 'ngo'],
    ['more entries than the taxonomy allows', () => Array(10).fill('ngo')],
  ])('rejects %s', async (_label, value) => {
    expect(await invalidProps(create(value()))).toContain('additionalTraderTypes');
  });

  it('the update DTO inherits the rule when traderType is in the same patch', async () => {
    const dto = plainToInstance(AdminActorUpdateDto, {
      traderType: 'ngo',
      additionalTraderTypes: ['ngo'],
    });
    expect(await invalidProps(dto)).toContain('additionalTraderTypes');
    expect(
      await validate(plainToInstance(AdminActorUpdateDto, { additionalTraderTypes: ['ngo'] })),
    ).toHaveLength(0);
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

  // T-2 — populated round-trip on the partial-update DTO too, and the
  // inherited @MaxLength bound must still fire through PartialType.
  it('passes and round-trips a non-empty contactPerson and otherCrops in a partial update', async () => {
    const dto = plainToInstance(AdminActorUpdateDto, {
      contactPerson: 'Amina Hassan',
      otherCrops: 'Cassava',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.contactPerson).toBe('Amina Hassan');
    expect(dto.otherCrops).toBe('Cassava');
  });

  it('rejects an over-bound contactPerson in a partial update (inherited @MaxLength)', async () => {
    const dto = plainToInstance(AdminActorUpdateDto, {
      contactPerson: 'x'.repeat(121),
    });
    expect(await invalidProps(dto)).toContain('contactPerson');
  });

  it('rejects inherited validation in a partial update (malformed email)', async () => {
    const dto = plainToInstance(AdminActorUpdateDto, {
      email: 'not-an-email',
    });
    expect(await invalidProps(dto)).toContain('email');
  });

  // T-1 (consent-request-email, design.md §5.7) — the UPDATE DTO keeps the
  // FULL ConsentMethod enum (unlike create's admin-assertable subset),
  // because ActorForm.buildDto always resends the stored value (P-16): a
  // narrowed update DTO would 400 every save of an EMAIL_LINK actor. This
  // pins the redeclared decorator actually overriding the inherited one
  // from ActorCreateDto (class-validator resolves per property+target, own
  // metadata wins — verified judgment-day).
  it('accepts EMAIL_LINK as consentMethod shape-wise on update (the admin-assertable rule is enforced service-side, not here)', async () => {
    const dto = plainToInstance(AdminActorUpdateDto, {
      consentMethod: ConsentMethod.EMAIL_LINK,
    });
    expect(await invalidProps(dto)).not.toContain('consentMethod');
  });

  it('still rejects a bogus consentMethod value on update', async () => {
    const dto = plainToInstance(AdminActorUpdateDto, {
      consentMethod: 'BOGUS',
    });
    expect(await invalidProps(dto)).toContain('consentMethod');
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

// D-26 (consent-request-email, design.md §5.7a) — optional stale-form guard.
describe('AdminActorUpdateDto.expectedUpdatedAt (D-26)', () => {
  it('is optional: an update without it passes', async () => {
    const dto = plainToInstance(AdminActorUpdateDto, { traderName: 'X' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts an ISO-8601 instant', async () => {
    const dto = plainToInstance(AdminActorUpdateDto, {
      expectedUpdatedAt: '2026-10-06T08:15:30.123Z',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each(['yesterday', '2026-13-45T00:00:00Z', 12345, ''])(
    'rejects %p',
    async (value) => {
      const dto = plainToInstance(AdminActorUpdateDto, { expectedUpdatedAt: value });
      expect(await invalidProps(dto)).toContain('expectedUpdatedAt');
    },
  );
});
