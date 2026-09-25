// @sdd-spec admin/actor-import
/**
 * Handler-level regression for the serverless (`lambda.ts`) request path.
 *
 * The supertest e2e suites drive the Nest app directly and never exercise the
 * `serverless-http` handler, so a body-parsing defect that only appears under
 * `serverless-http` (the deployed Lambda path) slips past them. This suite
 * imports the REAL `handler` from `src/lambda.ts` and invokes it with a
 * synthetic API Gateway HTTP API v2 (payload format 2.0) event, reproducing the
 * production 500 on `POST /api/v1/admin/actors/import`:
 *
 *   TypeError: Cannot delete property '0' of [object Uint8Array]
 *   at ValidationExecutor.whitelist (class-validator)
 *
 * Root cause: under `serverless-http`, `ServerlessRequest` pre-seeds `req.body`
 * with the raw request Buffer. If the JSON body-parser does not overwrite it,
 * the Buffer reaches the global ValidationPipe, whose `whitelist` tries to
 * `delete` array indices off the Uint8Array and throws.
 *
 * Cognito JWT verification and Prisma are mocked at the module level (the real
 * handler bootstraps AppModule itself, so providers cannot be overridden via the
 * testing module).
 *
 * auth/account-access-emails T-8 (NFR-2, requirements.md §9 D-4) adds a second
 * class of regression to this same file, for the same structural reason:
 * only the REAL `lambda.ts` handler exercises `UsersService.create()` /
 * `resetPassword()` dispatching an account-access email **awaited inside
 * their own `try`/`catch`** (design.md §5.3), and supertest never reaches
 * it. The property under test is ordering: the send must complete before
 * the handler's returned promise resolves, because a fire-and-forget
 * dispatch is not merely slow — it can be silently lost the instant the
 * execution environment freezes. `mockContext.callbackWaitsForEmptyEventLoop`
 * plays NO role in this: it is inert under Jest, and in production
 * `lambda.ts:108` overwrites it to `true` unconditionally as the handler's
 * first statement, before a single line of request handling runs — so
 * whatever value this file sets on `mockContext` has zero effect either way.
 * The actual proof mechanism is described below, at the mock and at the
 * tests themselves: the transport's `send()` returns a promise the test
 * holds open, and the test asserts the handler's own invocation has NOT
 * settled while that promise is outstanding — an ordering proved by
 * blocking, not by counting event-loop turns. Two more module-level seams
 * support this:
 *
 *  - `@aws-sdk/client-cognito-identity-provider` is NOT `jest.mock`'d whole —
 *    `aws-sdk-client-mock`'s `mockClient(CognitoIdentityProviderClient)`
 *    patches the SDK client's prototype `send()` directly, which is the same
 *    mechanism `users.service.spec.ts`'s unit tests already use. It composes
 *    with this file's "no DI overrides" constraint for a different reason
 *    than the two mocks above: it never goes through Nest's DI container at
 *    all — `UsersService`/`users.service.ts` reach Cognito via
 *    `getCognitoAdminClient()`, a lazily-constructed module-level singleton,
 *    not a constructor-injected provider — so there is nothing to override
 *    and nothing to route around.
 *  - `../mail/mail-transport.factory` IS `jest.mock`'d (below), because it is
 *    the one seam whose `send()` the test can hold open indefinitely and
 *    release on command. `MailService` itself is left real and unmocked, so
 *    its NFR-1 log-shape discipline still runs; only the transport
 *    `MailService.dispatch()` sends through is swapped. See that mock's own
 *    comment for the held-promise mechanism.
 */

import { gunzipSync } from 'node:zlib';

import type { Context } from 'aws-lambda';
import * as ExcelJS from 'exceljs';
import { mockClient } from 'aws-sdk-client-mock';
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';

import { TEMPLATE_COLUMNS, TEMPLATE_HEADERS } from '../common/template-columns';
import { REGISTRATIONS_PAYLOAD_CAP_BYTES } from '../common/payload-cap.config';
import { REGISTRATIONS_THROTTLE_LIMIT } from '../registrations/registrations-throttle.guard';
import { resetCognitoAdminClient } from '../users/cognito-admin.client';

