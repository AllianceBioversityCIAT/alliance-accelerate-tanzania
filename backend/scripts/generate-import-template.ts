/**
 * T-3 — Import template generator (FR-1, NFR-8; design.md §4 + §8 DR-2/DR-7).
 *
 * Dev-time script that writes the Excel actor-import template that field staff
 * fill in and that the admin import UI links to. It is generated FROM the single
 * source of truth `common/template-columns.ts` (the same module the runtime
 * parser consumes), so the Data-sheet headers, the dropdown allowed-values, and
 * the values validation actually enforces can never drift (NFR-8).
 *
 * Byte-stability (DR-7): regenerating the template without a schema change MUST
 * produce a byte-identical file, so a committed asset + `git diff --exit-code`
 * is a reliable drift check. exceljs writes two kinds of volatile data into the
 * .xlsx and BOTH are pinned here:
 *   1. Document properties (created / modified / creator / lastModifiedBy) in
 *      `docProps/core.xml` — pinned via the fixed `workbook.*` assignments below.
 *   2. The per-entry "last modified" DOS timestamp inside the ZIP container.
 *      exceljs exposes no public hook for this: JSZip defaults every entry —
 *      including the folder entries (`xl/`, `_rels/`, …) it auto-creates — to
 *      `new Date()` (2-second resolution, so two runs seconds apart differ). We
 *      pin it by wrapping `ZipWriter.prototype.finalize` to stamp a fixed date on
 *      every entry (files AND folders) just before the archive is generated.
 *      JSZip serialises it with `getUTC*`, so the output is also
 *      timezone-independent. This is the "pin any other volatile field" step the
 *      design calls for; `generate-template.spec.ts` guards it against exceljs
 *      changing this internal path.
 *
 * Run: `npm run generate:template`.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';

import {
  TEMPLATE_COLUMNS,
  TEMPLATE_VERSION,
} from '../src/common/template-columns';

/** The one fixed instant stamped on the document AND on every ZIP entry. */
const FIXED_INSTANT = new Date('2026-07-10T00:00:00Z');

/** Constant author string (pins docProps/core.xml creator + lastModifiedBy). */
const WORKBOOK_AUTHOR = 'ACCELERATE Tanzania Seed Registry';

/** Sheet names (the Data sheet the parser reads; Lists backs the dropdowns). */
const INSTRUCTIONS_SHEET = 'Instructions';
const DATA_SHEET = 'Data';
const LISTS_SHEET = 'Lists';

/** Last row the Data-sheet dropdowns cover (headers = row 1). */
const DATA_VALIDATION_LAST_ROW = 1001;

/** Output path, resolved relative to this script (backend/scripts/). */
const OUTPUT_PATH = path.resolve(
  __dirname,
  '../../frontend/public/templates/actor-import-template.xlsx',
);

const HOW_TO_LINES: readonly string[] = [
  '1. Enter one actor per row on the "Data" sheet. Do not rename, reorder, or delete the header row.',
  '2. Columns marked Required must be filled in — rows missing a required value are rejected on import.',
  '3. Where a column has a dropdown (Trader Type, Region, Sex, the three Crop columns, Consent Status), pick a listed value.',
  '4. For each crop the actor deals in, choose YES or NO in that crop’s column.',
  '5. Leave a cell blank when you have no value; blank optional cells are accepted.',
  '6. Save the file as .xlsx and upload it from Admin → Actors → Import.',
];

// Pin the ZIP entry timestamp as soon as this module loads, before any workbook
// is written (see the file header for why exceljs needs this). Applied once.
applyDeterministicZipDate(FIXED_INSTANT);

/**
 * Wrap exceljs's internal ZipWriter so every archive entry carries a fixed
 * modification date instead of `new Date()`. Stamping in `finalize` (rather than
 * per-append) covers the folder entries JSZip auto-creates, which never pass
 * through `append`. This is the only volatile field exceljs offers no public API
 * to control.
 */
function applyDeterministicZipDate(date: Date): void {
  /* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
  const zipStream = require('exceljs/lib/utils/zip-stream');
  const originalFinalize = zipStream.ZipWriter.prototype.finalize;
  zipStream.ZipWriter.prototype.finalize = function finalize(
    this: { zip: { files: Record<string, { date: Date }> } },
    ...args: unknown[]
  ): unknown {
    for (const name of Object.keys(this.zip.files)) {
      this.zip.files[name].date = date;
    }
    return originalFinalize.apply(this, args);
  };
  /* eslint-enable */
}

/**
 * Build the complete template workbook in memory (no I/O). Exported so the
 * byte-stability spec can drive it directly.
 */
