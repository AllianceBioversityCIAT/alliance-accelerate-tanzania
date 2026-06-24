/**
 * Auth role + request-user types shared across the auth guards/decorators.
 *
 * Role is authoritative ONLY from the verified `cognito:groups` claim (NFR-1);
 * `Public` is an authenticated-but-ungrouped caller (anonymous callers never
 * reach a guarded route). `Admin ≥ Staff` is enforced in the RolesGuard, not
 * encoded here.
 */
export type Role = 'Public' | 'Staff' | 'Admin';

/** Roles that can be required via `@Roles()` (Public is never a requirement). */
export type RequiredRole = Exclude<Role, 'Public'>;

/** Verified identity attached to `req.user` by {@link JwtAuthGuard}. */
export interface AuthUser {
  sub: string;
  username: string;
  email?: string;
  groups: string[];
  role: Role;
}

/**
 * Map verified Cognito groups → app role: `admin` wins over `staff`, any other
 * (or empty) is `Public`. Pure + case-sensitive to the Cognito group names
 * (`admin`/`staff`).
 */
export function roleFromGroups(groups: string[] | undefined): Role {
  if (groups?.includes('admin')) return 'Admin';
  if (groups?.includes('staff')) return 'Staff';
  return 'Public';
}
