// @sdd-spec actors/public-self-registration (T-4)
/**
 * T-4 — HTTP-level proof that structured request logging is scoped to
 * `RegistrationsModule`'s own controllers and does NOT apply globally
 * (design.md §4.10: "applied to this module's controllers only, not
 * globally"). Boots the real `AppModule` (only `PrismaService` is faked — no
 * DB is reachable here, and this module's wired route never touches Prisma)
 * and hits two real routes in the SAME test: the wired one
 * (`GET /registrations/consent-policy`, from `RegistrationsController`) and
 * an unrelated one in a different module (`GET /health`, from
 * `HealthController`, also unauthenticated). Exactly one line is captured,
 * and its `route` is the registrations one — that asymmetry, proven inside
 * one test rather than as two independent facts, is what a global
 * interceptor/middleware (`APP_INTERCEPTOR`, `app.useGlobalInterceptors`,
 * `forRoutes('*')`) would erase, since it would fire identically on both.
 *
 * A second describe block below proves the attempt-2 fix itself: a
 * guard-rejected request run through the REAL NestJS pipeline still emits a
 * line, because emission lives in `RequestContextMiddleware`
 * (middleware → guards → interceptors → pipes → handler), which registers
 * its `res.on('finish', ...)` listener before any guard gets a chance to
 * throw.
 */
import {
  CanActivate,
  Controller,
  ForbiddenException,
  Get,
  INestApplication,
  Injectable,
  Logger,
  MiddlewareConsumer,
  Module,
  NestModule,
  UseGuards,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { LoggingModule } from './logging.module';
import { RequestContextMiddleware } from './request-context.middleware';

/** Pull just the JSON structured-log lines out of everything a log spy captured. */
function capturedLines(logSpy: jest.SpyInstance): Record<string, unknown>[] {
  return logSpy.mock.calls
    .map((call) => call[0])
    .filter((msg): msg is string => typeof msg === 'string' && msg.startsWith('{'))
    .map((msg) => JSON.parse(msg) as Record<string, unknown>);
}

describe('Structured request logging is scoped to RegistrationsModule only (HTTP e2e)', () => {
  let app: INestApplication;
  let logSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({} as unknown as PrismaService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it(
    "emits exactly ONE structured line, for this module's own route, when both a wired route " +
      '(GET /api/v1/registrations/consent-policy) and an unrelated route in a different module ' +
      '(GET /api/v1/health) are hit in the same test — the asymmetry a global interceptor/middleware ' +
      'would erase',
    async () => {
      await request(app.getHttpServer()).get('/api/v1/registrations/consent-policy').expect(200);
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);

      // The middleware's res.on('finish') listener fires on the next tick after
      // supertest resolves each response — give it one before asserting.
      await new Promise((resolve) => setImmediate(resolve));

      const lines = capturedLines(logSpy);

      // Exactly one line total, from both requests combined.
      expect(lines).toHaveLength(1);

      const line = lines[0];
      // Pinned exactly: setGlobalPrefix('api/v1') prefixes route paths on the
      // root router and does not rewrite req.url, so req.path carries the
      // prefix too — this is the real runtime value, not `toContain`.
      expect(line.route).toBe('/api/v1/registrations/consent-policy');
      expect(line.method).toBe('GET');
      expect(line.status).toBe(200);
      expect(line.role).toBe('Public');
      expect(
        ['requestId', 'route', 'method', 'status', 'role', 'latencyMs'].every((k) => k in line),
      ).toBe(true);
    },
  );
});

describe('A guard-rejected request still emits a structured line (attempt-2 fix, real HTTP pipeline)', () => {
  /** Rejects unconditionally, standing in for T-5's not-yet-built throttle guard / a future 401/403 guard. */
  @Injectable()
  class AlwaysForbiddenGuard implements CanActivate {
    canActivate(): boolean {
      throw new ForbiddenException('rejected for test');
    }
  }

  /** Test-only controller — proves the pipeline behaviour, not production routing. */
  @Controller('guard-rejected-test')
  class GuardRejectedTestController {
    @UseGuards(AlwaysForbiddenGuard)
    @Get('reject')
    reject(): { ok: boolean } {
      return { ok: true };
    }
  }

  /** Mirrors RegistrationsModule's own wiring: same middleware, same forRoutes pattern. */
  @Module({
    imports: [LoggingModule],
    controllers: [GuardRejectedTestController],
    providers: [AlwaysForbiddenGuard],
  })
  class GuardRejectedTestModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer.apply(RequestContextMiddleware).forRoutes(GuardRejectedTestController);
    }
  }

  let app: INestApplication;
  let logSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [GuardRejectedTestModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it(
    'emits a line carrying status 403 for a request AlwaysForbiddenGuard rejects — NestJS runs guards ' +
      "AFTER middleware, so RequestContextMiddleware's finish listener is already registered when the " +
      'guard throws, unlike attempt 1 where the interceptor never ran at all',
    async () => {
      await request(app.getHttpServer()).get('/guard-rejected-test/reject').expect(403);

      await new Promise((resolve) => setImmediate(resolve));

      const lines = capturedLines(logSpy);

      // Emission proven first — the whole point of this test is that this is
      // non-empty for a guard-rejected request.
      expect(lines.length).toBeGreaterThan(0);
      expect(lines).toHaveLength(1);

      const line = lines[0];
      expect(line.status).toBe(403);
      expect(line.route).toBe('/guard-rejected-test/reject');
      expect(line.method).toBe('GET');
      expect(
        ['requestId', 'route', 'method', 'status', 'role', 'latencyMs'].every((k) => k in line),
      ).toBe(true);
    },
  );
});

