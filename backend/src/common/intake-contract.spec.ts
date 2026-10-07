import 'reflect-metadata';
import { getMetadataStorage, validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AdminActorCreateDto } from '../actors/dto/admin-actor-create.dto';
import {
  RegistrationCreateDto,
  RegistrationPayloadDto,
} from '../registrations/dto/registration-create.dto';
import {
  INTAKE_CAPACITY_MIN,
  INTAKE_MAX_LENGTHS,
  INTAKE_REQUIRED_FIELDS,
  missingIntakeFields,
} from './intake-contract';
import { TEMPLATE_COLUMNS } from './template-columns';

/**
 * T-1 — NFR-1: "one definition, not three copies." These read class-validator's
 * OWN decorator metadata off the self-registration reference
 * (`RegistrationPayloadDto` / `RegistrationCreateDto.email`) and off
 * `AdminActorCreateDto`, and assert both agree with the declaration in
 * `intake-contract.ts`. A DTO that drifts from the declaration — Phone made
 * optional, a bound raised — reddens here, by NAME, before it ever reaches a
 * behavioural spec.
 *
 * Disqualifier (design.md DD-1, tasks.md T-1): if a test below still passes
 * after a field is deliberately made optional on the DTO under test, it is
 * reading the wrong metadata target (e.g. only the base class, missing
 * inherited metadata via `getTargetValidationMetadatas`'s inheritance walk).
 * The fallback is DD-1's black-box `validate()` convention, already exercised
 * in `actor-dto.spec.ts` / `admin-actor-dto.spec.ts`.
 *
 * Rework note (attempt 2, review issue 1): the per-field loop over
 * self-registration below now iterates `INTAKE_REQUIRED_FIELDS` itself,
 * never a second, hand-maintained field list — and a dedicated
 * "set-equality" block (below the per-field loops) asserts the DERIVED
 * required-property set of each reference DTO equals the declaration
 * exactly, so a field quietly ADDED or REMOVED from either side (not just
 * one named in `INTAKE_REQUIRED_FIELDS` becoming optional) also reddens.
 */

/** A class constructor — the shape `getTargetValidationMetadatas` expects. */
type ClassConstructor = new (...args: never[]) => unknown;

function metadataFor(target: ClassConstructor, property: string) {
  return getMetadataStorage()
    .getTargetValidationMetadatas(target, '', true, false)
    .filter((m) => m.propertyName === property);
}

/**
 * Required = at least one validation decorator fired for this property AND
 * none of them is `@IsOptional`. The length check (review issue 1) closes a
 * vacuous-truth gap: a property with ZERO metadata entries (e.g. one deleted
 * from the DTO entirely) would otherwise read as "required" by this
 * function, because `.some()` over an empty array is `false`.
 */
function isRequired(target: ClassConstructor, property: string): boolean {
  const metas = metadataFor(target, property);
  return metas.length > 0 && !metas.some((m) => m.name === 'isOptional');
}

function maxLengthOf(target: ClassConstructor, property: string): number | undefined {
  return metadataFor(target, property).find((m) => m.name === 'maxLength')
    ?.constraints?.[0];
}

function minOf(target: ClassConstructor, property: string): number | undefined {
  return metadataFor(target, property).find((m) => m.name === 'min')?.constraints?.[0];
}

/** Every property name `class-validator` has metadata for on this class, inherited included. */
function decoratedProperties(target: ClassConstructor): Set<string> {
  const names = getMetadataStorage()
    .getTargetValidationMetadatas(target, '', true, false)
    .map((m) => m.propertyName);
  return new Set(names);
}

/** The DERIVED required-property set for a DTO: every decorated property that is required (`isRequired` above). */
function requiredPropertiesOf(target: ClassConstructor): Set<string> {
  const required = new Set<string>();
  for (const property of decoratedProperties(target)) {
    if (isRequired(target, property)) required.add(property);
  }
  return required;
}

