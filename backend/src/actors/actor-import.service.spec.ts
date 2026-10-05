// @sdd-spec admin/actor-import
/**
 * T-5 (admin/actor-import) / T-4 (actors/consent-intake/intake-required-fields)
 * — `ActorImportService` unit tests (design §10).
 *
 * Fixtures are real `.xlsx` workbooks built in-memory with exceljs and handed to
 * the service as base64, so the parse + validate + consent + chunk pipeline is
 * exercised end-to-end against a mocked Prisma client. Covers: header/column
 * mapping, per-field validation (including the v4 intake-contract required
 * set), GPS-cleared warning (DR-5), the consent gate (FR-6), preview writing
 * nothing (FR-3), per-chunk Trader ID allocation + collision retry + chunk
 * fault isolation (FR-2, FR-5), totals consistency, the size/row caps, and
 * corrupt-buffer handling.
 *
 * T-4 (consent-intake/intake-required-fields) — the Trader-ID dedupe
 * (`dedupeInFile`/`dedupeAgainstDb`) is removed from the production code, so
 * every `skipped-exists`/`skipped-duplicate-in-file` scenario below is
 * REWRITTEN to prove the new, declared gap instead (tasks.md: "In between,
 * the branch has no import dedupe — acceptable, unreleased branch"). T-5
 * replaces this with duplicate classification and restores equivalent
 * coverage under the new outcome.
 */

import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { isEmail, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { ActorImportService } from './actor-import.service';
import { ActorAuditService } from './actor-audit.service';
import { ActingAdminResolver } from './acting-admin.resolver';
import { PrismaService } from '../prisma/prisma.service';
import { ActorImportRequestDto } from './dto/actor-import-request.dto';
import { AdminActorCreateDto } from './dto/admin-actor-create.dto';
import { MAX_TRADER_ID_ALLOCATION_ATTEMPTS } from './trader-id.util';
import {
  TEMPLATE_COLUMNS,
  TEMPLATE_HEADERS,
  TEMPLATE_VERSION,
} from '../common/template-columns';
import {
  INTAKE_MAX_LENGTHS,
  INTAKE_REQUIRED_FIELDS,
  IntakeRequiredField,
} from '../common/intake-contract';

type CellMap = Record<string, string | number>;

/** A real Prisma `P2002` on `traderId`, the MySQL shape measured in T-2 (execution.md). */
function buildTraderIdCollisionError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`traderId`)',
    {
      code: 'P2002',
      clientVersion: '0.0.0',
      meta: { modelName: 'Actor', target: 'Actor_traderId_key' },
    },
  );
}

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

/**
 * A minimal valid data row (every intake-contract required field filled);
 * override as needed. `traderId` is NOT a column any more (T-4) — the system
 * assigns it at commit; any stray `traderId` key in an override is simply
 * never written to a cell.
 */
