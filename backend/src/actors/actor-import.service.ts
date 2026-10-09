// @sdd-spec admin/actor-import
/**
 * T-5 — Admin actor bulk-import service (FR-2..FR-8, DR-4/DR-5/DR-6).
 *
 * Parses an uploaded `.xlsx` workbook (base64 JSON body, DR-1) with exceljs,
 * validates every data row against the SAME canonical rules as single create
 * (`common/normalize.ts` + `AdminActorCreateDto` bounds), classifies each row
 * (create / possible-duplicate / fail / warning), and — on commit — inserts
 * the survivors in chunked, fault-isolated transactions with `IMPORT` audit
 * entries.
 *
 * The pipeline is stateless: `preview` and `commit` re-run the whole thing, so
 * the commit re-validates and re-dedupes from scratch (DR-4). Nothing is written
 * in preview mode (FR-3). Row-level errors carry field NAMES and messages only —
 * never phone/email VALUES (FR-11).
 *
 * Design refs: `docs/specs/admin/actor-import/design.md` §3, §4, §8.
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import { ConsentMethod, ConsentStatus, Prisma, RegistrationSource } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { isEmail, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { sortTraderTypes } from '../common/additional-types';
import { PrismaService } from '../prisma/prisma.service';
import { ActingAdminResolver } from './acting-admin.resolver';
import {
  ActorAuditService,
  ActingAdmin,
  DuplicateConfirmationSnapshot,
} from './actor-audit.service';
import { AdminActor, toAdminActor } from './admin-actor.serializer';
import { AdminActorCreateDto } from './dto/admin-actor-create.dto';
import { ActorImportRequestDto } from './dto/actor-import-request.dto';
import {
  ImportDuplicateCandidate,
  ImportFailureReason,
  ImportReport,
  ImportRowError,
  ImportRowResult,
} from './actor-import.types';
import {
  IntakeDuplicateCandidateInput,
  IntakeDuplicateIndex,
  IntakeDuplicateIndexMatch,
  IntakeDuplicateService,
} from './intake-duplicate.service';
import { DuplicateCandidate } from '../registrations/duplicate-detection.service';
import {
  CONSENT_METHOD_VALUES,
  CONSENT_VALUES,
  CROP_COLUMN_CATALOG,
  CropColumnField,
  TEMPLATE_COLUMNS,
  TEMPLATE_HEADERS,
  TEMPLATE_VERSION,
} from '../common/template-columns';
import {
  isValidLatitude,
  isValidLongitude,
  normalizePhone,
  normalizeRegion,
  normalizeSex,
  normalizeTraderType,
  parseCapacityTons,
} from '../common/normalize';
import { isConsentProvenanceSatisfied } from '../common/consent-provenance.policy';
import { INTAKE_MAX_LENGTHS, IntakeRequiredField } from '../common/intake-contract';
import {
  allocateTraderIds,
  isTraderIdCollisionError,
  MAX_TRADER_ID_ALLOCATION_ATTEMPTS,
} from './trader-id.util';

/** Hard caps (design §3): decoded file size and data-row count. */
const MAX_DECODED_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_DATA_ROWS = 1000;
/** Actors created per transaction; a chunk is the fault-isolation unit (FR-5). */
const COMMIT_CHUNK_SIZE = 100;
/**
 * T-5 attempt 2 (design.md §3/§9) — per-row strong candidates on the WIRE are
 * capped at this many, matching the confirmation DTO's `ArrayMaxSize(50)`: a
 * row above this count can never be fully confirmed anyway. Without this cap,
 * N rows sharing one phone/email produce N(N−1)/2 candidates — about 385 such
 * rows would exceed Lambda's 6 MB synchronous response limit. **Gating always
 * uses the full, uncapped strong-key set** (`classifyDuplicates`) — this
 * constant bounds only what is serialized.
 */
const MAX_WIRE_DUPLICATE_CANDIDATES = 50;

/** `Date.UTC(1899, 11, 30)` — Excel's day-0 epoch (its well-known leap-year-bug date). */
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
/**
 * T-6 rework — lower bound for a bare-number "Consent Obtained At" cell to be
 * accepted as an Excel serial date: 1 Jan 2000 (serial 36526). Below this, a
 * bare number is far more likely to be a mistyped year ("2026"), a
 * day-of-month ("15"), or a "0" from a formula over an empty reference than a
 * real consent-evidence date — none of that plausibly predates this system.
 * The upper bound is enforced by the shared not-in-the-future check.
 */
const MIN_PLAUSIBLE_EXCEL_SERIAL = 36526;

/** Fixed warning surfaced when a row's GPS is dropped (DR-5). */
const GPS_CLEARED_WARNING = 'GPS out of range — imported with GPS cleared';
/** Preview-only note so the UI knows to gate the commit behind acknowledgement. */
const CONSENT_ACK_WARNING =
  'Consent is GRANTED — acknowledgement will be required to import this actor';

/**
 * T-3 (FR-5) — warning for a non-empty Phone cell that `normalizePhone()`
 * could not resolve. The row is still **created**: an unusable phone is not
 * grounds to reject a real organisation. The message names the column so the
 * AT team can find and repair the source cell, and deliberately carries **no
 * part of the rejected value** — echoing the digits back would put PII into a
 * report surface (FR-5, NFR-9).
 */
const PHONE_UNNORMALIZABLE_WARNING =
  'Phone — value is not a recognized Tanzanian number; imported with Phone cleared';

/**
 * T-3 (FR-5) — warning for a `/`-separated multi-number Phone cell. The first
 * number is stored; the rest are discarded. `normalizePhone()` never returns
 * the discarded values, only how many there were, so this message can name
 * **positions and a count but never a digit of the input** — which is the
 * whole reason the normalizer returns a count instead of an array.
 *
 * Positions are `2…additionalCount+1` because the *kept* number is always the
 * first non-empty segment (design.md §4.1).
 */
