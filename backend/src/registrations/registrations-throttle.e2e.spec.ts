// @sdd-spec actors/public-self-registration (T-5)
/**
 * T-5 — HTTP-level proof of the throttle guard + `429` envelope filter
 * (FR-7, NFR-4, DC-26, design.md §4.4/DD-5) — and of the carried-forward
 * T-4 obligation that a guard-rejected request still emits a structured log
 * line (design.md §4.10's correction; `execution.md` T-4 "T4-A4").
 *
 * Two describe blocks, each with its OWN app instance (own in-memory
 * `ThrottlerStorageService`) so throttle counters never bleed across `it`
 * blocks — driving `429` inside a shared `beforeAll` app across several
 * tests is exactly what `design.md` §7 (B28) flags as making a gate
 * order-dependent. Every `429` assertion below drives its whole request
 * sequence inside ONE `it`.
 *
 * Block A hits the REAL wired route (`GET /api/v1/registrations/consent-policy`
 * via the real `AppModule`) to prove `RegistrationsThrottleGuard` +
 * `ThrottlerExceptionFilter` are actually applied in production wiring, not
 * just constructible in isolation.
 *
 * Block B is the disqualifying-clause proof `tasks.md` T-5 demands and the
 * real route above cannot give, because `GET /consent-policy` never touches
 * Prisma: a throwaway, Prisma-touching controller, guarded by the SAME
 * `RegistrationsThrottleGuard` class (not a stand-in), proves that the
 * (limit + 1)-th request is rejected BEFORE the handler — and therefore
 * before any database call — ever runs, and that the rejection itself still
 * emits `RequestContextMiddleware`'s structured log line with `status: 429`.
 */
import {
  Controller,
  Get,
  INestApplication,
  Logger,
  MiddlewareConsumer,
  Module,
  NestModule,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LoggingModule } from '../logging/logging.module';
import { RequestContextMiddleware } from '../logging/request-context.middleware';
import {
  REGISTRATIONS_THROTTLE_LIMIT,
  RegistrationsThrottleGuard,
} from './registrations-throttle.guard';
import { ThrottledResponseBody, ThrottlerExceptionFilter } from './throttler-exception.filter';

/** Pull just the JSON structured-log lines out of everything a log spy captured. */
function capturedLines(logSpy: jest.SpyInstance): Record<string, unknown>[] {
  return logSpy.mock.calls
    .map((call) => call[0])
    .filter((msg): msg is string => typeof msg === 'string' && msg.startsWith('{'))
    .map((msg) => JSON.parse(msg) as Record<string, unknown>);
}

describe('RegistrationsThrottleGuard is wired on the real public route (HTTP e2e)', () => {
  let app: INestApplication;

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

  it(
    `rejects the (limit + 1)-th request to GET /api/v1/registrations/consent-policy with 429 in the ` +
      'documented envelope, once REGISTRATIONS_THROTTLE_LIMIT is exceeded within the window',
    async () => {
      for (let i = 0; i < REGISTRATIONS_THROTTLE_LIMIT; i++) {
        await request(app.getHttpServer())
          .get('/api/v1/registrations/consent-policy')
          .expect(200);
      }

      const overLimit = await request(app.getHttpServer()).get(
        '/api/v1/registrations/consent-policy',
      );

      expect(overLimit.status).toBe(429);
      expect(overLimit.body).toEqual({
        statusCode: 429,
        error: 'Too Many Requests',
        message: expect.any(String),
      });
      expect(overLimit.body.message).not.toMatch(/ThrottlerException/i);
    },
  );
});

describe(
  'A throttled request never reaches the handler (zero Prisma calls) and still emits a ' +
    'structured log line carrying status 429 (real guard, real HTTP pipeline)',
  () => {
    /** Small, deterministic limit local to this suite — independent of the production constant. */
    const TEST_LIMIT = 3;

    /** Test-only controller standing in for a future Prisma-touching route in this module. */
    @Controller('throttle-db-test')
    @UseGuards(RegistrationsThrottleGuard)
    @UseFilters(ThrottlerExceptionFilter)
    class ThrottleDbTestController {
      constructor(private readonly prisma: PrismaService) {}

      @Get('probe')
      async probe(): Promise<{ ok: boolean }> {
        // Stands in for what a real handler in this module does — touch the DB.
        // `RegistrationsThrottleGuard` runs before this method for every
        // request; if it rejects, this line never executes.
        await (this.prisma as unknown as { registration: { count: () => Promise<number> } })
          .registration.count();
        return { ok: true };
      }
    }

    /** Mirrors RegistrationsModule's own wiring: same guard, same middleware pattern. */
    @Module({
      imports: [
        PrismaModule,
        LoggingModule,
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: TEST_LIMIT }]),
      ],
      controllers: [ThrottleDbTestController],
      providers: [RegistrationsThrottleGuard],
    })
    class ThrottleDbTestModule implements NestModule {
      configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestContextMiddleware).forRoutes(ThrottleDbTestController);
      }
    }

    let app: INestApplication;
    let logSpy: jest.SpyInstance;
    let countSpy: jest.Mock;

    beforeAll(async () => {
      countSpy = jest.fn().mockResolvedValue(0);
      const prismaMock = { registration: { count: countSpy } } as unknown as PrismaService;

      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [ThrottleDbTestModule],
      })
        .overrideProvider(PrismaService)
        .useValue(prismaMock)
        .compile();

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
      countSpy.mockClear();
    });

    it(
      `serves the first ${TEST_LIMIT} requests (each calling Prisma once), then rejects request ` +
        `${TEST_LIMIT + 1} with 429 WITHOUT any additional Prisma invocation, and logs that ` +
        'rejection with status 429',
      async () => {
        for (let i = 0; i < TEST_LIMIT; i++) {
          await request(app.getHttpServer()).get('/throttle-db-test/probe').expect(200);
        }
        // The DB was reached exactly once per accepted request — proves the mock
        // is actually wired into the handler, so its silence on the next
        // request below is meaningful, not vacuous.
        expect(countSpy).toHaveBeenCalledTimes(TEST_LIMIT);

        const throttled = await request(app.getHttpServer()).get('/throttle-db-test/probe');

        // FR-7: "must NOT open a database connection or write a row to reach
        // that decision" — the call count must NOT have advanced past TEST_LIMIT.
        expect(countSpy).toHaveBeenCalledTimes(TEST_LIMIT);

        // DC-26: the documented 429 envelope.
        expect(throttled.status).toBe(429);
        const body = throttled.body as ThrottledResponseBody;
        expect(body).toEqual({
          statusCode: 429,
          error: 'Too Many Requests',
          message: expect.any(String),
        });

        // T-4's carried-forward obligation: the guard-rejected request still
        // emits RequestContextMiddleware's structured line, with status 429.
        await new Promise((resolve) => setImmediate(resolve));
        const lines = capturedLines(logSpy);
        const throttledLine = lines.find((line) => line.status === 429);
        expect(throttledLine).toBeDefined();
        expect(throttledLine?.route).toBe('/throttle-db-test/probe');
        expect(throttledLine?.method).toBe('GET');
        expect(
          ['requestId', 'route', 'method', 'status', 'role', 'latencyMs'].every(
            (k) => throttledLine && k in throttledLine,
          ),
        ).toBe(true);
      },
    );
  },
);
