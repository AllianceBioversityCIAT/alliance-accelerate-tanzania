// @sdd-spec admin/user-management (T-5)
/**
 * T-5 (B) — RBAC matrix e2e for `/api/v1/users` (FR-9).
 *
 * Goal: prove every `/api/v1/users` route is Admin-only over the REAL HTTP →
 * guard stack. The guard is declared CLASS-LEVEL on the controller
 * (`@UseGuards(JwtAuthGuard, RolesGuard) @Roles('Admin')`), so it applies
 * uniformly to all 7 routes; we therefore exercise a representative GET, POST
 * and DELETE rather than all routes.
 *
 * Seams: the JWT verifier is mocked (`getJwtVerifier`) so the REAL `JwtAuthGuard`
 * and REAL `RolesGuard` run end to end — a token's role is whatever the mocked
 * verifier returns via `cognito:groups`. `UsersService` is mocked so no Cognito
 * is touched; the focus is purely the RBAC layer. The app mirrors production
 * bootstrap (`api/v1` prefix + shared `createValidationPipe()`).
 *
 * Naming convention (bugfix/dead-e2e-tests): e2e suites are named
 * `*.e2e.spec.ts` (dot). The Jest `testRegex` also collects the NestJS
 * scaffold default `*.e2e-spec.ts` defensively — this file was originally
 * named with the hyphen and was silently never collected.
 *
 * Matrix per route:
 *  - no token / invalid token → 401 (JwtAuthGuard)
 *  - authenticated Staff and Public → 403 (RolesGuard, @Roles('Admin'))
 *  - authenticated Admin → 2xx (service mocked)
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { getJwtVerifier } from '../auth/jwt-verifier';
import { resetJwtVerifier } from '../auth/jwt-verifier';
import { createValidationPipe } from '../common/validation-pipe';

jest.mock('../auth/jwt-verifier');

const mockedGetVerifier = getJwtVerifier as jest.MockedFunction<
  typeof getJwtVerifier
>;

/** Map a chosen role to the bearer token the mocked verifier will accept. */
const TOKENS = {
  Admin: 'token-admin',
  Staff: 'token-staff',
  Public: 'token-public',
} as const;

/** What the mocked verifier returns for each known good token (by groups). */
const CLAIMS: Record<string, Record<string, unknown>> = {
  [TOKENS.Admin]: { sub: 'admin-sub', 'cognito:groups': ['admin'] },
  [TOKENS.Staff]: { sub: 'staff-sub', 'cognito:groups': ['staff'] },
  [TOKENS.Public]: { sub: 'public-sub', 'cognito:groups': [] },
};

describe('Users RBAC matrix (HTTP e2e, mocked verifier + service)', () => {
  let app: INestApplication;

  /** A UsersService double — every method resolves so any reachable route 2xx's. */
  const usersServiceMock: Partial<Record<keyof UsersService, jest.Mock>> = {
    list: jest.fn().mockResolvedValue({ users: [], paginationToken: undefined }),
    get: jest.fn().mockResolvedValue({ id: 'x' }),
    create: jest.fn().mockResolvedValue({
      user: { id: 'created' },
      temporaryPassword: 'Temp-Pass-16chars',
    }),
    update: jest.fn().mockResolvedValue({ id: 'x' }),
    setRole: jest.fn().mockResolvedValue({ id: 'x' }),
    remove: jest.fn().mockResolvedValue(undefined),
    resetPassword: jest
      .fn()
      .mockResolvedValue({ temporaryPassword: 'Temp-Pass-16chars' }),
  };

  beforeAll(async () => {
    // Real JwtAuthGuard verifies via this mock: known token → its claims,
    // anything else → reject (→ 401), mirroring an expired/forged token.
    const verify = jest.fn(async (token: string) => {
      const claims = CLAIMS[token];
      if (!claims) throw new Error('invalid token');
      return claims;
    });
    mockedGetVerifier.mockReturnValue({ verify } as never);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersServiceMock }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    resetJwtVerifier();
  });

  const bearer = (role: keyof typeof TOKENS): string =>
    `Bearer ${TOKENS[role]}`;

  // Representative routes: a GET, a POST, a DELETE. The guard is class-level,
  // so these stand in for the whole controller surface.
  describe('GET /api/v1/users', () => {
    it('401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/v1/users').expect(401);
    });

    it('401 with an invalid/expired token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('403 for authenticated Staff', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', bearer('Staff'))
        .expect(403);
    });

    it('403 for authenticated Public', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', bearer('Public'))
        .expect(403);
    });

    it('200 for authenticated Admin', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', bearer('Admin'))
        .expect(200);
      expect(usersServiceMock.list).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/users', () => {
    const body = { email: 'new@example.com' };

    it('401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(body)
        .expect(401);
    });

    it('403 for authenticated Staff', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', bearer('Staff'))
        .send(body)
        .expect(403);
    });

    it('403 for authenticated Public', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', bearer('Public'))
        .send(body)
        .expect(403);
    });

    it('201 for authenticated Admin with a { user, temporaryPassword } body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', bearer('Admin'))
        .send(body)
        .expect(201);
      expect(usersServiceMock.create).toHaveBeenCalled();
      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('temporaryPassword');
      expect(typeof res.body.temporaryPassword).toBe('string');
    });
  });

  describe('DELETE /api/v1/users/:id', () => {
    it('401 without a token', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/users/some-id')
        .expect(401);
    });

    it('403 for authenticated Staff', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/users/some-id')
        .set('Authorization', bearer('Staff'))
        .expect(403);
    });

    it('403 for authenticated Public', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/users/some-id')
        .set('Authorization', bearer('Public'))
        .expect(403);
    });

    it('204 for authenticated Admin', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/users/some-id')
        .set('Authorization', bearer('Admin'))
        .expect(204);
      expect(usersServiceMock.remove).toHaveBeenCalled();
    });
  });

  // FR-7 reset (POST :id/password) — same class-level guard, but unlike the
  // other writes it returns 200 with a `{ temporaryPassword }` body (no-email
  // admin-mediated handoff), so it also asserts the status/body contract.
  describe('POST /api/v1/users/:id/password', () => {
    it('401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users/some-id/password')
        .expect(401);
    });

    it('403 for authenticated Staff', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users/some-id/password')
        .set('Authorization', bearer('Staff'))
        .expect(403);
    });

    it('403 for authenticated Public', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users/some-id/password')
        .set('Authorization', bearer('Public'))
        .expect(403);
    });

    it('200 with { temporaryPassword } for authenticated Admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users/some-id/password')
        .set('Authorization', bearer('Admin'))
        .expect(200);
      expect(res.body).toEqual({ temporaryPassword: 'Temp-Pass-16chars' });
      expect(usersServiceMock.resetPassword).toHaveBeenCalledWith('some-id');
    });
  });
});