function validRow(overrides: CellMap = {}): CellMap {
  return {
    traderName: 'Actor One',
    traderType: 'seed_company',
    region: 'Arusha',
    contactPerson: 'Jane Mwangi',
    capacityTons: 10,
    phone: '0700000002',
    email: 'actor@example.org',
    cropSorghum: 'YES',
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
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let auditService: { logImport: jest.Mock };
  let resolver: { resolve: jest.Mock };

  beforeEach(() => {
    let seq = 0;

    // T-4 — in-memory `ActorSequence` counter (design.md §4.2), reachable
    // through the SAME `$transaction` as the chunk's own create transaction:
    // `allocateTraderIds` opens its own transaction, resolved to this same
    // `tx` by the `$transaction` mock below (mirrors
    // `actors-admin.service.spec.ts`'s T-2 pattern).
    let sequenceRows: Array<{ year: number; seq: number }> = [];
    let sessionNewSeq: number | null = null;

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
          consentStatus: 'UNKNOWN',
          createdAt: new Date('2026-07-10T00:00:00Z'),
          updatedAt: new Date('2026-07-10T00:00:00Z'),
          ...data,
        })),
      },
      cropsOnActors: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $executeRaw: jest.fn(
        async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const sql = strings.join('?');
          if (!sql.includes('ActorSequence')) {
            throw new Error(`Fake $executeRaw: unrecognized SQL: ${sql}`);
          }
          const [year, count] = values as [number, number];
          let row = sequenceRows.find((r) => r.year === year);
          if (!row) {
            row = { year, seq: count };
            sequenceRows.push(row);
          } else {
            row.seq += count;
          }
          sessionNewSeq = row.seq;
          return 1;
        },
      ),
      $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
        const sql = strings.join('?');
        if (!sql.includes('@newActorSeq')) {
          throw new Error(`Fake $queryRaw: unrecognized SQL: ${sql}`);
        }
        return [{ newActorSeq: sessionNewSeq as number }];
      }),
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
      const b64 = await buildWorkbook([validRow({ traderName: 'Meru Seeds' })]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.mode).toBe('preview');
      expect(report.rows).toHaveLength(1);
      expect(report.rows[0]).toMatchObject({
        rowNumber: 2,
        // T-4 — Trader ID is system-generated at commit; a preview row
        // carries no id yet (design.md §5: "—" in the UI maps to `null`).
        traderId: null,
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
      const b64 = await buildWorkbook([
        validRow({ traderName: 'First' }),
        {},
        validRow({ traderName: 'Second' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.totals.rows).toBe(2);
      expect(report.rows.map((r) => r.traderName)).toEqual(['First', 'Second']);
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
      const b64 = await buildWorkbook([validRow()], { instructionsVersion: 'v2' });

      await expect(service.run(previewDto(b64), 'sub-1')).rejects.toThrow(
        /out of date.*re-download/i,
      );
    });

    // T-4 (consent-intake/intake-required-fields, FR-5) — v3 (the PREVIOUS
    // version, dropped by this task) is rejected exactly like any other
    // stale version, naming the version now expected (v4).
    it('rejects a workbook stamped v3, naming v4 as the expected version', async () => {
      const b64 = await buildWorkbook([validRow()], { instructionsVersion: 'v3' });

      await expect(service.run(previewDto(b64), 'sub-1')).rejects.toThrow(
        /found v3, current is v4/i,
      );
    });

    // T-6 (FR-11) — the message must also point to WHERE to get the current
    // template, not just that one is needed. This is a new element on top of
    // the pre-existing "out of date ... re-download" pair above (KZ-002: a
    // presence check that only re-proves the old substrings is not evidence
    // for this task).
    it('names the template download location in the stale-template message', async () => {
      const b64 = await buildWorkbook([validRow()], { instructionsVersion: 'v2' });

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
          // T-4 — traderName/contactPerson/phone/capacityTons/email/crops all
          // left blank too, on top of the pre-existing malformed fields, so
          // every one of the v4 required-set fields is independently proven
          // to redden here, not just the format checks T-6 already covered.
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
      // A genuinely MISSING contract field (contactPerson/phone here) can
      // legitimately carry more than one class-validator message (IsString +
      // MinLength + MaxLength all fail on `undefined`, FR-1), so this checks
      // the set of DISTINCT fields named, not the raw error count.
      const fields = [...new Set((row.errors ?? []).map((e) => e.field))].sort();
      expect(fields).toEqual([
        'capacityTons',
        'consentStatus',
        'contactPerson',
        'cropSorghum',
        'crops',
        'email',
        'phone',
        'region',
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
        validRow({ traderName: 'Ok Trader', email: 'ok@example.org' }),
        validRow({ traderName: 'Bad Trader', email: 'nope-at-example' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('create');
      expect(report.rows[1].outcome).toBe('failed');
      expect(report.rows[1].errors?.[0].field).toBe('email');
    });
  });

  // T-4 (public-profile-disclosure) — Contact Person and Other Crops (v3,
  // FR-5). The parser is a SECOND writer of these two columns (T-1's
  // Reviewer): `contactPerson` is bound to 120 chars (matching
  // `ActorCreateDto`/`RegistrationPayloadDto`, not just the `VARCHAR(191)`
  // column), `otherCrops` to 300 chars (`Actor.otherCrops VARCHAR(300)`).
  describe('Contact Person and Other Crops (v3, T-4 public-profile-disclosure)', () => {
    it('round-trips both new fields end to end on a v3 row', async () => {
      const b64 = await buildWorkbook([
        validRow({
          contactPerson: 'Jane Mwangi',
          otherCrops: 'Sesame, Sunflower',
        }),
      ]);

      const report = await service.run(commitDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('created');
      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(created.contactPerson).toBe('Jane Mwangi');
      expect(created.otherCrops).toBe('Sesame, Sunflower');
    });

    // T-4 (consent-intake/intake-required-fields) — contactPerson is now
    // REQUIRED (FR-1), so "blank" no longer applies to it; `validRow()`
    // already fills it. Other Crops stays optional and is the field this
    // test still proves stays unwritten when its own cell is blank.
    it('leaves Other Crops unwritten when its cell is blank', async () => {
      const b64 = await buildWorkbook([validRow()]);

      await service.run(commitDto(b64), 'sub-1');

      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(created.contactPerson).toBe('Jane Mwangi');
      expect(created).not.toHaveProperty('otherCrops');
    });

    // Validation remediation (D-12) — the test above is a vacuous guard
    // against derivation: EVERY plausible derive-source (position,
    // marketLocation, sex, traderName) is ALSO blank on `validRow()`, so a
    // defect like `otherCrops = cells.otherCrops || cells.position` would
    // leave `otherCrops` unwritten on that row too and the test above would
    // still pass. This row gives every plausible derive-source a distinct,
    // non-blank sentinel value while leaving ONLY `otherCrops` blank, so a
    // derive from any of them is now observable. Requirements FR-4: "AND IT
    // MUST NOT be backfilled, invented, or derived from any other column."
    it('does not derive otherCrops from other populated cells (FR-4, D-12)', async () => {
      const b64 = await buildWorkbook([
        validRow({
          traderName: 'Sentinel Trader Name',
          position: 'Sentinel Position',
          marketLocation: 'Sentinel Market Location',
          sex: 'Female',
          // otherCrops cell intentionally left blank.
        }),
      ]);

      await service.run(commitDto(b64), 'sub-1');

      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(created).not.toHaveProperty('otherCrops');
    });

    it('rejects a Contact Person cell over 120 characters with a field-level error', async () => {
      const b64 = await buildWorkbook([
        validRow({ contactPerson: 'A'.repeat(121) }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('failed');
      expect(report.rows[0].errors?.[0].field).toBe('contactPerson');
    });

    it('accepts a Contact Person cell at exactly 120 characters', async () => {
      const b64 = await buildWorkbook([
        validRow({ contactPerson: 'A'.repeat(120) }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('create');
    });

    it('rejects an Other Crops cell over 300 characters with a field-level error', async () => {
      const b64 = await buildWorkbook([
        validRow({ otherCrops: 'B'.repeat(301) }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('failed');
      expect(report.rows[0].errors?.[0].field).toBe('otherCrops');
    });

    it('accepts an Other Crops cell at exactly 300 characters', async () => {
      const b64 = await buildWorkbook([
        validRow({ otherCrops: 'B'.repeat(300) }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('create');
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

    // T-4 (consent-intake/intake-required-fields) — Phone is now REQUIRED
    // (FR-1): a blank cell is a missing-field failure, not a silent absent
    // column, so this test's old premise ("blank Phone still creates") no
    // longer holds. That new behaviour is proven in the "required fields"
    // describe block below; this one keeps proving the SUCCESS path (a
    // present, valid Phone is written with no warning).
    it('writes a present, normalizable Phone with no warning', async () => {
      const b64 = await buildWorkbook([validRow()]);

      const report = await service.run(commitDto(b64), 'sub-1');

      expect(report.totals.warnings).toBe(0);
      const created = tx.actor.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(created.phone).toBe('+255700000002');
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

    // T-4 (consent-intake/intake-required-fields) — the dedupe-based rows
    // (`TZ-DUP`/`TZ-EXISTS`) that used to supply the "skipped" half of the
    // sum are gone with `dedupeInFile`/`dedupeAgainstDb` (design.md §4.5).
    // Replaced with two more distinct FAILED reasons so the sum still mixes
    // several reasons together, just with `skipped` pinned at 0 until T-5.
    it('sums to failed exactly on a mixed fixture containing a multi-error row', async () => {
      const b64 = await buildWorkbook([
        validRow({ traderName: 'Ok' }),
        validRow({ traderName: 'No Phone 1', phone: '' }),
        validRow({ traderName: 'No Phone 2', phone: '' }),
        multiErrorRow({ traderName: 'Multi' }),
        validRow({ traderName: 'Bad Region', region: 'Atlantis' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      const breakdown = report.failureBreakdown ?? [];
      const total = breakdown.reduce((sum, entry) => sum + entry.count, 0);
      expect(total).toBe(report.totals.failed + report.totals.skipped);
      // Pin the arithmetic too, so a change that moves BOTH sides together
      // (e.g. rows silently dropped) cannot keep this green.
      expect(report.totals.skipped).toBe(0);
      expect(report.totals.failed).toBe(4);
      expect(total).toBe(4);
    });

    it('orders by count descending, then reason ascending', async () => {
      const b64 = await buildWorkbook([
        validRow({ traderName: 'R1', region: 'Atlantis' }),
        validRow({ traderName: 'R2', region: 'Atlantis' }),
        validRow({ traderName: 'No Phone', phone: '' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      // `region` (2) outranks `phone` (1) on count; had they tied, the
      // ascending slug comparison would still put `phone` first.
      expect(report.failureBreakdown).toEqual([
        { reason: 'region', count: 2 },
        { reason: 'phone', count: 1 },
      ]);
    });

    it('breaks a count tie on the reason slug, ascending', async () => {
      const b64 = await buildWorkbook([
        validRow({ traderName: 'R1', region: 'Atlantis' }),
        validRow({ traderName: 'No Type', traderType: '' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.failureBreakdown).toEqual([
        { reason: 'region', count: 1 },
        { reason: 'traderType', count: 1 },
      ]);
    });

    it('is byte-identical across two runs over the same input (NFR-6)', async () => {
      const rows = [
        validRow({ traderName: 'R1', region: 'Atlantis' }),
        validRow({ traderName: 'R2', region: 'Atlantis' }),
        validRow({ traderName: 'No Type', traderType: '' }),
        multiErrorRow({ traderName: 'Multi' }),
      ];

      const first = await service.run(previewDto(await buildWorkbook(rows)), 'sub-1');
      const second = await service.run(previewDto(await buildWorkbook(rows)), 'sub-1');

      expect(JSON.stringify(first.failureBreakdown)).toBe(
        JSON.stringify(second.failureBreakdown),
      );
    });

    it('surfaces a rolled-back batch as batch-rolled-back, never as _row', async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error('chunk exploded'));
      const b64 = await buildWorkbook([validRow({ traderName: 'Boom' })]);

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
      const b64 = await buildWorkbook([validRow({ traderName: 'Clean' })]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.totals.failed).toBe(0);
      expect(report.totals.skipped).toBe(0);
      expect(report).not.toHaveProperty('failureBreakdown');
    });

    it('leaves every pre-existing report field untouched (NFR-3)', async () => {
      const b64 = await buildWorkbook([
        validRow({ traderName: 'Ok' }),
        validRow({ traderName: 'R1', region: 'Atlantis' }),
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

  /**
   * T-4 (consent-intake/intake-required-fields) — the Trader-ID dedupe this
   * block used to cover (`dedupeInFile`/`dedupeAgainstDb`) is REMOVED
   * (design.md §4.5): an import of two identical rows now creates BOTH, with
   * no `skipped-*` outcome ever produced. This is a declared, acceptable gap
   * on this unreleased branch (tasks.md T-4) — T-5 replaces it with
   * duplicate classification under the new `possible-duplicate` outcome.
   */
  describe('no import dedupe in this interim window (T-4; T-5 replaces it)', () => {
    it('creates both rows of an otherwise-identical pair — there is no in-file dedupe yet', async () => {
      const b64 = await buildWorkbook([
        validRow({ traderName: 'Same Trader' }),
        validRow({ traderName: 'Same Trader' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows.map((r) => r.outcome)).toEqual(['create', 'create']);
      expect(report.totals).toMatchObject({ skipped: 0, toCreate: 2 });
    });

    it('creates a row even when an identical actor already exists — there is no DB dedupe yet', async () => {
      const b64 = await buildWorkbook([validRow({ traderName: 'Repeat Trader' })]);

      const first = await service.run(commitDto(b64), 'sub-1');
      expect(first.rows[0].outcome).toBe('created');

      const second = await service.run(commitDto(b64), 'sub-1');
      expect(second.rows[0].outcome).toBe('created');
      expect(second.totals).toMatchObject({ created: 1, skipped: 0, failed: 0 });
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

    it('accepts a GRANTED row with full row-level provenance and persists it, always as TEAM_MANAGED (T-4)', async () => {
      const b64 = await buildWorkbook([
        validRow({
          consentStatus: 'GRANTED',
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
      // T-4 — Registration Source is no longer a column; imports are always
      // TEAM_MANAGED (FR-5), regardless of any stray `registrationSource` key.
      expect(created.registrationSource).toBe('TEAM_MANAGED');
      expect(created.consentMethod).toBe('EMAIL');
      expect(created.consentObtainedAt).toBe('2026-01-15T00:00:00.000Z');
      expect(created.consentReference).toBe('thread-123');
    });

    it('defaults consentMethod to NOT_RECORDED when the column is blank; registrationSource is always TEAM_MANAGED', async () => {
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

    it('rejects an invalid consentMethod value with a field error', async () => {
      const b64 = await buildWorkbook([validRow({ consentMethod: 'BOGUS' })]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('failed');
      const fields = (report.rows[0].errors ?? []).map((e) => e.field);
      expect(fields).toEqual(['consentMethod']);
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
      // 150 valid rows → two chunks (100 + 50). `allocateTraderIds` opens its
      // OWN `prisma.$transaction` before the chunk's create transaction
      // (design.md §4.2), so call 1 here is chunk 1's ALLOCATION — not its
      // create transaction — throwing; either one hits the same non-collision
      // catch path (whole chunk fails, no retry), which is what this proves.
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

    /**
     * Companion to the test above: here it IS specifically the chunk's own
     * CREATE transaction (not the allocation) that throws, with a `P2002`
     * that is NOT a `traderId` collision (e.g. a `PRIMARY` key clash) — the
     * allocation itself succeeds. No retry happens (not a collision), and
     * the other chunk is unaffected.
     */
    it('fails only that chunk, with no retry, when its own create transaction throws a non-collision error', async () => {
      const rows = Array.from({ length: 150 }, (_, i) =>
        validRow({ traderName: `Actor ${i + 1}` }),
      );
      const b64 = await buildWorkbook(rows);

      let call = 0;
      prisma.$transaction.mockImplementation(
        async (cb: (t: typeof tx) => unknown) => {
          call += 1;
          // Call 1 = chunk 1's allocation (succeeds). Call 2 = chunk 1's OWN
          // create transaction — throws a non-traderId P2002.
          if (call === 2) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed on PRIMARY',
              { code: 'P2002', clientVersion: '0.0.0', meta: { target: 'PRIMARY' } },
            );
          }
          return cb(tx);
        },
      );

      const report = await service.run(commitDto(b64), 'sub-1');

      const created = report.rows.filter((r) => r.outcome === 'created');
      const failed = report.rows.filter((r) => r.outcome === 'failed');
      expect(created).toHaveLength(50);
      expect(failed).toHaveLength(100);
      expect(failed[0].errors?.[0].message).toMatch(/rolled back/i);
      // Chunk 1's create transaction threw before any `tx.actor.create` ran;
      // chunk 2's 50 rows are the only calls that landed, with no retry.
      expect(tx.actor.create).toHaveBeenCalledTimes(50);
    });
  });

  /**
   * T-4 (consent-intake/intake-required-fields) — Trader ID is system-
   * generated at commit (FR-2), allocated per chunk just before each attempt
   * (design.md §4.2/§4.5), mirroring `ActorsAdminService.create`'s per-
   * attempt allocate-and-retry, scaled to a chunk.
   */
  describe('Trader ID is system-generated per chunk, with collision retry (FR-2, T-4)', () => {
    it('reports traderId null in preview and a TM-<year>-<NNNN> id after commit', async () => {
      const b64 = await buildWorkbook([validRow({ traderName: 'Fresh Trader' })]);

      const preview = await service.run(previewDto(b64), 'sub-1');
      expect(preview.rows[0].traderId).toBeNull();

      const report = await service.run(commitDto(b64), 'sub-1');
      expect(report.rows[0].outcome).toBe('created');
      expect(report.rows[0].traderId).toMatch(/^TM-\d{4}-\d{4}$/);
    });

    it('ignores a stray traderId key — there is no column left to carry it', async () => {
      // TEMPLATE_COLUMNS no longer has a `traderId` field (T-4), so this key
      // is simply never written to any cell; the service never even sees it.
      const b64 = await buildWorkbook([
        validRow({ traderName: 'Ignore Me', traderId: 'TZ-SHOULD-BE-IGNORED' }),
      ]);

      const report = await service.run(commitDto(b64), 'sub-1');

      expect(report.rows[0].traderId).not.toBe('TZ-SHOULD-BE-IGNORED');
      expect(report.rows[0].traderId).toMatch(/^TM-/);
    });

    it('allocates fresh, distinct ids for a second row in the same chunk', async () => {
      const b64 = await buildWorkbook([
        validRow({ traderName: 'First' }),
        validRow({ traderName: 'Second' }),
      ]);

      const report = await service.run(commitDto(b64), 'sub-1');

      const ids = report.rows.map((r) => r.traderId);
      expect(ids[0]).not.toBe(ids[1]);
      expect(tx.actor.create).toHaveBeenCalledTimes(2);
    });

    /**
     * Falsifier (tasks.md T-4, falsifier 5): a chunk-2 collision retries
     * ONLY chunk 2 — chunk 1's rows are created exactly once, never retried.
     * 101 rows → chunk 1 (100) + chunk 2 (1). Chunk 2's single `create` call
     * collides on its first attempt and succeeds on retry.
     */
    it('retries only the colliding chunk on a traderId collision, leaving the other chunk untouched', async () => {
      const rows = Array.from({ length: 101 }, (_, i) =>
        validRow({ traderName: `Actor ${i + 1}` }),
      );
      const b64 = await buildWorkbook(rows);

      let createCalls = 0;
      let collided = false;
      let collidedTraderId: unknown;
      const originalCreate = tx.actor.create;
      tx.actor.create = jest.fn(async (args: { data: Record<string, unknown> }) => {
        createCalls += 1;
        if (createCalls === 101 && !collided) {
          collided = true;
          collidedTraderId = args.data.traderId;
          throw buildTraderIdCollisionError();
        }
        return originalCreate(args);
      });

      const report = await service.run(commitDto(b64), 'sub-1');

      expect(report.rows.filter((r) => r.outcome === 'created')).toHaveLength(101);
      expect(report.totals).toMatchObject({ created: 101, failed: 0 });
      // One extra `create` attempt landed: the collision plus the retry.
      expect(tx.actor.create).toHaveBeenCalledTimes(102);
      // Falsifier 5 (tasks.md T-4): an allocate-once-for-the-whole-import
      // implementation would call `$queryRaw` exactly ONCE total. The
      // correct per-chunk, per-ATTEMPT allocation calls it three times here:
      // chunk 1 (1 attempt) + chunk 2 (collides, so 2 attempts) = 3 — proving
      // chunk 2's retry allocated a FRESH range rather than reusing chunk 1's.
      expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
      // The retry allocated a FRESH id, never the one that just collided.
      expect(report.rows[100].traderId).not.toBe(collidedTraderId);
    });

    /**
     * Falsifier (tasks.md T-4, falsifier 4): exhaustion fails only the
     * colliding chunk, and a LATER chunk still commits (design.md §4.2
     * table). This collides chunk 1 (rows 1–100, the EARLIER chunk) on
     * every attempt and leaves chunk 2 (row 101) untouched — a `break`
     * that stops the chunk loop on exhaustion would leave chunk 2's row
     * unreported, which rendering the collision on the LAST chunk instead
     * could not catch (Reviewer B, attempt 1).
     */
    it('exhausts retries after 3 attempts on chunk 1, failing only chunk 1, while chunk 2 still creates', async () => {
      const rows = Array.from({ length: 101 }, (_, i) =>
        validRow({ traderName: `Actor ${i + 1}` }),
      );
      const b64 = await buildWorkbook(rows);

      const originalCreate = tx.actor.create;
      tx.actor.create = jest.fn(async (args: { data: Record<string, unknown> }) => {
        const match = (args.data.traderName as string).match(/^Actor (\d+)$/);
        const n = match ? Number(match[1]) : NaN;
        // Chunk 1 is rows 1–100: its first create call of EVERY attempt
        // collides, so the chunk's own transaction fails before any other
        // row in it is even attempted.
        if (n <= 100) {
          throw buildTraderIdCollisionError();
        }
        return originalCreate(args);
      });

      const report = await service.run(commitDto(b64), 'sub-1');

      const created = report.rows.filter((r) => r.outcome === 'created');
      const failed = report.rows.filter((r) => r.outcome === 'failed');
      expect(created).toHaveLength(1);
      expect(created[0].rowNumber).toBe(102); // chunk 2's only row
      expect(failed).toHaveLength(100);
      expect(failed.every((r) => r.errors?.[0].message.match(/rolled back/i))).toBe(true);
      // Chunk 1: one create call per attempt (fails on the first row, so the
      // other 99 are never attempted) × MAX_TRADER_ID_ALLOCATION_ATTEMPTS.
      // Chunk 2: one successful call.
      expect(tx.actor.create).toHaveBeenCalledTimes(
        MAX_TRADER_ID_ALLOCATION_ATTEMPTS + 1,
      );
      expect(report.totals).toMatchObject({ created: 1, failed: 100 });
    });
  });

  /**
   * T-4 (consent-intake/intake-required-fields) — the required set (FR-1):
   * Contact Person, ≥1 crop, Capacity, Phone, Email. `validRow()` already
   * fills every one of these; each test here blanks exactly ONE.
   */
  describe('required fields (FR-1, intake-required-fields, T-4)', () => {
    /**
     * One blanking override per `INTAKE_REQUIRED_FIELDS` member (NFR-1):
     * driven from the contract's own declaration, not a second hand-picked
     * field list, so a field ADDED to or REMOVED from the contract changes
     * this `Record`'s required keys and reddens the suite at compile time —
     * `missing a field = 0 valid crop names`.
     */
    const BLANK_OVERRIDE_FOR: Record<IntakeRequiredField, CellMap> = {
      contactPerson: { contactPerson: '' },
      crops: { cropSorghum: 'NO' },
      capacityTons: { capacityTons: '' },
      phone: { phone: '' },
      email: { email: '' },
    };

    it.each(INTAKE_REQUIRED_FIELDS)(
      'fails a row missing %s, naming the field',
      async (field) => {
        const b64 = await buildWorkbook([validRow(BLANK_OVERRIDE_FOR[field])]);

        const report = await service.run(previewDto(b64), 'sub-1');

        expect(report.rows[0].outcome).toBe('failed');
        const fields = (report.rows[0].errors ?? []).map((e) => e.field);
        expect(fields).toContain(field);
      },
    );

    it('accepts a Capacity of exactly 0 (FR-1 "capacity of zero")', async () => {
      const b64 = await buildWorkbook([validRow({ capacityTons: 0 })]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('create');
    });

    it('accepts a row with exactly one crop selected', async () => {
      const b64 = await buildWorkbook([
        validRow({ cropSorghum: 'NO', cropGroundnut: 'YES' }),
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('create');
    });

    // "the same bounds, not only the same presence" (FR-1) — rejected with a
    // field error; exact message text is NOT required to match (only the
    // "same omission" MESSAGE clause is, covered in the next describe block).
    it.each([
      ['traderName', INTAKE_MAX_LENGTHS.traderName],
      ['contactPerson', INTAKE_MAX_LENGTHS.contactPerson],
      ['phone', INTAKE_MAX_LENGTHS.phone],
    ] as const)('rejects %s over its %i-character bound', async (field, max) => {
      const overLong = 'A'.repeat(max + 1);
      const b64 = await buildWorkbook([validRow({ [field]: overLong })]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('failed');
      const fields = (report.rows[0].errors ?? []).map((e) => e.field);
      expect(fields).toContain(field);
    });

    /**
     * Email needs its own fixture (Reviewer A/B): a local part over 64
     * characters already fails `isEmail` on its own, so
     * `'a'.repeat(191) + '@example.com'` reddens the SAME way whether or not
     * the `INTAKE_MAX_LENGTHS.email` branch exists — it cannot discriminate
     * the bound check from the format check. This address is valid in SHAPE
     * (asserted below, so the fixture checks itself) and over 191 characters
     * only in LENGTH.
     */
    it('rejects email over its 191-character bound, using a well-formed address so only the bound check can fail it', async () => {
      const overLongValidEmail = `${'a'.repeat(60)}@${'b'.repeat(63)}.${'c'.repeat(63)}.com`;
      expect(overLongValidEmail.length).toBeGreaterThan(INTAKE_MAX_LENGTHS.email);
      expect(isEmail(overLongValidEmail)).toBe(true);

      const b64 = await buildWorkbook([validRow({ email: overLongValidEmail })]);

      const report = await service.run(previewDto(b64), 'sub-1');

      expect(report.rows[0].outcome).toBe('failed');
      const emailError = (report.rows[0].errors ?? []).find((e) => e.field === 'email');
      expect(emailError?.message).toMatch(/191 characters or fewer/);
    });
  });

  /**
   * T-4 — FR-1's MUST clause: "the same field-level messages as
   * self-registration for the same omission." The import's row error for a
   * genuinely missing contract field reuses `AdminActorCreateDto`'s OWN
   * class-validator output (the same declaration self-registration is
   * pinned against, `intake-contract.spec.ts`), so this compares against
   * that INDEPENDENT source — never the production code's own literal
   * strings — closing the loop requirements.md FR-1 asks for.
   */
  describe('FR-1 — import reports the same field-level messages as admin create for the same omission', () => {
    it.each(['contactPerson', 'phone', 'email'] as const)(
      'missing %s: the import row message set equals AdminActorCreateDto\'s for the same omission',
      async (field) => {
        const b64 = await buildWorkbook([validRow({ [field]: '' })]);
        const report = await service.run(previewDto(b64), 'sub-1');
        const rowMessages = (report.rows[0].errors ?? [])
          .filter((e) => e.field === field)
          .map((e) => e.message)
          .sort();

        const probe = plainToInstance(AdminActorCreateDto, { [field]: undefined });
        const violations = validateSync(probe);
        const match = violations.find((v) => v.property === field);
        const adminMessages = Object.values(match?.constraints ?? {}).sort();

        expect(rowMessages).toEqual(adminMessages);
        expect(rowMessages.length).toBeGreaterThan(0);
      },
    );

    it('missing capacityTons: the import row message set equals AdminActorCreateDto\'s for the same omission', async () => {
      const b64 = await buildWorkbook([validRow({ capacityTons: '' })]);
      const report = await service.run(previewDto(b64), 'sub-1');
      const rowMessages = (report.rows[0].errors ?? [])
        .filter((e) => e.field === 'capacityTons')
        .map((e) => e.message)
        .sort();

      const probe = plainToInstance(AdminActorCreateDto, { capacityTons: undefined });
      const violations = validateSync(probe);
      const match = violations.find((v) => v.property === 'capacityTons');
      const adminMessages = Object.values(match?.constraints ?? {}).sort();

      expect(rowMessages).toEqual(adminMessages);
      expect(rowMessages.length).toBeGreaterThan(0);
    });

    it('no crop selected: the import row message set equals AdminActorCreateDto\'s for crops: []', async () => {
      const b64 = await buildWorkbook([validRow({ cropSorghum: 'NO' })]);
      const report = await service.run(previewDto(b64), 'sub-1');
      const rowMessages = (report.rows[0].errors ?? [])
        .filter((e) => e.field === 'crops')
        .map((e) => e.message)
        .sort();

      const probe = plainToInstance(AdminActorCreateDto, { crops: [] });
      const violations = validateSync(probe);
      const match = violations.find((v) => v.property === 'crops');
      const adminMessages = Object.values(match?.constraints ?? {}).sort();

      expect(rowMessages).toEqual(adminMessages);
      expect(rowMessages.length).toBeGreaterThan(0);
    });
  });

  describe('totals consistency', () => {
    // T-4 (consent-intake/intake-required-fields) — the two `skipped-*` rows
    // this test used to carry are gone with the Trader-ID dedupe (design.md
    // §4.5); replaced with a second `failed` row so the fixture still mixes
    // create / failed / create+warning outcomes.
    it('keeps totals aligned with the rows array across mixed outcomes', async () => {
      const b64 = await buildWorkbook([
        validRow({ traderName: 'New One' }), // create
        validRow({ traderName: 'Bad Region', region: 'Atlantis' }), // failed
        validRow({ traderName: 'Bad Type', traderType: '' }), // failed
        validRow({ traderName: 'New Two', gpsLatitude: 999 }), // create + warning
      ]);

      const report = await service.run(previewDto(b64), 'sub-1');

      const outcomes = report.rows.map((r) => r.outcome);
      expect(outcomes).toEqual(['create', 'failed', 'failed', 'create']);
      expect(report.totals).toEqual({
        rows: 4,
        toCreate: 2,
        created: 0,
        skipped: 0,
        failed: 2,
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
