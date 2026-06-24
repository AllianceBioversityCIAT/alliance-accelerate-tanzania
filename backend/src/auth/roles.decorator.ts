import { SetMetadata } from '@nestjs/common';
import { RequiredRole } from './auth.types';

/** Metadata key the {@link RolesGuard} reads required roles from. */
export const ROLES_KEY = 'roles';

/**
 * Restrict a route to the given roles (e.g. `@Roles('Staff')`). `Admin`
 * satisfies any `Staff` requirement (Admin ≥ Staff) — enforced in the guard.
 * Must be paired with `JwtAuthGuard` (which runs first to populate `req.user`).
 */
export const Roles = (...roles: RequiredRole[]) => SetMetadata(ROLES_KEY, roles);
