import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { ConsentMethod } from '@prisma/client';

/**
 * T-1 — Bulk set-consent (lock/unlock) request body.
 *
 * The `ids` array is validated as non-empty, unique, bounded, and composed of
 * strings to protect the Lambda invocation and produce clean per-id results.
 * `acknowledged` is required server-side when unlocking (`GRANTED`) because
 * publishing PII + GPS demands an explicit consent confirmation (FR-4).
 *
 * T-4 — `consentMethod` + `consentObtainedAt` carry the BATCH-level provenance
 * applied to actors in the selection whose own `consentMethod` is
 * `NOT_RECORDED` (DD-4 option d) — actors that already carry their own
 * evidence keep it untouched. These fields are only SHAPE-validated here
 * (enum membership, date format, not-in-the-future); whether they are
 * *required* for a given write is decided by `isConsentProvenanceSatisfied`
 * in `ActorsAdminService.bulkSetConsent` (FR-3, NFR-7), mirroring
 * `ActorCreateDto`'s precedent rather than a DTO-level "required" decorator.
 *
 * Design refs: `docs/specs/admin/bulk-actor-operations/design.md` §3;
 * `docs/specs/actors/registration-source-and-consent/design.md` §4.2, §4.3, DD-4.
 * Requirements: FR-3, FR-4, FR-8, NFR-1, NFR-4, NFR-7.
 */

const CONSENT_STATUSES = ['GRANTED', 'DENIED'] as const;
const MAX_BATCH_SIZE = 500;
const CONSENT_METHOD_VALUES = Object.values(ConsentMethod);

/**
 * T-4 — Rejects a date string later than "now" (FR-2's not-in-the-future
 * rule, applied to the batch's `consentObtainedAt`). Duplicated in miniature
 * from `actor-create.dto.ts`'s `IsNotFutureDate` (not exported there) rather
 * than importing across files outside this task's scope.
 */
function IsNotFutureDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNotFutureDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          const parsed = new Date(value);
          return !Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now();
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must not be a future date`;
        },
      },
    });
  };
}

export class BulkConsentDto {
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(MAX_BATCH_SIZE)
  @IsString({ each: true })
  ids!: string[];

  @IsIn(CONSENT_STATUSES as readonly string[])
  consentStatus!: string;

  @IsOptional()
  @IsBoolean()
  acknowledged?: boolean;

  /**
   * T-4 — Batch consent method (FR-2). Required-when-`GRANTED` is enforced
   * service-side, not here (see class doc comment).
   */
  @IsOptional()
  @IsIn(CONSENT_METHOD_VALUES)
  consentMethod?: ConsentMethod;

  /** T-4 — Batch consent date (FR-2); must not be in the future. */
  @IsOptional()
  @IsDateString()
  @IsNotFutureDate()
  consentObtainedAt?: string;

  /**
   * T-4 — Batch free-text evidence pointer (FR-2). Applied only to the
   * actors the batch actually fills (DD-4); optional even when granting.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  consentReference?: string;
}
