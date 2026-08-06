import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CANONICAL_REGIONS, TRADER_TYPES } from '../../common/normalize';
import { CROP_NAMES } from '../../actors/dto/admin-actor-create.dto';

/**
 * T-9 — Validated write DTO for the public `POST /registrations` request
 * body (FR-2). Enumerated explicitly against `design.md` §4.1's field table —
 * **not** derived by extending `ActorCreateDto` (revision 1's approach,
 * corrected under C-13/S-5): the admin DTO leaves `crops` optional and bounds
 * only 2 of its 9 free-text strings, both wrong for an unauthenticated
 * applicant. Every rule below is transcribed from §4.1, not mirrored.
 *
 * Scope note (T-9): DTO + tests only. The consent *check* (`accepted ===
 * true` and a known `policyVersion`), OTP verification, the submission
 * `$transaction`, and reference allocation are T-10's. This DTO is not wired
 * into any controller or route here.
 *
 * Design refs: design.md §3.1 (request shape), §4.1 (field table).
 * Requirement: requirements.md FR-2 (scenarios 1-3).
 */

const SEX_VALUES = ['M', 'F', 'Other'] as const;

/**
 * Cross-field GPS coordinate pairing (design.md §4.1, FR-2 scenario 3).
 *
 * `@IsOptional()` on `gpsLatitude`/`gpsLongitude` means class-validator skips
 * EVERY decorator on that property — this one included — when the property's
 * own value is null/undefined. That is exactly the behaviour this rule needs:
 * when a coordinate is present, this decorator runs (because `@IsOptional()`
 * let it through) and checks that its PAIR is also present; when a
 * coordinate is absent, this decorator does not run on that property, but it
 * DOES run on the other one if that one is present — so an exactly-one-of-two
 * submission always produces exactly one violation, on whichever field the
 * applicant supplied. Both blank: neither decorator runs, no violation. Both
 * present: both decorators run and both find their pair, no violation.
 *
 * Two independent `@IsOptional()` fields cannot express "exactly one of two
 * is rejected" (design.md §4.1) — this is the mechanism that fills the gap.
 */
function RequiresPairedCoordinate(
  pairedProperty: 'gpsLatitude' | 'gpsLongitude',
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'requiresPairedCoordinate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [pairedProperty],
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const [otherProperty] = args.constraints as [string];
          const otherValue = (args.object as Record<string, unknown>)[otherProperty];
          return otherValue !== undefined && otherValue !== null;
        },
        defaultMessage(args: ValidationArguments): string {
          const [otherProperty] = args.constraints as [string];
          return `${args.property} cannot be provided without ${otherProperty} (and vice versa)`;
        },
      },
    });
  };
}

/**
 * The applicant's consent acceptance (design.md §3.1's `consent:
 * {accepted, policyVersion}`; requirements.md FR-3). Nested under
 * `RegistrationCreateDto.consent`.
 *
 * **`@ValidateNested()` + `@Type()` on the parent are what make this class's
 * decorators run at all.** The production pipe runs `whitelist: true`
 * (`validation-pipe.ts:93-95`), which strips any nested property that isn't
 * declared via `@Type()`-driven class-transformation — without it,
 * `consent.accepted` reaches the service as `undefined` and every submission
 * would 400 regardless of what the applicant actually sent (B33).
 *
 * The semantic check — `accepted === true` AND `policyVersion` is a known,
 * still-accepted version — is service-side (T-10, design.md §4.1 step 4).
 * This DTO validates shape only: a boolean and a non-empty, bounded string.
 */
export class ConsentInputDto {
  @IsBoolean()
  accepted!: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  policyVersion!: string;
}

/**
 * The submission payload (design.md §4.1's field table, transcribed field
 * for field — not mirrored from `ActorCreateDto`/`AdminActorCreateDto`).
 *
 * Deliberately omitted, per §4.1:
 * - `email` (S-6) — the top-level, OTP-verified `RegistrationCreateDto.email`
 *   is the ONE address: stored as `submitterEmail`, published as `Actor.email`
 *   on approval, used for every notification. A second, payload-level `email`
 *   would create an address that could be published without ever being
 *   verified.
 * - `traderId` — server-derived at approval (design.md §4.5), never
 *   applicant-supplied.
 * - `consentStatus` / `consentMethod` / `consentObtainedAt` / `consentReference`
 *   — the `Actor`-level consent PROVENANCE fields, server-set at approval
 *   from the applicant's verified `consent` input (not this payload). Not to
 *   be confused with `RegistrationCreateDto.consent`, which the applicant
 *   DOES submit.
 * - `gpsAltitude` / `gpsAccuracy` — not collected from applicants.
 */
export class RegistrationPayloadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  traderName!: string;

  @IsString()
  @IsIn(TRADER_TYPES as readonly string[])
  traderType!: string;

  /** Review context only — never published (design.md §4.6 step 3). */
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  contactPerson!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  marketLocation?: string;

  @IsOptional()
  @IsIn(SEX_VALUES as readonly string[])
  sex?: string;

  @IsString()
  @IsIn(CANONICAL_REGIONS as readonly string[])
  region!: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @RequiresPairedCoordinate('gpsLongitude')
  gpsLatitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @RequiresPairedCoordinate('gpsLatitude')
  gpsLongitude?: number;

  /** Required here, unlike `AdminActorCreateDto.crops` (C-13). */
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(CROP_NAMES as readonly string[], { each: true })
  @ArrayUnique()
  crops!: string[];

  /** Review context only — never published (design.md §4.6 step 3). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  otherCrops?: string;

  @IsNumber()
  @Min(0)
  capacityTons!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  phone!: string;
}

/**
 * `POST /registrations` request body (design.md §3.1): the OTP-verified
 * `email`, the `code` being redeemed, the applicant's `consent`, and the
 * submission `payload`. Both nested objects carry `@ValidateNested()` +
 * `@Type()` for the B33 whitelist reason documented on `ConsentInputDto`.
 */
export class RegistrationCreateDto {
  /**
   * `@MaxLength(191)` (T-10 sibling fix to T-8's `RegistrationVerifyDto`):
   * `@IsEmail()` alone admits addresses up to 254 characters (RFC 5321), but
   * this value is persisted as `Registration.submitterEmail` — a bare Prisma
   * `String` column, `VARCHAR(191)` on MySQL. Without this bound, a
   * WELL-FORMED 200-character address would pass `@IsEmail()`, reach
   * `submitRegistration`'s insert, and MySQL would raise error 1406 (data
   * too long) — a `500` on a public path where `design.md` §3.1 promises
   * only `400`/`429`. 191 matches the column width exactly.
   */
  @IsEmail()
  @MaxLength(191)
  email!: string;

  /** 6-digit CSPRNG OTP (design.md §4.3). Match/expiry/consumption is T-7/T-10. */
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit numeric code' })
  code!: string;

  @ValidateNested()
  @Type(() => ConsentInputDto)
  consent!: ConsentInputDto;

  @ValidateNested()
  @Type(() => RegistrationPayloadDto)
  payload!: RegistrationPayloadDto;
}
