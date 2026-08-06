// @sdd-spec actors/public-self-registration (T-8)
/**
 * T-8 — Validated request body for `POST /registrations/verify` (FR-4).
 *
 * `@IsEmail()` is the primary rule: malformed input must `400` (Done-when),
 * but nothing about a WELL-FORMED address branches the response —
 * `EmailVerificationService.issueCode` normalizes (trim + lowercase)
 * internally, and this endpoint never queries for whether the address is
 * already known to the registry (FR-8's membership-oracle scenario).
 * Keeping this DTO to exactly the shape the requirement needs, rather than
 * mirroring `RegistrationCreateDto`'s email handling, is deliberate: there
 * is no second field here to omit or get wrong (unlike T-9's `S-6`).
 *
 * `@MaxLength(191)` (rework attempt 2, FAIL — required, no id given): `class-
 * validator`'s `@IsEmail()` admits addresses up to 254 characters (RFC
 * 5321), but `EmailVerification.email` and `EmailSendBudget.email` are both
 * bare Prisma `String` columns on MySQL, which default to `VARCHAR(191)`.
 * Without this bound, a WELL-FORMED 200-character address would pass
 * `@IsEmail()`, reach `issueCode`'s insert, and MySQL would raise error 1406
 * (data too long) — a `500` on a public path where design.md §3.1 promises
 * only `400`/`429`. 191 matches the column width exactly, so nothing longer
 * than what could ever be stored is accepted.
 */
import { IsEmail, MaxLength } from 'class-validator';

export class RegistrationVerifyDto {
  @IsEmail()
  @MaxLength(191)
  email!: string;
}
