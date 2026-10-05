// @sdd-spec admin/actor-import (T-8)
/**
 * Unit tests for /admin/actors/import (ActorImportPage).
 *
 * Covers the full flow and its gates:
 *   - pick → preview → confirm → result (no acknowledgement)
 *   - acknowledgement dialog gates the commit when a previewed row publishes a
 *     GRANTED actor (its warning names the acknowledgement) — and NOT otherwise
 *   - template download link href
 *   - non-.xlsx / client-guard rejection surfaces inline (no result rendered)
 *   - ApiError 400 (file-level) rendered as an alert
 *   - result summary announced via a live region
 *   - auth failure on mount routes to /login
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockRouterPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => '/admin/actors/import',
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, onClick, ...rest }: any) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));

const mockGetSession = jest.fn();
jest.mock('@/lib/auth/auth-client', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
}));

const mockImportActors = jest.fn();
jest.mock('@/lib/api/actors-admin', () => ({
  importActors: (...args: unknown[]) => mockImportActors(...args),
  // T-7 — a real implementation, not another mock: the page calls this to
  // build `duplicateConfirmations`, and its behavior (not just its call
  // shape) is what the "only ticked rows are sent" test is verifying.
  importDuplicateCandidateKey: (candidate: { kind: string; actorId?: string; row?: number }) =>
    candidate.kind === 'actor' ? `actor:${candidate.actorId}` : `row:${candidate.row}`,
}));

jest.mock('@/lib/api/client', () => {
  class AuthFailureError extends Error {
    readonly status = 401;
    constructor(msg = 'Session expired') {
      super(msg);
      this.name = 'AuthFailureError';
    }
  }
  class ApiError extends Error {
    readonly status: number;
    readonly details?: unknown;
    constructor(status: number, message: string, details?: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.details = details;
    }
  }
  return { AuthFailureError, ApiError };
});

import ActorImportPage from './page';
import { ApiError, AuthFailureError } from '@/lib/api/client';
import type { ImportReport } from '@/lib/api/actors-admin';

// ── Fixtures ───────────────────────────────────────────────────────────────

const TOKEN = 'test-access-token';
const FAKE_SESSION = { role: 'Admin' as const, user: { name: 'Alice' }, accessToken: TOKEN };

const ACK_PHRASE = 'I confirm consent is on file';

const PREVIEW_REPORT: ImportReport = {
  mode: 'preview',
  totals: { rows: 1, toCreate: 1, created: 0, possibleDuplicate: 0, failed: 0, warnings: 0 },
  rows: [{ rowNumber: 2, traderId: null, traderName: 'Meru Agro', outcome: 'create' }],
};

const COMMIT_REPORT: ImportReport = {
  mode: 'commit',
  totals: { rows: 1, toCreate: 1, created: 1, possibleDuplicate: 0, failed: 0, warnings: 0 },
  rows: [
    { rowNumber: 2, traderId: 'TZ-001', traderName: 'Meru Agro', outcome: 'created', actorId: 'a1' },
  ],
};

const PREVIEW_REPORT_GRANTED: ImportReport = {
  mode: 'preview',
  totals: { rows: 1, toCreate: 1, created: 0, possibleDuplicate: 0, failed: 0, warnings: 1 },
  rows: [
    {
      rowNumber: 2,
      traderId: null,
      traderName: 'Meru Agro',
      outcome: 'create',
      warnings: ['Consent is GRANTED — acknowledgement will be required to import this actor'],
    },
  ],
};

// T-7 (actors/consent-intake/intake-required-fields) — a preview carrying two
// possible-duplicate rows alongside a plain create, so a test can tick ONE of
// them and verify only that row's confirmation is sent, with ALL of its
// shown candidate keys (design.md §3, DD-4).
const PREVIEW_REPORT_WITH_DUPES: ImportReport = {
  mode: 'preview',
  totals: { rows: 3, toCreate: 1, created: 0, possibleDuplicate: 2, failed: 0, warnings: 0 },
  rows: [
    { rowNumber: 2, traderId: null, traderName: 'Plain Create', outcome: 'create' },
    {
      rowNumber: 3,
      traderId: null,
      traderName: 'Meru Agro',
      outcome: 'possible-duplicate',
      duplicateCandidates: [
        {
          kind: 'actor',
          actorId: 'actor-1',
          traderId: 'TZ-001',
          traderName: 'Meru Agro Ltd',
          matchedOn: ['email'],
        },
        { kind: 'row', row: 2, traderName: 'Plain Create', matchedOn: ['phone'] },
      ],
      duplicateCandidatesTotal: 2,
    },
    {
      rowNumber: 4,
      traderId: null,
      traderName: 'Second Dup',
      outcome: 'possible-duplicate',
      duplicateCandidates: [
        {
          kind: 'actor',
          actorId: 'actor-2',
          traderId: 'TZ-002',
          traderName: 'Second Dup Existing',
          matchedOn: ['phone'],
        },
      ],
      duplicateCandidatesTotal: 1,
    },
  ],
};

// T-7 (rework) — every row flagged: `toCreate` is 0 because the backend's
// total excludes EVERY possible-duplicate row, confirmed or not. Before the
// fix, `toCreate` alone drove the button, so this report could never be
// imported no matter what the admin ticked.
const ALL_FLAGGED_REPORT: ImportReport = {
  mode: 'preview',
  totals: { rows: 1, toCreate: 0, created: 0, possibleDuplicate: 1, failed: 0, warnings: 0 },
  rows: [
    {
      rowNumber: 2,
      traderId: null,
      traderName: 'Meru Agro',
      outcome: 'possible-duplicate',
      duplicateCandidates: [
        {
          kind: 'actor',
          actorId: 'actor-1',
          traderId: 'TZ-001',
          traderName: 'Meru Agro Ltd',
          matchedOn: ['email'],
        },
      ],
      duplicateCandidatesTotal: 1,
    },
  ],
};

// T-7 (rework) — a possible-duplicate row past the 50-shown wire cap
// (`duplicateCandidatesTotal` > `duplicateCandidates.length`): its checkbox
// is disabled and it can never be confirmed (`ArrayMaxSize(50)`), so ticking
// it must not raise the derived commit count either.
const OVER_CAP_PREVIEW_REPORT: ImportReport = {
  mode: 'preview',
  totals: { rows: 1, toCreate: 0, created: 0, possibleDuplicate: 1, failed: 0, warnings: 0 },
  rows: [
    {
      rowNumber: 2,
      traderId: null,
      traderName: 'Shared Email Co',
      outcome: 'possible-duplicate',
      duplicateCandidates: [
        {
          kind: 'actor',
          actorId: 'actor-1',
          traderId: 'TZ-001',
          traderName: 'Meru Agro Ltd',
          matchedOn: ['email'],
        },
      ],
      duplicateCandidatesTotal: 60,
    },
  ],
};

function xlsxFile(name = 'actors.xlsx'): File {
  return new File(['workbook-bytes'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Render the page and flush the getSession effect so the token is set.
 *
 * Awaits the SAME promise the component's mount effect awaits (rather than
 * flushing a fixed number of microtask ticks), so this is deterministic, not
 * a guess: `init()` (page.tsx) calls `getSession()` and registers its
 * `.then` continuation (which calls `setToken`) on `sessionPromise` during
 * the synchronous `render()` call, before this function's own `await
 * sessionPromise` below registers a second `.then` on the same promise.
 * Promise reactions run in FIFO registration order, so `setToken` is
 * guaranteed to commit before this function returns control to the test —
 * closing the race where `selectFile()` could fire while `token` was still
 * null (A-94).
 */