function phoneAdditionalValuesWarning(additionalCount: number): string {
  const subject =
    additionalCount === 1
      ? 'an additional value was present at position 2'
      : `${additionalCount} additional values were present at positions 2–${additionalCount + 1}`;
  return `Phone — ${subject}; only the first number was imported and the rest were not stored`;
}

/**
 * T-4 — the internal pseudo-field a rolled-back commit chunk pushes onto its
 * rows, and the slug it surfaces as in the breakdown (FR-7). `_row` is not a
 * template column; emitting it raw would put a non-column in a vocabulary the
 * client reads as column names.
 */
const ROW_LEVEL_ERROR_FIELD = '_row';
const BATCH_ROLLED_BACK_REASON = 'batch-rolled-back';

/**
 * T-4 — position of a field in the canonical template's column order, used to
 * pick **which** of a multi-error row's errors names the row (FR-7).
 *
 * `errors[0]` is the wrong answer and this is not hypothetical: `validateRow`
 * pushes `region` before `traderType`, while `TEMPLATE_COLUMNS` orders Trader
 * Type *first*. A row failing both would be attributed to `region` by
 * insertion order and to `traderType` by template order — so the two rules are
 * observably different, and FR-7 wants the template's.
 *
 * Unknown fields (i.e. `_row`) sort last. `Array#sort` is stable in V8, so
 * ties keep insertion order and the result is deterministic (NFR-6).
 */
