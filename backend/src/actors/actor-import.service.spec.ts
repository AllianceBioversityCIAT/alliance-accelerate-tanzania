// @sdd-spec admin/actor-import
/**
 * T-5 — `ActorImportService` unit tests (design §10).
 *
 * Fixtures are real `.xlsx` workbooks built in-memory with exceljs and handed to
 * the service as base64, so the parse + validate + dedupe + consent + chunk
 * pipeline is exercised end-to-end against a mocked Prisma client. Covers:
 * header/column mapping, per-field validation, GPS-cleared warning (DR-5),
 * in-file + DB dedupe (FR-4), the consent gate (FR-6), preview writing nothing
 * (FR-3), chunk fault isolation (FR-5), totals consistency, the size/row caps,
 * and corrupt-buffer handling.
 */

import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

import { ActorImportService } from './actor-import.service';
import { ActorAuditService } from './actor-audit.service';
import { ActingAdminResolver } from './acting-admin.resolver';
import { PrismaService } from '../prisma/prisma.service';
import { ActorImportRequestDto } from './dto/actor-import-request.dto';
import {
  TEMPLATE_COLUMNS,
  TEMPLATE_HEADERS,
  TEMPLATE_VERSION,
} from '../common/template-columns';

type CellMap = Record<string, string | number>;

/** Build a base64 .xlsx from data rows keyed by TEMPLATE_COLUMNS `field`. */
async function buildWorkbook(
  dataRows: CellMap[],
  opts: {
    sheetName?: string;
    headers?: string[];
    instructionsVersion?: string;
  } = {},
): Promise<string> {
  const wb = new ExcelJS.Workbook();

  if (opts.instructionsVersion) {
    const ins = wb.addWorksheet('Instructions');
    ins.getCell('A1').value = 'Template version:';
    ins.getCell('B1').value = opts.instructionsVersion;
  }

  const ws = wb.addWorksheet(opts.sheetName ?? 'Data');
  ws.addRow(opts.headers ?? [...TEMPLATE_HEADERS]);
  for (const row of dataRows) {
    ws.addRow(TEMPLATE_COLUMNS.map((col) => row[col.field] ?? ''));
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf).toString('base64');
}

/** A minimal valid data row (required fields only); override as needed. */
function validRow(overrides: CellMap = {}): CellMap {
  return {
    traderId: 'TZ-1',
    traderName: 'Actor One',
    traderType: 'seed_company',
    region: 'Arusha',
    ...overrides,
  };
}

function previewDto(fileBase64: string): ActorImportRequestDto {
  return { fileName: 'import.xlsx', fileBase64, mode: 'preview' };
}

function commitDto(
  fileBase64: string,
  acknowledged?: boolean,
): ActorImportRequestDto {
  return { fileName: 'import.xlsx', fileBase64, mode: 'commit', acknowledged };
}