describe('Intake contract — NFR-1 metadata pin', () => {
  describe('required fields — AdminActorCreateDto', () => {
    it.each(INTAKE_REQUIRED_FIELDS)('requires %s (no @IsOptional)', (field) => {
      expect(isRequired(AdminActorCreateDto, field)).toBe(true);
    });
  });

  describe('required fields — self-registration (the reference)', () => {
    // Driven by the contract's OWN declaration, not a second hand-maintained
    // list (review issue 1): `email` lives on `RegistrationCreateDto`, every
    // other member of `INTAKE_REQUIRED_FIELDS` lives on `RegistrationPayloadDto`.
    const PAYLOAD_FIELDS = INTAKE_REQUIRED_FIELDS.filter((field) => field !== 'email');

    it.each(PAYLOAD_FIELDS)('RegistrationPayloadDto requires %s (no @IsOptional)', (field) => {
      expect(isRequired(RegistrationPayloadDto, field)).toBe(true);
    });

    it('RegistrationCreateDto requires email (no @IsOptional)', () => {
      expect(isRequired(RegistrationCreateDto, 'email')).toBe(true);
    });
  });

  describe('crops is non-empty, not merely present', () => {
    it.each([AdminActorCreateDto, RegistrationPayloadDto])(
      '%p carries @ArrayNotEmpty on crops',
      (target) => {
        const names = metadataFor(target, 'crops').map((m) => m.name);
        expect(names).toContain('arrayNotEmpty');
      },
    );
  });

  describe('bounds — AdminActorCreateDto', () => {
    it.each(Object.entries(INTAKE_MAX_LENGTHS))(
      'bounds %s at %i characters',
      (field, max) => {
        expect(maxLengthOf(AdminActorCreateDto, field)).toBe(max);
      },
    );

    it(`bounds capacityTons at a minimum of ${INTAKE_CAPACITY_MIN}`, () => {
      expect(minOf(AdminActorCreateDto, 'capacityTons')).toBe(INTAKE_CAPACITY_MIN);
    });
  });

  describe('bounds — self-registration (the reference)', () => {
    it('bounds traderName/contactPerson/phone on RegistrationPayloadDto the same way', () => {
      expect(maxLengthOf(RegistrationPayloadDto, 'traderName')).toBe(
        INTAKE_MAX_LENGTHS.traderName,
      );
      expect(maxLengthOf(RegistrationPayloadDto, 'contactPerson')).toBe(
        INTAKE_MAX_LENGTHS.contactPerson,
      );
      expect(maxLengthOf(RegistrationPayloadDto, 'phone')).toBe(INTAKE_MAX_LENGTHS.phone);
    });

    it('bounds email on RegistrationCreateDto the same way', () => {
      expect(maxLengthOf(RegistrationCreateDto, 'email')).toBe(INTAKE_MAX_LENGTHS.email);
    });

    it(`bounds capacityTons at a minimum of ${INTAKE_CAPACITY_MIN}`, () => {
      expect(minOf(RegistrationPayloadDto, 'capacityTons')).toBe(INTAKE_CAPACITY_MIN);
    });
  });

  /**
   * Rework addition (attempt 2, review issue 1 remediation): the per-field
   * loops above prove every NAMED field in `INTAKE_REQUIRED_FIELDS` is
   * required on both reference DTOs — but they cannot notice a field that
   * was never named at all, in either direction: dropped from a DTO
   * (vacuously "required" before the `isRequired` length fix above), or
   * newly added to self-registration without ever being added here. This
   * block derives each DTO's FULL required-property set from its metadata
   * and asserts it is EXACTLY `INTAKE_REQUIRED_FIELDS ∪ {traderName,
   * traderType, region}` — the identity/location fields self-registration
   * and the admin DTO have always both required, outside this task's scope
   * but still part of the one true required set every intake path shares.
   */
  describe('set-equality: the derived required set matches the declaration exactly', () => {
    const REFERENCE_REQUIRED_FIELDS = new Set<string>([
      ...INTAKE_REQUIRED_FIELDS,
      'traderName',
      'traderType',
      'region',
    ]);

    it('RegistrationPayloadDto (+ RegistrationCreateDto.email) requires exactly this set — no more, no less', () => {
      const required = requiredPropertiesOf(RegistrationPayloadDto);
      if (isRequired(RegistrationCreateDto, 'email')) {
        required.add('email');
      }
      expect(required).toEqual(REFERENCE_REQUIRED_FIELDS);
    });

    it('AdminActorCreateDto requires exactly this set — no more, no less (T-2: traderId carries no metadata at all)', () => {
      const required = requiredPropertiesOf(AdminActorCreateDto);
      expect(required).toEqual(REFERENCE_REQUIRED_FIELDS);
    });

    /**
     * T-4 (consent-intake/intake-required-fields) — the import template's
     * `required` column flags are the THIRD consumer NFR-1 demands ("the
     * required set is defined once and consumed by the admin DTO, the
     * import validator and the template generator"). `crops` has no single
     * template column (it is the three YES/NO columns, enforced as
     * "at least one" at row-validation time, design.md §4.6), so the
     * reference set here is the same identity ∪ declaration union minus
     * `crops`.
     */
    it('TEMPLATE_COLUMNS requires exactly this set minus crops (no single crops column) — no more, no less', () => {
      const required = new Set(
        TEMPLATE_COLUMNS.filter((c) => c.required).map((c) => c.field),
      );
      const expectedTemplateRequired = new Set(
        [...REFERENCE_REQUIRED_FIELDS].filter((field) => field !== 'crops'),
      );
      expect(required).toEqual(expectedTemplateRequired);
    });
  });
});

