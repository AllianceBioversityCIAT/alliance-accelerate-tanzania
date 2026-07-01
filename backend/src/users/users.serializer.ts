// @sdd-spec admin/user-management (T-2)
/**
 * T-2 — Admin-user serializer (design §2, FR-10): the ONLY exit through which a
 * raw Cognito user object becomes an API response.
 *
 * Built by EXPLICIT field allowlist (NOT spread + delete), mirroring the actors
 * role-aware serializer: the output object is constructed field-by-field, so no
 * Cognito attribute, password, temporary-password, or other secret can ever leak
 * into a response — they are simply never written. `roles` is derived from the
 * caller-provided group-name list, filtered to the two assignable groups.
 *
 * Design refs: design.md §2 (`AdminUser` shape), §3 (FR-10), §6 (no secret
 * leakage). Requirement: requirements.md FR-10.
 */

import { ASSIGNABLE_ROLES, AssignableRole } from './users.constants';

/**
 * The design §2 public projection of a Cognito user — the contract returned by
 * every `UsersController` route. No password / temporary-password / secret field
 * exists on this type by construction.
 */
export interface AdminUser {
  id: string;
  email: string;
  status: string;
  enabled: boolean;
  roles: ('admin' | 'staff')[];
  createdAt: string;
  updatedAt: string;
}

/** A Cognito attribute name/value pair (`AttributeType` shape). */
interface CognitoAttribute {
  Name?: string;
  Value?: string;
}

/**
 * The Cognito user shape the serializer ACCEPTS — the common subset of
 * `UserType` (from `ListUsers`) and `AdminGetUserCommandOutput`. Declared here so
 * the serializer can RECEIVE the full Cognito object and provably emit only the
 * allowlisted fields. No secret field is read.
 */
export interface SerializableCognitoUser {
  Username?: string;
  Attributes?: CognitoAttribute[];
  UserStatus?: string;
  Enabled?: boolean;
  UserCreateDate?: Date;
  UserLastModifiedDate?: Date;
}

/**
 * Project a raw Cognito user onto the §2 `AdminUser` shape (FR-10).
 *
 * Built by explicit field PICK — `id` from `Username`, `email` from the email
 * attribute, `status` from `UserStatus`, `enabled` from `Enabled`, timestamps as
 * ISO strings, and `roles` from `groups` filtered to the assignable set. Any
 * password/secret field on the input is never referenced and so cannot appear.
 *
 * @param user   Cognito `UserType` / `AdminGetUserCommandOutput`.
 * @param groups Group names the user belongs to (e.g. from
 *               `AdminListGroupsForUser`); filtered to `admin`/`staff`.
 */
export function toAdminUser(
  user: SerializableCognitoUser,
  groups: string[],
): AdminUser {
  return {
    id: user.Username ?? '',
    email: findEmail(user.Attributes),
    status: user.UserStatus ?? '',
    enabled: user.Enabled ?? false,
    roles: filterRoles(groups),
    createdAt: toIso(user.UserCreateDate),
    updatedAt: toIso(user.UserLastModifiedDate),
  };
}

/** Find the `email` attribute value, or `''` when absent. */
function findEmail(attributes: CognitoAttribute[] | undefined): string {
  if (!attributes) return '';
  const match = attributes.find((attr) => attr.Name === 'email');
  return match?.Value ?? '';
}

/** Keep only the assignable group names, de-duplicated and order-stable. */
function filterRoles(groups: string[]): AssignableRole[] {
  return ASSIGNABLE_ROLES.filter((role) => groups.includes(role));
}

/** Render a Cognito `Date` as an ISO-8601 string, or `''` when absent. */
function toIso(value: Date | undefined): string {
  return value ? value.toISOString() : '';
}