export function buildTemplateWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = WORKBOOK_AUTHOR;
  workbook.lastModifiedBy = WORKBOOK_AUTHOR;
  workbook.created = FIXED_INSTANT;
  workbook.modified = FIXED_INSTANT;

  buildInstructionsSheet(workbook);
  const dataSheet = workbook.addWorksheet(DATA_SHEET, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const listRanges = buildListsSheet(workbook);
  populateDataSheet(dataSheet, listRanges);

  return workbook;
}

/**
 * Serialise the workbook to a deterministic .xlsx buffer. Two calls without a
 * schema change return byte-identical buffers.
 */
export async function generateTemplateBuffer(): Promise<Buffer> {
  const workbook = buildTemplateWorkbook();
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

/** Instructions sheet: title, version stamp, how-to, and a per-column table. */
function buildInstructionsSheet(workbook: ExcelJS.Workbook): void {
  const ws = workbook.addWorksheet(INSTRUCTIONS_SHEET);
  ws.columns = [{ width: 26 }, { width: 12 }, { width: 46 }, { width: 62 }];

  const title = ws.addRow(['ACCELERATE Tanzania — Actor Import Template']);
  title.getCell(1).font = { bold: true, size: 14 };

  const version = ws.addRow([`Template version: ${TEMPLATE_VERSION}`]);
  version.getCell(1).font = { bold: true };

  ws.addRow([]);
  ws.addRow(['How to use this template']).getCell(1).font = { bold: true };
  for (const line of HOW_TO_LINES) {
    ws.addRow([line]);
  }

  ws.addRow([]);
  const head = ws.addRow(['Column', 'Required', 'Format / guidance', 'Allowed values']);
  head.eachCell((cell) => {
    cell.font = { bold: true };
  });

  for (const col of TEMPLATE_COLUMNS) {
    ws.addRow([
      col.header,
      col.required ? 'Yes' : 'No',
      col.format ?? (col.allowedValues ? 'Choose from the dropdown' : 'Free text'),
      col.allowedValues ? col.allowedValues.join(', ') : '—',
    ]);
  }
}

/**
 * Hidden Lists sheet holding the allowed values for each constrained column, one
 * column per constrained field. Referencing a range keeps the Data-sheet
 * dropdowns clear of Excel's 255-character inline-list limit (the Region list
 * alone exceeds it). Returns `field -> absolute range` for the validations.
 */
function buildListsSheet(workbook: ExcelJS.Workbook): Record<string, string> {
  const ws = workbook.addWorksheet(LISTS_SHEET, { state: 'veryHidden' });
  const ranges: Record<string, string> = {};

  let colIndex = 1;
  for (const col of TEMPLATE_COLUMNS) {
    if (!col.allowedValues) continue;
    const letter = ws.getColumn(colIndex).letter;
    col.allowedValues.forEach((value, rowOffset) => {
      ws.getCell(rowOffset + 1, colIndex).value = value;
    });
    ranges[col.field] =
      `${LISTS_SHEET}!$${letter}$1:$${letter}$${col.allowedValues.length}`;
    colIndex += 1;
  }

  return ranges;
}

/**
 * exceljs supports one range-based data-validation per address at runtime
 * (`worksheet.dataValidations.add`), but its published typings only expose the
 * per-cell `cell.dataValidation`. This shim types the range API we rely on so a
 * single validation entry covers rows 2..1001 instead of 1,000 per-cell copies.
 */
interface WorksheetWithValidations {
  dataValidations: { add(range: string, validation: ExcelJS.DataValidation): void };
}

/** Data sheet: bold frozen header row, column widths, and dropdown validations. */
function populateDataSheet(
  ws: ExcelJS.Worksheet,
  listRanges: Record<string, string>,
): void {
  const validations = (ws as unknown as WorksheetWithValidations).dataValidations;
  const headerRow = ws.getRow(1);
  TEMPLATE_COLUMNS.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true };
  });

  TEMPLATE_COLUMNS.forEach((col, i) => {
    ws.getColumn(i + 1).width = Math.max(14, col.header.length + 2);
    if (!col.allowedValues) return;
    const letter = ws.getColumn(i + 1).letter;
    validations.add(`${letter}2:${letter}${DATA_VALIDATION_LAST_ROW}`, {
      type: 'list',
      allowBlank: true,
      formulae: [listRanges[col.field]],
      showErrorMessage: true,
      errorStyle: 'error',
      errorTitle: 'Invalid value',
      error: 'Choose a value from the dropdown list.',
    });
  });
}

async function main(): Promise<void> {
  const buffer = await generateTemplateBuffer();
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, buffer);
  // eslint-disable-next-line no-console
  console.log(`Wrote ${OUTPUT_PATH} (${buffer.length} bytes)`);
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