// --- module mocks (hoisted before lambda.ts / AppModule import) -------------

// Admin identity for any Bearer token — bypasses real Cognito JWKS verification.
jest.mock('../auth/jwt-verifier', () => ({
  getJwtVerifier: () => ({
    verify: jest.fn().mockResolvedValue({
      sub: 'admin-sub',
      username: 'admin-user',
      'cognito:groups': ['admin'],
    }),
  }),
  resetJwtVerifier: jest.fn(),
}));

// In-memory Prisma: a preview import only reads `actor.findMany` for DB dedupe.
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class {
    actor = { findMany: jest.fn().mockResolvedValue([]) };
    crop = { findMany: jest.fn().mockResolvedValue([]) };
    async onModuleInit(): Promise<void> {}
    async $connect(): Promise<void> {}
    async $transaction(arg: unknown): Promise<unknown> {
      return typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(this) : arg;
    }
  },
}));

/**
 * auth/account-access-emails T-8 — a mail transport whose `send()` returns a
 * promise the TEST controls: it does not resolve on its own, at all, until
 * the test explicitly releases it via `releasePendingSend()` (in the T-8
 * describe block below). This is the entire falsifier-detection mechanism
 * (NFR-2, D-4), and it is a structural guarantee rather than a timing one:
 *
 * With the dispatch correctly awaited all the way up through
 * `UsersService.create()`/`resetPassword()` and the handler itself, the
 * handler's own returned promise is chained to this held promise and
 * THEREFORE CANNOT settle until the test calls `releasePendingSend()` — not
 * "is unlikely to settle first", cannot, by ordinary promise semantics. No
 * amount of draining the event loop can make it settle early, because
 * nothing has resolved the inner promise yet.
 *
 * With the `await` dropped, nothing upstream is chained to this promise at
 * all, so the handler's returned promise settles on its own, independent of
 * whether `releasePendingSend()` is ever called. Each test asserts "the
 * invocation has NOT settled while the send is outstanding" BEFORE
 * releasing; that assertion is false the instant the `await` is dropped,
 * regardless of how the rest of the response pipeline happens to be
 * scheduled.
 *
 * This replaces an earlier version of this mock that instead deferred
 * resolution across a `setImmediate` and relied on empirically-observed
 * event-loop timing to make the two cases diverge — a real hedge, since a
 * response crossing the compression threshold, an async interceptor doing
 * I/O, or a `serverless-http` upgrade could each have silently closed the
 * gap the timing depended on. Holding the promise open removes the hedge
 * entirely: the negative case (dropped `await`) is now caught by the SAME
 * mechanism as the positive case, not by a fortunate scheduling accident.
 *
 * State lives INSIDE the mock factory (never captured from an outer
 * variable) so it works regardless of how/when Jest hoists `jest.mock`
 * calls, and is exposed via `__mailTestState` so the suite below can read,
 * reset, and release it directly.
 */
jest.mock('../mail/mail-transport.factory', () => {
  const state: {
    sendCompleted: boolean;
    sendCount: number;
    pendingSends: Array<() => void>;
  } = { sendCompleted: false, sendCount: 0, pendingSends: [] };
  return {
    __mailTestState: state,
    getMailTransport: () => ({
      send: (_message: unknown) =>
        new Promise<void>((resolve) => {
          // Held open until the test calls releasePendingSend() — see the
          // docblock above for why this is what makes the ordering
          // assertion structural rather than timing-dependent.
          state.pendingSends.push(() => {
            state.sendCompleted = true;
            state.sendCount += 1;
            resolve();
          });
        }),
    }),
    resetMailTransport: jest.fn(),
  };
});

import { handler } from '../lambda';
import * as mailTransportFactory from '../mail/mail-transport.factory';

// --- helpers ----------------------------------------------------------------

type CellMap = Record<string, string | number>;

/** Build a base64 `.xlsx` from data rows keyed by TEMPLATE_COLUMNS `field`. */
async function buildWorkbook(dataRows: CellMap[]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data');
  ws.addRow([...TEMPLATE_HEADERS]);
  for (const row of dataRows) {
    ws.addRow(TEMPLATE_COLUMNS.map((col) => row[col.field] ?? ''));
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf).toString('base64');
}

