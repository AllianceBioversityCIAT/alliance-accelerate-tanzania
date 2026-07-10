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
import { TEMPLATE_COLUMNS, TEMPLATE_HEADERS } from '../common/template-columns';

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
      const b64 = await buildWorkbook([validRow()], { instructionsVersion: 'v1' });

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.templateVersionDetected).toBe('v1');
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
    it('fails GRANTED rows on commit without acknowledgement', async () => {
      const b64 = await buildWorkbook([
        validRow({ consentStatus: 'GRANTED' }),
      ]);

      const report = await service.run(commitDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('failed');
      expect(report.rows[0].errors?.[0].field).toBe('consentStatus');
      expect(tx.actor.create).not.toHaveBeenCalled();
    });

    it('imports GRANTED rows on commit when acknowledged is true', async () => {
      const b64 = await buildWorkbook([
        validRow({ consentStatus: 'GRANTED' }),
      ]);

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
      const b64 = await buildWorkbook([
        validRow({ consentStatus: 'GRANTED' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('create');
      expect(report.rows[0].warnings?.[0]).toMatch(/acknowledgement/i);
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
