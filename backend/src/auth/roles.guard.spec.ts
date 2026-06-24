import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { AuthUser, Role } from './auth.types';

/**
 * RolesGuard — authorizes against the `@Roles()` requirement using the verified
 * `req.user` from JwtAuthGuard (FR-6). `@Roles('Staff')` allows Staff and Admin
 * (Admin ≥ Staff), denies Public (403). No requirement → any authenticated
 * caller passes.
 */
describe('RolesGuard', () => {
  function makeGuard(required: string[] | undefined): RolesGuard {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  function contextFor(role: Role | undefined): ExecutionContext {
    const user = role ? ({ role } as AuthUser) : undefined;
    return {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  it('allows Staff on a @Roles("Staff") route', () => {
    expect(makeGuard(['Staff']).canActivate(contextFor('Staff'))).toBe(true);
  });

  it('allows Admin on a @Roles("Staff") route (Admin ≥ Staff)', () => {
    expect(makeGuard(['Staff']).canActivate(contextFor('Admin'))).toBe(true);
  });

  it('denies Public on a @Roles("Staff") route with 403', () => {
    expect(() =>
      makeGuard(['Staff']).canActivate(contextFor('Public')),
    ).toThrow(ForbiddenException);
  });

  it('denies Staff on a @Roles("Admin") route with 403', () => {
    expect(() =>
      makeGuard(['Admin']).canActivate(contextFor('Staff')),
    ).toThrow(ForbiddenException);
  });

  it('passes any authenticated caller when no @Roles() requirement is set', () => {
    expect(makeGuard(undefined).canActivate(contextFor('Public'))).toBe(true);
    expect(makeGuard([]).canActivate(contextFor('Public'))).toBe(true);
  });
});
