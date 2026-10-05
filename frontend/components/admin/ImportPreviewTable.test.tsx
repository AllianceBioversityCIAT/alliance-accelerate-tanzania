// @sdd-spec actors/consent-intake/intake-required-fields (T-7)
/**
 * Unit tests for ImportPreviewTable.
 *
 * Covers:
 *   - outcome badge labels per outcome (create/created/possible-duplicate/failed)
 *   - field-level errors rendered as "field: message" (names only, FR-11)
 *   - warnings rendered per row + a caution "Warning" badge, on the
 *     `bg-surface-alt text-warning` token (never `/NN`, frontend/CLAUDE.md)
 *   - invalid-first grouping (failed → possible-duplicate → create) with row
 *     numbers intact
 *   - a table with accessible column headers
 *   - T-7: duplicate candidates + the "Not a duplicate — create" checkbox,
 *     in BOTH the table and the card layout; disabled past the 50-shown cap;
 *     only ticked rows are reported as confirmed to the caller
 */

import { render, screen, within, fireEvent } from '@testing-library/react';

import { ImportPreviewTable } from './ImportPreviewTable';
import type { ImportDuplicateCandidate, ImportRowResult } from '@/lib/api/actors-admin';

const CREATE_ROW: ImportRowResult = {
  rowNumber: 2,
  traderId: 'TZ-001',
  traderName: 'Meru Agro',
  outcome: 'create',
};

const ACTOR_CANDIDATE: ImportDuplicateCandidate = {
  kind: 'actor',
  actorId: 'actor-1',
  traderId: 'TZ-002',
  traderName: 'Kilimo Co',
  matchedOn: ['email'],
};

const ROW_CANDIDATE: ImportDuplicateCandidate = {
  kind: 'row',
  row: 5,
  traderName: 'Earlier Row Trader',
  matchedOn: ['phone'],
};

