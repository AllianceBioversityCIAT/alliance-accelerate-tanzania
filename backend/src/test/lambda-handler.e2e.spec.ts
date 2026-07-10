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
        sourceIp: '1.2.3.4',
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
