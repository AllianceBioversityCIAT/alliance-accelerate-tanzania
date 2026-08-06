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
 */

import type { Context } from 'aws-lambda';
import * as ExcelJS from 'exceljs';

import { TEMPLATE_COLUMNS, TEMPLATE_HEADERS } from '../common/template-columns';
import { REGISTRATIONS_PAYLOAD_CAP_BYTES } from '../common/payload-cap.config';
import { REGISTRATIONS_THROTTLE_LIMIT } from '../registrations/registrations-throttle.guard';

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

 
import { handler } from '../lambda';

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
      '(reaches routing and 404s on the not-yet-built POST /registrations route, never 413)',
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
      expect(res.statusCode).toBe(404);
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