/**
 * Newly owned clause (tasks.md §5, added by the Leader during T-1 rework):
 * "FR-1 MUST use the same field-level messages the self-registration path
 * uses for the same omission" — for CREATE. Self-registration and the admin
 * DTO share the exact same decorator stack per required field (both
 * transcribed from the same bound/decorator choices, intake-contract.ts), so
 * the DEFAULT class-validator message for a given decorator is driven only
 * by the decorator + the property name — identical property names on both
 * DTOs (`phone`, `email`, …) therefore produce identical message sets for
 * the same omission. A custom `message:` added to just one side's decorator
 * breaks that symmetry and reddens here, by name.
 */
describe('FR-1 — admin create reports the same field-level messages as self-registration', () => {
  async function constraintsFor(dto: object, property: string): Promise<string[]> {
    const errors = await validate(dto as Record<string, unknown>);
    const error = errors.find((e) => e.property === property);
    return Object.values(error?.constraints ?? {}).sort();
  }

  const validAdminInput = {
    traderId: 'TZ-0001',
    traderName: 'Valid Trader',
    region: 'Mbeya',
    traderType: 'seed_company',
    contactPerson: 'Neema Shirima',
    capacityTons: 10,
    phone: '+255700000000',
    email: 'contact@example.com',
    crops: ['sorghum'],
  };

  const validPayloadInput = {
    traderName: 'Valid Trader',
    traderType: 'seed_company',
    contactPerson: 'Neema Shirima',
    region: 'Mbeya',
    crops: ['sorghum'],
    capacityTons: 10,
    phone: '+255700000000',
  };

  // `email` lives at the top level of `RegistrationCreateDto`, not on the
  // nested payload — a separate, minimal valid instance covers it.
  const validRegistrationCreateInput = {
    email: 'contact@example.com',
    code: '123456',
    consent: { accepted: true, policyVersion: 'v1' },
    payload: validPayloadInput,
  };

  it.each(['contactPerson', 'crops', 'capacityTons', 'phone'] as const)(
    'missing %s: AdminActorCreateDto and RegistrationPayloadDto produce the same message(s)',
    async (field) => {
      const adminInput = { ...validAdminInput } as Record<string, unknown>;
      delete adminInput[field];
      const adminDto = plainToInstance(AdminActorCreateDto, adminInput);

      const payloadInput = { ...validPayloadInput } as Record<string, unknown>;
      delete payloadInput[field];
      const payloadDto = plainToInstance(RegistrationPayloadDto, payloadInput);

      const adminMessages = await constraintsFor(adminDto, field);
      const referenceMessages = await constraintsFor(payloadDto, field);

      expect(adminMessages).toEqual(referenceMessages);
      expect(adminMessages.length).toBeGreaterThan(0);
    },
  );

  it('missing email: AdminActorCreateDto and RegistrationCreateDto produce the same message(s)', async () => {
    const adminInput = { ...validAdminInput } as Record<string, unknown>;
    delete adminInput.email;
    const adminDto = plainToInstance(AdminActorCreateDto, adminInput);

    const registrationInput = {
      ...validRegistrationCreateInput,
    } as Record<string, unknown>;
    delete registrationInput.email;
    const registrationDto = plainToInstance(RegistrationCreateDto, registrationInput);

    const adminMessages = await constraintsFor(adminDto, 'email');
    const referenceMessages = await constraintsFor(registrationDto, 'email');

    expect(adminMessages).toEqual(referenceMessages);
    expect(adminMessages.length).toBeGreaterThan(0);
  });
});

