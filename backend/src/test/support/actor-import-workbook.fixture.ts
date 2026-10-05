import * as ExcelJS from 'exceljs';
import { TEMPLATE_COLUMNS, TEMPLATE_HEADERS } from '../../common/template-columns';

export type CellMap = Record<string, string | number>;

/**
 * Build a base64 `.xlsx` from data rows keyed by `TEMPLATE_COLUMNS` `field`.
 * Shared by `actor-import.service.spec.ts` and `admin-actor-import.e2e.spec.ts`.
 */
export async function buildWorkbook(
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
 * override as needed. `traderId` is NOT a column any more (T-4,
 * consent-intake/intake-required-fields) — the system assigns it at commit;
 * any stray `traderId` key in an override is simply never written to a cell.
 */
export function validRow(overrides: CellMap = {}): CellMap {
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
