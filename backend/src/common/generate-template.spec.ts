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
import { AFRICAN_COUNTRIES } from './geo/countries';
import {
  definedNameRange,
  rangeRows,
  regionDropdownFor,
} from '../test/support/import-template-dropdowns';
import {
  CONSENT_METHOD_VALUES,
  CROP_YES_NO,
  TEMPLATE_HEADERS,
  TEMPLATE_VERSION,
} from './template-columns';

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

  it('stamps the template version and describes the Country and Region columns on the Instructions sheet', async () => {
    const workbook = await loadGeneratedWorkbook();
    const instructions = workbook.getWorksheet('Instructions');
    expect(instructions).toBeDefined();

    const text = collectText(instructions!);
    expect(text).toContain(`Template version: ${TEMPLATE_VERSION}`);
    expect(text).toContain('Choose a country from the dropdown');
    expect(text).toContain('lists the regions of the country picked in the same row');
    expect(text).toMatch(/Pick the Country first/);
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

    // Country names are Lists column B, so Sex is C.
    expect(lists!.getCell(1, 3).value).toBe('M');
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
  it('keeps Consent Method on Lists column H (Country names took column B in v6)', async () => {
    const workbook = await loadGeneratedWorkbook();
    const lists = workbook.getWorksheet('Lists');
    expect(lists).toBeDefined();

    const consentMethodColumn = CONSENT_METHOD_VALUES.map(
      (_, i) => lists!.getCell(i + 1, 8).value,
    );
    expect(consentMethodColumn).toEqual([...CONSENT_METHOD_VALUES]);
  });

  it('lists Additional Actor Types after Trader Type with the taxonomy on Instructions but no single-value dropdown (v5)', async () => {
    const workbook = await loadGeneratedWorkbook();
    const dataSheet = workbook.getWorksheet('Data');
    expect(dataSheet!.getRow(1).getCell(3).value).toBe('Additional Actor Types');
    const text = collectText(workbook.getWorksheet('Instructions')!);
    expect(text).toContain('Additional Actor Types');
    // A list validation would reject "a; b" — the column must not carry one.
    expect(dataSheet!.getCell('C2').dataValidation ?? null).toBeNull();
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

  describe('Country and dependent Region dropdowns (v6)', () => {
    it('puts a list validation over the 54 country names on every data row of the Country column', async () => {
      const workbook = await loadGeneratedWorkbook();
      const data = workbook.getWorksheet('Data')!;
      expect(data.getCell('D1').value).toBe('Country');

      for (const address of ['D2', 'D500', 'D1001']) {
        const validation = data.getCell(address).dataValidation;
        expect(validation.type).toBe('list');
        expect(validation.allowBlank).toBe(true);
        expect(validation.errorStyle).toBe('error');
        const names = rangeRows(workbook, validation.formulae![0] as string).map(([n]) => n);
        expect(names).toEqual(AFRICAN_COUNTRIES.map((c) => c.name));
      }
      expect(data.getCell('D1002').dataValidation ?? null).toBeNull();
    });

    it("puts an INDIRECT validation on the Region column that reads the same row's Country cell", async () => {
      const workbook = await loadGeneratedWorkbook();
      const data = workbook.getWorksheet('Data')!;
      expect(data.getCell('E1').value).toBe('Region');

      const validation = data.getCell('E2').dataValidation;
      expect(validation.type).toBe('list');
      expect(validation.allowBlank).toBe(true);
      expect(validation.errorStyle).toBe('warning');
      expect(validation.formulae![0]).toMatch(
        /^INDIRECT\("R_"&IFERROR\(VLOOKUP\(\$D2,Lists!\$[A-Z]+\$1:\$[A-Z]+\$54,2,FALSE\),"NONE"\)\)$/,
      );
      // Same single formula for the whole column: relative $D2 shifts per row.
      expect(data.getCell('E1001').dataValidation.formulae).toEqual(validation.formulae);
      expect(data.getCell('E1002').dataValidation ?? null).toBeNull();
    });

    it('maps every country name to its code and defines R_<code> over exactly its regions', async () => {
      const workbook = await loadGeneratedWorkbook();
      const formula = workbook.getWorksheet('Data')!.getCell('E2').dataValidation.formulae![0] as string;
      const lookup = rangeRows(workbook, /VLOOKUP\(\$D2,([^,]+),2,FALSE\)/.exec(formula)![1]);
      expect(lookup).toEqual(AFRICAN_COUNTRIES.map((c) => [c.name, c.code]));

      for (const country of AFRICAN_COUNTRIES) {
        const range = definedNameRange(workbook, `R_${country.code}`);
        expect(range).toBeDefined();
        const regions = rangeRows(workbook, range!).map(([r]) => r);
        expect(regions).toHaveLength(country.regions.length);
        expect(regions).toEqual([...country.regions]);
      }
      expect(rangeRows(workbook, definedNameRange(workbook, 'R_NONE')!)).toEqual([['']]);
    });

    it('lists the picked country’s regions only', async () => {
      const workbook = await loadGeneratedWorkbook();
      expect(regionDropdownFor(workbook, 'Kenya')).toContain('Nakuru');
      expect(regionDropdownFor(workbook, 'Kenya')).not.toContain('Kigoma');
      expect(regionDropdownFor(workbook, 'Tanzania')).toHaveLength(31);
      expect(regionDropdownFor(workbook, 'Uganda')).toHaveLength(135);
    });
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