function validRow(overrides: CellMap = {}): CellMap {
  return {
    traderId: 'TZ-1',
    traderName: 'Actor One',
    traderType: 'seed_company',
    region: 'Arusha',
    ...overrides,
  };
}

const mockContext = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test',
  awsRequestId: 'req-1',
} as unknown as Context;

/** Build an API Gateway HTTP API v2 (payload format 2.0) event. */
function apiGatewayV2Event(opts: {
  method: string;
  path: string;
  body: string;
  headers?: Record<string, string>;
  sourceIp?: string;
}) {
  return {
    version: '2.0',
    routeKey: `${opts.method} ${opts.path}`,
    rawPath: opts.path,
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer admin-token',
      ...opts.headers,
    },
    requestContext: {
      accountId: '123',
      apiId: 'api',
      http: {
        method: opts.method,
        path: opts.path,
        protocol: 'HTTP/1.1',
        sourceIp: opts.sourceIp ?? '1.2.3.4',
        userAgent: 'jest',
      },
      requestId: 'req-1',
      routeKey: `${opts.method} ${opts.path}`,
      stage: '$default',
    },
    body: opts.body,
    isBase64Encoded: false,
  };
}

async function invoke(event: unknown): Promise<{ statusCode: number; body: any }> {
  const res = (await handler(event, mockContext, () => {})) as {
    statusCode: number;
    body: string;
  };
  let parsed: any = res.body;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    /* leave raw */
  }
  return { statusCode: res.statusCode, body: parsed };
}

const IMPORT_PATH = '/api/v1/admin/actors/import';

// --- suite ------------------------------------------------------------------

describe('Lambda handler (serverless-http) body-parsing', () => {
  it('parses a JSON import body and returns 200 (not a 500 Uint8Array TypeError)', async () => {
    const fileBase64 = await buildWorkbook([validRow({ traderId: 'TZ-HANDLER-1' })]);
    const event = apiGatewayV2Event({
      method: 'POST',
      path: IMPORT_PATH,
      body: JSON.stringify({ fileName: 'actors.xlsx', fileBase64, mode: 'preview' }),
    });

    const res = await invoke(event);

    expect(res.statusCode).toBe(200);
    expect(res.body.mode).toBe('preview');
    expect(res.body.totals.rows).toBe(1);
  });

  it('rejects a non-object JSON body with a clean 400 (never a 500)', async () => {
    const event = apiGatewayV2Event({
      method: 'POST',
      path: IMPORT_PATH,
      body: JSON.stringify('this is a bare string, not an object'),
    });

    const res = await invoke(event);

    expect(res.statusCode).toBe(400);
    expect(res.statusCode).not.toBe(500);
  });
});

// --- ATP-68: response compression through the REAL handler -----------------

/**
 * `configureCompression` (ATP-68) makes the API emit `Content-Encoding: gzip`.
 * That is only safe in Lambda if the gzip BYTES reach API Gateway base64-encoded
 * with `isBase64Encoded: true`; returned as a UTF-8 string they arrive corrupt.
 *
 * `serverless-http@3.2.0` classifies a response binary by `content-encoding`
 * before it looks at content-type, so it does this unprompted — but that is a
 * property of a dependency's internals, exactly the kind of thing a major
 * upgrade changes silently. Asserted here, through the real handler, because
 * supertest decompresses transparently and would show nothing.
 *
 * The import preview is used as the large-body route because this suite's
 * Prisma mock already supports it; the compression middleware is global, so
 * the route is incidental.
 */