describe('missingIntakeFields (merged-state check, design.md §4.4)', () => {
  const complete = {
    contactPerson: 'Grace Mushi',
    capacityTons: 10,
    phone: '+255700000000',
    email: 'grace@example.com',
    cropsCount: 1,
  };

  it('returns nothing when the stored state already satisfies the required set and the patch is empty', () => {
    expect(missingIntakeFields(complete, {})).toEqual([]);
  });

  it('keeps the stored crop links when crops is absent from a patch touching another field', () => {
    expect(missingIntakeFields(complete, { contactPerson: 'Grace Mushi' })).toEqual([]);
  });

  it('is satisfied by a non-empty patch crops array when the stored count is zero', () => {
    const incomplete = { ...complete, cropsCount: 0 };
    expect(missingIntakeFields(incomplete, { crops: ['sorghum'] })).toEqual([]);
  });

  it('rejects an explicit empty crops array even though the stored count is non-zero', () => {
    expect(missingIntakeFields(complete, { crops: [] })).toContain('crops');
  });

  // Advisory (tasks.md T-1 rework) — `crops: null` (reachable through the
  // `@IsOptional` partial-update DTO, which skips validation on `null`) is
  // treated exactly like an explicit `crops: []`, never a TypeError.
  it('rejects crops: null exactly like crops: [] — no TypeError', () => {
    expect(missingIntakeFields(complete, { crops: null })).toContain('crops');
  });

  it('flags crops missing when the stored count is zero and the patch never mentions crops', () => {
    const incomplete = { ...complete, cropsCount: 0 };
    expect(missingIntakeFields(incomplete, {})).toContain('crops');
  });

  it('flags a scalar missing from BOTH the stored state and the patch (e.g. a legacy actor with no email)', () => {
    const noEmail = { ...complete, email: null };
    expect(missingIntakeFields(noEmail, {})).toContain('email');
  });

  it('is satisfied when the patch supplies the field the stored state lacks', () => {
    const noEmail = { ...complete, email: null };
    expect(missingIntakeFields(noEmail, { email: 'new@example.com' })).toEqual([]);
  });

  // Advisory (tasks.md T-1 rework, whitespace symmetry) — a whitespace-only
  // value is length ≥ 1, so it is PRESENT under the same rule
  // `@MinLength(1)` enforces on create: a value the create path accepted
  // must never become un-editable on a later PATCH.
  it('treats a whitespace-only patch value as present, matching the DTO MinLength(1) rule', () => {
    expect(missingIntakeFields(complete, { contactPerson: '   ' })).toEqual([]);
  });

  it('still treats an empty-string patch value as blank', () => {
    expect(missingIntakeFields(complete, { contactPerson: '' })).toContain('contactPerson');
  });

  it('accepts capacityTons of exactly 0 from either source', () => {
    expect(missingIntakeFields(complete, { capacityTons: 0 })).toEqual([]);
    const zeroStored = { ...complete, capacityTons: 0 };
    expect(missingIntakeFields(zeroStored, {})).toEqual([]);
  });
});
