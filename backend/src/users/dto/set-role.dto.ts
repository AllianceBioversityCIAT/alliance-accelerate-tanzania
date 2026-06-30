// @sdd-spec admin/user-management (T-2)
import { IsIn } from 'class-validator';

/**
 * T-2 — Validated write DTO for `PATCH /api/v1/users/:id/role` (design §3,
 * FR-5/FR-8).
 *
 * `none` is the explicit "demote to Public" value (remove all assignable
 * groups). Membership is enforced against the role taxonomy so the write
 * contract cannot drift from the group set the service manages.
 *
 * Scope note: authored in isolation (T-2). Controller/service wiring is T-3/T-4.
 */

const SETTABLE_ROLES = ['admin', 'staff', 'none'] as const;

export class SetRoleDto {
  /** Target role; `none` demotes the user to Public (FR-5/FR-8). */
  @IsIn(SETTABLE_ROLES as readonly string[])
  role!: string;
}
