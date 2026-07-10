// @sdd-spec admin/actor-import (T-8)
/**
 * Unit tests for ImportPreviewTable.
 *
 * Covers:
 *   - outcome badge labels per outcome (create/created/skipped/failed)
 *   - field-level errors rendered as "field: message" (names only, FR-11)
 *   - warnings rendered per row + a caution "Warning" badge
 *   - invalid-first grouping (failed → skipped → create) with row numbers intact
 *   - a table with accessible column headers
 */

import { render, screen, within } from '@testing-library/react';

import { ImportPreviewTable } from './ImportPreviewTable';
import type { ImportRowResult } from '@/lib/api/actors-admin';

const CREATE_ROW: ImportRowResult = {
  rowNumber: 2,
  traderId: 'TZ-001',
  traderName: 'Meru Agro',
  outcome: 'create',
};

const SKIP_ROW: ImportRowResult = {
  rowNumber: 3,
  traderId: 'TZ-002',
  traderName: 'Kilimo Co',
  outcome: 'skipped-exists',
};

const FAILED_ROW: ImportRowResult = {
  rowNumber: 4,
  traderId: 'TZ-003',
  traderName: 'Bad Row',
  outcome: 'failed',
  errors: [
    { field: 'region', message: 'Region is not a recognized Tanzania region.' },
    { field: 'email', message: 'Email format is invalid.' },
  ],
};

const WARNING_ROW: ImportRowResult = {
  rowNumber: 5,
  traderId: 'TZ-004',
  traderName: 'GPS Row',
  outcome: 'create',
  warnings: ['GPS out of range — imported with GPS cleared'],
};

describe('ImportPreviewTable — outcome badges', () => {
  it('renders a "Will create" badge for a preview create row', () => {
    render(<ImportPreviewTable rows={[CREATE_ROW]} />);
    expect(screen.getAllByText(/will create/i).length).toBeGreaterThan(0);
  });

  it('renders a "Created" badge for a committed row', () => {
    render(<ImportPreviewTable rows={[{ ...CREATE_ROW, outcome: 'created', actorId: 'a1' }]} />);
    expect(screen.getAllByText(/^created$/i).length).toBeGreaterThan(0);
  });

  it('renders a skipped badge for a duplicate row', () => {
    render(<ImportPreviewTable rows={[SKIP_ROW]} />);
    expect(screen.getAllByText(/skipped — exists/i).length).toBeGreaterThan(0);
  });

  it('renders a duplicate-in-file skipped badge', () => {
    render(
      <ImportPreviewTable
        rows={[{ ...SKIP_ROW, outcome: 'skipped-duplicate-in-file' }]}
      />,
    );
    expect(screen.getAllByText(/skipped — duplicate in file/i).length).toBeGreaterThan(0);
  });

  it('renders a failed badge for an invalid row', () => {
    render(<ImportPreviewTable rows={[FAILED_ROW]} />);
    expect(screen.getAllByText(/^failed$/i).length).toBeGreaterThan(0);
  });
});

describe('ImportPreviewTable — errors and warnings', () => {
  it('renders each field error as "field: message"', () => {
    render(<ImportPreviewTable rows={[FAILED_ROW]} />);
    // Field name and message both appear (names only — no PII values).
    expect(screen.getAllByText(/region/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/not a recognized tanzania region/i).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/email format is invalid/i).length).toBeGreaterThan(0);
  });

  it('renders warnings and a caution Warning badge', () => {
    render(<ImportPreviewTable rows={[WARNING_ROW]} />);
    expect(screen.getAllByText(/gps out of range/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^warning$/i).length).toBeGreaterThan(0);
  });
});

describe('ImportPreviewTable — grouping and structure', () => {
  it('groups invalid rows first while keeping Excel row numbers', () => {
    // Supplied in create → skip → failed order; expect failed to sort first.
    render(<ImportPreviewTable rows={[CREATE_ROW, SKIP_ROW, FAILED_ROW]} />);

    const table = screen.getByRole('table', { name: /import rows/i });
    const bodyRows = within(table).getAllByRole('row');
    // bodyRows[0] is the header row; the first data row should be the failed one.
    const firstData = bodyRows[1];
    expect(within(firstData).getByText('4')).toBeInTheDocument(); // rowNumber 4 = failed
    expect(within(firstData).getByText(/^failed$/i)).toBeInTheDocument();
  });

  it('renders accessible column headers', () => {
    render(<ImportPreviewTable rows={[CREATE_ROW]} />);
    const table = screen.getByRole('table', { name: /import rows/i });
    expect(within(table).getByText('Row #')).toBeInTheDocument();
    expect(within(table).getByText('Trader ID')).toBeInTheDocument();
    expect(within(table).getByText('Outcome')).toBeInTheDocument();
    expect(within(table).getByText('Details')).toBeInTheDocument();
  });
});
