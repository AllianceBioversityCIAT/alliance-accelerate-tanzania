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
  CONSENT_METHOD_VALUES,
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

  it('lists the allowed values for the consent-method column on the Instructions sheet (FR-5)', async () => {
    const workbook = await loadGeneratedWorkbook();
    const instructions = workbook.getWorksheet('Instructions');
    const text = collectText(instructions!);

    for (const value of CONSENT_METHOD_VALUES) {
      expect(text).toContain(value);
    }
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

  /**
   * T-4 (consent-intake/intake-required-fields) — Registration Source's
   * removal re-letters every constrained Lists column AFTER it (design.md
   * §4.6). Consent Method was column I in v3 and is column H in v4; Region
   * (B) and the crop YES/NO columns (D) sit BEFORE the removed column and are
   * unaffected (pinned above, unchanged).
   */
  it('moves Consent Method to Lists column H now that Registration Source is gone (v4)', async () => {
    const workbook = await loadGeneratedWorkbook();
    const lists = workbook.getWorksheet('Lists');
    expect(lists).toBeDefined();

    const consentMethodColumn = CONSENT_METHOD_VALUES.map(
      (_, i) => lists!.getCell(i + 1, 8).value,
    );
    expect(consentMethodColumn).toEqual([...CONSENT_METHOD_VALUES]);
  });

  // T-4 (public-profile-disclosure) — Contact Person and Other Crops, v3.

  it('writes the Contact Person and Other Crops headers to the Data sheet, after every existing column', async () => {
    const workbook = await loadGeneratedWorkbook();
    const dataSheet = workbook.getWorksheet('Data');
    expect(dataSheet).toBeDefined();

    const headerRow = dataSheet!.getRow(1);
    expect(TEMPLATE_HEADERS[TEMPLATE_HEADERS.length - 2]).toBe('Contact Person');
    expect(TEMPLATE_HEADERS[TEMPLATE_HEADERS.length - 1]).toBe('Other Crops');
    expect(headerRow.getCell(TEMPLATE_HEADERS.length - 1).value).toBe('Contact Person');
    expect(headerRow.getCell(TEMPLATE_HEADERS.length).value).toBe('Other Crops');
  });

  it('lists Contact Person and Other Crops on the Instructions sheet with no allowed-value list (FR-5)', async () => {
    const workbook = await loadGeneratedWorkbook();
    const instructions = workbook.getWorksheet('Instructions');
    expect(instructions).toBeDefined();

    const rows: Array<Record<number, unknown>> = [];
    instructions!.eachRow((row) => {
      rows.push({
        1: row.getCell(1).value,
        2: row.getCell(2).value,
        3: row.getCell(3).value,
        4: row.getCell(4).value,
      });
    });

    const contactPersonRow = rows.find((r) => r[1] === 'Contact Person');
    const otherCropsRow = rows.find((r) => r[1] === 'Other Crops');
    expect(contactPersonRow).toBeDefined();
    expect(otherCropsRow).toBeDefined();
    // T-4 (consent-intake/intake-required-fields) — Contact Person is now
    // required (the intake contract, FR-1); Other Crops stays optional.
    // Format/guidance names the bound; Allowed values: '—' (free text, not a
    // dropdown) — this row IS the Instructions-sheet half of FR-5's
    // "headers, allowed-value lists, and parser agree" clause.
    expect(contactPersonRow![2]).toBe('Yes');
    expect(contactPersonRow![4]).toBe('—');
    expect(otherCropsRow![2]).toBe('No');
    expect(otherCropsRow![4]).toBe('—');
  });

  /**
   * T-4 (consent-intake/intake-required-fields) — the Instructions sheet's
   * how-to list names the new system-generated Trader ID / duplicate-review
   * behaviour (requirements.md FR-5's Instructions-sheet clause).
   */
  it('describes the system-generated Trader ID and duplicate review on the Instructions sheet', async () => {
    const workbook = await loadGeneratedWorkbook();
    const instructions = workbook.getWorksheet('Instructions');
    const text = collectText(instructions!);

    expect(text).toMatch(/trader id/i);
    expect(text).toMatch(/system assigns/i);
    expect(text).toMatch(/held for review/i);
  });

  /**
   * T-4 (consent-intake/intake-required-fields rework) — FR-5's Instructions-
   * sheet clause: "at least one crop" is part of the required set (FR-1) but
   * no single column is marked Required for it, so field staff get no warning
   * without this line (Reviewer-found gap).
   */
  it('tells field staff at least one crop must be YES on the Instructions sheet', async () => {
    const workbook = await loadGeneratedWorkbook();
    const instructions = workbook.getWorksheet('Instructions');
    const text = collectText(instructions!);

    expect(text).toMatch(/at least one crop must be yes/i);
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
