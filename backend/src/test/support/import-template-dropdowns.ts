import * as ExcelJS from 'exceljs';

const RANGE = /^(\w+)!\$([A-Z]+)\$(\d+)(?::\$([A-Z]+)\$(\d+))?$/;

/** Cell values of a single- or two-column absolute range such as `Lists!$K$1:$K$58`. */
export function rangeRows(workbook: ExcelJS.Workbook, range: string): string[][] {
  const m = RANGE.exec(range)!;
  const sheet = workbook.getWorksheet(m[1])!;
  const [first, last] = [sheet.getColumn(m[2]).number, sheet.getColumn(m[4] ?? m[2]).number];
  const rows: string[][] = [];
  for (let r = Number(m[3]); r <= Number(m[5] ?? m[3]); r += 1) {
    const row: string[] = [];
    for (let c = first; c <= last; c += 1) row.push(String(sheet.getCell(r, c).value ?? ''));
    rows.push(row);
  }
  return rows;
}

export function definedNameRange(workbook: ExcelJS.Workbook, name: string): string | undefined {
  const names = workbook.definedNames.model as Array<{ name: string; ranges: string[] }>;
  return names.find((n) => n.name === name)?.ranges[0];
}

/** The Region dropdown's contents for a chosen Country, resolved the way Excel evaluates the validation. */
export function regionDropdownFor(workbook: ExcelJS.Workbook, countryName: string): string[] {
  const formula = workbook.getWorksheet('Data')!.getCell('E2').dataValidation.formulae![0] as string;
  const lookup = rangeRows(workbook, /VLOOKUP\(\$D2,([^,]+),2,FALSE\)/.exec(formula)![1]);
  const code = lookup.find(([name]) => name === countryName)![1];
  return rangeRows(workbook, definedNameRange(workbook, `R_${code}`)!).map(([region]) => region);
}
