import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';
import { AuthUser, RequiredRole } from './auth.types';

/**
 * Authorizes a route by the `@Roles()` requirement, reading the verified
 * `req.user` populated by {@link JwtAuthGuard} (which MUST run first). Passes
 * when the caller's role is in the required set, or is `Admin` while `Staff` is
 * required (Admin ≥ Staff). A route with no `@Roles()` requirement passes any
 * authenticated caller. An under-privileged caller gets `403`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const role = req.user?.role;
    const allowed =
      role !== undefined &&
      (required.includes(role as RequiredRole) ||
        (role === 'Admin' && required.includes('Staff')));
    if (!allowed) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