describe('Response compression through the real handler (ATP-68)', () => {
  /** Enough rows that the JSON report clears COMPRESSION_THRESHOLD_BYTES. */
  const ROWS = 120;

  /**
   * Drive the real handler with a large import-preview body under a given
   * Accept-Encoding, and hand back the raw Lambda result — unparsed, because
   * how the body is encoded is the thing under test.
   */
  async function invokeLargeBody(acceptEncoding: string, idPrefix: string) {
    const fileBase64 = await buildWorkbook(
      Array.from({ length: ROWS }, (_, i) => validRow({ traderId: `${idPrefix}-${i}` })),
    );
    const event = apiGatewayV2Event({
      method: 'POST',
      path: IMPORT_PATH,
      body: JSON.stringify({ fileName: 'actors.xlsx', fileBase64, mode: 'preview' }),
      headers: { 'accept-encoding': acceptEncoding },
    });

    return (await handler(event, mockContext, () => {})) as {
      statusCode: number;
      body: string;
      isBase64Encoded?: boolean;
      headers?: Record<string, string>;
    };
  }

  it('returns gzip BASE64-ENCODED, and the bytes decode back to the real JSON', async () => {
    const res = await invokeLargeBody('gzip', 'TZ-GZ');

    expect(res.statusCode).toBe(200);
    expect(res.headers?.['content-encoding']).toBe('gzip');

    // The half that actually breaks in production if serverless-http changes:
    // gzip bytes handed back as a plain string are unrecoverable.
    expect(res.isBase64Encoded).toBe(true);

    const decoded = JSON.parse(
      gunzipSync(Buffer.from(res.body, 'base64')).toString('utf8'),
    );
    expect(decoded.mode).toBe('preview');
    expect(decoded.totals.rows).toBe(ROWS);
  });

  it('returns plain, non-base64 JSON when the client does not accept gzip', async () => {
    const res = await invokeLargeBody('identity', 'TZ-PLAIN');

    expect(res.statusCode).toBe(200);
    expect(res.headers?.['content-encoding']).toBeUndefined();
    expect(res.isBase64Encoded).toBeFalsy();
    expect(JSON.parse(res.body).totals.rows).toBe(ROWS);
  });
});

// --- T-6: registrations payload cap, proven through the REAL handler --------

const REGISTRATIONS_PATH = '/api/v1/registrations';
const CONSENT_POLICY_PATH = '/api/v1/registrations/consent-policy';

