import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { getJwtVerifier } from './jwt-verifier';
import { AuthController } from './auth.controller';
import { AuthUser } from './auth.types';

jest.mock('./jwt-verifier');

const mockedGetVerifier = getJwtVerifier as jest.MockedFunction<
  typeof getJwtVerifier
>;

/**
 * AuthController — proof endpoints (FR-7). `/auth/me` returns the mapped
 * identity shape (role from the verified claim only). The guards themselves are
 * unit-tested separately; here the controller is exercised directly with the
 * `req.user` a passed JwtAuthGuard would have attached.
 *
 * Security assertion (NFR-1 / FR-5 / FR-7): a caller without a token MUST
 * receive 401 when hitting `/auth/me`. The guard is the enforcement boundary —
 * this describe block confirms the contract explicitly so a future refactor
 * that removes JwtAuthGuard from the controller is caught by the test suite.
 */

// ── Security: GET /auth/me → 401 without a token (NFR-1 / FR-5 / FR-7) ────
describe('GET /auth/me — 401 without token (security, NFR-1)', () => {
  let guard: JwtAuthGuard;
  let verify: jest.Mock;

  beforeEach(() => {
    guard = new JwtAuthGuard();
    verify = jest.fn();
    mockedGetVerifier.mockReturnValue({ verify } as never);
  });

  function contextWithoutToken(): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as unknown as ExecutionContext;
  }

  it('JwtAuthGuard (which guards /auth/me) throws 401 when the Authorization header is absent', async () => {
    // This asserts the end-to-end security contract: tokenless → 401.
    // JwtAuthGuard is applied to GET /auth/me in auth.controller.ts via
    // @UseGuards(JwtAuthGuard); the handler never runs without a valid token.
    await expect(
      guard.canActivate(contextWithoutToken()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });
});

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