async function renderReady() {
  const sessionPromise = Promise.resolve(FAKE_SESSION);
  mockGetSession.mockReturnValue(sessionPromise);
  render(<ActorImportPage />);
  await act(async () => {
    await sessionPromise;
  });
}

async function selectFile(file = xlsxFile()) {
  const input = screen.getByLabelText(/excel file/i);
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  return file;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reset (not just clear) so no queued once-values or implementations leak
  // between tests.
  mockImportActors.mockReset();
  mockGetSession.mockReset();
});

/** importActors resolver keyed by mode so call order never causes leaks. */
function resolveByMode(previewReport: ImportReport, commitReport: ImportReport) {
  mockImportActors.mockImplementation((_file: File, mode: 'preview' | 'commit') =>
    Promise.resolve(mode === 'commit' ? commitReport : previewReport),
  );
}

// ── Template link ────────────────────────────────────────────────────────────

describe('ActorImportPage — template', () => {
  it('renders a download link to the static template asset', async () => {
    await renderReady();
    const link = screen.getByRole('link', { name: /download template/i });
    expect(link).toHaveAttribute('href', '/templates/actor-import-template.xlsx');
    expect(link).toHaveAttribute('download');
  });
});

// ── Happy path: pick → preview → confirm → result ────────────────────────────

