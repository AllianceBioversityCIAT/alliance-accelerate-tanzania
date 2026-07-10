// @sdd-spec admin/actor-import
/**
 * T-5 — Admin actor bulk-import service (FR-2..FR-8, DR-4/DR-5/DR-6).
 *
 * Parses an uploaded `.xlsx` workbook (base64 JSON body, DR-1) with exceljs,
 * validates every data row against the SAME canonical rules as single create
 * (`common/normalize.ts` + `AdminActorCreateDto` bounds), classifies each row
 * (create / skip / fail / warning), and — on commit — inserts the survivors in
 * chunked, fault-isolated transactions with `IMPORT` audit entries.
 *
 * The pipeline is stateless: `preview` and `commit` re-run the whole thing, so
 * the commit re-validates and re-dedupes from scratch (DR-4). Nothing is written
 * in preview mode (FR-3). Row-level errors carry field NAMES and messages only —
 * never phone/email VALUES (FR-11).
 *
 * Design refs: `docs/specs/admin/actor-import/design.md` §3, §4, §8.
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import { ConsentStatus, Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { isEmail } from 'class-validator';

import { PrismaService } from '../prisma/prisma.service';
import { ActingAdminResolver } from './acting-admin.resolver';
import { ActorAuditService, ActingAdmin } from './actor-audit.service';
import { AdminActor, toAdminActor } from './admin-actor.serializer';
import { ActorImportRequestDto } from './dto/actor-import-request.dto';
import {
  ImportReport,
  ImportRowError,
  ImportRowResult,
} from './actor-import.types';
import {
  CONSENT_VALUES,
  CROP_COLUMN_CATALOG,
  CropColumnField,
  TEMPLATE_COLUMNS,
  TEMPLATE_HEADERS,
} from '../common/template-columns';
import {
  isValidLatitude,
  isValidLongitude,
  normalizeRegion,
  normalizeSex,
  normalizeTraderType,
  parseCapacityTons,
} from '../common/normalize';

/** Hard caps (design §3): decoded file size and data-row count. */
const MAX_DECODED_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_DATA_ROWS = 1000;
/** Actors created per transaction; a chunk is the fault-isolation unit (FR-5). */
const COMMIT_CHUNK_SIZE = 100;

/** Fixed warning surfaced when a row's GPS is dropped (DR-5). */
const GPS_CLEARED_WARNING = 'GPS out of range — imported with GPS cleared';
/** Preview-only note so the UI knows to gate the commit behind acknowledgement. */
const CONSENT_ACK_WARNING =
  'Consent is GRANTED — acknowledgement will be required to import this actor';

/** Scalar Actor create payload assembled from a validated row. */
interface ActorScalarData {
  traderId: string;
  traderName: string;
  region: string;
  traderType: string;
  district?: string;
  sex?: string;
  position?: string;
  marketLocation?: string;
  capacityTons?: number;
  technicalSupport?: string;
  phone?: string;
  email?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAltitude?: number;
  gpsAccuracy?: number;
  consentStatus: ConsentStatus;
}

/** Mutable per-row working state threaded through the pipeline phases. */
interface WorkRow {
  rowNumber: number;
  traderId: string | null;
  traderName: string | null;
  errors: ImportRowError[];
  warnings: string[];
  /**
   * `candidate` — passed validation + dedupe + consent gate, eligible to create.
   * `failed` — validation, consent-gate, or commit-chunk failure (has errors).
   * `skipped-exists` / `skipped-dup` — duplicate rules (FR-4).
   * `created` — committed (has `actorId`).
   */
  state:
    | 'candidate'
    | 'failed'
    | 'skipped-exists'
    | 'skipped-dup'
    | 'created';
  /** Present while the row is a create candidate. */
  create?: {
    scalar: ActorScalarData;
    cropNames: string[];
    consentGranted: boolean;
  };
  actorId?: string;
}