describe('ActorImportService', () => {
  let service: ActorImportService;
  let prisma: {
    actor: { findMany: jest.Mock; create: jest.Mock };
    crop: { findMany: jest.Mock };
    cropsOnActors: { createMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    actor: { create: jest.Mock };
    cropsOnActors: { createMany: jest.Mock };
  };
  let auditService: { logImport: jest.Mock };
  let resolver: { resolve: jest.Mock };

  beforeEach(() => {
    let seq = 0;
    tx = {
      actor: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: `new-${(seq += 1)}`,
          district: null,
          sex: null,
          position: null,
          marketLocation: null,
          capacityTons: null,
          technicalSupport: null,
          phone: null,
          email: null,
          gpsLatitude: null,
          gpsLongitude: null,
          gpsAltitude: null,
          gpsAccuracy: null,
          consentStatus: 'UNKNOWN',
          createdAt: new Date('2026-07-10T00:00:00Z'),
          updatedAt: new Date('2026-07-10T00:00:00Z'),
          ...data,
        })),
      },
      cropsOnActors: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };

    prisma = {
      actor: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      crop: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'crop-sorghum', name: 'sorghum' },
          { id: 'crop-bean', name: 'common_bean' },
          { id: 'crop-groundnut', name: 'groundnut' },
        ]),
      },
      cropsOnActors: { createMany: jest.fn() },
      $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    };

    auditService = { logImport: jest.fn().mockResolvedValue({ count: 0 }) };
    resolver = { resolve: jest.fn().mockResolvedValue('admin@example.com') };

    service = new ActorImportService(
      prisma as unknown as PrismaService,
      auditService as unknown as ActorAuditService,
      resolver as unknown as ActingAdminResolver,
    );
  });

  describe('parsing & mapping', () => {
    it('maps headers/columns and classifies a valid row as a prospective create', async () => {
      const b64 = await buildWorkbook([
        validRow({ traderId: 'TZ-9', traderName: 'Meru Seeds' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.mode).toBe('preview');
      expect(report.rows).toHaveLength(1);
      expect(report.rows[0]).toMatchObject({
        rowNumber: 2,
        traderId: 'TZ-9',
        traderName: 'Meru Seeds',
        outcome: 'create',
      });
      expect(report.totals).toMatchObject({
        rows: 1,
        toCreate: 1,
        created: 0,
        skipped: 0,
        failed: 0,
      });
    });

    it('skips fully-empty data rows entirely', async () => {
      const b64 = await buildWorkbook([validRow(), {}, validRow({ traderId: 'TZ-2' })]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.totals.rows).toBe(2);
      expect(report.rows.map((r) => r.traderId)).toEqual(['TZ-1', 'TZ-2']);
    });

    it('reads the template version from the Instructions sheet (best effort)', async () => {
      const b64 = await buildWorkbook([validRow()], {
        instructionsVersion: TEMPLATE_VERSION,
      });

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.templateVersionDetected).toBe(TEMPLATE_VERSION);
    });

    // T-6 (FR-5) — a template stamped with an OLDER version is rejected
    // legibly, telling the admin to re-download, rather than falling through
    // to the generic "no Data sheet matching" column-mismatch error.
    it('rejects a workbook stamped with a stale template version', async () => {
      const b64 = await buildWorkbook([validRow()], { instructionsVersion: 'v1' });

      await expect(service.run(previewDto(b64), 'sub-1')).rejects.toThrow(
        /out of date.*re-download/i,
      );
    });

    // T-6 (FR-11) — the message must also point to WHERE to get the current
    // template, not just that one is needed. This is a new element on top of
    // the pre-existing "out of date ... re-download" pair above (KZ-002: a
    // presence check that only re-proves the old substrings is not evidence
    // for this task).
    it('names the template download location in the stale-template message', async () => {
      const b64 = await buildWorkbook([validRow()], { instructionsVersion: 'v1' });

      await expect(service.run(previewDto(b64), 'sub-1')).rejects.toThrow(
        /link on this page/i,
      );
    });

    it('locates the data sheet by matching headers when it is not named "Data"', async () => {
      const b64 = await buildWorkbook([validRow()], { sheetName: 'Sheet1' });

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('create');
    });

    it('rejects a workbook whose headers do not match the template (400)', async () => {
      const b64 = await buildWorkbook([], { headers: ['Foo', 'Bar'] });

      await expect(service.run(previewDto(b64), 'sub-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a corrupt / non-xlsx buffer with a clean 400', async () => {
      const b64 = Buffer.from('this is definitely not a workbook').toString(
        'base64',
      );

      await expect(service.run(previewDto(b64), 'sub-1')).rejects.toThrow(
        /not a valid \.xlsx/i,
      );
    });
  });

  describe('per-field validation', () => {
    it('reports field-level errors with row numbers and never echoes PII values', async () => {
      const b64 = await buildWorkbook([
        {
          traderId: '',
          traderName: '',
          traderType: 'not_a_type',
          region: 'Atlantis',
          email: 'super-secret-not-an-email',
          capacityTons: -5,
          consentStatus: 'MAYBE',
          cropSorghum: 'PERHAPS',
        },
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      const row = report.rows[0];
      expect(row.outcome).toBe('failed');
      const fields = (row.errors ?? []).map((e) => e.field).sort();
      expect(fields).toEqual([
        'capacityTons',
        'consentStatus',
        'cropSorghum',
        'email',
        'region',
        'traderId',
        'traderName',
        'traderType',
      ]);
      // FR-11: the offending email value must never appear in any message.
      const messages = JSON.stringify(report.rows);
      expect(messages).not.toContain('super-secret-not-an-email');
      expect(report.totals.failed).toBe(1);
      expect(report.totals.toCreate).toBe(0);
    });

    it('accepts a valid email and rejects a malformed one', async () => {
      const b64 = await buildWorkbook([
        validRow({ traderId: 'TZ-ok', email: 'ok@example.org' }),
        validRow({ traderId: 'TZ-bad', email: 'nope-at-example' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('create');
      expect(report.rows[1].outcome).toBe('failed');
      expect(report.rows[1].errors?.[0].field).toBe('email');
    });
  });

  describe('GPS handling (DR-5)', () => {
    it('clears all GPS and warns when latitude/longitude is out of range, without failing the row', async () => {
      const b64 = await buildWorkbook([
        validRow({
          gpsLatitude: 200,
          gpsLongitude: 39.2,
          gpsAltitude: 1400,
          gpsAccuracy: 5,
        }),
      ]);

      const report = await service.run(commitDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('created');
      expect(report.rows[0].warnings).toContain(
        'GPS out of range — imported with GPS cleared',
      );
      expect(report.totals.warnings).toBe(1);

      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(created).not.toHaveProperty('gpsLatitude');
      expect(created).not.toHaveProperty('gpsLongitude');
      expect(created).not.toHaveProperty('gpsAltitude');
      expect(created).not.toHaveProperty('gpsAccuracy');
    });

    it('keeps in-range GPS on the created actor', async () => {
      const b64 = await buildWorkbook([
        validRow({ gpsLatitude: -3.3869, gpsLongitude: 36.683 }),
      ]);

      await service.run(commitDto(b64), 'sub-1');

      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(created.gpsLatitude).toBe(-3.3869);
      expect(created.gpsLongitude).toBe(36.683);
    });
  });

  /**
   * T-3 — phone normalization wired into the row pipeline (FR-5, design.md
   * §4.1, F-1). All fixture numbers are synthetic; no real number from the
   * client workbook appears here (NFR-9).
   *
   * **This block covers a NARROWING of shipped behavior (F-1).** Before T-3
   * the importer stored the Phone cell verbatim (`phone: cells.phone ||
   * undefined`); a value the normalizer does not recognise now stores as
   * `null` plus a warning. That is deliberate, and these tests are what make
   * it visible rather than buried.
   */
  describe('phone normalization (FR-5, T-3)', () => {
    const CLEARED_WARNING =
      'Phone — value is not a recognized Tanzanian number; imported with Phone cleared';

    it('stores a normalizable phone canonically, with no warning', async () => {
      const b64 = await buildWorkbook([validRow({ phone: '0700000002' })]);

      const report = await service.run(commitDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('created');
      expect(report.totals.warnings).toBe(0);

      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(created.phone).toBe('+255700000002');
    });

    it('creates the row with phone null and a warning when the cell cannot be normalized', async () => {
      // FR-5: an unusable phone is not grounds to reject a real organisation.
      const b64 = await buildWorkbook([validRow({ phone: 'ring my office' })]);

      const report = await service.run(commitDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('created');
      expect(report.rows[0].warnings).toContain(CLEARED_WARNING);
      expect(report.totals.warnings).toBe(1);

      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      // Explicitly `null` — NOT absent, and NOT the raw string. Storing the
      // unnormalizable value verbatim is the behavior T-3 removes.
      expect(created).toHaveProperty('phone');
      expect(created.phone).toBeNull();
    });

    it('never stores the raw string as a fallback for a rejected value', async () => {
      const raw = 'contact via 0700-000-002 or the office';
      const b64 = await buildWorkbook([validRow({ phone: raw })]);

      const report = await service.run(commitDto(b64), 'sub-1');

      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(created.phone).toBeNull();
      expect(JSON.stringify(report)).not.toContain(raw);
    });

    it('keeps the first number of a "/"-separated cell and warns about the rest', async () => {
      const b64 = await buildWorkbook([
        validRow({ phone: '700000006/700000007' }),
      ]);

      const report = await service.run(commitDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('created');
      expect(report.rows[0].warnings).toContain(
        'Phone — an additional value was present at position 2; only the first number was imported and the rest were not stored',
      );

      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(created.phone).toBe('+255700000006');
    });

    it('names positions, never digits, when more than one number is discarded', async () => {
      const b64 = await buildWorkbook([
        validRow({ phone: '700000006/700000007/700000009' }),
      ]);

      const report = await service.run(commitDto(b64), 'sub-1');

      expect(report.rows[0].warnings).toContain(
        'Phone — 2 additional values were present at positions 2–3; only the first number was imported and the rest were not stored',
      );
    });

    it('puts no digit of the discarded numbers anywhere in the report (FR-5, NFR-9)', async () => {
      const b64 = await buildWorkbook([
        validRow({ phone: '700000006/700000007/700000009' }),
      ]);

      const report = await service.run(commitDto(b64), 'sub-1');

      const reportText = JSON.stringify(report);
      // The KEPT number is legitimately absent from the report too — the
      // report echoes only non-PII identity — but the discarded ones are the
      // values that must never have left `normalizePhone()` at all.
      for (const discarded of ['700000007', '700000009']) {
        expect(reportText).not.toContain(discarded);
      }
    });

    it('raises BOTH warnings when the first segment is unusable and later ones exist', async () => {
      // T-1 advisory A2: `additionalCount` counts SEGMENTS, so
      // `{ phone: null, additionalCount: 1 }` is reachable. The pipeline must
      // not assume a non-null phone whenever the count is > 0.
      const b64 = await buildWorkbook([validRow({ phone: 'n/a/700000007' })]);

      const report = await service.run(commitDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('created');
      expect(report.rows[0].warnings).toEqual(
        expect.arrayContaining([
          CLEARED_WARNING,
          expect.stringContaining('additional value'),
        ]),
      );

      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(created.phone).toBeNull();
    });

    it('writes no second number into any other Actor field', async () => {
      const b64 = await buildWorkbook([
        validRow({ phone: '700000006/700000007' }),
      ]);

      await service.run(commitDto(b64), 'sub-1');

      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      // Scan every scalar written, not just the fields we thought to name —
      // FR-5's clause is "no OTHER field", which a fixed list cannot prove.
      for (const [field, value] of Object.entries(created)) {
        if (field === 'phone') continue;
        expect(JSON.stringify(value ?? null)).not.toContain('700000007');
      }
    });

    it('leaves an empty Phone cell absent and unwarned, exactly as before', async () => {
      const b64 = await buildWorkbook([validRow()]);

      const report = await service.run(commitDto(b64), 'sub-1');

      expect(report.totals.warnings).toBe(0);

      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      // `undefined` is dropped by `buildCreateData`, so the column is simply
      // not written — distinct from the explicit `null` of a rejected value.
      expect(created).not.toHaveProperty('phone');
    });
  });

  /**
   * T-4 — per-reason breakdown of rows that did not import (FR-7, design.md
   * §4.3, DD-4). Purely additive: every pre-existing report field keeps its
   * name, type, and optionality, and no existing test needed a change.
   */
  describe('failure breakdown (FR-7, T-4)', () => {
    /** Fails BOTH traderType and region — the one row that separates the rules. */
    const multiErrorRow = (overrides: CellMap = {}): CellMap =>
      validRow({ region: 'Atlantis', traderType: 'not-a-real-type', ...overrides });

    it('names a multi-error row by TEMPLATE ORDER, not by insertion order', async () => {
      // The whole point of the rule. `validateRow` pushes `region` BEFORE
      // `traderType`, while TEMPLATE_COLUMNS orders Trader Type FIRST. So
      // `errors[0]` yields `region` and the correct answer is `traderType` —
      // a fixture without a multi-error row cannot tell the two apart, which
      // is exactly what T-4's disqualifier warns about.
      const b64 = await buildWorkbook([multiErrorRow()]);

      const report = await service.run(previewDto(b64), 'sub-1');

      // Guard the premise: if validateRow's push order ever changes, this
      // test must fail loudly rather than quietly start passing for the wrong
      // reason.
      expect(report.rows[0].errors?.map((e) => e.field)).toEqual([
        'region',
        'traderType',
      ]);

      expect(report.failureBreakdown).toEqual([
        { reason: 'traderType', count: 1 },
      ]);
    });

    it('sums to failed + skipped exactly on a mixed fixture containing a multi-error row', async () => {
      prisma.actor.findMany.mockResolvedValueOnce([{ traderId: 'TZ-EXISTS' }]);
      const b64 = await buildWorkbook([
        validRow({ traderId: 'TZ-OK' }),
        validRow({ traderId: 'TZ-DUP' }),
        validRow({ traderId: 'TZ-DUP' }),
        validRow({ traderId: 'TZ-EXISTS' }),
        multiErrorRow({ traderId: 'TZ-MULTI' }),
        validRow({ traderId: 'TZ-REGION', region: 'Atlantis' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      const breakdown = report.failureBreakdown ?? [];
      const total = breakdown.reduce((sum, entry) => sum + entry.count, 0);
      expect(total).toBe(report.totals.failed + report.totals.skipped);
      // Pin the arithmetic too, so a change that moves BOTH sides together
      // (e.g. rows silently dropped) cannot keep this green.
      expect(report.totals.failed).toBe(2);
      expect(report.totals.skipped).toBe(2);
      expect(total).toBe(4);
    });

    it('orders by count descending, then reason ascending', async () => {
      const b64 = await buildWorkbook([
        validRow({ traderId: 'TZ-R1', region: 'Atlantis' }),
        validRow({ traderId: 'TZ-R2', region: 'Atlantis' }),
        validRow({ traderId: '', traderName: 'No Id' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      // `region` (2) outranks `traderId` (1) on count; had they tied, the
      // ascending slug comparison would still put `region` first.
      expect(report.failureBreakdown).toEqual([
        { reason: 'region', count: 2 },
        { reason: 'traderId', count: 1 },
      ]);
    });

    it('breaks a count tie on the reason slug, ascending', async () => {
      const b64 = await buildWorkbook([
        validRow({ traderId: 'TZ-R1', region: 'Atlantis' }),
        validRow({ traderId: '', traderName: 'No Id' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.failureBreakdown).toEqual([
        { reason: 'region', count: 1 },
        { reason: 'traderId', count: 1 },
      ]);
    });

    it('is byte-identical across two runs over the same input (NFR-6)', async () => {
      const rows = [
        validRow({ traderId: 'TZ-R1', region: 'Atlantis' }),
        validRow({ traderId: 'TZ-R2', region: 'Atlantis' }),
        validRow({ traderId: '', traderName: 'No Id' }),
        multiErrorRow({ traderId: 'TZ-MULTI' }),
      ];

      const first = await service.run(previewDto(await buildWorkbook(rows)), 'sub-1');
      const second = await service.run(previewDto(await buildWorkbook(rows)), 'sub-1');

      expect(JSON.stringify(first.failureBreakdown)).toBe(
        JSON.stringify(second.failureBreakdown),
      );
    });

    it('names skipped rows by their outcome', async () => {
      prisma.actor.findMany.mockResolvedValueOnce([{ traderId: 'TZ-EXISTS' }]);
      const b64 = await buildWorkbook([
        validRow({ traderId: 'TZ-EXISTS' }),
        validRow({ traderId: 'TZ-DUP' }),
        validRow({ traderId: 'TZ-DUP' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.failureBreakdown).toEqual([
        { reason: 'skipped-duplicate-in-file', count: 1 },
        { reason: 'skipped-exists', count: 1 },
      ]);
    });

    it('surfaces a rolled-back batch as batch-rolled-back, never as _row', async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error('chunk exploded'));
      const b64 = await buildWorkbook([validRow({ traderId: 'TZ-BOOM' })]);

      const report = await service.run(commitDto(b64), 'sub-1');

      expect(report.failureBreakdown).toEqual([
        { reason: 'batch-rolled-back', count: 1 },
      ]);
      // `_row` is an internal pseudo-field. It may appear in the row's own
      // errors, but never in the breakdown, where it would read as a column.
      const reasons = (report.failureBreakdown ?? []).map((e) => e.reason);
      expect(reasons).not.toContain('_row');
    });

    it('is omitted entirely when every row imports', async () => {
      const b64 = await buildWorkbook([validRow({ traderId: 'TZ-CLEAN' })]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.totals.failed).toBe(0);
      expect(report.totals.skipped).toBe(0);
      expect(report).not.toHaveProperty('failureBreakdown');
    });

    it('leaves every pre-existing report field untouched (NFR-3)', async () => {
      const b64 = await buildWorkbook([
        validRow({ traderId: 'TZ-OK' }),
        validRow({ traderId: 'TZ-R1', region: 'Atlantis' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(Object.keys(report.totals).sort()).toEqual([
        'created',
        'failed',
        'rows',
        'skipped',
        'toCreate',
        'warnings',
      ]);
      expect(Object.keys(report).sort()).toEqual([
        'failureBreakdown',
        'mode',
        'rows',
        'totals',
      ]);
    });
  });

  describe('dedupe (FR-4)', () => {
    it('keeps the first valid in-file occurrence and skips later duplicates', async () => {
      const b64 = await buildWorkbook([
        validRow({ traderId: 'TZ-DUP', traderName: 'First' }),
        validRow({ traderId: 'TZ-DUP', traderName: 'Second' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('create');
      expect(report.rows[1].outcome).toBe('skipped-duplicate-in-file');
      expect(report.totals.skipped).toBe(1);
      expect(report.totals.toCreate).toBe(1);
    });

    it('skips rows whose traderId already exists in the registry', async () => {
      prisma.actor.findMany.mockResolvedValueOnce([{ traderId: 'TZ-EXISTS' }]);
      const b64 = await buildWorkbook([
        validRow({ traderId: 'TZ-EXISTS' }),
        validRow({ traderId: 'TZ-NEW' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('skipped-exists');
      expect(report.rows[1].outcome).toBe('create');
      expect(report.totals.skipped).toBe(1);
    });
  });

  describe('consent gate (FR-6)', () => {
    // Rows below carry VALID per-row provenance (consentMethod + a date) so
    // these tests isolate the pre-existing file-level `acknowledged` gate,
    // which remains independent of the T-6 per-row provenance gate covered in
    // its own describe block below (DD-5, NFR-7).
    const grantedRow = (overrides: CellMap = {}): CellMap =>
      validRow({
        consentStatus: 'GRANTED',
        consentMethod: 'SIGNED_FORM',
        consentObtainedAt: '2026-01-01',
        ...overrides,
      });

    it('fails GRANTED rows on commit without acknowledgement', async () => {
      const b64 = await buildWorkbook([grantedRow()]);

      const report = await service.run(commitDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('failed');
      expect(report.rows[0].errors?.[0].field).toBe('consentStatus');
      expect(tx.actor.create).not.toHaveBeenCalled();
    });

    it('imports GRANTED rows on commit when acknowledged is true', async () => {
      const b64 = await buildWorkbook([grantedRow()]);

      const report = await service.run(commitDto(b64, true), 'sub-1');

      expect(report.rows[0].outcome).toBe('created');
      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(created.consentStatus).toBe('GRANTED');
      expect(auditService.logImport).toHaveBeenCalledWith(
        tx,
        expect.any(Array),
        { sub: 'sub-1', email: 'admin@example.com' },
        true,
      );
    });

    it('defaults an empty consent column to UNKNOWN', async () => {
      const b64 = await buildWorkbook([validRow()]);

      await service.run(commitDto(b64), 'sub-1');

      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(created.consentStatus).toBe('UNKNOWN');
    });

    it('marks GRANTED rows as create with an acknowledgement warning in preview', async () => {
      const b64 = await buildWorkbook([grantedRow()]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('create');
      expect(report.rows[0].warnings?.[0]).toMatch(/acknowledgement/i);
    });
  });

  describe('per-row consent provenance (T-6, FR-3, NFR-7, DD-5)', () => {
    it('fails a GRANTED row with no method/date, but leaves its neighbours untouched (QA-9)', async () => {
      const b64 = await buildWorkbook([
        validRow({ traderId: 'TZ-OK-BEFORE', traderName: 'Before' }),
        validRow({
          traderId: 'TZ-NO-PROVENANCE',
          traderName: 'No Provenance',
          consentStatus: 'GRANTED',
        }),
        validRow({ traderId: 'TZ-OK-AFTER', traderName: 'After' }),
      ]);

      const report = await service.run(commitDto(b64, true), 'sub-1');

      expect(report.rows[0].outcome).toBe('created');
      expect(report.rows[1].outcome).toBe('failed');
      const fields = (report.rows[1].errors ?? []).map((e) => e.field).sort();
      expect(fields).toEqual(['consentMethod', 'consentObtainedAt']);
      expect(report.rows[2].outcome).toBe('created');
      expect(report.totals).toMatchObject({ created: 2, failed: 1 });
    });

    it('fails a GRANTED row that has a method but no date', async () => {
      const b64 = await buildWorkbook([
        validRow({
          consentStatus: 'GRANTED',
          consentMethod: 'SIGNED_FORM',
        }),
      ]);

      const report = await service.run(commitDto(b64, true), 'sub-1');

      expect(report.rows[0].outcome).toBe('failed');
      expect(report.rows[0].errors?.[0].field).toBe('consentObtainedAt');
    });

    it('accepts a GRANTED row with full row-level provenance and persists all four new fields', async () => {
      const b64 = await buildWorkbook([
        validRow({
          consentStatus: 'GRANTED',
          registrationSource: 'SELF_REGISTERED',
          consentMethod: 'EMAIL',
          consentObtainedAt: '2026-01-15',
          consentReference: 'thread-123',
        }),
      ]);

      const report = await service.run(commitDto(b64, true), 'sub-1');

      expect(report.rows[0].outcome).toBe('created');
      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(created.registrationSource).toBe('SELF_REGISTERED');
      expect(created.consentMethod).toBe('EMAIL');
      expect(created.consentObtainedAt).toBe('2026-01-15T00:00:00.000Z');
      expect(created.consentReference).toBe('thread-123');
    });

    it('defaults registrationSource/consentMethod when the columns are blank', async () => {
      const b64 = await buildWorkbook([validRow()]);

      await service.run(commitDto(b64), 'sub-1');

      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(created.registrationSource).toBe('TEAM_MANAGED');
      expect(created.consentMethod).toBe('NOT_RECORDED');
      expect(created).not.toHaveProperty('consentObtainedAt');
      expect(created).not.toHaveProperty('consentReference');
    });

    it('rejects an invalid registrationSource/consentMethod value with a field error', async () => {
      const b64 = await buildWorkbook([
        validRow({ registrationSource: 'BOGUS', consentMethod: 'BOGUS' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('failed');
      const fields = (report.rows[0].errors ?? []).map((e) => e.field).sort();
      expect(fields).toEqual(['consentMethod', 'registrationSource']);
    });

    it('converts a date-only Consent Obtained At cell to a full instant (E-2)', async () => {
      const b64 = await buildWorkbook([
        validRow({
          consentStatus: 'GRANTED',
          consentMethod: 'SIGNED_FORM',
          consentObtainedAt: '2026-02-20',
        }),
      ]);

      const report = await service.run(commitDto(b64, true), 'sub-1');

      expect(report.rows[0].outcome).toBe('created');
      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(created.consentObtainedAt).toBe('2026-02-20T00:00:00.000Z');
    });

    it('converts an Excel serial date number for Consent Obtained At (E-2)', async () => {
      // Excel serial 46023 = 2026-01-01 (epoch 1899-12-30).
      const b64 = await buildWorkbook([
        validRow({
          consentStatus: 'GRANTED',
          consentMethod: 'SIGNED_FORM',
          consentObtainedAt: 46023,
        }),
      ]);

      const report = await service.run(commitDto(b64, true), 'sub-1');

      expect(report.rows[0].outcome).toBe('created');
      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(created.consentObtainedAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('rejects an unparsable Consent Obtained At value with a field error, never a 500', async () => {
      const b64 = await buildWorkbook([
        validRow({ consentObtainedAt: 'not-a-date' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('failed');
      expect(report.rows[0].errors?.[0].field).toBe('consentObtainedAt');
    });

    // T-6 rework attempt 2 — the Excel-serial branch previously had no
    // plausibility bound, so a bare number typed into the cell (a year, a
    // day-of-month, or a "0" from a formula over an empty reference) silently
    // parsed into a fabricated date and satisfied the provenance gate.
    it.each([0, 2026, 15])(
      'rejects a bare implausible number (%d) for Consent Obtained At',
      async (value) => {
        const b64 = await buildWorkbook([
          validRow({ consentObtainedAt: value }),
        ]);

        const report = await service.run(previewDto(b64), 'sub-1');

        expect(report.rows[0].outcome).toBe('failed');
        expect(report.rows[0].errors?.[0].field).toBe('consentObtainedAt');
      },
    );

    it('rejects a large-but-in-range serial that would overflow into an expanded-year ISO string', async () => {
      // 20260115 is a plausible way to type "2026-01-15" without separators,
      // but as an Excel serial it maps to year ≈ 57,369 — a string Prisma
      // (and MySQL's DATETIME bound) rejects. The not-in-the-future check
      // rejects it as a per-row error before it ever reaches Prisma.
      const b64 = await buildWorkbook([
        validRow({ consentObtainedAt: 20260115 }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('failed');
      expect(report.rows[0].errors?.[0].field).toBe('consentObtainedAt');
    });

    it('rejects a full-instant Consent Obtained At with out-of-range components', async () => {
      const b64 = await buildWorkbook([
        validRow({ consentObtainedAt: '2026-13-45T99:99:99Z' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('failed');
      expect(report.rows[0].errors?.[0].field).toBe('consentObtainedAt');
    });
  });

  describe('preview writes nothing (FR-3)', () => {
    it('never opens a transaction or creates an actor in preview mode', async () => {
      const b64 = await buildWorkbook([
        validRow({ traderId: 'TZ-1' }),
        validRow({ traderId: 'TZ-2' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.totals.created).toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.actor.create).not.toHaveBeenCalled();
      expect(auditService.logImport).not.toHaveBeenCalled();
    });
  });

  describe('commit chunking & fault isolation (FR-5)', () => {
    it('creates actors with crop links and one audit batch', async () => {
      const b64 = await buildWorkbook([
        validRow({ traderId: 'TZ-1', cropSorghum: 'YES', cropGroundnut: 'YES' }),
      ]);

      const report = await service.run(commitDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('created');
      expect(report.rows[0].actorId).toBe('new-1');
      expect(tx.cropsOnActors.createMany).toHaveBeenCalledWith({
        data: [
          { actorId: 'new-1', cropId: 'crop-sorghum' },
          { actorId: 'new-1', cropId: 'crop-groundnut' },
        ],
      });
      expect(auditService.logImport).toHaveBeenCalledTimes(1);
      expect(report.totals).toMatchObject({ created: 1, toCreate: 1, failed: 0 });
    });

    it('rolls back a failing chunk and still runs later chunks', async () => {
      // 150 valid rows → two chunks (100 + 50). First chunk's transaction throws.
      const rows = Array.from({ length: 150 }, (_, i) =>
        validRow({ traderId: `TZ-${i + 1}`, traderName: `Actor ${i + 1}` }),
      );
      const b64 = await buildWorkbook(rows);

      let call = 0;
      prisma.$transaction.mockImplementation(
        async (cb: (t: typeof tx) => unknown) => {
          call += 1;
          if (call === 1) throw new Error('chunk 1 boom');
          return cb(tx);
        },
      );

      const report = await service.run(commitDto(b64), 'sub-1');

      const created = report.rows.filter((r) => r.outcome === 'created');
      const failed = report.rows.filter((r) => r.outcome === 'failed');
      expect(created).toHaveLength(50);
      expect(failed).toHaveLength(100);
      expect(failed[0].errors?.[0].message).toMatch(/rolled back/i);
      expect(report.totals).toMatchObject({
        rows: 150,
        created: 50,
        failed: 100,
      });
    });
  });

  describe('totals consistency', () => {
    it('keeps totals aligned with the rows array across mixed outcomes', async () => {
      prisma.actor.findMany.mockResolvedValueOnce([{ traderId: 'TZ-EXISTS' }]);
      const b64 = await buildWorkbook([
        validRow({ traderId: 'TZ-NEW-1' }), // create
        validRow({ traderId: 'TZ-EXISTS' }), // skipped-exists
        validRow({ traderId: 'TZ-NEW-1' }), // skipped-duplicate-in-file
        validRow({ traderId: '', region: 'Atlantis' }), // failed
        validRow({ traderId: 'TZ-NEW-2', gpsLatitude: 999 }), // create + warning
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      const outcomes = report.rows.map((r) => r.outcome);
      expect(outcomes).toEqual([
        'create',
        'skipped-exists',
        'skipped-duplicate-in-file',
        'failed',
        'create',
      ]);
      expect(report.totals).toEqual({
        rows: 5,
        toCreate: 2,
        created: 0,
        skipped: 2,
        failed: 1,
        warnings: 1,
      });
    });
  });

  describe('caps & guards', () => {
    it('rejects a decoded file larger than 4 MB (400)', async () => {
      const b64 = Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64');

      await expect(service.run(previewDto(b64), 'sub-1')).rejects.toThrow(
        /maximum is/i,
      );
    });

    it('rejects a workbook with more than 1,000 data rows (400)', async () => {
      const rows = Array.from({ length: 1001 }, (_, i) =>
        validRow({ traderId: `TZ-${i + 1}` }),
      );
      const b64 = await buildWorkbook(rows);

      await expect(service.run(previewDto(b64), 'sub-1')).rejects.toThrow(
        /maximum is 1000/i,
      );
    });
  });
});