describe('ActorImportPage — full flow (no acknowledgement)', () => {
  it('previews on file select, then commits and shows the result summary', async () => {
    resolveByMode(PREVIEW_REPORT, COMMIT_REPORT);

    await renderReady();
    const file = await selectFile();

    // Preview requested, preview table rendered.
    await waitFor(() =>
      expect(mockImportActors).toHaveBeenNthCalledWith(1, file, 'preview', TOKEN),
    );
    expect(await screen.findByText(/review and confirm/i)).toBeInTheDocument();
    // Rendered in both the desktop table and the mobile card.
    expect(screen.getAllByText(/meru agro/i).length).toBeGreaterThan(0);

    // Confirm → commit directly (no dialog, no acknowledged flag).
    fireEvent.click(screen.getByRole('button', { name: /import 1 actor/i }));

    await waitFor(() =>
      expect(mockImportActors).toHaveBeenLastCalledWith(file, 'commit', TOKEN, undefined, undefined),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Result view + live-region summary.
    expect(await screen.findByText(/import complete/i)).toBeInTheDocument();
    const status = screen.getByText(/1 created, 0 possible duplicates, 0 failed/i);
    expect(status).toBeInTheDocument();
    expect(status.closest('[aria-live="polite"]')).not.toBeNull();
  });
});

// ── Per-row duplicate confirmation (T-7) ─────────────────────────────────────

describe('ActorImportPage — duplicate confirmation', () => {
  it('sends only the ticked row, with ALL of its shown candidate keys, and leaves the other possible-duplicate row unconfirmed', async () => {
    resolveByMode(PREVIEW_REPORT_WITH_DUPES, COMMIT_REPORT);

    await renderReady();
    const file = await selectFile();

    expect(await screen.findByText(/review and confirm/i)).toBeInTheDocument();

    // Tick ONLY row 3's checkbox (one of its two rendered instances — table + card).
    const rowThreeBoxes = screen.getAllByRole('checkbox', { name: /row 3\)/i });
    expect(rowThreeBoxes.length).toBeGreaterThan(0);
    fireEvent.click(rowThreeBoxes[0]);

    // Both instances reflect the same confirmed state (shared, lifted state).
    for (const box of screen.getAllByRole('checkbox', { name: /row 3\)/i })) {
      expect(box).toBeChecked();
    }
    // Row 4's checkbox was never touched.
    for (const box of screen.getAllByRole('checkbox', { name: /row 4\)/i })) {
      expect(box).not.toBeChecked();
    }

    // T-7 (rework) — ticking row 3 raises the commit count by one over the
    // backend's `toCreate` (1): the button must read the derived count, not
    // the raw total, or this confirmation could never be sent (the FAIL this
    // rework fixes).
    fireEvent.click(screen.getByRole('button', { name: /import 2 actors/i }));

    await waitFor(() =>
      expect(mockImportActors).toHaveBeenLastCalledWith(file, 'commit', TOKEN, undefined, [
        { row: 3, candidates: ['actor:actor-1', 'row:2'] },
      ]),
    );
  });

  it('sends undefined duplicateConfirmations when no possible-duplicate row is ticked', async () => {
    resolveByMode(PREVIEW_REPORT_WITH_DUPES, COMMIT_REPORT);

    await renderReady();
    const file = await selectFile();

    expect(await screen.findByText(/review and confirm/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /import 1 actor/i }));

    await waitFor(() =>
      expect(mockImportActors).toHaveBeenLastCalledWith(file, 'commit', TOKEN, undefined, undefined),
    );
  });

  it('resets confirmations when a different file is selected', async () => {
    resolveByMode(PREVIEW_REPORT_WITH_DUPES, COMMIT_REPORT);

    await renderReady();
    await selectFile();
    expect(await screen.findByText(/review and confirm/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /row 3\)/i })[0]);
    expect(screen.getAllByRole('checkbox', { name: /row 3\)/i })[0]).toBeChecked();

    // Re-selecting (e.g. choosing a different file) previews again and must
    // not carry the old confirmation forward onto the new report's rows.
    const file2 = await selectFile(xlsxFile('other.xlsx'));
    await waitFor(() =>
      expect(mockImportActors).toHaveBeenNthCalledWith(2, file2, 'preview', TOKEN),
    );
    expect(await screen.findByText(/review and confirm/i)).toBeInTheDocument();
    for (const box of screen.getAllByRole('checkbox', { name: /row 3\)/i })) {
      expect(box).not.toBeChecked();
    }
  });
});

