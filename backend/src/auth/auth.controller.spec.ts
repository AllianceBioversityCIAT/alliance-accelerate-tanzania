import { AuthController } from './auth.controller';
import { AuthUser } from './auth.types';

/**
 * AuthController — proof endpoints (FR-7). `/auth/me` returns the mapped
 * identity shape (role from the verified claim only). The guards themselves are
 * unit-tested separately; here the controller is exercised directly with the
 * `req.user` a passed JwtAuthGuard would have attached.
 */
describe('AuthController', () => {
  const controller = new AuthController();

  const user: AuthUser = {
    sub: 'sub-1',
    username: 'jane',
    email: 'jane@example.com',
    groups: ['admin'],
    role: 'Admin',
  };

  it('GET /auth/me returns sub/username/email/role/groups from the verified user', () => {
    expect(controller.me(user)).toEqual({
      sub: 'sub-1',
      username: 'jane',
      email: 'jane@example.com',
      role: 'Admin',
      groups: ['admin'],
    });
  });

  it('GET /auth/me reflects only the claim-derived role (a forged role never reaches here)', () => {
    // The guard maps role from cognito:groups before the handler runs; the
    // controller simply echoes user.role, so Public stays Public.
    const publicUser: AuthUser = {
      sub: 's',
      username: 's',
      groups: [],
      role: 'Public',
    };
    expect(controller.me(publicUser).role).toBe('Public');
    expect(controller.me(publicUser).email).toBeUndefined();
  });

  it('GET /auth/protected returns { ok, role } for the (guarded) Staff caller', () => {
    const staff: AuthUser = {
      sub: 's',
      username: 's',
      groups: ['staff'],
      role: 'Staff',
    };
    expect(controller.protected(staff)).toEqual({ ok: true, role: 'Staff' });
  });
});
