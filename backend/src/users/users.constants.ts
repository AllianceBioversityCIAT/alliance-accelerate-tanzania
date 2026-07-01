// @sdd-spec admin/user-management (T-3)
/**
 * Single source of truth for the admin-user role taxonomy (design §3, FR-5).
 *
 * `ASSIGNABLE_ROLES` are the two real Cognito groups a user can belong to;
 * `SETTABLE_ROLES` adds the synthetic `none` sentinel meaning "remove from all
 * assignable groups" (demote to Public). DTOs and the serializer import these so
 * the write contract and the projection can never drift from the group set the
 * service manages.
 */

/** The two real Cognito groups a user can be a member of. */
export const ASSIGNABLE_ROLES = ['admin', 'staff'] as const;

/** Assignable groups plus `none` (the explicit demote-to-Public sentinel). */
export const SETTABLE_ROLES = ['admin', 'staff', 'none'] as const;

/** A group a user can be added to. */
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** A role accepted by `setRole` — an assignable group or `none`. */
export type SettableRole = (typeof SETTABLE_ROLES)[number];
