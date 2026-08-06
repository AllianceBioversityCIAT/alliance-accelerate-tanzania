import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Shared `class-validator` decorators for consent-date fields (FR-2).
 *
 * Bugfix (validation-report.md R-2/E-1, delta round item 1) — these two
 * validators used to be duplicated verbatim across `actor-create.dto.ts`
 * (`consentObtainedAt`, single-actor create/update) and
 * `bulk-consent.dto.ts` (`consentObtainedAt`, bulk set-consent). Per NFR-7 /
 * DD-1 ("exactly one implementation" of a shared invariant), two copies of
 * "what counts as a valid consent date" is exactly the drift class those
 * govern — a future edit to one copy and not the other would silently
 * diverge what "valid" means between the two write paths. Both DTOs now
 * import from here instead.
 */

/**
 * Rejects a date string later than "now" (FR-2: "IT MUST reject a
 * consentObtainedAt in the future with a 400"). Applied alongside
 * `@IsDateString()`, which validates the string is a well-formed date in the
 * first place; this decorator only adds the not-in-the-future constraint.
 *
 * Behaviour unchanged from the two prior copies (`actor-create.dto.ts` T-3,
 * `bulk-consent.dto.ts` T-4) — moved here verbatim, not rewritten.
 */
export function IsNotFutureDate(validationOptions?: ValidationOptions) {
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

/**
 * Bugfix (validation-report.md R-2/E-1) — `@IsDateString()` (`class-validator`'s
 * `isISO8601`) accepts a bare date-only string like `"2026-01-15"` as valid,
 * but neither DTO carries a `@Type(() => Date)`/`@Transform`, so a date-only
 * value reaches Prisma untransformed. Prisma's `DateTime` column requires a
 * full instant and raises a `PrismaClientValidationError`. On the single-actor
 * path this is caught and remapped by `mapPrismaError`; on the bulk path there
 * is no try/catch at all, so it propagates as an unhandled 500 either way.
 *
 * Both admin form callers already avoid this (`ActorForm.tsx`'s
 * `dateOnlyToInstant` and `lib/api/actors-admin.ts` build a full RFC-3339
 * instant before sending), and the importer normalizes per row, so this is
 * unreachable through the UI — but reachable by any direct Admin API call,
 * on both the single-actor and bulk write paths. Rather than normalizing
 * server-side (which would add a THIRD copy of the Tanzania-midnight offset
 * convention, on top of the two client-side copies recorded as R-5/A-3), the
 * API contract requires a full instant and this validator says so:
 * `consentObtainedAt` must include a time component, not just a calendar
 * date. `@IsDateString()` is kept alongside this decorator on both DTOs to
 * reject strings that are not a well-formed date at all; this one only adds
 * the "must be a full instant, not date-only" constraint, so a date-only
 * value produces exactly one field-level message (R-10: one message per
 * distinct fault).
 */
export function IsFullInstant(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFullInstant',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          // A bare `YYYY-MM-DD` date-only string has no time component;
          // require the `T` that starts an RFC-3339 date-time.
          return /^\d{4}-\d{2}-\d{2}T/.test(value);
        },
        defaultMessage(args: ValidationArguments): string {
          return (
            `${args.property} must be a full RFC-3339 instant ` +
            '(e.g. 2026-01-15T00:00:00+03:00), not a date-only value'
          );
        },
      },
    });
  };
}