const POSSIBLE_DUPLICATE_ROW: ImportRowResult = {
  rowNumber: 3,
  traderId: null,
  traderName: 'Kilimo Co Copy',
  outcome: 'possible-duplicate',
  duplicateCandidates: [ACTOR_CANDIDATE, ROW_CANDIDATE],
  duplicateCandidatesTotal: 2,
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

const CREATED_WITH_WEAK_MATCH: ImportRowResult = {
  rowNumber: 6,
  traderId: 'TM-2026-0010',
  traderName: 'Weak Match Co',
  outcome: 'created',
  actorId: 'actor-6',
  duplicateWarnings: [
    { kind: 'actor', actorId: 'actor-9', traderId: 'TZ-009', traderName: 'Similar Co', matchedOn: ['traderName'] },
  ],
};

/** A row the server already created after the admin confirmed its strong match — no further action possible. */
const CREATED_AFTER_CONFIRMATION: ImportRowResult = {
  rowNumber: 8,
  traderId: 'TM-2026-0008',
  traderName: 'Confirmed Not Duplicate Co',
  outcome: 'created',
  actorId: 'actor-8',
  duplicateCandidates: [ACTOR_CANDIDATE],
  duplicateCandidatesTotal: 1,
};

const OVER_CAP_ROW: ImportRowResult = {
  rowNumber: 7,
  traderId: null,
  traderName: 'Shared Email Co',
  outcome: 'possible-duplicate',
  duplicateCandidates: [ACTOR_CANDIDATE],
  duplicateCandidatesTotal: 60,
};

describe('ImportPreviewTable — outcome badges', () => {
  it('renders a "Will create" badge for a preview create row', () => {
    render(<ImportPreviewTable rows={[CREATE_ROW]} />);
    expect(screen.getAllByText(/will create/i).length).toBeGreaterThan(0);
  });

  it('renders a "Created" badge for a committed row with no weak match', () => {
    render(<ImportPreviewTable rows={[{ ...CREATE_ROW, outcome: 'created', actorId: 'a1' }]} />);
    expect(screen.getAllByText(/^created$/i).length).toBeGreaterThan(0);
  });

  it('renders "Created (similar actor exists)" for a committed row carrying a weak match', () => {
    render(<ImportPreviewTable rows={[CREATED_WITH_WEAK_MATCH]} />);
    expect(screen.getAllByText(/created \(similar actor exists\)/i).length).toBeGreaterThan(0);
  });

  it('renders "Possible duplicate — not created" for a possible-duplicate row', () => {
    render(<ImportPreviewTable rows={[POSSIBLE_DUPLICATE_ROW]} />);
    expect(screen.getAllByText(/possible duplicate — not created/i).length).toBeGreaterThan(0);
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

  it('renders a Warning badge for a row whose only warning is a weak duplicate match', () => {
    render(<ImportPreviewTable rows={[CREATED_WITH_WEAK_MATCH]} />);
    expect(screen.getAllByText(/^warning$/i).length).toBeGreaterThan(0);
  });

  // Falsifier 3 (tasks.md T-7): keeping `bg-warning/10` on the warning badge
  // must redden this presence check — the class never emits CSS for a
  // semantic token (frontend/CLAUDE.md). The rendered capture is the proof
  // of visual correctness; this is a presence check only.
  it('renders the Warning badge on the bg-surface-alt text-warning token, never bg-warning/10', () => {
    render(<ImportPreviewTable rows={[WARNING_ROW]} />);
    const badges = screen.getAllByText(/^warning$/i);
    for (const badge of badges) {
      expect(badge.className).toContain('bg-surface-alt');
      expect(badge.className).toContain('text-warning');
      expect(badge.className).not.toContain('bg-warning/10');
    }
  });
});

describe('ImportPreviewTable — grouping and structure', () => {
  it('groups invalid rows first while keeping Excel row numbers', () => {
    // Supplied in create → possible-duplicate → failed order; expect failed to sort first.
    render(<ImportPreviewTable rows={[CREATE_ROW, POSSIBLE_DUPLICATE_ROW, FAILED_ROW]} />);

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

  it('shows "—" for the Trader ID of a preview row and the assigned id after commit', () => {
    const { rerender } = render(<ImportPreviewTable rows={[POSSIBLE_DUPLICATE_ROW]} />);
    const table = screen.getByRole('table', { name: /import rows/i });
    expect(within(table).getByText('—')).toBeInTheDocument();

    rerender(
      <ImportPreviewTable
        rows={[{ ...CREATE_ROW, outcome: 'created', actorId: 'a1', traderId: 'TM-2026-0003' }]}
      />,
    );
    expect(screen.getAllByText('TM-2026-0003').length).toBeGreaterThan(0);
  });
});

describe('ImportPreviewTable — duplicate candidates (T-7)', () => {
  it('renders each candidate — existing-actor and in-file — in the table layout', () => {
    render(<ImportPreviewTable rows={[POSSIBLE_DUPLICATE_ROW]} />);
    const table = screen.getByRole('table', { name: /import rows/i });
    // Exact match: "Kilimo Co" (the candidate) vs "Kilimo Co Copy" (the row's own name).
    expect(within(table).getByText('Kilimo Co')).toBeInTheDocument();
    expect(within(table).getByText(/tz-002/i)).toBeInTheDocument();
    expect(within(table).getByText(/email address/i)).toBeInTheDocument();
    expect(within(table).getByText(/row 5 of this file/i)).toBeInTheDocument();
    expect(within(table).getByText(/phone number/i)).toBeInTheDocument();
  });

  it('renders each candidate in the card layout too', () => {
    render(<ImportPreviewTable rows={[POSSIBLE_DUPLICATE_ROW]} />);
    const cardsList = screen.getByRole('list', { name: /import rows/i });
    expect(within(cardsList).getByText('Kilimo Co')).toBeInTheDocument();
    expect(within(cardsList).getByText(/row 5 of this file/i)).toBeInTheDocument();
  });

  // Falsifier 1 (tasks.md T-7): a checkbox rendered only in the table branch
  // must redden this test — the control is expected in the CARD branch too.
  it('renders the "Not a duplicate — create" checkbox in BOTH the table and the card branches', () => {
    render(
      <ImportPreviewTable
        rows={[POSSIBLE_DUPLICATE_ROW]}
        confirmedRows={new Set()}
        onToggleConfirm={() => {}}
      />,
    );

    const table = screen.getByRole('table', { name: /import rows/i });
    const cardsList = screen.getByRole('list', { name: /import rows/i });

    expect(
      within(table).getByRole('checkbox', { name: /not a duplicate — create/i }),
    ).toBeInTheDocument();
    expect(
      within(cardsList).getByRole('checkbox', { name: /not a duplicate — create/i }),
    ).toBeInTheDocument();
  });

  it('renders no checkbox when no onToggleConfirm is supplied (read-only, e.g. post-commit)', () => {
    render(<ImportPreviewTable rows={[POSSIBLE_DUPLICATE_ROW]} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('renders no checkbox for an already-created row even though it carries duplicateCandidates', () => {
    render(
      <ImportPreviewTable
        rows={[CREATED_AFTER_CONFIRMATION]}
        confirmedRows={new Set()}
        onToggleConfirm={() => {}}
      />,
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('calls onToggleConfirm with the row number and the new checked state', () => {
    const onToggleConfirm = jest.fn();
    render(
      <ImportPreviewTable
        rows={[POSSIBLE_DUPLICATE_ROW]}
        confirmedRows={new Set()}
        onToggleConfirm={onToggleConfirm}
      />,
    );

    const boxes = screen.getAllByRole('checkbox', { name: /not a duplicate — create/i });
    fireEvent.click(boxes[0]);

    expect(onToggleConfirm).toHaveBeenCalledWith(3, true);
  });

  it('renders the checkbox checked when the row number is in confirmedRows', () => {
    render(
      <ImportPreviewTable
        rows={[POSSIBLE_DUPLICATE_ROW]}
        confirmedRows={new Set([3])}
        onToggleConfirm={() => {}}
      />,
    );

    const boxes = screen.getAllByRole('checkbox', { name: /not a duplicate — create/i });
    for (const box of boxes) {
      expect(box).toBeChecked();
    }
  });

  // Falsifier 5 (tasks.md T-7): enabling confirmation when the true total
  // exceeds the shown candidates must redden this test.
  it('disables the checkbox and shows a truthful note when duplicateCandidatesTotal exceeds the shown candidates', () => {
    render(
      <ImportPreviewTable
        rows={[OVER_CAP_ROW]}
        confirmedRows={new Set()}
        onToggleConfirm={() => {}}
      />,
    );

    const boxes = screen.getAllByRole('checkbox', { name: /not a duplicate — create/i });
    for (const box of boxes) {
      expect(box).toBeDisabled();
    }
    expect(
      screen.getAllByText(/more than 50 matches — resolve the duplicates first/i).length,
    ).toBeGreaterThan(0);
  });

  it('does not disable the checkbox when duplicateCandidatesTotal equals the shown candidates', () => {
    render(
      <ImportPreviewTable
        rows={[POSSIBLE_DUPLICATE_ROW]}
        confirmedRows={new Set()}
        onToggleConfirm={() => {}}
      />,
    );
    const boxes = screen.getAllByRole('checkbox', { name: /not a duplicate — create/i });
    for (const box of boxes) {
      expect(box).toBeEnabled();
    }
  });
});