describe('Registrations payload cap (real serverless-http handler, FR-7/NFR-4)', () => {
  it(
    'rejects an oversized, NON-JSON body on a registrations path with 413 — proving the cap runs ' +
      'BEFORE any JSON parsing is attempted (a malformed body that reached the parser would 400, ' +
      'never 413)',
    async () => {
      const oversizedGarbage = 'x'.repeat(REGISTRATIONS_PAYLOAD_CAP_BYTES + 1);
      const event = apiGatewayV2Event({
        method: 'POST',
        path: REGISTRATIONS_PATH,
        body: oversizedGarbage,
        headers: { 'content-type': 'application/json' },
      });

      const res = await invoke(event);

      expect(res.statusCode).toBe(413);
      expect(res.body).toMatchObject({ statusCode: 413 });
    },
  );

  it(
    'leaves a non-registrations path (the admin import route) uncapped: a body well over the ' +
      'registrations cap but under the global 8 MB import limit is NOT rejected as 413 (P-2)',
    async () => {
      const fileBase64 = await buildWorkbook([validRow({ traderId: 'TZ-CAP-SCOPE-1' })]);
      // Padding pushes the body past REGISTRATIONS_PAYLOAD_CAP_BYTES; `whitelist`
      // strips the unknown field from the validated DTO but the raw body the
      // payload cap inspects is unaffected — proving THIS middleware, not
      // validation, is what would have rejected an oversized body here if it
      // matched the wrong path.
      const body = JSON.stringify({
        fileName: 'actors.xlsx',
        fileBase64,
        mode: 'preview',
        padding: 'x'.repeat(REGISTRATIONS_PAYLOAD_CAP_BYTES),
      });
      expect(Buffer.byteLength(body)).toBeGreaterThan(REGISTRATIONS_PAYLOAD_CAP_BYTES);

      const event = apiGatewayV2Event({ method: 'POST', path: IMPORT_PATH, body });

      const res = await invoke(event);

      expect(res.statusCode).not.toBe(413);
      expect(res.statusCode).toBe(200);
    },
  );

  it(
    'a request AT exactly the cap on a registrations path is not rejected by the cap itself ' +
      "(re-pinned T-10: POST /registrations now exists, so this shape — no email/code/consent/" +
      'payload — reaches routing and 400s on DTO validation, never 413 and never the ' +
      '404 this test asserted before the route was built)',
    async () => {
      // `{"padding":"` (12 bytes) + padding + `"}` (2 bytes) = CAP bytes exactly
      // — pin the boundary precisely rather than merely "comfortably under".
      const atCapBody = JSON.stringify({
        padding: 'x'.repeat(REGISTRATIONS_PAYLOAD_CAP_BYTES - 14),
      });
      expect(Buffer.byteLength(atCapBody)).toBe(REGISTRATIONS_PAYLOAD_CAP_BYTES);
      const event = apiGatewayV2Event({ method: 'POST', path: REGISTRATIONS_PATH, body: atCapBody });

      const res = await invoke(event);

      expect(res.statusCode).not.toBe(413);
      expect(res.statusCode).toBe(400);
    },
  );

  it(
    'caps an oversized body on an UPPERCASE registrations path — 2026-08-05 review finding: ' +
      "Express's router is case-INSENSITIVE by default, so a case-sensitive path matcher would " +
      'let a caller bypass the cap by shifting the path to uppercase, on the real handler',
    async () => {
      const oversizedGarbage = 'x'.repeat(REGISTRATIONS_PAYLOAD_CAP_BYTES + 1);
      const event = apiGatewayV2Event({
        method: 'POST',
        path: '/API/V1/REGISTRATIONS',
        body: oversizedGarbage,
        headers: { 'content-type': 'application/json' },
      });

      const res = await invoke(event);

      expect(res.statusCode).toBe(413);
    },
  );

  it(
    'rejects a request whose event declares Transfer-Encoding: chunked with 413 — this P-3 ' +
      "sub-case DOES survive into serverless-http's synthetic request (create-request.js forwards " +
      'event.headers verbatim), unlike the absent-Content-Length sub-case covered instead by ' +
      'payload-cap.e2e.spec.ts against the real streaming local entrypoint',
    async () => {
      const event = apiGatewayV2Event({
        method: 'POST',
        path: `${REGISTRATIONS_PATH}/verify`,
        body: '{"small":"body"}',
        headers: { 'transfer-encoding': 'chunked' },
      });

      const res = await invoke(event);

      expect(res.statusCode).toBe(413);
    },
  );

  it(
    'rejects a request whose event declares a malformed Content-Length with 413, on the real handler',
    async () => {
      const event = apiGatewayV2Event({
        method: 'POST',
        path: `${REGISTRATIONS_PATH}/verify`,
        body: '{"small":"body"}',
        headers: { 'content-length': 'not-a-number' },
      });

      const res = await invoke(event);

      expect(res.statusCode).toBe(413);
    },
  );
});

// --- T5-A1: the carried-forward 429-through-the-real-handler obligation ----

describe('T5-A1 — RegistrationsThrottleGuard 429, proven through the REAL handler', () => {
  it(
    `rejects the ${REGISTRATIONS_THROTTLE_LIMIT + 1}-th request from the SAME sourceIp with 429, and a ` +
      'request from a DIFFERENT sourceIp still succeeds — proving req.ip resolves from ' +
      "event.requestContext.http.sourceIp under serverless-http (create-request.js's remoteAddress → " +
      "request.js's own `ip` property), so the throttle key is genuinely per-caller and NOT a single " +
      'shared bucket for every caller (which would be a global self-DoS if sourceIp were lost)',
    async () => {
      const callerIp = '198.51.100.7';

      for (let i = 0; i < REGISTRATIONS_THROTTLE_LIMIT; i++) {
        const event = apiGatewayV2Event({
          method: 'GET',
          path: CONSENT_POLICY_PATH,
          body: '',
          sourceIp: callerIp,
        });
        const res = await invoke(event);
        expect(res.statusCode).toBe(200);
      }

      const overLimitEvent = apiGatewayV2Event({
        method: 'GET',
        path: CONSENT_POLICY_PATH,
        body: '',
        sourceIp: callerIp,
      });
      const overLimitRes = await invoke(overLimitEvent);

      expect(overLimitRes.statusCode).toBe(429);
      expect(overLimitRes.body).toEqual({
        statusCode: 429,
        error: 'Too Many Requests',
        message: expect.any(String),
      });

      // A different caller (different sourceIp) is NOT affected by the first
      // caller's exhausted bucket — proving the tracker is keyed on the
      // resolved per-request IP, not a single global counter.
      const otherCallerEvent = apiGatewayV2Event({
        method: 'GET',
        path: CONSENT_POLICY_PATH,
        body: '',
        sourceIp: '203.0.113.42',
      });
      const otherCallerRes = await invoke(otherCallerEvent);
      expect(otherCallerRes.statusCode).toBe(200);
    },
  );
});