@Injectable()
export class ActorImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: ActorAuditService,
    private readonly actingAdminResolver: ActingAdminResolver,
  ) {}

  /**
   * Run a preview (dry run) or commit import for one uploaded workbook.
   *
   * @param dto validated request (base64 workbook, mode, optional acknowledged)
   * @param actingSub Cognito sub of the acting Admin (resolved to email once)
   */
  async run(dto: ActorImportRequestDto, actingSub: string): Promise<ImportReport> {
    const buffer = this.decode(dto.fileBase64);
    const workbook = await this.load(buffer);

    const sheet = this.locateDataSheet(workbook);
    if (!sheet) {
      throw new BadRequestException(
        'The workbook has no Data sheet matching the import template headers.',
      );
    }
    const templateVersionDetected = this.detectTemplateVersion(workbook);

    // Read raw rows first so the row cap bounds CPU before any validation.
    const rawRows = this.readRawRows(sheet);
    if (rawRows.length > MAX_DATA_ROWS) {
      throw new BadRequestException(
        `The file has ${rawRows.length} data rows; the maximum is ${MAX_DATA_ROWS}.`,
      );
    }

    const commit = dto.mode === 'commit';
    const rows = rawRows.map((raw) => this.validateRow(raw));

    this.dedupeInFile(rows);
    await this.dedupeAgainstDb(rows);
    this.applyConsentGate(rows, commit, dto.acknowledged);

    if (commit) {
      await this.commit(rows, actingSub, dto.acknowledged);
    }

    return this.buildReport(dto.mode, rows, templateVersionDetected);
  }

  // ---- parse -------------------------------------------------------------

  /** Decode the base64 body and enforce the decoded-size cap (clean 400). */
  private decode(fileBase64: string): Buffer {
    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length > MAX_DECODED_BYTES) {
      throw new BadRequestException(
        `The decoded file is ${buffer.length} bytes; the maximum is ${MAX_DECODED_BYTES} bytes (4 MB).`,
      );
    }
    return buffer;
  }

  /** Load the workbook, mapping any parse failure to a clean 400 (NFR-1). */
  private async load(buffer: Buffer): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    try {
      // exceljs declares its own `Buffer` type; cast the Node Buffer across it.
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException(
        'The uploaded file is not a valid .xlsx workbook.',
      );
    }
    return workbook;
  }

  /**
   * Find the Data sheet: the sheet named 'Data' if its header row matches the
   * template, otherwise the first sheet whose header row matches (DR-7 anti-drift
   * detection). Returns null when none match.
   */
  private locateDataSheet(
    workbook: ExcelJS.Workbook,
  ): ExcelJS.Worksheet | null {
    const named = workbook.getWorksheet('Data');
    if (named && this.headerMatches(named)) {
      return named;
    }
    for (const ws of workbook.worksheets) {
      if (this.headerMatches(ws)) {
        return ws;
      }
    }
    return null;
  }

  /** True when row 1 of the sheet equals TEMPLATE_HEADERS in order. */
  private headerMatches(sheet: ExcelJS.Worksheet): boolean {
    const header = sheet.getRow(1);
    return TEMPLATE_HEADERS.every(
      (expected, i) => this.cellToString(header.getCell(i + 1).value) === expected,
    );
  }

  /** Best-effort template-version read from an 'Instructions' sheet (NFR-8). */
  private detectTemplateVersion(
    workbook: ExcelJS.Workbook,
  ): string | undefined {
    const sheet = workbook.getWorksheet('Instructions');
    if (!sheet) {
      return undefined;
    }

    let detected: string | undefined;
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        const text = this.cellToString(cell.value);
        if (!text) return;
        // A bare version token (e.g. "v1", "v2") anywhere on the sheet.
        if (!detected && /^v\d+$/i.test(text)) {
          detected = text;
        }
        // Or a "Template version: vN" style label.
        const labelled = text.match(/template version[:\s]+?(v\d+)/i);
        if (labelled) {
          detected = labelled[1];
        }
      });
    });
    return detected;
  }

  /**
   * Read every non-empty data row (Excel row 2..N) into a field→cell-text map.
   * A row is empty when every template cell is blank; empty rows are dropped
   * entirely (not reported).
   */
  private readRawRows(
    sheet: ExcelJS.Worksheet,
  ): Array<{ rowNumber: number; cells: Record<string, string> }> {
    const out: Array<{ rowNumber: number; cells: Record<string, string> }> = [];
    for (let r = 2; r <= sheet.rowCount; r += 1) {
      const excelRow = sheet.getRow(r);
      const cells: Record<string, string> = {};
      let anyValue = false;
      TEMPLATE_COLUMNS.forEach((col, i) => {
        const text = this.cellToString(excelRow.getCell(i + 1).value);
        cells[col.field] = text;
        if (text !== '') anyValue = true;
      });
      if (anyValue) {
        out.push({ rowNumber: r, cells });
      }
    }
    return out;
  }

  /** Coerce any exceljs cell value to a trimmed string ('' for blank). */
  private cellToString(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      const obj = value as unknown as Record<string, unknown>;
      if (typeof obj.text === 'string') return obj.text.trim();
      if ('result' in obj) return this.cellToString(obj.result as ExcelJS.CellValue);
      if (Array.isArray(obj.richText)) {
        return (obj.richText as Array<{ text?: string }>)
          .map((part) => part.text ?? '')
          .join('')
          .trim();
      }
    }
    return String(value).trim();
  }

  // ---- validation --------------------------------------------------------

  /**
   * Map + normalize + validate one raw row against the create-DTO bounds.
   * Field violations accumulate into `errors` (→ state 'failed'); out-of-range
   * GPS is cleared with a warning rather than failing (DR-5).
   */
  private validateRow(raw: {
    rowNumber: number;
    cells: Record<string, string>;
  }): WorkRow {
    const { rowNumber, cells } = raw;
    const errors: ImportRowError[] = [];
    const warnings: string[] = [];

    const traderId = cells.traderId || null;
    const traderName = cells.traderName || null;

    if (!traderId) {
      errors.push({ field: 'traderId', message: 'Trader ID is required.' });
    }
    if (!traderName) {
      errors.push({ field: 'traderName', message: 'Trader Name is required.' });
    }

    // Region — required + canonical (normalized).
    let region: string | null = null;
    if (!cells.region) {
      errors.push({ field: 'region', message: 'Region is required.' });
    } else {
      const normalized = normalizeRegion(cells.region);
      if (!normalized.region) {
        errors.push({
          field: 'region',
          message: 'Region is not a recognized Tanzania region.',
        });
      } else {
        region = normalized.region;
      }
    }

    // Trader type — required + taxonomy.
    let traderType: string | null = null;
    if (!cells.traderType) {
      errors.push({ field: 'traderType', message: 'Trader Type is required.' });
    } else {
      const normalized = normalizeTraderType(cells.traderType);
      if (!normalized) {
        errors.push({
          field: 'traderType',
          message: 'Trader Type is not in the allowed taxonomy.',
        });
      } else {
        traderType = normalized;
      }
    }

    // Sex — optional; when present must normalize to M/F/Other.
    let sex: string | undefined;
    if (cells.sex) {
      const normalized = normalizeSex(cells.sex);
      if (!normalized) {
        errors.push({
          field: 'sex',
          message: 'Sex must be one of M, F, or Other.',
        });
      } else {
        sex = normalized;
      }
    }

    // Capacity — optional; when present must be a number ≥ 0.
    let capacityTons: number | undefined;
    if (cells.capacityTons) {
      const parsed = parseCapacityTons(cells.capacityTons);
      if (parsed === null) {
        errors.push({
          field: 'capacityTons',
          message: 'Capacity must be a number greater than or equal to 0.',
        });
      } else {
        capacityTons = parsed;
      }
    }

    // Email — optional; when present must be a valid address. Never echo value.
    let email: string | undefined;
    if (cells.email) {
      if (!isEmail(cells.email)) {
        errors.push({ field: 'email', message: 'Email format is invalid.' });
      } else {
        email = cells.email;
      }
    }

    // GPS — out-of-range or non-numeric lat/long clears ALL GPS + warns (DR-5).
    const gps = this.resolveGps(cells, warnings);

    // Consent — optional; empty → UNKNOWN, else must be a valid enum value.
    let consentStatus: ConsentStatus = ConsentStatus.UNKNOWN;
    if (cells.consentStatus) {
      const upper = cells.consentStatus.toUpperCase();
      if (!(CONSENT_VALUES as string[]).includes(upper)) {
        errors.push({
          field: 'consentStatus',
          message: `Consent Status must be one of ${CONSENT_VALUES.join(', ')}.`,
        });
      } else {
        consentStatus = upper as ConsentStatus;
      }
    }

    // Crops — three YES/NO columns → crop-name list (DR-3).
    const cropNames = this.resolveCrops(cells, errors);

    const row: WorkRow = {
      rowNumber,
      traderId,
      traderName,
      errors,
      warnings,
      state: errors.length > 0 ? 'failed' : 'candidate',
    };

    if (row.state === 'candidate') {
      row.create = {
        scalar: {
          traderId: traderId as string,
          traderName: traderName as string,
          region: region as string,
          traderType: traderType as string,
          district: cells.district || undefined,
          sex,
          position: cells.position || undefined,
          marketLocation: cells.marketLocation || undefined,
          capacityTons,
          technicalSupport: cells.technicalSupport || undefined,
          phone: cells.phone || undefined,
          email,
          gpsLatitude: gps.lat,
          gpsLongitude: gps.lng,
          gpsAltitude: gps.alt,
          gpsAccuracy: gps.acc,
          consentStatus,
        },
        cropNames,
        consentGranted: consentStatus === ConsentStatus.GRANTED,
      };
    }

    return row;
  }

  /**
   * Resolve the four GPS cells. If a present lat/long is out of range or
   * non-numeric (or a present altitude/accuracy is non-numeric), ALL four GPS
   * values are cleared and a single warning is recorded (DR-5) — GPS problems
   * never fail a whole actor.
   */
  private resolveGps(
    cells: Record<string, string>,
    warnings: string[],
  ): {
    lat?: number;
    lng?: number;
    alt?: number;
    acc?: number;
  } {
    const lat = this.numOrNull(cells.gpsLatitude);
    const lng = this.numOrNull(cells.gpsLongitude);
    const alt = this.numOrNull(cells.gpsAltitude);
    const acc = this.numOrNull(cells.gpsAccuracy);

    const invalid =
      (cells.gpsLatitude !== '' && !isValidLatitude(lat)) ||
      (cells.gpsLongitude !== '' && !isValidLongitude(lng)) ||
      (cells.gpsAltitude !== '' && alt === null) ||
      (cells.gpsAccuracy !== '' && (acc === null || acc < 0));

    if (invalid) {
      warnings.push(GPS_CLEARED_WARNING);
      return {};
    }

    return {
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      alt: alt ?? undefined,
      acc: acc ?? undefined,
    };
  }

  /** Parse a finite number from a cell string, or null (blank/non-numeric). */
  private numOrNull(text: string): number | null {
    if (text === '') return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }

  /** Turn the three YES/NO crop columns into canonical crop names (DR-3). */
  private resolveCrops(
    cells: Record<string, string>,
    errors: ImportRowError[],
  ): string[] {
    const names: string[] = [];
    for (const field of Object.keys(CROP_COLUMN_CATALOG) as CropColumnField[]) {
      const raw = cells[field];
      if (raw === '') continue;
      const upper = raw.toUpperCase();
      if (upper === 'YES') {
        names.push(CROP_COLUMN_CATALOG[field]);
      } else if (upper !== 'NO') {
        errors.push({
          field,
          message: 'Crop columns must be YES, NO, or blank.',
        });
      }
    }
    return names;
  }

  // ---- dedupe + consent gate --------------------------------------------

  /**
   * In-file dedupe on `traderId` (FR-4): the first valid occurrence wins; later
   * valid rows with the same id become `skipped-duplicate-in-file`.
   */
  private dedupeInFile(rows: WorkRow[]): void {
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.state !== 'candidate' || !row.traderId) continue;
      if (seen.has(row.traderId)) {
        row.state = 'skipped-dup';
        row.create = undefined;
      } else {
        seen.add(row.traderId);
      }
    }
  }

  /**
   * DB dedupe (FR-4): one `findMany` over the surviving candidates' traderIds;
   * any already in the registry become `skipped-exists` (the existing actor is
   * never touched).
   */
  private async dedupeAgainstDb(rows: WorkRow[]): Promise<void> {
    const candidateIds = rows
      .filter((r) => r.state === 'candidate' && r.traderId)
      .map((r) => r.traderId as string);
    if (candidateIds.length === 0) return;

    const existing = await this.prisma.actor.findMany({
      where: { traderId: { in: candidateIds } },
      select: { traderId: true },
    });
    const existingIds = new Set(existing.map((a) => a.traderId));

    for (const row of rows) {
      if (
        row.state === 'candidate' &&
        row.traderId &&
        existingIds.has(row.traderId)
      ) {
        row.state = 'skipped-exists';
        row.create = undefined;
      }
    }
  }

  /**
   * Consent gate (FR-6). Rows publishing an actor as `GRANTED` require the
   * file-level acknowledgement on commit — without it those rows fail. In
   * preview the row stays a create candidate but carries a warning so the UI
   * knows to show the acknowledgement dialog.
   */
  private applyConsentGate(
    rows: WorkRow[],
    commit: boolean,
    acknowledged?: boolean,
  ): void {
    for (const row of rows) {
      if (row.state !== 'candidate' || !row.create?.consentGranted) continue;

      if (commit && acknowledged !== true) {
        row.state = 'failed';
        row.create = undefined;
        row.errors.push({
          field: 'consentStatus',
          message: 'Acknowledgement is required to import GRANTED actors.',
        });
      } else if (!commit) {
        row.warnings.push(CONSENT_ACK_WARNING);
      }
    }
  }

  // ---- commit ------------------------------------------------------------

  /**
   * Create the surviving candidates in chunked transactions (FR-5). Each chunk
   * is one `$transaction` (actor + crop links + one `IMPORT` audit batch); a
   * chunk failure rolls that chunk back and fails only its rows — later chunks
   * still run.
   */
  private async commit(
    rows: WorkRow[],
    actingSub: string,
    acknowledged?: boolean,
  ): Promise<void> {
    const candidates = rows.filter((r) => r.state === 'candidate');
    if (candidates.length === 0) return;

    const acting = await this.resolveActing(actingSub);
    const cropIdByName = await this.loadCropIds();

    for (let i = 0; i < candidates.length; i += COMMIT_CHUNK_SIZE) {
      const chunk = candidates.slice(i, i + COMMIT_CHUNK_SIZE);
      try {
        const createdIds = await this.prisma.$transaction(async (tx) => {
          const createdActors: AdminActor[] = [];
          const ids: string[] = [];

          for (const row of chunk) {
            const create = row.create as NonNullable<WorkRow['create']>;
            const actor = await tx.actor.create({
              data: this.buildCreateData(create.scalar),
            });

            const linkedNames = create.cropNames.filter((name) =>
              cropIdByName.has(name),
            );
            if (linkedNames.length > 0) {
              await tx.cropsOnActors.createMany({
                data: linkedNames.map((name) => ({
                  actorId: actor.id,
                  cropId: cropIdByName.get(name) as string,
                })),
              });
            }

            ids.push(actor.id);
            createdActors.push(
              toAdminActor({
                ...actor,
                crops: linkedNames.map((name) => ({ crop: { name } })),
              }),
            );
          }

          await this.auditService.logImport(
            tx,
            createdActors,
            acting,
            acknowledged,
          );
          return ids;
        });

        chunk.forEach((row, idx) => {
          row.state = 'created';
          row.actorId = createdIds[idx];
        });
      } catch {
        for (const row of chunk) {
          row.state = 'failed';
          row.create = undefined;
          row.actorId = undefined;
          row.errors.push({
            field: '_row',
            message:
              'This batch failed and was rolled back; the row was not imported.',
          });
        }
      }
    }
  }

  /** Resolve the acting Admin email once and package it with the sub. */
  private async resolveActing(actingSub: string): Promise<ActingAdmin> {
    const email = await this.actingAdminResolver.resolve(actingSub);
    return { sub: actingSub, email };
  }

  /** Fetch the catalog crop name→id map once before chunking. */
  private async loadCropIds(): Promise<Map<string, string>> {
    const names = Object.values(CROP_COLUMN_CATALOG);
    const crops = await this.prisma.crop.findMany({
      where: { name: { in: names } },
      select: { id: true, name: true },
    });
    return new Map(crops.map((c) => [c.name, c.id]));
  }

  /** Build a Prisma create payload, omitting undefined optionals. */
  private buildCreateData(scalar: ActorScalarData): Prisma.ActorCreateInput {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(scalar)) {
      if (value !== undefined) {
        data[key] = value;
      }
    }
    return data as Prisma.ActorCreateInput;
  }

  // ---- report ------------------------------------------------------------

  /** Assemble the `ImportReport` with totals kept consistent with the rows. */
  private buildReport(
    mode: 'preview' | 'commit',
    rows: WorkRow[],
    templateVersionDetected?: string,
  ): ImportReport {
    const resultRows: ImportRowResult[] = rows.map((row) =>
      this.toRowResult(mode, row),
    );

    const created = resultRows.filter((r) => r.outcome === 'created').length;
    const skipped = resultRows.filter((r) =>
      r.outcome.startsWith('skipped'),
    ).length;
    const failed = resultRows.filter((r) => r.outcome === 'failed').length;
    const warnings = resultRows.filter(
      (r) => r.warnings && r.warnings.length > 0,
    ).length;
    // Preview reports prospective creates in `toCreate` (`created` = 0); commit
    // reports what actually landed (`toCreate` mirrors `created`, FR-7).
    const toCreate =
      mode === 'commit'
        ? created
        : resultRows.filter((r) => r.outcome === 'create').length;

    const report: ImportReport = {
      mode,
      totals: {
        rows: resultRows.length,
        toCreate,
        created: mode === 'commit' ? created : 0,
        skipped,
        failed,
        warnings,
      },
      rows: resultRows,
    };
    if (templateVersionDetected) {
      report.templateVersionDetected = templateVersionDetected;
    }
    return report;
  }

  /** Project one working row onto the reportable row result. */
  private toRowResult(
    mode: 'preview' | 'commit',
    row: WorkRow,
  ): ImportRowResult {
    let outcome: ImportRowResult['outcome'];
    switch (row.state) {
      case 'candidate':
        outcome = mode === 'commit' ? 'created' : 'create';
        break;
      case 'created':
        outcome = 'created';
        break;
      case 'skipped-exists':
        outcome = 'skipped-exists';
        break;
      case 'skipped-dup':
        outcome = 'skipped-duplicate-in-file';
        break;
      default:
        outcome = 'failed';
    }

    const result: ImportRowResult = {
      rowNumber: row.rowNumber,
      traderId: row.traderId,
      traderName: row.traderName,
      outcome,
    };
    if (outcome === 'created' && row.actorId) {
      result.actorId = row.actorId;
    }
    if (row.errors.length > 0) {
      result.errors = row.errors;
    }
    if (row.warnings.length > 0) {
      result.warnings = row.warnings;
    }
    return result;
  }
}