// ── Commit count derivation (T-7, rework) ────────────────────────────────────
//
// The Reviewer FAIL this rework fixes: the commit button read
// `report.totals.toCreate` directly, which EXCLUDES every possible-duplicate
// row whether or not the admin confirmed it. That made the button disabled
// and wrong-labeled the moment any row was flagged — up to and including a
// re-upload where every row is flagged (`toCreate` permanently 0).

describe('ActorImportPage — commit count derivation (T-7 rework)', () => {
  it('derives the commit count from confirmed rows when toCreate is 0 (every row flagged)', async () => {
    resolveByMode(ALL_FLAGGED_REPORT, COMMIT_REPORT);

    await renderReady();
    const file = await selectFile();

    expect(await screen.findByText(/review and confirm/i)).toBeInTheDocument();

    // Falsifier (a): before ticking, the raw `toCreate` (0) would leave the
    // button disabled forever and claim nothing is importable.
    expect(screen.getByText(/no rows are eligible to import/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import 0 actors/i })).toBeDisabled();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /row 2\)/i })[0]);

    const button = screen.getByRole('button', { name: /import 1 actor/i });
    expect(button).toBeEnabled();
    expect(screen.queryByText(/no rows are eligible to import/i)).not.toBeInTheDocument();

    fireEvent.click(button);

    await waitFor(() =>
      expect(mockImportActors).toHaveBeenLastCalledWith(file, 'commit', TOKEN, undefined, [
        { row: 2, candidates: ['actor:actor-1'] },
      ]),
    );
  });

  it('raises the commit count by one for each confirmable row ticked, and drops it back when unticked', async () => {
    resolveByMode(PREVIEW_REPORT_WITH_DUPES, COMMIT_REPORT);

    await renderReady();
    await selectFile();

    expect(await screen.findByText(/review and confirm/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import 1 actor/i })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /row 3\)/i })[0]);
    expect(screen.getByRole('button', { name: /import 2 actors/i })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /row 4\)/i })[0]);
    expect(screen.getByRole('button', { name: /import 3 actors/i })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /row 3\)/i })[0]);
    expect(screen.getByRole('button', { name: /import 2 actors/i })).toBeInTheDocument();
  });

  it('ignores a ticked over-cap (tooMany) row when deriving the commit count', async () => {
    resolveByMode(OVER_CAP_PREVIEW_REPORT, COMMIT_REPORT);

    await renderReady();
    await selectFile();

    expect(await screen.findByText(/review and confirm/i)).toBeInTheDocument();

    const box = screen.getAllByRole('checkbox', { name: /row 2\)/i })[0];
    expect(box).toBeDisabled();

    // Falsifier (b): the checkbox is disabled in the UI, but the derived
    // count must ALSO ignore this row defensively — assert that directly by
    // driving the change event past the disabled attribute.
    fireEvent.click(box);

    expect(screen.getByRole('button', { name: /import 0 actors/i })).toBeDisabled();
    expect(screen.getByText(/no rows are eligible to import/i)).toBeInTheDocument();
  });

  it('shows the updated wording for what is excluded from the import', async () => {
    resolveByMode(PREVIEW_REPORT_WITH_DUPES, COMMIT_REPORT);

    await renderReady();
    await selectFile();

    expect(await screen.findByText(/review and confirm/i)).toBeInTheDocument();
    expect(
      screen.getByText(/possible duplicates you have not confirmed and failed rows are not imported/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/skipped/i)).not.toBeInTheDocument();
  });
});

