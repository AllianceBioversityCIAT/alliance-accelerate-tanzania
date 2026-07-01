// @sdd-spec admin/user-management (T-2)
import { IsBoolean, IsEmail, IsOptional } from 'class-validator';

/**
 * T-2 — Validated write DTO for `PATCH /api/v1/users/:id` (design §3, FR-4).
 *
 * Both fields are optional so an admin can update the email attribute, toggle
 * enable/disable, or both. The global `ValidationPipe({ whitelist })` strips any
 * unknown property; malformed values are rejected (→ 400).
 *
 * Scope note: authored in isolation (T-2). Controller/service wiring is T-3/T-4.
 */
export class UpdateUserDto {
  /** New email attribute, validated when present (FR-4). */
  @IsOptional()
  @IsEmail()
  email?: string;

  /** Enable/disable the account (Cognito `AdminEnable/DisableUser`). */
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