/**
 * `admin/registration-review-queue` T-4 — the `forRoutes(...)` EMISSION
 * proof for `AdminRegistrationsController` (`design.md` §6.1, DD-19, NFR-8,
 * DC-29). Registering a second controller in `RegistrationsModule.
 * controllers` is caught by any endpoint test the moment it's missing
 * (`pii-boundary.spec.ts`'s totality assertion). Extending `configure()`'s
 * `forRoutes(...)` call has NO such signal — omitting it produces silence,
 * never an error — so this is a DEDICATED test for that second edit,
 * modelled directly on the "guard-rejected request still emits a line"
 * block above (real HTTP pipeline, no test double for the middleware or
 * the guard stack).
 *
 * Deliberately hits the real, production `AdminRegistrationsController`
 * route ANONYMOUSLY (no `Authorization` header) rather than an
 * authenticated Admin request: `JwtAuthGuard` rejects with `401` before the
 * handler (or `PrismaService`) is ever reached, so this test needs no
 * database fixture at all and stays entirely about whether a log line was
 * emitted for the request — not about what the route returns.
 *
 * **This IS the falsifying-input check `tasks.md` T-4 names.** Reverting
 * `RegistrationsModule.configure()` to
 * `forRoutes(RegistrationsController)` (naming only the original
 * controller) must fail this test's `toHaveLength(1)` assertion with `0`
 * captured lines — the middleware is simply never registered on this
 * controller's routes, so nothing runs the `res.on('finish', ...)`
 * listener that would have emitted one. If reverting `forRoutes(...)` does
 * NOT fail this test, the test is checking controller REGISTRATION rather
 * than middleware EMISSION and is not evidence for DC-29 (KZ-002).
 */
describe(
  "AdminRegistrationsController is covered by RegistrationsModule's forRoutes(...) (T-4, DD-19, NFR-8, DC-29)",
  () => {
    let app: INestApplication;
    let logSpy: jest.SpyInstance;

    beforeAll(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PrismaService)
        .useValue({} as unknown as PrismaService)
        .compile();

      app = moduleRef.createNestApplication();
      app.setGlobalPrefix('api/v1');
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    it(
      'emits exactly ONE structured line for an anonymous (401) GET /api/v1/admin/registrations — ' +
        'proof that configure()\'s forRoutes(...) call was extended to the new controller, not just ' +
        "the controllers array (a guard-thrown 401 still passes through the middleware's " +
        "res.on('finish', ...) listener, DD-19, since middleware runs ahead of guards)",
      async () => {
        await request(app.getHttpServer()).get('/api/v1/admin/registrations').expect(401);

        // The middleware's res.on('finish') listener fires on the next tick
        // after supertest resolves the response — give it one before asserting.
        await new Promise((resolve) => setImmediate(resolve));

        const lines = capturedLines(logSpy);

        expect(lines).toHaveLength(1);

        const line = lines[0];
        expect(line.route).toBe('/api/v1/admin/registrations');
        expect(line.method).toBe('GET');
        expect(line.status).toBe(401);
        expect(
          ['requestId', 'route', 'method', 'status', 'role', 'latencyMs'].every((k) => k in line),
        ).toBe(true);
      },
    );
  },
);