// ── Acknowledgement gating ───────────────────────────────────────────────────

describe('ActorImportPage — acknowledgement gate', () => {
  it('opens the AcknowledgeDialog and commits with acknowledged=true when a row publishes', async () => {
    resolveByMode(PREVIEW_REPORT_GRANTED, COMMIT_REPORT);

    await renderReady();
    const file = await selectFile();

    expect(await screen.findByText(/review and confirm/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /import 1 actor/i }));

    // Dialog gates the commit — nothing committed yet.
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(mockImportActors).toHaveBeenCalledTimes(1);

    const confirmBtn = within(dialog).getByRole('button', { name: /^import$/i });
    expect(confirmBtn).toBeDisabled();

    const input = within(dialog).getByLabelText(/type .* to confirm/i);
    fireEvent.change(input, { target: { value: ACK_PHRASE } });
    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);

    await waitFor(() =>
      expect(mockImportActors).toHaveBeenLastCalledWith(file, 'commit', TOKEN, true, undefined),
    );
    expect(await screen.findByText(/import complete/i)).toBeInTheDocument();
  });

  it('does NOT open the dialog when no previewed row publishes', async () => {
    resolveByMode(PREVIEW_REPORT, COMMIT_REPORT);

    await renderReady();
    const file = await selectFile();

    expect(await screen.findByText(/review and confirm/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /import 1 actor/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mockImportActors).toHaveBeenLastCalledWith(file, 'commit', TOKEN, undefined, undefined),
    );
  });

  // T-10 (registration-source-and-consent, design.md §5) — the import commit
  // call site structurally cannot supply per-row provenance (it comes from
  // the per-row template columns, DD-5), so it omits AcknowledgeDialog's
  // opt-in `provenance` prop and must render no method/date inputs.
  it('T-10: renders no consent-method or consent-date inputs on the acknowledge dialog', async () => {
    resolveByMode(PREVIEW_REPORT_GRANTED, COMMIT_REPORT);

    await renderReady();
    await selectFile();

    expect(await screen.findByText(/review and confirm/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /import 1 actor/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByLabelText(/consent method/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/consent obtained on/i)).not.toBeInTheDocument();
  });
});

// ── Client-side rejection (non-.xlsx) ────────────────────────────────────────