// --- T-8: account-access email dispatch survives the Lambda freeze class ---

/**
 * auth/account-access-emails T-8 (NFR-2, requirements.md §9 D-4, design.md
 * §5.3) — this is the **only** harness in the repo that can prove this
 * property, per this file's own docblock: supertest never exercises
 * `serverless-http`, so a fire-and-forget dispatch that would be lost the
 * instant a real Lambda execution environment freezes is invisible to any
 * supertest-based e2e suite, however green.
 *
 * The ordering property is proved by BLOCKING, not by `mockContext`: each
 * test starts `invoke()` WITHOUT awaiting it, drains the event loop
 * generously while the mocked mail transport's `send()` is held open (see
 * `../mail/mail-transport.factory`'s mock, above), and asserts the
 * invocation has NOT settled — then releases the held send and awaits the
 * result. `mockContext.callbackWaitsForEmptyEventLoop` is inert here and in
 * production alike (`lambda.ts:108` overwrites it to `true` unconditionally
 * before any request handling runs); it plays no role in either direction
 * of this assertion.
 */
describe('Account-access email dispatch survives the Lambda freeze class (T-8, NFR-2, D-4)', () => {
  const cognitoMock = mockClient(CognitoIdentityProviderClient);
  const mailTestState = (
    mailTransportFactory as unknown as {
      __mailTestState: {
        sendCompleted: boolean;
        sendCount: number;
        pendingSends: Array<() => void>;
      };
    }
  ).__mailTestState;

  /** Release the oldest send the mocked mail transport is holding open. */
  function releasePendingSend(): void {
    const resolveSend = mailTestState.pendingSends.shift();
    if (!resolveSend) {
      throw new Error('releasePendingSend(): no pending mail send to release');
    }
    resolveSend();
  }

  /**
   * Drain the event loop generously (macrotask ticks) while nothing has
   * released a held send. Proves the block genuinely holds — "hasn't
   * settled after many turns" — rather than merely "hasn't had a turn yet".
   */
  async function drainEventLoop(ticks = 20): Promise<void> {
    for (let i = 0; i < ticks; i++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  const USERS_PATH = '/api/v1/users';

  beforeAll(() => {
    // Cognito Admin client config (`getCognitoAdminClient`/`getUserPoolId`,
    // `users/cognito-admin.client.ts`) — read lazily, so only THIS describe
    // block, which actually drives a Cognito-calling route, needs them set.
    process.env.COGNITO_USER_POOL_ID = 'us-east-1_TESTPOOL';
    process.env.COGNITO_CLIENT_ID = 'test-client-id';
    process.env.AWS_REGION = 'us-east-1';
    // The invitation/admin-reset templates resolve their sign-in link from
    // this at CALL time (never at module load — ATP-67), so it must be set
    // before either route is exercised.
    process.env.PUBLIC_APP_BASE_URL = 'https://accelerate.example.org';
  });

  afterAll(() => {
    delete process.env.COGNITO_USER_POOL_ID;
    delete process.env.COGNITO_CLIENT_ID;
    delete process.env.AWS_REGION;
    delete process.env.PUBLIC_APP_BASE_URL;
    resetCognitoAdminClient();
  });

  beforeEach(() => {
    cognitoMock.reset();
    resetCognitoAdminClient();
    mailTestState.sendCompleted = false;
    mailTestState.sendCount = 0;
    mailTestState.pendingSends.length = 0;
  });

  it(
    'create(): POST /api/v1/users — the handler\'s own invocation cannot ' +
      'settle while the invitation send is held open, and only settles once ' +
      'it is released (NFR-2). Falsifier: dropping the `await` in ' +
      "`dispatchInvitationEmail` (users.service.ts ~L340) must redden this — see the " +
      'report for the verbatim red/green run.',
    async () => {
      cognitoMock.on(AdminCreateUserCommand).resolves({
        User: {
          Username: 'new.invitee@example.org',
          Attributes: [
            { Name: 'sub', Value: 'sub-invite-1' },
            { Name: 'email', Value: 'new.invitee@example.org' },
            { Name: 'email_verified', Value: 'true' },
          ],
        },
      });

      const event = apiGatewayV2Event({
        method: 'POST',
        path: USERS_PATH,
        body: JSON.stringify({ email: 'new.invitee@example.org' }),
      });

      let settled = false;
      const invokePromise = invoke(event).finally(() => {
        settled = true;
      });

      // Generous drain while the mock's send() is still held open — proves
      // the block genuinely holds, not merely "hasn't had a turn yet".
      await drainEventLoop();

      // The structural assertion (NFR-2): with the dispatch correctly
      // awaited all the way up through `UsersService.create()` and the
      // handler itself, the handler's OWN returned promise is chained to
      // the mail transport's still-open `send()` promise and therefore
      // CANNOT have settled yet — not "is unlikely to", cannot, by ordinary
      // promise semantics. No amount of event-loop draining changes this;
      // only releasing the held send does.
      expect(settled).toBe(false);
      expect(mailTestState.sendCompleted).toBe(false);

      releasePendingSend();
      const res = await invokePromise;

      expect(mailTestState.sendCompleted).toBe(true);
      // this is the assertion that prevents a leaked send from the previous
      // test masking a broken dispatch here — do not remove
      expect(mailTestState.sendCount).toBe(1);

      expect(res.statusCode).toBe(201);
      expect(res.body.emailSent).toBe(true);
    },
  );

  it(
    "resetPassword(): POST /api/v1/users/:id/password — the handler's own " +
      "invocation cannot settle while the admin-reset send is held open, and " +
      'only settles once it is released (NFR-2, FR-5\'s "same rules as FR-1 ' +
      'through FR-4"). Same mechanism as the create() test above, exercised through ' +
      "`dispatchAdminResetEmail` instead of `dispatchInvitationEmail` — both dispatch " +
      'sites were written to the identical awaited-inside-its-own-try pattern ' +
      '(design.md §5.3) and this pins both, not only the one the falsifier below ' +
      'mutates.',
    async () => {
      // Production-defect fix (2026-09-22): `id` (the route param / Cognito
      // `Username`) is a UUID in this pool, NOT the email address —
      // deliberately UUID-shaped and DIFFERENT from the resolved `email`
      // attribute below, so this fixture cannot hide a regression to
      // dispatching at `id` the way the former email-shaped `id` fixture
      // did (that fixture made `to === id` true even under the bug,
      // because both were the same string).
      const resetUserId = '9c8f6b2e-1a34-4e77-9f0a-5c7d8e2b4a10';
      const resolvedRecipientEmail = 'existing.user@example.org';

      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});
      cognitoMock.on(AdminGetUserCommand).resolves({
        Username: resetUserId,
        UserAttributes: [
          { Name: 'sub', Value: 'sub-reset-1' },
          { Name: 'email', Value: resolvedRecipientEmail },
        ],
      });

      const event = apiGatewayV2Event({
        method: 'POST',
        path: `${USERS_PATH}/${resetUserId}/password`,
        body: '',
      });

      let settled = false;
      const invokePromise = invoke(event).finally(() => {
        settled = true;
      });

      await drainEventLoop();

      expect(settled).toBe(false);
      expect(mailTestState.sendCompleted).toBe(false);

      releasePendingSend();
      const res = await invokePromise;

      expect(mailTestState.sendCompleted).toBe(true);
      // this is the assertion that prevents a leaked send from the previous
      // test masking a broken dispatch here — do not remove
      expect(mailTestState.sendCount).toBe(1);

      expect(res.statusCode).toBe(200);
      expect(res.body.emailSent).toBe(true);
    },
  );
});