function templateColumnIndex(field: string): number {
  const index = TEMPLATE_COLUMNS.findIndex((column) => column.field === field);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/**
 * T-4 (FR-1) — one row's message(s) for a required field, reusing
 * `AdminActorCreateDto`'s own class-validator output for the same "missing"
 * shape (NFR-1), rather than a hand-typed paraphrase. Memoized per field
 * (module-level map, not per row) to keep `validateSync` off the per-row hot
 * path (NFR-2).
 */
const MISSING_FIELD_ERROR_CACHE = new Map<IntakeRequiredField, ImportRowError[]>();

function missingContractFieldErrors(field: IntakeRequiredField): ImportRowError[] {
  const cached = MISSING_FIELD_ERROR_CACHE.get(field);
  if (cached) return cached;

  const probeInput: Record<string, unknown> =
    field === 'crops' ? { crops: [] } : { [field]: undefined };
  const probe = plainToInstance(AdminActorCreateDto, probeInput);
  const violations = validateSync(probe, { skipMissingProperties: false });
  const match = violations.find((v) => v.property === field);
  const messages = Object.values(match?.constraints ?? {});
  // Fallback only guards a future metadata drift (NFR-1's set-equality test
  // pins the normal case); it must never throw and kill the whole row.
  const result =
    messages.length > 0
      ? messages.map((message) => ({ field, message }))
      : [{ field, message: `${field} is required` }];
  MISSING_FIELD_ERROR_CACHE.set(field, result);
  return result;
}

/** Scalar Actor create payload assembled from a validated row. `traderId` is
 * merged in separately at commit time, once a chunk has allocated one
 * (design.md §4.2/§4.5) — a row never carries its own Trader ID. */
interface ActorScalarData {
  traderName: string;
  region: string;
  traderType: string;
  district?: string;
  sex?: string;
  position?: string;
  marketLocation?: string;
  capacityTons?: number;
  technicalSupport?: string;
  /**
   * `null` is meaningful here, not merely "absent": T-3 writes an explicit
   * `null` for a non-empty cell that could not be normalized, and
   * `buildCreateData` keeps `null` while dropping `undefined` — so the column
   * is written NULL rather than left to a default.
   */
  phone?: string | null;
  email?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  consentStatus: ConsentStatus;
  /** Imports are always TEAM_MANAGED (FR-5, T-4); no longer a column. */
  registrationSource: RegistrationSource;
  /** T-6 — how consent was obtained (FR-2); defaults to NOT_RECORDED. */
  consentMethod: ConsentMethod;
  /** T-6 — full RFC-3339 instant consent was obtained (FR-2); optional. */
  consentObtainedAt?: string;
  /** T-6 — free-text pointer to the consent evidence (FR-2); optional. */
  consentReference?: string;
  /**
   * T-4 (public-profile-disclosure) — named natural person, published
   * deliberately once consent is GRANTED. Bound in `validateRow` to
   * `INTAKE_MAX_LENGTHS.contactPerson`, matching every other intake path.
   */
  contactPerson?: string;
  /**
   * T-4 (public-profile-disclosure) — actor-declared free text, published.
   * Bound to 300 chars in `validateRow`, matching the `Actor.otherCrops`
   * `VARCHAR(300)` column.
   */
  otherCrops?: string;
}

/** Mutable per-row working state threaded through the pipeline phases. */
interface WorkRow {
  rowNumber: number;
  /** `null` until a chunk allocates and commits this row (design.md §4.2). */
  traderId: string | null;
  traderName: string | null;
  errors: ImportRowError[];
  warnings: string[];
  /**
   * `candidate` — passed validation (+ duplicate classification, + consent
   * gate), eligible to create.
   * `possible-duplicate` — a strong match (DB or in-file) was not confirmed;
   * never created (T-5, design.md §4.5).
   * `failed` — validation, consent-gate, or commit-chunk failure (has errors).
   * `created` — committed (has `actorId`).
   */
  state: 'candidate' | 'possible-duplicate' | 'failed' | 'created';
  /** Present while the row is a create candidate. */
  create?: {
    scalar: ActorScalarData;
    cropNames: string[];
    additionalTraderTypes: string[];
    consentGranted: boolean;
  };
  actorId?: string;
  /**
   * T-5 — this row's strong matches (DB + in-file), reported on every
   * surface whatever the outcome. Also the source the commit-time audit
   * confirmation is resolved from (design.md §4.5): a `kind: 'row'` entry
   * naming an earlier row that itself got created is rewritten to
   * `kind: 'actor'` using THAT row's created id/traderId.
   */
  duplicateCandidates?: ImportDuplicateCandidate[];
  /**
   * T-5 — the full strong-match count behind `duplicateCandidates`, before
   * the 50-item wire cap (design.md §3/§9, attempt-2 rework).
   */
  duplicateCandidatesTotal?: number;
  /** T-5 — this row's weak matches (DB + in-file) — advisory only. */
  duplicateWarnings?: ImportDuplicateCandidate[];
}

/** A candidate row's scalar data reduced to `IntakeDuplicateService`'s comparison shape. */
function toCandidateInput(scalar: ActorScalarData): IntakeDuplicateCandidateInput {
  return {
    phone: scalar.phone ?? null,
    email: scalar.email ?? null,
    traderName: scalar.traderName,
    gpsLatitude: scalar.gpsLatitude ?? null,
    gpsLongitude: scalar.gpsLongitude ?? null,
  };
}

/** An existing-actor match → the wire/audit `kind: 'actor'` shape (T-5, design.md §3). */
function toActorCandidate(c: DuplicateCandidate): ImportDuplicateCandidate {
  return {
    kind: 'actor',
    actorId: c.actorId,
    traderId: c.traderId,
    traderName: c.traderName,
    matchedOn: c.matchedOn,
  };
}

/**
 * An in-file match → the wire/audit `kind: 'row'` shape. `match.key` is
 * whatever `IntakeDuplicateIndex.add()` indexed the earlier row under — this
 * service always uses `row:<n>` (never leaking the raw key onto the wire,
 * T-3 Reviewer forward pointer), so the row number is recovered by slicing
 * off that fixed prefix.
 */
function toRowCandidate(match: IntakeDuplicateIndexMatch): ImportDuplicateCandidate {
  return {
    kind: 'row',
    row: Number(match.key.slice('row:'.length)),
    traderName: match.traderName,
    matchedOn: match.matchedOn,
  };
}

@Injectable()
export class ActorImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: ActorAuditService,
    private readonly actingAdminResolver: ActingAdminResolver,
    private readonly intakeDuplicateService: IntakeDuplicateService,
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

    // T-6 (FR-5) — detect a stale template BEFORE the header-match lookup: an
    // old template's headers won't match TEMPLATE_HEADERS (it's missing the
    // newly-added columns), which would otherwise surface as the generic
    // "no Data sheet matching" error below — opaque about WHY it failed. A
    // version stamp mismatch gets a specific, actionable message instead.
    const templateVersionDetected = this.detectTemplateVersion(workbook);
    // Detection is case-insensitive (`/^v\d+$/i` below), so the comparison
    // must be too — otherwise a workbook stamped "V2" is rejected as stale
    // against a current "v2" with the self-contradictory message "found V2,
    // current is v2" (T-6 rework attempt 2).
    if (
      templateVersionDetected &&
      templateVersionDetected.toLowerCase() !== TEMPLATE_VERSION.toLowerCase()
    ) {
      throw new BadRequestException(
        `This template is out of date (found ${templateVersionDetected}, current is ${TEMPLATE_VERSION}). Please re-download the import template from the "Download template" link on this page and try again.`,
      );
    }

    const sheet = this.locateDataSheet(workbook);
    if (!sheet) {
      throw new BadRequestException(
        'The workbook has no Data sheet matching the import template headers.',
      );
    }

    // Read raw rows first so the row cap bounds CPU before any validation.
    const rawRows = this.readRawRows(sheet);
    if (rawRows.length > MAX_DATA_ROWS) {
      throw new BadRequestException(
        `The file has ${rawRows.length} data rows; the maximum is ${MAX_DATA_ROWS}.`,
      );
    }

    const commit = dto.mode === 'commit';
    const rows = rawRows.map((raw) => this.validateRow(raw));

    // T-5 (design.md §1, §4.5) — duplicate classification runs BEFORE the
    // consent gate: a row the consent gate later fails still had a VALID
    // identity, so it stays an in-file match source; only a row that failed
    // VALIDATION (above) is excluded. `duplicateConfirmations` is ignored in
    // preview (the field itself is also unused there, design.md §3).
    await this.classifyDuplicates(
      rows,
      commit ? (dto.duplicateConfirmations ?? []) : [],
    );

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

    // T-4 — Trader ID is no longer a column: it is system-assigned per chunk
    // at commit time (design.md §4.2/§4.5), never parsed from a cell.
    const traderName = cells.traderName || null;

    if (!traderName) {
      errors.push({ field: 'traderName', message: 'Trader Name is required.' });
    } else if (traderName.length > INTAKE_MAX_LENGTHS.traderName) {
      errors.push({
        field: 'traderName',
        message: `Trader Name must be ${INTAKE_MAX_LENGTHS.traderName} characters or fewer.`,
      });
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

    // Additional actor types — optional, ";"-separated. Unknown value fails the
    // row; the main type and repeats are silently dropped (spreadsheet-friendly).
    const additionalTraderTypes: string[] = [];
    if (cells.additionalTraderTypes) {
      for (const part of cells.additionalTraderTypes.split(';')) {
        const trimmed = part.trim();
        if (trimmed === '') continue;
        const normalized = normalizeTraderType(trimmed);
        if (!normalized) {
          if (!errors.some((e) => e.field === 'additionalTraderTypes')) {
            errors.push({
              field: 'additionalTraderTypes',
              message: 'Additional Actor Types contains a value not in the allowed taxonomy.',
            });
          }
        } else if (normalized !== traderType && !additionalTraderTypes.includes(normalized)) {
          additionalTraderTypes.push(normalized);
        }
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

    // Capacity — required (FR-1). Blank → missing omission; non-blank,
    // non-numeric → its own format error (design.md §4.1).
    let capacityTons: number | undefined;
    if (!cells.capacityTons) {
      errors.push(...missingContractFieldErrors('capacityTons'));
    } else {
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

    // Phone — required (`common/intake-contract.ts`, FR-1). An
    // unnormalizable (but present) value warns and clears rather than
    // failing the row (FR-5); the two phone-cleared warnings below are
    // independent, not exclusive.
    let phone: string | null | undefined;
    if (!cells.phone) {
      errors.push(...missingContractFieldErrors('phone'));
    } else if (cells.phone.length > INTAKE_MAX_LENGTHS.phone) {
      errors.push({
        field: 'phone',
        message: `Phone must be ${INTAKE_MAX_LENGTHS.phone} characters or fewer.`,
      });
    } else {
      const normalized = normalizePhone(cells.phone);
      // `null`, never the raw string — storing an unnormalizable value is the
      // behavior this task exists to remove (design.md §4.1 / §10.1 F-1).
      phone = normalized.phone;
      if (normalized.phone === null) {
        warnings.push(PHONE_UNNORMALIZABLE_WARNING);
      }
      if (normalized.additionalCount > 0) {
        warnings.push(phoneAdditionalValuesWarning(normalized.additionalCount));
      }
    }

    // Email — required (FR-1). Blank → missing omission; over bound rejected
    // before the format check; present + in-bound must be a valid address.
    // Never echo the value.
    let email: string | undefined;
    if (!cells.email) {
      errors.push(...missingContractFieldErrors('email'));
    } else if (cells.email.length > INTAKE_MAX_LENGTHS.email) {
      errors.push({
        field: 'email',
        message: `Email must be ${INTAKE_MAX_LENGTHS.email} characters or fewer.`,
      });
    } else if (!isEmail(cells.email)) {
      errors.push({ field: 'email', message: 'Email format is invalid.' });
    } else {
      email = cells.email;
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

    // Registration Source — no longer a column; imports are always
    // TEAM_MANAGED (FR-5, T-4).
    const registrationSource: RegistrationSource = RegistrationSource.TEAM_MANAGED;

    // Consent Method — optional; blank defaults to NOT_RECORDED (FR-2). Always
    // normalized to the enum BEFORE the provenance gate sees it — a raw,
    // un-normalized value would short-circuit `isConsentProvenanceSatisfied`'s
    // `NOT_RECORDED` comparison (T-2 Reviewer advisory C-3).
    let consentMethod: ConsentMethod = ConsentMethod.NOT_RECORDED;
    if (cells.consentMethod) {
      const upper = cells.consentMethod.toUpperCase();
      if (!(CONSENT_METHOD_VALUES as string[]).includes(upper)) {
        errors.push({
          field: 'consentMethod',
          message: `Consent Method must be one of ${CONSENT_METHOD_VALUES.join(', ')}.`,
        });
      } else {
        consentMethod = upper as ConsentMethod;
      }
    }

    // Consent Obtained At — optional; blank cells stay `undefined` (never `''`,
    // C-3) so a missing date reads as "not provided" to the provenance gate
    // rather than as a truthy non-null value. When present, parse to a full
    // RFC-3339 instant: Prisma's `DateTime` rejects a date-only string with an
    // unhandled `PrismaClientValidationError` (500, advisory E-2), so
    // date-only text and Excel serial numbers are normalized here, in the
    // per-row parse path, so a bad date is a row-level rejection, never a 500.
    let consentObtainedAt: string | undefined;
    if (cells.consentObtainedAt) {
      const parsed = this.parseConsentObtainedAt(cells.consentObtainedAt);
      if (parsed === null) {
        errors.push({
          field: 'consentObtainedAt',
          message: 'Consent Obtained At must be a valid date.',
        });
      } else {
        consentObtainedAt = parsed;
      }
    }

    // Consent Reference — optional free text pointer to the evidence (FR-2).
    let consentReference: string | undefined;
    if (cells.consentReference) {
      if (cells.consentReference.length > 255) {
        errors.push({
          field: 'consentReference',
          message: 'Consent Reference must be 255 characters or fewer.',
        });
      } else {
        consentReference = cells.consentReference;
      }
    }

    // Contact Person — required (FR-1, intake-required-fields): published
    // deliberately once consent is GRANTED (public-profile-disclosure
    // FR-4/FR-5). A blank cell is the missing omission below; bound to
    // `INTAKE_MAX_LENGTHS.contactPerson`, matching every other intake path.
    let contactPerson: string | undefined;
    if (!cells.contactPerson) {
      errors.push(...missingContractFieldErrors('contactPerson'));
    } else if (cells.contactPerson.length > INTAKE_MAX_LENGTHS.contactPerson) {
      errors.push({
        field: 'contactPerson',
        message: `Contact Person must be ${INTAKE_MAX_LENGTHS.contactPerson} characters or fewer.`,
      });
    } else {
      contactPerson = cells.contactPerson;
    }

    // Other Crops — optional actor-declared free text, published
    // (public-profile-disclosure FR-4/FR-5). Bound to 300 chars to match the
    // `Actor.otherCrops` `VARCHAR(300)` column — an unbounded cell here would
    // hit MySQL error 1406 on commit rather than fail this one row cleanly.
    let otherCrops: string | undefined;
    if (cells.otherCrops) {
      if (cells.otherCrops.length > 300) {
        errors.push({
          field: 'otherCrops',
          message: 'Other Crops must be 300 characters or fewer.',
        });
      } else {
        otherCrops = cells.otherCrops;
      }
    }

    // Crops — three YES/NO columns → crop-name list (DR-3). At least one is
    // required (FR-1): zero names is the same "missing" shape as `crops: []`.
    const cropNames = this.resolveCrops(cells, errors);
    if (cropNames.length === 0) {
      errors.push(...missingContractFieldErrors('crops'));
    }

    const row: WorkRow = {
      rowNumber,
      traderId: null,
      traderName,
      errors,
      warnings,
      state: errors.length > 0 ? 'failed' : 'candidate',
    };

    if (row.state === 'candidate') {
      row.create = {
        scalar: {
          traderName: traderName as string,
          region: region as string,
          traderType: traderType as string,
          district: cells.district || undefined,
          sex,
          position: cells.position || undefined,
          marketLocation: cells.marketLocation || undefined,
          capacityTons,
          technicalSupport: cells.technicalSupport || undefined,
          phone,
          email,
          gpsLatitude: gps.lat,
          gpsLongitude: gps.lng,
          consentStatus,
          registrationSource,
          consentMethod,
          consentObtainedAt,
          consentReference,
          contactPerson,
          otherCrops,
        },
        cropNames,
        additionalTraderTypes: sortTraderTypes(additionalTraderTypes),
        consentGranted: consentStatus === ConsentStatus.GRANTED,
      };
    }

    return row;
  }

  /**
   * Parse a non-blank "Consent Obtained At" cell into a full RFC-3339 instant
   * Prisma's `DateTime` will accept, or `null` if the cell isn't a
   * recognizable, plausible, not-future date (T-6, advisory E-2; T-6 rework
   * attempt 2). Excel cells can arrive as any of:
   *
   * 1. A real Excel date cell — `cellToString` already rendered it via
   *    `Date#toISOString()`, so it's a full instant already. Still
   *    round-tripped through `new Date(...)` — the regex alone accepts
   *    out-of-range components like "2026-13-45T99:99:99Z".
   * 2. Date-only text a field-staff member typed directly (e.g. "2026-01-15")
   *    — Prisma's `DateTime` requires a full instant, not a date-only string,
   *    or it throws `PrismaClientValidationError` (NOT a
   *    `PrismaClientKnownRequestError`, so the error mapper rethrows it as an
   *    unhandled 500). Normalized to midnight UTC.
   * 3. An Excel serial date number (cell typed as a bare number rather than a
   *    formatted date), e.g. "46042". Excel's day 0 is 1899-12-30 (its
   *    well-known leap-year-bug epoch). Rejected below `MIN_PLAUSIBLE_EXCEL_SERIAL`
   *    — see that constant's comment for why an unbounded serial is unsafe.
   *
   * Every branch also rejects an instant later than "now": the importer must
   * enforce the same not-in-the-future invariant as the other two write paths
   * (`AdminActorCreateDto`, `BulkConsentDto`) or a future-dated row imports as
   * satisfied provenance and later makes the actor uneditable through
   * `ActorForm` (R-9 re-entering through the import door).
   *
   * Never throws — an unrecognized, implausible, or future value returns
   * `null` so the caller can reject just that row with a reason (never a 500
   * that kills the batch).
   */
  private parseConsentObtainedAt(raw: string): string | null {
    const now = Date.now();
    /** Accept a parsed instant only if it's a real date and not in the future. */
    const accept = (parsed: Date): string | null =>
      Number.isNaN(parsed.getTime()) || parsed.getTime() > now
        ? null
        : parsed.toISOString();

    const fullInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
    if (fullInstant.test(raw)) {
      return accept(new Date(raw));
    }

    const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
    if (dateOnly.test(raw)) {
      return accept(new Date(`${raw}T00:00:00.000Z`));
    }

    const serialLike = /^\d+(\.\d+)?$/;
    if (serialLike.test(raw)) {
      const serial = Number(raw);
      if (serial < MIN_PLAUSIBLE_EXCEL_SERIAL) {
        return null;
      }
      return accept(new Date(EXCEL_EPOCH_UTC_MS + serial * 86400000));
    }

    return null;
  }

  /**
   * Resolve the two GPS cells the template still carries (GPS Altitude and
   * GPS Accuracy are no longer import columns, T-4 — they stay on the admin
   * form and in the database, D-11). If a present lat/long is out of range
   * or non-numeric, BOTH GPS values are cleared and a warning is recorded
   * (DR-5) — GPS problems never fail a whole actor.
   */
  private resolveGps(
    cells: Record<string, string>,
    warnings: string[],
  ): {
    lat?: number;
    lng?: number;
  } {
    const lat = this.numOrNull(cells.gpsLatitude);
    const lng = this.numOrNull(cells.gpsLongitude);

    const invalid =
      (cells.gpsLatitude !== '' && !isValidLatitude(lat)) ||
      (cells.gpsLongitude !== '' && !isValidLongitude(lng));

    if (invalid) {
      warnings.push(GPS_CLEARED_WARNING);
      return {};
    }

    return {
      lat: lat ?? undefined,
      lng: lng ?? undefined,
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

  // ---- duplicate classification (T-5, FR-4, design.md §4.5) --------------

  /**
   * Classify every row that passed validation against the database AND
   * against earlier rows of the same workbook, in one pass (design.md §3,
   * §4.5):
   *
   * - **One actor scan for the whole batch** via `checkBatch` (T-3's API,
   *   design.md §4.3) — never one scan per row.
   * - **In-file direction:** a row is matched against `IntakeDuplicateIndex`
   *   BEFORE it is added, so only EARLIER rows can match a LATER one
   *   (FR-4 scenario 2). A `failed` row (validation) is never added, so it
   *   is never a match source; a row that will later fail the CONSENT gate
   *   still passed validation here and IS added (FR-4: "a row the consent
   *   gate later fails stays a match source").
   * - **The gate:** a row's strong keys (`actor:<id>` / `row:<n>`) must ALL
   *   be named in its own `duplicateConfirmations` entry, or it becomes
   *   `possible-duplicate` and is excluded from commit (which filters on
   *   `state === 'candidate'`). `row.create` is kept, not cleared, so
   *   `applyConsentGate` can still check a held row's provenance (T-5
   *   attempt 3, design.md §4.5 amendment) — a held row is never created
   *   either way. The server recomputes this every run (DD-4) — a
   *   confirmation covers only the candidates it names.
   * - **Wire cap (attempt-2 rework):** `row.duplicateCandidates` is truncated
   *   to {@link MAX_WIRE_DUPLICATE_CANDIDATES}; `strongKeys`, used for the
   *   gate above, is never truncated.
   */
  private async classifyDuplicates(
    rows: WorkRow[],
    confirmations: Array<{ row: number; candidates: string[] }>,
  ): Promise<void> {
    const candidateRows = rows.filter(
      (row) => row.state === 'candidate' && row.create !== undefined,
    );
    if (candidateRows.length === 0) return;

    const confirmedByRow = new Map<number, Set<string>>();
    for (const entry of confirmations) {
      confirmedByRow.set(entry.row, new Set(entry.candidates));
    }

    const inputs = candidateRows.map((row) =>
      toCandidateInput((row.create as NonNullable<WorkRow['create']>).scalar),
    );
    const dbResults = await this.intakeDuplicateService.checkBatch(inputs);
    const index = new IntakeDuplicateIndex();

    candidateRows.forEach((row, i) => {
      const input = inputs[i];
      const dbResult = dbResults[i];
      const inFileResult = index.match(input);

      const strongCandidates: ImportDuplicateCandidate[] = [
        ...dbResult.strong.map(toActorCandidate),
        ...inFileResult.strong.map(toRowCandidate),
      ];
      const weakCandidates: ImportDuplicateCandidate[] = [
        ...dbResult.weak.map(toActorCandidate),
        ...inFileResult.weak.map(toRowCandidate),
      ];
      // Gating uses this FULL, uncapped list — never the wire-truncated one
      // below (design.md §3/§9: a row above the cap can never be fully
      // confirmed, so it correctly stays `possible-duplicate`).
      const strongKeys = [
        ...dbResult.strong.map((c) => `actor:${c.actorId}`),
        ...inFileResult.strong.map((m) => m.key),
      ];

      if (strongCandidates.length > 0) {
        row.duplicateCandidates = strongCandidates.slice(
          0,
          MAX_WIRE_DUPLICATE_CANDIDATES,
        );
        row.duplicateCandidatesTotal = strongCandidates.length;
      }
      if (weakCandidates.length > 0) row.duplicateWarnings = weakCandidates;

      const confirmedSet = confirmedByRow.get(row.rowNumber) ?? new Set<string>();
      const allConfirmed = strongKeys.every((key) => confirmedSet.has(key));

      if (strongKeys.length > 0 && !allConfirmed) {
        row.state = 'possible-duplicate';
        // `row.create` is kept (not cleared): the consent gate (below) still
        // needs its scalar data to check a held row's provenance (design.md
        // §4.5 amendment, T-5 attempt 3). Commit only ever creates rows whose
        // STATE is 'candidate', so a held row is never created regardless.
      }
      // `IntakeDuplicateIndex` enforces nothing about direction or exclusion
      // itself (intake-duplicate.service.ts docblock) — THIS caller decides:
      // add every row that passed validation, in row order, regardless of
      // whether it just became `possible-duplicate` (FR-4 scenario 2's
      // "including rows that are themselves possible-duplicate").
      index.add(`row:${row.rowNumber}`, input);
    });
  }

  // ---- consent gate -------------------------------------------------------

  /**
   * Consent gate (FR-3, FR-6, NFR-7, DD-5). Two INDEPENDENT checks, both must
   * pass for a row publishing an actor as `GRANTED`:
   *
   * 1. Per-row provenance (T-6, new): the SAME shared `isConsentProvenanceSatisfied`
   *    predicate consulted by create/update/bulk-consent (NFR-7 — one
   *    implementation, not a reimplementation here). Import only ever creates
   *    NEW actors, so `stored` is always `null`, which means condition (a)
   *    always fires for an effective-`GRANTED` row; the predicate reduces to
   *    "does this row itself carry a method (not
   *    `NOT_RECORDED`) and a date". A failure rejects ONLY this row (QA-9's
   *    per-row isolation) with a field-level reason; neighbours are untouched.
   * 2. The pre-existing file-level `acknowledged` flag (unchanged, DD-2/DD-5):
   *    required on commit — without it those rows fail. In preview the row
   *    stays a create candidate but carries a warning so the UI knows to show
   *    the acknowledgement dialog.
   *
   * T-5 attempt 3 (design.md §4.5 amendment) — this also runs on HELD
   * (`possible-duplicate`) rows, not just `candidate` ones: `classifyDuplicates`
   * no longer clears `row.create` when it holds a row, so its scalar data is
   * still here. A provenance failure outranks the hold (FR-5: the row reports
   * `failed`, never `possible-duplicate`). A held row that passes provenance
   * is never created either way, so only the preview acknowledgement warning
   * applies to it — that is what makes the frontend's file-level
   * acknowledgement dialog fire before a LATER confirmation reaches commit.
   */
  private applyConsentGate(
    rows: WorkRow[],
    commit: boolean,
    acknowledged?: boolean,
  ): void {
    for (const row of rows) {
      this.applyConsentGateToRow(row, commit, acknowledged);
    }
  }

  /** Per-row body of {@link applyConsentGate} — see that method's docblock. */
  private applyConsentGateToRow(
    row: WorkRow,
    commit: boolean,
    acknowledged?: boolean,
  ): void {
    const held = row.state === 'possible-duplicate';
    if ((row.state !== 'candidate' && !held) || !row.create) return;

    if (!this.passesProvenanceGate(row, row.create.scalar)) return;
    if (!row.create.consentGranted) return;

    if (held) {
      if (!commit) row.warnings.push(CONSENT_ACK_WARNING);
      return;
    }

    this.applyAcknowledgementGate(row, commit, acknowledged);
  }

  /**
   * Provenance half of the consent gate (T-6). On failure, fails the row and
   * returns `false`; a passing row is left untouched and returns `true`.
   */
  private passesProvenanceGate(row: WorkRow, scalar: ActorScalarData): boolean {
    const provenanceOk = isConsentProvenanceSatisfied(null, {
      consentStatus: scalar.consentStatus,
      consentMethod: scalar.consentMethod,
      consentObtainedAt: scalar.consentObtainedAt,
      consentReference: scalar.consentReference,
    });
    if (provenanceOk) return true;

    row.state = 'failed';
    row.create = undefined;
    row.errors.push(
      ...this.buildProvenanceRowErrors(scalar.consentMethod, scalar.consentObtainedAt),
    );
    return false;
  }

  /**
   * File-level acknowledgement half of the consent gate (DD-2/DD-5), for a
   * non-held `candidate` row whose provenance already passed and that
   * publishes `GRANTED`.
   */
  private applyAcknowledgementGate(
    row: WorkRow,
    commit: boolean,
    acknowledged?: boolean,
  ): void {
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

  /**
   * Field-level error(s) for a row that fails the provenance gate — mirrors
   * `ActorsAdminService.buildProvenanceError`'s per-field granularity (same
   * invariant, NFR-7) but returns `ImportRowError[]` for the row report rather
   * than throwing, so the import pipeline can fail just this one row.
   */
  private buildProvenanceRowErrors(
    method: ConsentMethod,
    obtainedAt: string | undefined,
  ): ImportRowError[] {
    const errors: ImportRowError[] = [];
    if (method === ConsentMethod.NOT_RECORDED) {
      errors.push({
        field: 'consentMethod',
        message:
          'Consent Method must be recorded (not blank / Not recorded) when Consent Status is GRANTED.',
      });
    }
    if (obtainedAt === undefined) {
      errors.push({
        field: 'consentObtainedAt',
        message: 'Consent Obtained At is required when Consent Status is GRANTED.',
      });
    }
    return errors;
  }

  // ---- commit ------------------------------------------------------------

  /**
   * Create the surviving candidates in chunked transactions (FR-5). Each
   * chunk is one `$transaction` (actor + crop links + one `IMPORT` audit
   * batch); a chunk failure rolls that chunk back and fails only its rows —
   * later chunks still run.
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
    // T-5 — rowNumber → created identity, so a LATER chunk (or a LATER row
    // in the SAME chunk) can resolve a `kind: 'row'` confirmation snapshot
    // to the real actor it ended up pointing at (design.md §4.5).
    const createdByRow = new Map<number, { actorId: string; traderId: string }>();

    for (let i = 0; i < candidates.length; i += COMMIT_CHUNK_SIZE) {
      const chunk = candidates.slice(i, i + COMMIT_CHUNK_SIZE);
      await this.commitChunk(chunk, acting, cropIdByName, acknowledged, createdByRow);
    }
  }

  /**
   * Allocate this chunk's Trader IDs, then create it in one transaction
   * (design.md §4.2, §4.5). A `traderId` collision retries the WHOLE chunk,
   * up to {@link MAX_TRADER_ID_ALLOCATION_ATTEMPTS} times; exhaustion or any
   * other error keeps the existing whole-chunk failure (P-23) — later chunks
   * still run, nothing is rethrown out of `commit`.
   */
  private async commitChunk(
    chunk: WorkRow[],
    acting: ActingAdmin,
    cropIdByName: Map<string, string>,
    acknowledged: boolean | undefined,
    createdByRow: Map<number, { actorId: string; traderId: string }>,
  ): Promise<void> {
    const now = new Date();

    for (let attempt = 1; attempt <= MAX_TRADER_ID_ALLOCATION_ATTEMPTS; attempt += 1) {
      try {
        const traderIds = await allocateTraderIds(this.prisma, chunk.length, now);
        // T-5 — seeded from the OUTER map (earlier chunks' creates), then
        // grown with THIS chunk's own rows as they are created below, so a
        // row can resolve a confirmation against an earlier row of the SAME
        // chunk too. Discarded on any failure in this attempt — only merged
        // into `createdByRow` once the transaction actually commits.
        const localCreated = new Map(createdByRow);
        const createdIds = await this.prisma.$transaction(async (tx) => {
          const createdActors: AdminActor[] = [];
          const ids: string[] = [];

          for (let idx = 0; idx < chunk.length; idx += 1) {
            const row = chunk[idx];
            const create = row.create as NonNullable<WorkRow['create']>;
            const actor = await tx.actor.create({
              data: this.buildCreateData(create.scalar, traderIds[idx]),
            });

            if (create.additionalTraderTypes.length > 0) {
              await tx.actorAdditionalType.createMany({
                data: create.additionalTraderTypes.map((traderType) => ({
                  actorId: actor.id,
                  traderType,
                })),
              });
            }

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
                additionalTypes: create.additionalTraderTypes.map((traderType) => ({ traderType })),
              }),
            );
            localCreated.set(row.rowNumber, { actorId: actor.id, traderId: traderIds[idx] });
          }

          const duplicateConfirmations = chunk.map((row) =>
            this.resolveDuplicateConfirmation(row.duplicateCandidates, localCreated),
          );

          await this.auditService.logImport(
            tx,
            createdActors,
            acting,
            acknowledged,
            duplicateConfirmations,
          );
          return ids;
        });

        chunk.forEach((row, idx) => {
          row.state = 'created';
          row.actorId = createdIds[idx];
          row.traderId = traderIds[idx];
          createdByRow.set(row.rowNumber, {
            actorId: createdIds[idx],
            traderId: traderIds[idx],
          });
        });
        return;
      } catch (err) {
        if (isTraderIdCollisionError(err) && attempt < MAX_TRADER_ID_ALLOCATION_ATTEMPTS) {
          continue;
        }
        for (const row of chunk) {
          row.state = 'failed';
          row.create = undefined;
          row.actorId = undefined;
          row.traderId = null;
          row.errors.push({
            field: ROW_LEVEL_ERROR_FIELD,
            message:
              'This batch failed and was rolled back; the row was not imported.',
          });
        }
        return;
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

  /**
   * Resolve one row's confirmed strong candidates into the audit snapshot
   * `logImport` persists (design.md §2/§4.5). A `kind: 'row'` entry whose
   * referenced row was ITSELF created earlier in this same import (an
   * earlier chunk, or an earlier row of this chunk) is rewritten to
   * `kind: 'actor'` using that row's real id/traderId — the wire-facing
   * `ImportRowResult.duplicateCandidates` is never mutated this way, only
   * the audit copy. `null` when there is nothing to confirm (mirrors
   * `ActorsAdminService.create`'s `duplicateConfirmation`, T-3).
   */
  private resolveDuplicateConfirmation(
    candidates: ImportDuplicateCandidate[] | undefined,
    createdByRow: ReadonlyMap<number, { actorId: string; traderId: string }>,
  ): DuplicateConfirmationSnapshot[] | null {
    if (!candidates || candidates.length === 0) return null;

    return candidates.map((candidate): DuplicateConfirmationSnapshot => {
      if (candidate.kind === 'actor') {
        return {
          kind: 'actor',
          actorId: candidate.actorId,
          traderId: candidate.traderId,
          traderName: candidate.traderName,
          matchedOn: candidate.matchedOn,
        };
      }
      const resolved = createdByRow.get(candidate.row);
      if (resolved) {
        return {
          kind: 'actor',
          actorId: resolved.actorId,
          traderId: resolved.traderId,
          traderName: candidate.traderName,
          matchedOn: candidate.matchedOn,
        };
      }
      return {
        kind: 'row',
        row: candidate.row,
        traderName: candidate.traderName,
        matchedOn: candidate.matchedOn,
      };
    });
  }

  /**
   * Build a Prisma create payload, omitting undefined optionals. `traderId`
   * is merged in explicitly — it is allocated per chunk (design.md §4.2),
   * never carried on the row's own scalar data.
   */
  private buildCreateData(
    scalar: ActorScalarData,
    traderId: string,
  ): Prisma.ActorCreateInput {
    const data: Record<string, unknown> = { traderId };
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
    const possibleDuplicate = resultRows.filter(
      (r) => r.outcome === 'possible-duplicate',
    ).length;
    const failed = resultRows.filter((r) => r.outcome === 'failed').length;
    const warnings = resultRows.filter(
      (r) => r.warnings && r.warnings.length > 0,
    ).length;
    // Preview reports prospective creates in `toCreate` (`created` = 0); commit
    // reports what actually landed (`toCreate` mirrors `created`, FR-7).
    // Either way: toCreate + possibleDuplicate + failed = rows (T-5, FR-4).
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
        possibleDuplicate,
        failed,
        warnings,
      },
      rows: resultRows,
    };
    if (templateVersionDetected) {
      report.templateVersionDetected = templateVersionDetected;
    }
    const failureBreakdown = this.buildFailureBreakdown(resultRows);
    if (failureBreakdown.length > 0) {
      report.failureBreakdown = failureBreakdown;
    }
    return report;
  }

  /**
   * T-4 (FR-7) — tally why rows did not import, **one reason per row**, so the
   * counts sum to `failed + possibleDuplicate` exactly (T-5 renamed `skipped`).
   *
   * Ordering is count descending, then reason ascending. The tie-break uses a
   * plain `<` on the slugs rather than `localeCompare`, which is
   * locale-sensitive and would let the same input order differently on a
   * differently-configured runtime — the opposite of what NFR-6 asks for.
   */
  private buildFailureBreakdown(
    resultRows: ImportRowResult[],
  ): ImportFailureReason[] {
    const counts = new Map<string, number>();
    for (const row of resultRows) {
      const reason = this.failureReasonFor(row);
      if (reason !== null) {
        counts.set(reason, (counts.get(reason) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => {
        if (a.count !== b.count) return b.count - a.count;
        return a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0;
      });
  }

  /**
   * The single reason a row did not import, or `null` if it did (or will).
   *
   * A `possible-duplicate` row is named by its outcome; a failed row by the
   * template-first of its errors. Both vocabularies are closed and
   * value-free (FR-7, NFR-9).
   */
  private failureReasonFor(row: ImportRowResult): string | null {
    if (row.outcome === 'possible-duplicate') return row.outcome;
    if (row.outcome !== 'failed') return null;

    const errors = row.errors ?? [];
    // A `failed` row always carries at least one error; guard anyway so a
    // future path that fails a row without one cannot silently break the sum
    // invariant by contributing zero reasons.
    if (errors.length === 0) return BATCH_ROLLED_BACK_REASON;

    const [first] = [...errors].sort(
      (a, b) => templateColumnIndex(a.field) - templateColumnIndex(b.field),
    );
    return first.field === ROW_LEVEL_ERROR_FIELD
      ? BATCH_ROLLED_BACK_REASON
      : first.field;
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
      case 'possible-duplicate':
        // T-5 — held in BOTH modes (design.md §4.5: preview shows the hold
        // as plainly as commit does; only commit's enforcement differs).
        outcome = 'possible-duplicate';
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
    if (row.duplicateCandidates && row.duplicateCandidates.length > 0) {
      result.duplicateCandidates = row.duplicateCandidates;
      if (row.duplicateCandidatesTotal !== undefined) {
        result.duplicateCandidatesTotal = row.duplicateCandidatesTotal;
      }
    }
    if (row.duplicateWarnings && row.duplicateWarnings.length > 0) {
      result.duplicateWarnings = row.duplicateWarnings;
    }
    return result;
  }
}
