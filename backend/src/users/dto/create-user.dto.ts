// @sdd-spec admin/user-management (T-2)
// @sdd-spec bugfix/email-case-normalization
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { ASSIGNABLE_ROLES, AssignableRole } from '../users.constants';

/**
 * Normalize an email to a canonical lowercase, trimmed form. The Cognito pool is
 * case-SENSITIVE (UsernameConfiguration unset — immutable), so `Daniela.Gomez@x`
 * and `daniela.gomez@x` would otherwise be different sign-in identities. Storing
 * every email lowercase (paired with lowercasing at sign-in) makes login
 * case-insensitive in practice. Non-strings pass through for the validator to reject.
 */
const toLowerEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/**
 * T-2 — Validated write DTO for `POST /api/v1/users` (design §3, FR-3).
 *
 * Per the project rule every write goes through a `class-validator` DTO so
 * malformed input is rejected (→ 400 under the global `ValidationPipe`), never
 * silently coerced. `role` is optional — omitting it creates a Public user (no
 * group membership); when present it must be one of the two assignable groups.
 *
 * Scope note: authored in isolation (T-2). Controller/service wiring is T-3/T-4.
 */

export class CreateUserDto {
  /** New user's email (also the Cognito sign-in alias). Normalized to lowercase. */
  @Transform(toLowerEmail)
  @IsEmail()
  email!: string;

  /** Optional group to add the user to — omit for Public (no group). */
  @IsOptional()
  @IsString()
  @IsIn(ASSIGNABLE_ROLES as readonly string[])
  role?: AssignableRole;
}
