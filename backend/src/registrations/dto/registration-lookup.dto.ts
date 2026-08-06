// @sdd-spec actors/public-self-registration (T-11)
/**
 * T-11 — Validated request body for `POST /registrations/lookup` (FR-6,
 * design.md §3.1 decision 3 / C-11): a BODY, not a query string, because an
 * email in a URL reaches request lines, `Referer`, browser history, and any
 * access log later enabled — egress paths this module's own logging
 * (`design.md` §4.10) structurally cannot see either.
 *
 * `design.md` §3.1's endpoint table lists this route's Errors as `404
 * identical for both failure modes · 429` — no `400` — but that describes
 * the two content-dependent failure modes FR-6/L-2 name (reference absent,
 * email mismatch), not a blanket promise that malformed input never `400`s.
 * A shape failure here happens identically for ANY malformed body,
 * regardless of what it contains, entirely BEFORE `RegistrationsService`
 * ever runs a lookup — exactly like `RegistrationVerifyDto`'s `@IsEmail()`
 * `400`s ahead of any per-email decision in `POST /verify` (design.md §3.1
 * decision 1). It discloses nothing about any reference or address, so it is
 * not part of the oracle surface L-2 protects and is validated with the
 * same class-validator + global-pipe convention every other DTO in this
 * module uses.
 */
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegistrationLookupDto {
  /**
   * Bounded, not format-checked against `REG-<year>-<seq>`: a malformed or
   * unknown reference simply matches no row and falls into the identical
   * `404` `RegistrationsService.lookupRegistration` returns for every
   * content-dependent failure — a stricter pattern check here would add a
   * second place that guarantee could drift from. The bound itself is only
   * abuse-defence (an absurdly long string reaching a `WHERE` clause), sized
   * generously above the longest reference this registry can ever emit
   * (`registration-reference.util.ts`'s format widens rather than
   * truncating a 5+-digit sequence).
   */
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  reference!: string;

  /**
   * `@MaxLength(191)` matches `Registration.submitterEmail`'s bare Prisma
   * `String` column width (`VARCHAR(191)` on MySQL) — the same reasoning
   * `RegistrationVerifyDto` already records for its own email field, so an
   * over-long but well-formed address cannot reach a comparison against a
   * column it could never have been stored in.
   */
  @IsEmail()
  @MaxLength(191)
  email!: string;
}
