/**
 * T-3 — Byte-stability + content guard for the import template generator
 * (FR-1, NFR-8; design.md §4 + §8 DR-2/DR-7).
 *
 * The template ships as a committed static asset and `git diff --exit-code` is
 * the drift check, so regeneration MUST be byte-identical. These tests are the
 * real gate: they drive the exported build function directly (no child process),
 * assert two generations are byte-equal to each other AND to the committed file,
 * and confirm the workbook still carries the canonical headers and allowed values
 * so a silent drift can't slip past the byte check.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';

import {
  buildTemplateWorkbook,
  generateTemplateBuffer,
} from '../../scripts/generate-import-template';
import {
  CROP_YES_NO,
  TEMPLATE_HEADERS,
  TEMPLATE_VERSION,
} from './template-columns';
import { CANONICAL_REGIONS } from './normalize';

const COMMITTED_ASSET = path.resolve(
  __dirname,
  '../../../frontend/public/templates/actor-import-template.xlsx',
);

describe('generate-import-template', () => {
  it('is byte-stable across regenerations', async () => {
    const first = await generateTemplateBuffer();
    const second = await generateTemplateBuffer();
    expect(first.equals(second)).toBe(true);
  });

  it('matches the committed static asset byte-for-byte', async () => {
    // If this fails, the template drifted from the canonical column map: run
    // `npm run generate:template` and commit the refreshed .xlsx.
    const committed = fs.readFileSync(COMMITTED_ASSET);
    const generated = await generateTemplateBuffer();
    expect(generated.equals(committed)).toBe(true);
  });

  it('writes the canonical headers to the Data sheet, in order', async () => {
    const workbook = await loadGeneratedWorkbook();
    const dataSheet = workbook.getWorksheet('Data');
    expect(dataSheet).toBeDefined();

    const headerRow = dataSheet!.getRow(1);
    const headers = TEMPLATE_HEADERS.map((_, i) => headerRow.getCell(i + 1).value);
    expect(headers).toEqual([...TEMPLATE_HEADERS]);
  });

  it('stamps the template version and lists the region allowed values on the Instructions sheet', async () => {
    const workbook = await loadGeneratedWorkbook();
    const instructions = workbook.getWorksheet('Instructions');
    expect(instructions).toBeDefined();

    const text = collectText(instructions!);
    expect(text).toContain(`Template version: ${TEMPLATE_VERSION}`);
    // Spot-check the region list end-to-end (first, a Zanzibar region, last).
    expect(text).toContain(CANONICAL_REGIONS[0]);
    expect(text).toContain('Kusini Pemba');
    expect(text).toContain(CANONICAL_REGIONS[CANONICAL_REGIONS.length - 1]);
  });

  it('backs the constrained columns with a hidden Lists sheet of allowed values', async () => {
    const workbook = await loadGeneratedWorkbook();
    const lists = workbook.getWorksheet('Lists');
    expect(lists).toBeDefined();
    expect(lists!.state).toBe('veryHidden');

    // Region list (Lists column B) mirrors the canonical constant exactly.
    const regionColumn = CANONICAL_REGIONS.map((_, i) => lists!.getCell(i + 1, 2).value);
    expect(regionColumn).toEqual([...CANONICAL_REGIONS]);
    // Crop YES/NO list (Lists column D, shared shape of the three crop columns).
    const cropColumn = CROP_YES_NO.map((_, i) => lists!.getCell(i + 1, 4).value);
    expect(cropColumn).toEqual([...CROP_YES_NO]);
  });

  it('exposes buildTemplateWorkbook returning the three template sheets', () => {
    const workbook = buildTemplateWorkbook();
    expect(workbook.worksheets.map((w) => w.name)).toEqual([
      'Instructions',
      'Data',
      'Lists',
    ]);
  });
});

async function loadGeneratedWorkbook(): Promise<ExcelJS.Workbook> {
  const buffer = await generateTemplateBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return workbook;
}

function collectText(sheet: ExcelJS.Worksheet): string {
  let text = '';
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      text += `${String(cell.value)}\n`;
    });
  });
  return text;
}