describe('ActorImportPage — file rejection', () => {
  it('surfaces the client-guard plain Error inline and renders no preview', async () => {
    mockImportActors.mockRejectedValue(
      new Error('Only .xlsx files can be imported. Please select an Excel workbook.'),
    );

    await renderReady();
    await selectFile(xlsxFile('actors.csv'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/only \.xlsx files can be imported/i);
    expect(screen.queryByText(/review and confirm/i)).not.toBeInTheDocument();
  });

  it('renders an ApiError 400 file-level rejection as an alert', async () => {
    mockImportActors.mockRejectedValue(
      new ApiError(400, 'The file has 1200 data rows; the maximum is 1000.'),
    );

    await renderReady();
    await selectFile();

    expect(await screen.findByText(/the file could not be processed/i)).toBeInTheDocument();
    expect(screen.getByText(/1200 data rows/i)).toBeInTheDocument();
    expect(screen.queryByText(/review and confirm/i)).not.toBeInTheDocument();
  });
});

// ── File picker: hidden input + button + drag & drop + chip ──────────────────

describe('ActorImportPage — file picker', () => {
  it('drives a visually-hidden input from the styled "Select .xlsx file" button', async () => {
    await renderReady();

    const input = screen.getByLabelText(/excel file/i) as HTMLInputElement;
    // The native input is present but visually hidden (no default browser chip).
    expect(input).toHaveClass('sr-only');

    const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: /select \.xlsx file/i }));
    expect(clickSpy).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
  });

  it('previews a file dropped onto the drop zone (same validation path)', async () => {
    resolveByMode(PREVIEW_REPORT, COMMIT_REPORT);

    await renderReady();
    const file = xlsxFile('dropped.xlsx');
    const dropZone = screen.getByText(/drag & drop/i);

    await act(async () => {
      fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    });

    await waitFor(() =>
      expect(mockImportActors).toHaveBeenNthCalledWith(1, file, 'preview', TOKEN),
    );
    expect(await screen.findByText(/review and confirm/i)).toBeInTheDocument();
  });

  it('shows the selected file as a chip (name + size) with a replace control', async () => {
    resolveByMode(PREVIEW_REPORT, COMMIT_REPORT);

    await renderReady();
    await selectFile(xlsxFile('my-actors.xlsx'));

    // The chosen file is surfaced as a chip, not raw input text.
    expect(await screen.findByText('my-actors.xlsx')).toBeInTheDocument();

    // The replace control clears the file and returns to the drop zone.
    const replace = screen.getByRole('button', { name: /remove my-actors\.xlsx/i });
    await act(async () => {
      fireEvent.click(replace);
    });

    expect(screen.queryByText('my-actors.xlsx')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select \.xlsx file/i })).toBeInTheDocument();
  });
});

// ── Empty template (rows === 0) ──────────────────────────────────────────────

describe('ActorImportPage — empty template', () => {
  const EMPTY_REPORT: ImportReport = {
    mode: 'preview',
    totals: { rows: 0, toCreate: 0, created: 0, possibleDuplicate: 0, failed: 0, warnings: 0 },
    rows: [],
  };

  it('shows a friendly notice (not empty chips/table) when the file has no data rows', async () => {
    mockImportActors.mockResolvedValue(EMPTY_REPORT);

    await renderReady();
    await selectFile();

    expect(await screen.findByText(/the file has no data rows/i)).toBeInTheDocument();
    // No preview table and no dead confirm button.
    expect(screen.queryByRole('table', { name: /import rows/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /import 0 actor/i })).not.toBeInTheDocument();
  });
});

// ── Failure breakdown (FR-7, T-5) ────────────────────────────────────────────

