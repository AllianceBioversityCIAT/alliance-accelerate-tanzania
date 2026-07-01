// @sdd-spec admin/user-management (T-2)
import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { ASSIGNABLE_ROLES, AssignableRole } from '../users.constants';

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
  /** New user's email (also the Cognito sign-in alias). */
  @IsEmail()
  email!: string;

  /** Optional group to add the user to — omit for Public (no group). */
  @IsOptional()
  @IsString()
  @IsIn(ASSIGNABLE_ROLES as readonly string[])
  role?: AssignableRole;
}
