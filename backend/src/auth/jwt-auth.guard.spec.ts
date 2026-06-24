import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { getJwtVerifier } from './jwt-verifier';
import { AuthUser } from './auth.types';

jest.mock('./jwt-verifier');

const mockedGetVerifier = getJwtVerifier as jest.MockedFunction<
  typeof getJwtVerifier
>;

/**
 * JwtAuthGuard — authenticates from `Authorization: Bearer` via the mocked
 * verifier (FR-5). Valid → `req.user` populated with the claim-derived role;
 * missing header or a verify rejection → 401. A forged role in the body/header
 * is ignored: role comes only from the verified `cognito:groups` (FR-6).
 */
describe('JwtAuthGuard (mocked verifier)', () => {
  let guard: JwtAuthGuard;
  let verify: jest.Mock;

  beforeEach(() => {
    guard = new JwtAuthGuard();
    verify = jest.fn();
    mockedGetVerifier.mockReturnValue({ verify } as never);
  });

  function contextFor(
    req: Record<string, unknown>,
  ): { ctx: ExecutionContext; req: Record<string, unknown> } {
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return { ctx, req };
  }

  it('verifies a valid token and attaches req.user with the mapped role', async () => {
    verify.mockResolvedValue({
      sub: 'sub-1',
      username: 'jane',
      email: 'jane@example.com',
      'cognito:groups': ['staff'],
    });
    const { ctx, req } = contextFor({
      headers: { authorization: 'Bearer good.token' },
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('good.token');
    const user = (req as { user: AuthUser }).user;
    expect(user).toEqual({
      sub: 'sub-1',
      username: 'jane',
      email: 'jane@example.com',
      groups: ['staff'],
      role: 'Staff',
    });
  });

  it('derives role only from the verified claim, ignoring a forged body/header role', async () => {
    verify.mockResolvedValue({ sub: 'sub-2', 'cognito:groups': ['admin'] });
    const { ctx, req } = contextFor({
      headers: { authorization: 'Bearer t', 'x-role': 'Admin-forged' },
      body: { role: 'Admin' },
    });

    await guard.canActivate(ctx);
    expect((req as { user: AuthUser }).user.role).toBe('Admin');
  });

  it('falls back username → sub and defaults groups to [] (→ Public)', async () => {
    verify.mockResolvedValue({ sub: 'sub-3' });
    const { ctx, req } = contextFor({
      headers: { authorization: 'Bearer t' },
    });

    await guard.canActivate(ctx);
    const user = (req as { user: AuthUser }).user;
    expect(user.username).toBe('sub-3');
    expect(user.groups).toEqual([]);
    expect(user.role).toBe('Public');
  });

  it('throws 401 when the Authorization header is missing', async () => {
    const { ctx } = contextFor({ headers: {} });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it('throws 401 when the scheme is not Bearer', async () => {
    const { ctx } = contextFor({
      headers: { authorization: 'Basic abc' },
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws 401 when the verifier rejects (expired/invalid/wrong-aud)', async () => {
    verify.mockRejectedValue(new Error('token expired'));
    const { ctx } = contextFor({
      headers: { authorization: 'Bearer bad.token' },
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