describe('ActorImportPage — failure breakdown', () => {
  const BREAKDOWN_REPORT: ImportReport = {
    mode: 'preview',
    totals: { rows: 4, toCreate: 1, created: 0, possibleDuplicate: 1, failed: 2, warnings: 0 },
    rows: [
      { rowNumber: 2, traderId: null, traderName: 'Meru Agro', outcome: 'create' },
      { rowNumber: 3, traderId: null, traderName: 'Dup', outcome: 'possible-duplicate' },
      {
        rowNumber: 4,
        traderId: null,
        traderName: 'Bad Type',
        outcome: 'failed',
        errors: [{ field: 'traderType', message: 'Trader Type is not in the allowed taxonomy.' }],
      },
      {
        rowNumber: 5,
        traderId: null,
        traderName: 'Bad Type Two',
        outcome: 'failed',
        errors: [{ field: 'traderType', message: 'Trader Type is not in the allowed taxonomy.' }],
      },
    ],
    failureBreakdown: [
      { reason: 'traderType', count: 2 },
      { reason: 'possible-duplicate', count: 1 },
    ],
  };

  it('renders every reason with its count after a preview', async () => {
    mockImportActors.mockResolvedValue(BREAKDOWN_REPORT);

    await renderReady();
    await selectFile();

    const heading = await screen.findByText(/why rows will not import/i);
    const panel = heading.closest('div') as HTMLElement;

    const items = within(panel).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('traderType');
    expect(items[0]).toHaveTextContent('2');
    expect(items[1]).toHaveTextContent('possible-duplicate');
    expect(items[1]).toHaveTextContent('1');
  });

  it('preserves the backend ordering rather than re-sorting client-side', async () => {
    // Ordering is a backend invariant (count desc, then reason asc — NFR-6).
    // Feeding an order the client would NOT produce on its own proves the
    // component renders what it is given instead of imposing its own sort.
    mockImportActors.mockResolvedValue({
      ...BREAKDOWN_REPORT,
      failureBreakdown: [
        { reason: 'zzz-last-alphabetically', count: 9 },
        { reason: 'aaa-first-alphabetically', count: 1 },
      ],
    });

    await renderReady();
    await selectFile();

    const heading = await screen.findByText(/why rows will not import/i);
    const items = within(heading.closest('div') as HTMLElement).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'zzz-last-alphabetically9',
      'aaa-first-alphabetically1',
    ]);
  });

  it('sits inside a polite live region', async () => {
    mockImportActors.mockResolvedValue(BREAKDOWN_REPORT);

    await renderReady();
    await selectFile();

    const heading = await screen.findByText(/why rows will not import/i);
    const liveRegion = heading.closest('[aria-live]');

    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveAttribute('role', 'status');
    // LIMIT OF THIS ASSERTION: it proves the markup is correct, NOT that a
    // screen reader announces the update. jsdom runs no accessibility tree and
    // jest-axe cannot evaluate announcement behavior either. Whether this
    // actually announces is a human/AT check, not covered here (KZ-002).
  });

  it('renders nothing when the report carries no breakdown', async () => {
    // The backend OMITS the key on a clean import — it does not send `[]`.
    mockImportActors.mockResolvedValue(PREVIEW_REPORT);

    await renderReady();
    await selectFile();

    expect(await screen.findByRole('table', { name: /import rows/i })).toBeInTheDocument();
    expect(screen.queryByText(/why rows will not import/i)).not.toBeInTheDocument();
  });

  it('renders nothing when the breakdown is present but empty', async () => {
    mockImportActors.mockResolvedValue({ ...PREVIEW_REPORT, failureBreakdown: [] });

    await renderReady();
    await selectFile();

    expect(await screen.findByRole('table', { name: /import rows/i })).toBeInTheDocument();
    expect(screen.queryByText(/why rows will not import/i)).not.toBeInTheDocument();
  });
});

// ── Generic (non-400) server failure ─────────────────────────────────────────

describe('ActorImportPage — generic failure', () => {
  it('shows a friendly fallback (not the raw server message) for a 5xx ApiError', async () => {
    mockImportActors.mockRejectedValue(new ApiError(500, 'Internal server error'));

    await renderReady();
    await selectFile();

    expect(await screen.findByText(/something went wrong processing the file/i)).toBeInTheDocument();
    // The raw passthrough message must not leak to the Admin.
    expect(screen.queryByText(/internal server error/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/review and confirm/i)).not.toBeInTheDocument();
  });
});

// ── Auth failure ─────────────────────────────────────────────────────────────

describe('ActorImportPage — auth failure', () => {
  it('routes to /login when there is no session on mount', async () => {
    mockGetSession.mockResolvedValue(null);
    render(<ActorImportPage />);
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/login'));
  });

  it('routes to /login when the preview call fails auth', async () => {
    mockImportActors.mockRejectedValue(new AuthFailureError());
    await renderReady();
    await selectFile();
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/login'));
  });
});
